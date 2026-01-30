/**
 * Resume command - Resume orchestration from current state
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
import { TaskPoller } from '../core/TaskPoller.js';
import { DiscordNotifier } from '../notifications/DiscordNotifier.js';
import { DependencyResolver } from '../execution/DependencyResolver.js';
import { RetryManager } from '../execution/RetryManager.js';
import { TestFailureHandler } from '../execution/TestFailureHandler.js';
import { TestRetryCoordinator } from '../execution/TestRetryCoordinator.js';
import { TestResultAggregator } from '../execution/TestResultAggregator.js';

export class ResumeCommand {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(issueNumber, options) {
    console.log(`\n🔄 Resuming orchestration for issue #${issueNumber}\n`);

    // Load config
    const configManager = new ConfigManager(options.config);
    const config = configManager.load({
      debugMode: options.debug || false
    });

    // Initialize components
    const debugLogger = new DebugLogger(this.logger, config.logging.debugMode);
    const github = new GitHubClient(this.logger);
    const issueOps = new IssueOperations(github, this.logger);
    const labelOps = new LabelOperations(github, this.logger);
    const prOps = new PullRequestOperations(github, this.logger);
    const gitOps = new GitOperations(this.logger);
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
    
    const planningStage = new PlanningStage(
      agentExecutor,
      issueOps,
      issueBodyManager,
      statusUpdater,
      issueTemplateManager,
      stateManager,
      jsonParser,
      discordNotifier,
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
      config,
      this.logger
    );
    
    const testingStage = new TestingStage(
      agentExecutor,
      taskPoller,
      testRetryCoordinator,
      testResultAggregator,
      statusUpdater,
      discordNotifier,
      config,
      this.logger
    );
    
    const completionStage = new CompletionStage(
      prOps,
      issueOps,
      gitOps,
      worktreeManager,
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

    // Get current state
    try {
      const currentState = await stateManager.getCurrentState(issueNumber);
      
      console.log(`Current state: ${currentState}`);
      
      // Check if can resume
      const canResume = await stateManager.canResume(issueNumber);
      if (!canResume) {
        console.log(`\n⚠️ Cannot resume orchestration in state: ${currentState}`);
        console.log('Orchestration may be completed, failed, or in an invalid state.\n');
        process.exit(1);
      }

      // Resume based on state
      const result = await this.resumeFromState(
        orchestrator,
        stateManager,
        issueNumber,
        currentState,
        config
      );
      
      console.log(`\n✅ Resume operation completed`);
      console.log(`Status: ${result.status}`);
      console.log(`View issue: https://github.com/${config.github.owner}/${config.github.repo}/issues/${issueNumber}\n`);
      
    } catch (error) {
      console.error('\n❌ Resume failed:', error.message);
      if (options.debug) {
        console.error('\nStack trace:', error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Resume from specific state
   */
  async resumeFromState(orchestrator, stateManager, issueNumber, currentState, config) {
    switch (currentState) {
      case 'oc-ralph:awaiting-approval':
        this.logger.info('Resuming from awaiting-approval state', { issueNumber });
        // Orchestrator will poll for approval and continue
        return await orchestrator.resume(issueNumber);

      case 'oc-ralph:implementing':
        this.logger.info('Resuming from implementing state', { issueNumber });
        // TODO: Find incomplete implementation tasks and continue
        // For now, use orchestrator's resume method
        return await orchestrator.resume(issueNumber);

      case 'oc-ralph:testing':
        this.logger.info('Resuming from testing state', { issueNumber });
        console.log('ℹ️  Testing stage in progress. Use orchestrator.resume() to continue.\n');
        return await orchestrator.resume(issueNumber);

      case 'oc-ralph:completing':
        this.logger.info('Resuming from completing state', { issueNumber });
        console.log('ℹ️  Completion stage in progress. Use orchestrator.resume() to continue.\n');
        return await orchestrator.resume(issueNumber);

      case 'oc-ralph:completed':
        this.logger.info('Orchestration already completed', { issueNumber });
        console.log('✅ Orchestration already completed for this issue.\n');
        return { status: 'completed', message: 'Already completed' };

      case 'oc-ralph:pr-created':
        this.logger.info('PR already created', { issueNumber });
        console.log('✅ Pull request already created for this issue.\n');
        return { status: 'pr-created', message: 'PR already created' };

      case 'oc-ralph:failed':
        this.logger.warn('Cannot resume failed orchestration', { issueNumber });
        throw new Error('Cannot resume from failed state. Create a new orchestration.');

      case 'oc-ralph:rejected':
        this.logger.warn('Cannot resume rejected orchestration', { issueNumber });
        throw new Error('Cannot resume from rejected state. Create a new orchestration.');

      case 'oc-ralph:planning':
        this.logger.info('Resuming from planning state', { issueNumber });
        // Let planning continue
        return await orchestrator.resume(issueNumber);

      default:
        throw new Error(`Unknown state: ${currentState}`);
    }
  }
}
