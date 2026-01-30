/**
 * Start command - begin orchestration
 */
import { ConfigManager } from '../core/ConfigManager.js';
import { StateManager } from '../core/StateManager.js';
import { WorktreeManager } from '../core/WorktreeManager.js';
import { Orchestrator } from '../core/Orchestrator.js';
import { PlanningStage } from '../stages/PlanningStage.js';
import { ImplementationStage } from '../stages/ImplementationStage.js';
import { TestingStage } from '../stages/TestingStage.js';
import { CompletionStage } from '../stages/CompletionStage.js';
import { AgentExecutor } from '../agents/AgentExecutor.js';
import { GitHubClient } from '../github/GitHubClient.js';
import { IssueOperations } from '../github/IssueOperations.js';
import { LabelOperations } from '../github/LabelOperations.js';
import { PullRequestOperations } from '../github/PullRequestOperations.js';
import { IssueTemplateManager } from '../github/IssueTemplateManager.js';
import { GitOperations } from '../utils/GitOperations.js';
import { JSONParser } from '../utils/JSONParser.js';
import { DebugLogger } from '../logging/DebugLogger.js';
import { IssueBodyManager } from '../utils/IssueBodyManager.js';
import { StatusTable } from '../utils/StatusTable.js';
import { StatusUpdater } from '../core/StatusUpdater.js';
import { DiscordNotifier } from '../notifications/DiscordNotifier.js';
import { TaskPoller } from '../core/TaskPoller.js';
import { DependencyResolver } from '../execution/DependencyResolver.js';
import { RetryManager } from '../execution/RetryManager.js';
import { TestFailureHandler } from '../execution/TestFailureHandler.js';
import { TestRetryCoordinator } from '../execution/TestRetryCoordinator.js';
import { TestResultAggregator } from '../execution/TestResultAggregator.js';
import { StatusResilienceManager } from '../resilience/StatusResilienceManager.js';

export class StartCommand {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(issueNumber, options) {
    console.log(`\n🎯 Starting orchestration for issue #${issueNumber}\n`);

    // Load config
    const configManager = new ConfigManager(options.config);
    const config = configManager.load({
      debugMode: options.debug || false
    });

    // Validate environment
    console.log('🔍 Validating environment...');
    await this.validateEnvironment(config);
    console.log('✅ Environment validated\n');

    // Initialize components
    const debugLogger = new DebugLogger(this.logger, config.logging.debugMode);
    const github = new GitHubClient(this.logger);
    const issueOps = new IssueOperations(github, this.logger);
    const labelOps = new LabelOperations(github, this.logger);
    const prOps = new PullRequestOperations(github, this.logger);
    const gitOps = new GitOperations(this.logger, configManager.getRepoPath());
    const jsonParser = new JSONParser();
    
    const stateManager = new StateManager(labelOps, issueOps, config, this.logger);
    const worktreeManager = new WorktreeManager(gitOps, labelOps, config, this.logger);
    const issueTemplateManager = new IssueTemplateManager(issueOps, config, this.logger);
    
    const agentExecutor = new AgentExecutor(config, this.logger, debugLogger);
    
    // Initialize execution utilities
    const dependencyResolver = new DependencyResolver(this.logger);
    const retryManager = new RetryManager(config, this.logger);
    const taskPoller = new TaskPoller(issueOps, this.logger);
    
    // Initialize new components for issue body management and status updates
    const issueBodyManager = new IssueBodyManager();
    const statusTable = new StatusTable(issueOps, config, this.logger);
    const discordNotifier = new DiscordNotifier(config, this.logger);
    const statusUpdater = new StatusUpdater(
      issueOps,
      issueBodyManager,
      statusTable,
      discordNotifier,
      config,
      this.logger
    );
    
    // Initialize resilience manager
    const statusResilienceManager = new StatusResilienceManager({
      github: issueOps,
      discord: discordNotifier,
      occlient: agentExecutor.client,
      statusResilience: config.statusResilience,
      fullConfig: config // Pass full config for model failover
    }, this.logger);
    
