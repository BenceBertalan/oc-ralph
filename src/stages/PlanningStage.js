/**
 * Planning stage - executes Architect, Sculptor, and Sentinel agents
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PlanningStage {
  constructor(agentExecutor, issueOps, issueBodyManager, statusUpdater, issueTemplateManager, stateManager, jsonParser, discordNotifier, statusResilienceManager, config, logger) {
    this.agentExecutor = agentExecutor;
    this.issueOps = issueOps;
    this.issueBodyManager = issueBodyManager;
    this.statusUpdater = statusUpdater;
    this.issueTemplateManager = issueTemplateManager;
    this.stateManager = stateManager;
    this.jsonParser = jsonParser;
    this.discordNotifier = discordNotifier;
    this.statusResilienceManager = statusResilienceManager;
    this.config = config;
    this.logger = logger;
    this.repo = `${config.github.owner}/${config.github.repo}`;
  }

  /**
   * Execute planning stage
   */
  async execute(masterIssueNumber, worktreePath) {
    this.logger.info('Planning stage started', { masterIssueNumber });

    // Step 1: Architect creates high-level spec
    this.logger.info('Executing Architect agent...');
    this.statusUpdater.updatePlanningStatus({
      architectInProgress: true,
      architectComplete: false,
      sculptorComplete: false,
      sentinelComplete: false,
      completedCount: 0,
      allComplete: false
    });
    
    const spec = await this.executeArchitect(masterIssueNumber);
    await this.stateManager.markSubState(masterIssueNumber, 'spec-created');
    
    this.statusUpdater.updatePlanningStatus({
      architectComplete: true,
      architectInProgress: false,
      sculptorComplete: false,
      sentinelComplete: false,
      completedCount: 1,
      allComplete: false
    });

    // Step 2: Sculptor and Sentinel run in PARALLEL
    this.logger.info('Executing Sculptor and Sentinel in parallel...');
    this.statusUpdater.updatePlanningStatus({
      architectComplete: true,
      sculptorInProgress: true,
      sentinelInProgress: true,
      sculptorComplete: false,
      sentinelComplete: false,
      completedCount: 1,
      allComplete: false
    });
    
    const [implTasks, testTasks] = await Promise.all([
      this.executeSculptor(spec, masterIssueNumber),
      this.executeSentinel(spec, masterIssueNumber)
    ]);

    // Update planning status after parallel execution
    this.statusUpdater.updatePlanningStatus({
      architectComplete: true,
      sculptorComplete: true,
      sentinelComplete: true,
      implTaskCount: implTasks.length,
      testTaskCount: testTasks.length,
      completedCount: 3,
      allComplete: true
    });
    
    // Trigger status update
    await this.statusUpdater.onEvent('planning-complete', {
      masterIssueNumber,
      issueUrl: `https://github.com/${this.repo}/issues/${masterIssueNumber}`,
      implCount: implTasks.length,
      testCount: testTasks.length
    });

    await this.stateManager.markSubState(masterIssueNumber, 'tasks-planned');

    // Step 3: Create sub-issues
    this.logger.info('Creating sub-issues...', {
      implementationTasks: implTasks.length,
      testTasks: testTasks.length
    });

    const implIssues = await this.createImplementationIssues(
      masterIssueNumber,
      implTasks,
      worktreePath
    );

    const testIssues = await this.createTestIssues(
      masterIssueNumber,
      testTasks,
      worktreePath
    );

    // Build plan object
    const plan = {
      spec,
      implementationTasks: implTasks,
      testTasks: testTasks,
      implementationIssues: implIssues,
      testIssues: testIssues
    };

    this.logger.info('Planning stage completed', { 
      masterIssueNumber,
      implementationTasks: implTasks.length,
      testTasks: testTasks.length
    });

    return plan;
  }

  /**
   * Execute Architect agent
   */
  async executeArchitect(masterIssueNumber) {
    const masterIssue = await this.issueOps.getIssue(this.repo, masterIssueNumber);
    
    // Parse to get original request before any orchestration
    const { originalRequest } = this.issueBodyManager.parse(masterIssue.body);
    
    const promptTemplate = fs.readFileSync(
      path.join(__dirname, '../../prompts/architect.txt'),
      'utf-8'
    );

    const prompt = promptTemplate
      .replace('{{issueNumber}}', masterIssueNumber)
      .replace('{{issueBody}}', originalRequest || masterIssue.body);

    const result = await this.agentExecutor.execute('architect', prompt, {
      issueNumber: masterIssueNumber,
      discordNotifier: this.discordNotifier,
      statusResilienceManager: this.statusResilienceManager
    });
    
    // Parse JSON from response
    const spec = this.jsonParser.parse(result.response);
    
    // Validate spec structure
    this.validateSpec(spec);
    
    // Update master issue body with spec (not comment)
    await this.updateMasterIssueAfterArchitect(masterIssueNumber, spec, originalRequest || masterIssue.body);
    
    return spec;
  }
  
  /**
   * Update master issue body after Architect completes
   */
  async updateMasterIssueAfterArchitect(masterIssueNumber, spec, originalRequest) {
    // Build body with spec (no plan or status table yet)
    const newBody = this.issueBodyManager.build(spec, null, originalRequest, null, null);
    
    // Update issue
    await this.issueOps.updateIssue(this.repo, masterIssueNumber, { body: newBody });
    
    // Start status updater with planning status
    this.statusUpdater.start(masterIssueNumber, null, {
      architectComplete: true,
      sculptorComplete: false,
      sentinelComplete: false,
      implTaskCount: 0,
      testTaskCount: 0,
      completedCount: 1,
      allComplete: false
    });
    
    this.logger.info('Master issue body updated with spec', { masterIssueNumber });
  }

  /**
   * Execute Sculptor agent
   */
  async executeSculptor(spec, masterIssueNumber) {
    const promptTemplate = fs.readFileSync(
      path.join(__dirname, '../../prompts/sculptor.txt'),
      'utf-8'
    );

    // Filter spec for agents (no original request)
    const specForAgents = this.issueBodyManager.extractSpecForAgents(spec);
    const prompt = promptTemplate.replace('{{spec}}', JSON.stringify(specForAgents, null, 2));

    const result = await this.agentExecutor.execute('sculptor', prompt, {
      issueNumber: masterIssueNumber,
      discordNotifier: this.discordNotifier,
      statusResilienceManager: this.statusResilienceManager
    });
    const tasks = this.jsonParser.parse(result.response);
    
    this.validateTasks(tasks);
    
    return tasks;
  }

  /**
   * Execute Sentinel agent
   */
  async executeSentinel(spec, masterIssueNumber) {
    const promptTemplate = fs.readFileSync(
      path.join(__dirname, '../../prompts/sentinel.txt'),
      'utf-8'
    );

    // Filter spec for agents (no original request)
    const specForAgents = this.issueBodyManager.extractSpecForAgents(spec);
    const prompt = promptTemplate.replace('{{spec}}', JSON.stringify(specForAgents, null, 2));

    const result = await this.agentExecutor.execute('sentinel', prompt, {
      issueNumber: masterIssueNumber,
      discordNotifier: this.discordNotifier,
      statusResilienceManager: this.statusResilienceManager
    });
    const testTasks = this.jsonParser.parse(result.response);
    
    this.validateTestTasks(testTasks);
    
    return testTasks;
  }

  /**
   * Create implementation sub-issues
   */
  async createImplementationIssues(masterIssueNumber, tasks, worktreePath) {
    const issues = [];
    
    for (const task of tasks) {
      const issueNumber = await this.issueTemplateManager.createImplementationIssue(
        masterIssueNumber,
        task,
        worktreePath
      );
      
      issues.push({
        taskId: task.id,
        issueNumber,
        title: task.title,
        dependencies: task.dependencies
      });
    }
    
    return issues;
  }

  /**
   * Create test sub-issues
   */
  async createTestIssues(masterIssueNumber, testTasks, worktreePath) {
    const issues = [];
    
    for (const task of testTasks) {
      const issueNumber = await this.issueTemplateManager.createTestIssue(
        masterIssueNumber,
        task,
        worktreePath
      );
      
      issues.push({
        taskId: task.id,
        issueNumber,
        title: task.title,
        dependencies: task.dependencies
      });
    }
    
    return issues;
  }

  validateSpec(spec) {
    const required = ['requirements', 'acceptance_criteria', 'technical_approach'];
    for (const field of required) {
      if (!spec[field]) {
        throw new Error(`Invalid spec: missing field ${field}`);
      }
    }
  }

  validateTasks(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Invalid tasks: expected non-empty array');
    }
    
    for (const task of tasks) {
      if (!task.id || !task.title || !task.description) {
        throw new Error('Invalid task: missing required fields');
      }
    }
  }

  validateTestTasks(testTasks) {
    if (!Array.isArray(testTasks) || testTasks.length === 0) {
      throw new Error('Invalid test tasks: expected non-empty array');
    }
    
    for (const task of testTasks) {
      if (!task.id || !task.title || !task.test_scenarios) {
        throw new Error('Invalid test task: missing required fields');
      }
    }
  }

  formatSpec(spec) {
    return `## 📋 Technical Specification (Generated by Architect)

### Requirements
${spec.requirements.map(r => `- ${r}`).join('\n')}

### Acceptance Criteria
${spec.acceptance_criteria.map(c => `- ${c}`).join('\n')}

### Technical Approach
${spec.technical_approach}

### Edge Cases
${spec.edge_cases?.map(e => `- ${e}`).join('\n') || 'None specified'}

### Dependencies
${spec.dependencies?.map(d => `- ${d}`).join('\n') || 'None'}

### Estimated Complexity
**${spec.estimated_complexity}**
`;
  }
}
