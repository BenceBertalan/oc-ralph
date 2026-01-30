/**
 * Main orchestrator - coordinates all stages
 */
import { ApprovalMonitor } from './ApprovalMonitor.js';

export class Orchestrator {
  constructor(
    configManager,
    stateManager,
    worktreeManager,
    planningStage,
    implementationStage,
    testingStage,
    completionStage,
    issueBodyManager,
    statusTable,
    statusUpdater,
    logger
  ) {
    this.configManager = configManager;
    this.stateManager = stateManager;
    this.worktreeManager = worktreeManager;
    this.planningStage = planningStage;
    this.implementationStage = implementationStage;
    this.testingStage = testingStage;
    this.completionStage = completionStage;
    this.issueBodyManager = issueBodyManager;
    this.statusTable = statusTable;
    this.statusUpdater = statusUpdater;
    this.logger = logger;
    this.config = configManager.config;
    this.currentPlan = null;
    this.implResult = null;
    this.testResult = null;
  }

  /**
   * Start new orchestration
   */
  async start(issueNumber) {
    this.logger.info('Starting orchestration', { issueNumber });

    try {
      // Ensure labels exist
      const repo = this.configManager.getGitHubRepo();
      await this.stateManager.labelOps.ensureLabelsExist(repo);

      // Send orchestration-started event
      await this.statusUpdater.onEvent('orchestration-started', {
        masterIssueNumber: issueNumber,
        issueUrl: `https://github.com/${repo}/issues/${issueNumber}`
      });

      // Create worktree
      const { branchName, worktreePath } = await this.worktreeManager.createWorktree(
        issueNumber,
        this.config.github.baseBranch
      );

      this.logger.info('Worktree created', { branchName, worktreePath });

      // Transition to planning
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:planning');

      // Initialize status table with planning status BEFORE starting agents
      await this.initializeStatusTable(issueNumber);

      // Execute planning stage
      const plan = await this.planningStage.execute(issueNumber, worktreePath);

      // Update master issue with plan
      await this.updateMasterIssueWithPlan(issueNumber, plan);

      // Transition to awaiting approval
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:awaiting-approval');

      // Send awaiting-approval event
      await this.statusUpdater.onEvent('awaiting-approval', {
        masterIssueNumber: issueNumber,
        issueUrl: `https://github.com/${repo}/issues/${issueNumber}`
      });

      this.logger.info('Orchestration initialized, awaiting approval', { issueNumber });

      // Wait for approval and continue
      const approvalResult = await this.waitForApprovalAndContinue(issueNumber);

      if (approvalResult.rejected) {
        return { success: false, issueNumber, status: 'rejected' };
      }

      // If approved, implementation and testing stages will be added here in Sprint 2 & 3
      // For now, return success
      return { success: true, issueNumber, status: 'approved' };

    } catch (error) {
      this.logger.error('Orchestration start failed', {
        issueNumber,
        error: error.message,
        stack: error.stack
      });

      // Send orchestration-failed event
      const repo = this.configManager.getGitHubRepo();
      await this.statusUpdater.onEvent('orchestration-failed', {
        masterIssueNumber: issueNumber,
        issueUrl: `https://github.com/${repo}/issues/${issueNumber}`,
        error: error.message
      });

      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:failed');
      throw error;
    }
  }

  /**
   * Initialize status table before any agents run
   */
  async initializeStatusTable(issueNumber) {
    const repo = this.configManager.getGitHubRepo();
    
    // Initialize planning status for status updater
    const initialPlanningStatus = {
      architectComplete: false,
      sculptorComplete: false,
      sentinelComplete: false,
      implTaskCount: 0,
      testTaskCount: 0,
      completedCount: 0,
      allComplete: false
    };
    
    this.statusUpdater.updatePlanningStatus(initialPlanningStatus);
    
    // Start status updater (will show initial table with pending agents)
    this.statusUpdater.start(issueNumber, null, initialPlanningStatus);
    
    this.logger.info('Status table initialized', { issueNumber });
  }

  /**
   * Update master issue with plan
   */
  async updateMasterIssueWithPlan(issueNumber, plan) {
    const repo = this.configManager.getGitHubRepo();
    
    // Store plan for status updates
    this.currentPlan = plan;
    this.statusUpdater.updatePlan(plan);
    
    // Fetch current issue
    const issue = await this.stateManager.issueOps.getIssue(repo, issueNumber);
    
    // Parse body to get original request
    const { originalRequest } = this.issueBodyManager.parse(issue.body);
    
    // Build body with plan (status table already updating)
    const newBody = this.issueBodyManager.build(plan.spec, plan, originalRequest, null, {
      architectComplete: true,
      sculptorComplete: true,
      sentinelComplete: true,
      implTaskCount: plan.implementationTasks.length,
      testTaskCount: plan.testTasks.length,
      completedCount: 3,
      allComplete: true
    });
    
    // Update issue
    await this.stateManager.issueOps.updateIssue(repo, issueNumber, { body: newBody });
    
    this.logger.info('Master issue updated with plan', { issueNumber });
  }

