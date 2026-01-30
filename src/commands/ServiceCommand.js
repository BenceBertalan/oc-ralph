/**
 * ServiceCommand - Run oc-ralph as long-running service
 * Combines web server + GitHub polling + orchestration queue
 */

import { ConfigManager } from '../core/ConfigManager.js';
import { Logger } from '../logging/Logger.js';
import { DebugLogger } from '../logging/DebugLogger.js';
import { LogStreamManager } from '../logging/LogStreamManager.js';
import { GitHubClient } from '../github/GitHubClient.js';
import { IssueOperations } from '../github/IssueOperations.js';
import { LabelOperations } from '../github/LabelOperations.js';
import { PullRequestOperations } from '../github/PullRequestOperations.js';
import { StateManager } from '../core/StateManager.js';
import { WorktreeManager } from '../core/WorktreeManager.js';
import { Orchestrator } from '../core/Orchestrator.js';
import { PlanningStage } from '../stages/PlanningStage.js';
import { ImplementationStage } from '../stages/ImplementationStage.js';
import { TestingStage } from '../stages/TestingStage.js';
import { CompletionStage } from '../stages/CompletionStage.js';
import { AgentExecutor } from '../agents/AgentExecutor.js';
import { IssueTemplateManager } from '../github/IssueTemplateManager.js';
import { GitOperations } from '../utils/GitOperations.js';
import { JSONParser } from '../utils/JSONParser.js';
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
import { OrchestrationQueue } from '../queue/OrchestrationQueue.js';
import { GitHubPoller } from '../queue/GitHubPoller.js';
import { WebServer } from '../web/WebServer.js';

export class ServiceCommand {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(options) {
    console.log('\n🚀 Starting oc-ralph service\n');

    // Load config
    const configManager = new ConfigManager(options.config);
    const config = configManager.load();

    // Initialize log stream manager
    const logStreamManager = new LogStreamManager(
      config.service?.maxBufferSize || 10000
    );

    // Initialize logger with stream manager
    const serviceLogger = new Logger({ 
      level: config.logging?.level || 'info',
      logDir: config.logging?.logDir || './logs',
      streamManager: logStreamManager
    });

    const debugLogger = new DebugLogger(serviceLogger, config.logging?.debugMode);
    debugLogger.setStreamManager(logStreamManager);

    serviceLogger.info('Service starting', {
      config: options.config,
      logLevel: config.logging?.level || 'info'
    });

    // Initialize GitHub clients
    const github = new GitHubClient(serviceLogger);
    const issueOps = new IssueOperations(github, serviceLogger);
    const labelOps = new LabelOperations(github, serviceLogger);
    const prOps = new PullRequestOperations(github, serviceLogger);
    const gitOps = new GitOperations(serviceLogger, configManager.getRepoPath());

    // Create orchestrator factory (creates fresh instance for each issue)
    const orchestratorFactory = async () => {
      // Initialize all orchestrator dependencies
      const jsonParser = new JSONParser();
      const stateManager = new StateManager(labelOps, issueOps, config, serviceLogger);
      const worktreeManager = new WorktreeManager(gitOps, labelOps, config, serviceLogger);
      const issueTemplateManager = new IssueTemplateManager(issueOps, config, serviceLogger);
      const agentExecutor = new AgentExecutor(config, serviceLogger, debugLogger);
      
      // Initialize execution utilities
      const dependencyResolver = new DependencyResolver(serviceLogger);
      const retryManager = new RetryManager(config, serviceLogger);
      const taskPoller = new TaskPoller(issueOps, serviceLogger);
      
      // Initialize status management
      const issueBodyManager = new IssueBodyManager();
      const statusTable = new StatusTable(issueOps, config, serviceLogger);
      const discordNotifier = new DiscordNotifier(config, serviceLogger);
      const statusUpdater = new StatusUpdater(
        issueOps,
        issueBodyManager,
        statusTable,
        discordNotifier,
        config,
        serviceLogger
      );
      
      // Initialize resilience manager
      const statusResilienceManager = new StatusResilienceManager({
        github: issueOps,
        discord: discordNotifier,
        occlient: agentExecutor.client,
        statusResilience: config.statusResilience,
        fullConfig: config
      }, serviceLogger);
      
      // Initialize stages
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
        serviceLogger
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
        serviceLogger
      );
      
      // Initialize testing stage
      const testFailureHandler = new TestFailureHandler(
        issueOps,
        issueTemplateManager,
        gitOps,
        config,
        serviceLogger
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
        serviceLogger
      );
      
      const testResultAggregator = new TestResultAggregator(
        issueOps,
        serviceLogger
      );
      
      const testingStage = new TestingStage(
        issueOps,
        agentExecutor,
        testRetryCoordinator,
        testResultAggregator,
        taskPoller,
        stateManager,
        statusUpdater,
        discordNotifier,
        config,
        serviceLogger
      );
      
      const completionStage = new CompletionStage(
        prOps,
        worktreeManager,
        statusUpdater,
        discordNotifier,
        config,
        serviceLogger
      );
      
      // Create orchestrator
      return new Orchestrator(
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
        serviceLogger
      );
    };

    // Initialize queue
    const queue = new OrchestrationQueue(orchestratorFactory, serviceLogger);

    // Start web server
    const port = config.service?.port || 3000;
    const host = config.service?.host || '0.0.0.0';
    
    const webServer = new WebServer(
      logStreamManager, 
      queue, 
      config, 
      serviceLogger
    );
    
    await webServer.start(port, host);

    serviceLogger.info('Web interface available', { 
      url: `http://localhost:${port}`,
      wsUrl: `ws://localhost:${port}/ws`
    });

    // Start GitHub poller
    const poller = new GitHubPoller(issueOps, queue, config, serviceLogger);
    await poller.start();

    serviceLogger.info('Service started successfully', {
      pollInterval: `${(config.service?.pollInterval || 60000) / 1000}s`,
      queueLabel: config.service?.queueLabel || 'oc-ralph:queue',
      repo: `${config.github.owner}/${config.github.repo}`
    });

    console.log('\n✅ Service running');
    console.log(`   Web UI: http://localhost:${port}`);
    console.log(`   Watching: ${config.github.owner}/${config.github.repo}`);
    console.log(`   Queue label: ${config.service?.queueLabel || 'oc-ralph:queue'}`);
    console.log('\nPress Ctrl+C to stop\n');

    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      serviceLogger.info(`Received ${signal}, shutting down gracefully...`);
      console.log(`\n${signal} received, shutting down...\n`);
      
      try {
        // Stop polling
        poller.stop();
        serviceLogger.info('Poller stopped');
        
        // Wait for current orchestration to complete (with timeout)
        const queueStatus = queue.getStatus();
        if (queueStatus.running) {
          console.log(`Waiting for issue #${queueStatus.running} to complete...`);
          serviceLogger.info('Waiting for running orchestration', { 
            issueNumber: queueStatus.running 
          });
          
          // TODO: Add proper wait logic with timeout
        }
        
        // Stop web server
        await webServer.stop();
        serviceLogger.info('Web server stopped');
        
        serviceLogger.info('Service stopped gracefully');
        console.log('✅ Service stopped\n');
        
        process.exit(0);
      } catch (error) {
        serviceLogger.error('Error during shutdown', { error: error.message });
        console.error('Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Keep alive
    return new Promise(() => {});
  }
}