    const planningStage = new PlanningStage(
      agentExecutor,
      issueOps,
      issueBodyManager,
      statusUpdater,
      issueTemplateManager,
      stateManager,
      jsonParser,
      discordNotifier,
      statusResilienceManager,
      config,
      this.logger
    );

    const implementationStage = new ImplementationStage(
      agentExecutor,
      issueOps,
      stateManager,
      dependencyResolver,
      retryManager,
      taskPoller,
      statusUpdater,
      discordNotifier,
      statusResilienceManager,
      config,
      this.logger
    );
    
    // Initialize testing stage with self-healing components
    const testFailureHandler = new TestFailureHandler(
      issueOps,
      issueTemplateManager,
      gitOps,
      config,
      this.logger
    );
    
    const testRetryCoordinator = new TestRetryCoordinator(
      testFailureHandler,
      agentExecutor,
      taskPoller,
      issueOps,
      dependencyResolver,
      statusUpdater,
      discordNotifier,
      config,
      this.logger
    );
    
    const testResultAggregator = new TestResultAggregator(
      issueOps,
      this.logger
    );
    
    const testingStage = new TestingStage(
      issueOps,
      agentExecutor,
      taskPoller,
      testRetryCoordinator,
      testResultAggregator,
      dependencyResolver,
      statusUpdater,
      discordNotifier,
      config,
      this.logger
    );
    
    // Initialize completion stage
    const completionStage = new CompletionStage(
      prOps,
      issueOps,
      gitOps,
      issueBodyManager,
      statusUpdater,
      discordNotifier,
      config,
      this.logger
    );

    const orchestrator = new Orchestrator(
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
      this.logger
    );

    // Start orchestration
    try {
      const result = await orchestrator.start(issueNumber);
      
      console.log('\n✅ Orchestration completed successfully!');
      console.log(`\nStatus: ${result.status}`);
      
      if (result.status === 'approved') {
        console.log('\n🎉 Full orchestration cycle complete!');
        console.log('- Planning: ✅ Complete');
        console.log('- Implementation: ✅ Complete');
        console.log('- Testing: ✅ Complete');
        console.log('- Pull Request: ✅ Created');
      }
      
      console.log(`\nView issue: https://github.com/${config.github.owner}/${config.github.repo}/issues/${issueNumber}\n`);
      
    } catch (error) {
      console.error('\n❌ Orchestration failed:', error.message);
      if (options.debug) {
        console.error('\nStack trace:', error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Validate environment before starting orchestration
   */
  async validateEnvironment(config) {
    const errors = [];

    // Check GitHub token
    if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
      errors.push('GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN environment variable.');
    }

    // Check git is installed
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('git --version');
    } catch (error) {
      errors.push('Git is not installed or not in PATH.');
    }

    // Check gh CLI is installed
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('gh --version');
    } catch (error) {
      errors.push('GitHub CLI (gh) is not installed or not in PATH.');
    }

    // Check we're in a git repository
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('git rev-parse --git-dir');
    } catch (error) {
      errors.push('Not in a git repository. Run this command from your repository root.');
    }

    // Check config has required fields
    if (!config.github?.owner || !config.github?.repo) {
      errors.push('GitHub owner/repo not configured in .oc-ralph/config.json');
    }

    if (!config.github?.baseBranch) {
      errors.push('Base branch not configured in .oc-ralph/config.json');
    }

    // Check worktree base path exists or can be created
    if (config.worktree?.basePath) {
      try {
        const fs = await import('fs/promises');
        await fs.access(config.worktree.basePath);
      } catch (error) {
        // Path doesn't exist, that's okay - will be created
      }
    }

    if (errors.length > 0) {
      console.error('\n❌ Environment validation failed:\n');
      errors.forEach(error => console.error(`  - ${error}`));
      console.error('');
      process.exit(1);
    }
  }
}