  /**
   * Check current status
   */
  async status(issueNumber) {
    const state = await this.stateManager.getCurrentState(issueNumber);
    
    return {
      issueNumber,
      state,
      canResume: await this.stateManager.canResume(issueNumber)
    };
  }

  /**
   * Wait for approval and continue orchestration
   */
  async waitForApprovalAndContinue(issueNumber) {
    const repo = this.configManager.getGitHubRepo();
    
    // Check if auto-approve is enabled
    if (this.config.execution?.autoApprove) {
      this.logger.info('Auto-approve enabled, skipping manual approval', { issueNumber });
      
      // Automatically add approval label
      await this.stateManager.issueOps.addLabels(repo, issueNumber, ['oc-ralph:approved']);
      this.logger.info('Plan auto-approved', { issueNumber });
      
      // Small delay to ensure label is applied
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      this.logger.info('Waiting for approval', { issueNumber });
    }
    
    const approvalMonitor = new ApprovalMonitor(
      this.stateManager.issueOps,
      this.config,
      this.logger
    );
    
    try {
      const result = await approvalMonitor.waitForApproval(repo, issueNumber);
      
      if (result.approved) {
        this.logger.info('Plan approved, continuing to implementation', { issueNumber });
        
        // Get worktree path
        const worktreePath = await this.worktreeManager.getWorktree(issueNumber);
        
        // Run implementation stage
        this.implResult = await this.runImplementation(issueNumber, worktreePath, this.currentPlan);
        
        // Run testing stage
        this.testResult = await this.runTesting(issueNumber, worktreePath);
        
        // Run completion stage
        await this.runCompletion(issueNumber, worktreePath);
        
        return { approved: true, rejected: false };
        
      } else if (result.rejected) {
        this.logger.info('Plan rejected, cleaning up', { issueNumber });
        await this.cleanup(issueNumber);
        return { approved: false, rejected: true };
      }
      
    } catch (error) {
      this.logger.error('Approval monitoring failed', {
        issueNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cleanup after rejection or failure
   */
  async cleanup(issueNumber) {
    try {
      const repo = this.configManager.getGitHubRepo();
      
      // Mark as rejected
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:rejected');
      
      // Stop status updater
      await this.statusUpdater.stop();
      
      // Cleanup worktree if configured
      if (this.config.worktree.cleanupOnFailure) {
        await this.worktreeManager.cleanupWorktree(issueNumber);
      }
      
      this.logger.info('Cleanup completed', { issueNumber });
      
    } catch (error) {
      this.logger.error('Cleanup failed', {
        issueNumber,
        error: error.message
      });
      // Don't throw - best effort cleanup
    }
  }

  /**
   * Run implementation stage
   */
  async runImplementation(issueNumber, worktreePath, plan) {
    const repo = this.configManager.getGitHubRepo();
    
    try {
      // Transition to implementing
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:implementing');
      
      // Send Discord notification
      await this.statusUpdater.onEvent('implementation-started', {
        masterIssueNumber: issueNumber,
        issueUrl: `https://github.com/${repo}/issues/${issueNumber}`
      });
      
      this.logger.info('Starting implementation stage', { issueNumber });
      
      // Execute implementation stage
      const result = await this.implementationStage.execute(
        issueNumber,
        worktreePath,
        plan
      );
      
      if (result.failed > 0) {
        throw new Error(`Implementation failed: ${result.failed} tasks failed`);
      }
      
      this.logger.info('Implementation stage completed', { issueNumber, result });
      
      return result;
      
    } catch (error) {
      this.logger.error('Implementation stage failed', {
        issueNumber,
        error: error.message
      });
      
      // Send failure event
      await this.statusUpdater.onEvent('orchestration-failed', {
        masterIssueNumber: issueNumber,
        issueUrl: `https://github.com/${repo}/issues/${issueNumber}`,
        error: error.message
      });
      
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:failed');
      throw error;
    }
  }

  /**
   * Run testing stage with automatic failure recovery
   */
  async runTesting(issueNumber, worktreePath) {
    const repo = this.configManager.getGitHubRepo();
    
    try {
      // Transition to testing
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:testing');
      
      // Send Discord notification
      await this.statusUpdater.onEvent('testing-started', {
        masterIssueNumber: issueNumber,
        issueUrl: `https://github.com/${repo}/issues/${issueNumber}`
      });
      
      this.logger.info('Starting testing stage', { issueNumber });
      
      // Execute testing stage
      const result = await this.testingStage.execute(issueNumber, worktreePath);
      
      if (result.failed > 0) {
        throw new Error(`Testing failed: ${result.failed} test(s) could not be fixed`);
      }
      
      this.logger.info('Testing stage completed', { issueNumber, result });
      
      return result;
      
    } catch (error) {
      this.logger.error('Testing stage failed', {
        issueNumber,
        error: error.message
      });
      
      // Send failure event
      await this.statusUpdater.onEvent('orchestration-failed', {
        masterIssueNumber: issueNumber,
        issueUrl: `https://github.com/${repo}/issues/${issueNumber}`,
        error: error.message
      });
      
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:failed');
      throw error;
    }
  }

  /**
   * Run completion stage - create PR and finalize
   */
  async runCompletion(issueNumber, worktreePath) {
    const repo = this.configManager.getGitHubRepo();
    
    try {
      // Transition to completing
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:completing');
      
      this.logger.info('Starting completion stage', { issueNumber });
      
      // Execute completion stage
      const result = await this.completionStage.execute(
        issueNumber,
        worktreePath,
        this.currentPlan,
        this.implResult,
        this.testResult
      );
      
      // Transition to completed
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:completed');
      
      this.logger.info('Completion stage finished', {
        issueNumber,
        prNumber: result.prNumber,
        prUrl: result.prUrl
      });
      
      return result;
      
    } catch (error) {
      this.logger.error('Completion stage failed', {
        issueNumber,
        error: error.message
      });
      
      // Send failure event
      await this.statusUpdater.onEvent('orchestration-failed', {
        masterIssueNumber: issueNumber,
        issueUrl: `https://github.com/${repo}/issues/${issueNumber}`,
        error: error.message
      });
      
      await this.stateManager.transitionTo(issueNumber, 'oc-ralph:failed');
      throw error;
    }
  }

  /**
   * Resume orchestration from current state
   */
  async resume(issueNumber) {
    const repo = this.configManager.getGitHubRepo();
    const currentState = await this.stateManager.getCurrentState(issueNumber);
    
    this.logger.info('Resuming orchestration', { issueNumber, currentState });
    
    try {
      // Load plan from sub-issues if we don't have it
      if (!this.currentPlan) {
        this.currentPlan = await this.loadPlanFromSubIssues(issueNumber);
      }
      
      if (currentState === 'oc-ralph:awaiting-approval') {
        // Restart approval monitor
        const approvalResult = await this.waitForApprovalAndContinue(issueNumber);
        
        if (approvalResult.rejected) {
          return { success: false, issueNumber, status: 'rejected' };
        }
        
        return { success: true, issueNumber, status: 'approved' };
      }
      
      // For other states, return current status
      // Will be extended in later sprints
      return { success: true, issueNumber, status: currentState.replace('oc-ralph:', '') };
      
    } catch (error) {
      this.logger.error('Resume failed', {
        issueNumber,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Load plan from sub-issues (for resume)
   */
  async loadPlanFromSubIssues(masterIssueNumber) {
    this.logger.info('Loading plan from sub-issues', { masterIssueNumber });
    
    const repo = `${this.config.github.owner}/${this.config.github.repo}`;
    
    // Query sub-issues via gh CLI
    const GitHubClient = (await import('../github/GitHubClient.js')).GitHubClient;
    const github = new GitHubClient(this.logger);
    
    const subIssuesJson = await github.execJSON(
      `issue list --repo ${repo} --label "oc-ralph:sub-issue" --json number,title,body,labels --limit 1000`
    );
    
    const implementationTasks = [];
    const testTasks = [];
    
    for (const issue of subIssuesJson) {
      const isImpl = issue.labels.some(l => l.name === 'oc-ralph:implementation');
      const isTest = issue.labels.some(l => l.name === 'oc-ralph:test');
      
      // Extract task info from issue body or title
      const task = {
        title: issue.title.replace(/^\[Implementation\]\s*/, '').replace(/^\[Test\]\s*/, ''),
        issueNumber: issue.number,
        estimated_complexity: 'medium', // Default
        dependencies: [] // Will need to parse from body if stored
      };
      
      if (isImpl) {
        implementationTasks.push(task);
      } else if (isTest) {
        testTasks.push(task);
      }
    }
    
    this.logger.info('Plan loaded from sub-issues', {
      implTaskCount: implementationTasks.length,
      testTaskCount: testTasks.length
    });
    
    return {
      implementationTasks,
      testTasks
    };
  }
}
