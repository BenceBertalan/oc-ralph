/**
 * ImplementationStage - Execute Craftsman agents for implementation tasks
 */
export class ImplementationStage {
  constructor(
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
    logger
  ) {
    this.agentExecutor = agentExecutor;
    this.issueOps = issueOps;
    this.stateManager = stateManager;
    this.dependencyResolver = dependencyResolver;
    this.retryManager = retryManager;
    this.taskPoller = taskPoller;
    this.statusUpdater = statusUpdater;
    this.discordNotifier = discordNotifier;
    this.statusResilienceManager = statusResilienceManager;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Execute implementation stage
   */
  async execute(issueNumber, worktreePath, implementationPlan) {
    this.logger.info('Starting implementation stage', {
      issueNumber,
      taskCount: implementationPlan.implementationIssues.length
    });

    const repo = `${this.config.github.owner}/${this.config.github.repo}`;
    const results = {
      completed: 0,
      failed: 0,
      total: implementationPlan.implementationIssues.length
    };

    try {
      // Resolve dependencies and create batches
      const batches = await this.dependencyResolver.resolve(
        implementationPlan.implementationIssues
      );

      this.logger.info('Implementation tasks batched', {
        issueNumber,
        batchCount: batches.length
      });

      // Execute each batch sequentially, tasks within batch in parallel
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        this.logger.info('Executing implementation batch', {
          issueNumber,
          batchIndex,
          taskCount: batch.length
        });

        const batchResults = await this.executeBatch(
          batch,
          worktreePath,
          issueNumber,
          implementationPlan
        );

        results.completed += batchResults.completed;
        results.failed += batchResults.failed;

        // If any task in batch failed, stop
        if (batchResults.failed > 0) {
          this.logger.error('Implementation batch failed', {
            issueNumber,
            batchIndex,
            failed: batchResults.failed
          });
          break;
        }
      }

      this.logger.info('Implementation stage completed', { issueNumber, results });
      return results;

    } catch (error) {
      this.logger.error('Implementation stage failed', {
        issueNumber,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Execute a batch of tasks in parallel
   */
  async executeBatch(batch, worktreePath, masterIssueNumber, implementationPlan) {
    const repo = `${this.config.github.owner}/${this.config.github.repo}`;
    const results = { completed: 0, failed: 0 };

    // batch contains task objects with issueNumber
    const batchTasks = batch.map(task => ({
      task,
      issueNumber: task.issueNumber
    }));

    // Execute all tasks in batch concurrently
    const promises = batchTasks.map(({ task, issueNumber }) => 
      this.executeTask(issueNumber, worktreePath, masterIssueNumber)
    );

    const batchResults = await Promise.allSettled(promises);

    // Process results
    batchResults.forEach((result, index) => {
      const { issueNumber } = batchTasks[index];
      
      if (result.status === 'fulfilled') {
        results.completed++;
        this.logger.info('Implementation task completed', { issueNumber });
      } else {
        results.failed++;
        this.logger.error('Implementation task failed', {
          issueNumber,
          error: result.reason.message
        });
      }
    });

    return results;
  }

  /**
   * Execute a single implementation task
   */
  async executeTask(taskIssueNumber, worktreePath, masterIssueNumber) {
    const repo = `${this.config.github.owner}/${this.config.github.repo}`;
    
    this.logger.info('Executing implementation task', { taskIssueNumber });

    try {
      // Fetch sub-issue
      const issue = await this.issueOps.getIssue(repo, taskIssueNumber);

      // Transition to in-progress
      await this.stateManager.issueOps.addLabels(repo, taskIssueNumber, ['oc-ralph:in-progress']);

      // Execute with retry
      await this.retryManager.executeWithRetry(
        async () => {
          // Launch Craftsman agent
          const prompt = this.buildCraftsmanPrompt(issue, worktreePath, masterIssueNumber);
          await this.agentExecutor.execute('craftsman', prompt, {
            worktree: worktreePath,
            issueNumber: taskIssueNumber,
            statusUpdater: this.statusUpdater,
            discordNotifier: this.discordNotifier,
            statusResilienceManager: this.statusResilienceManager
          });

          // Poll for completion
          const timeoutMs = (this.config.agents.craftsman?.timeout || 600) * 1000;
          await this.taskPoller.waitForCompletion(repo, taskIssueNumber, timeoutMs);
        },
        {
          taskName: `implementation-task-${taskIssueNumber}`,
          maxAttempts: this.config.execution.retry.maxAttempts
        }
      );

      // Trigger immediate status table update
      await this.statusUpdater.updateStatusTable();

      // Send Discord notification
      await this.discordNotifier.onEvent('task-completed', {
        masterIssueNumber,
        taskIssueNumber,
        taskTitle: issue.title,
        taskIssueUrl: `https://github.com/${repo}/issues/${taskIssueNumber}`
      });

      this.logger.info('Implementation task succeeded', { taskIssueNumber });

    } catch (error) {
      this.logger.error('Implementation task failed', {
        taskIssueNumber,
        error: error.message,
        errorType: error.name,
        errorCode: error.code
      });

      // Check if error is SERVER_UNREACHABLE
      if (error.code === 'SERVER_UNREACHABLE' || error.name === 'ServerUnreachableError') {
        // Get the current log file
        const logFile = this.logger.getCurrentLogFile();
        
        // Send Discord notification with log file attachment
        await this.discordNotifier.onEventWithFile('critical-error', {
          masterIssueNumber,
          taskIssueNumber,
          errorType: 'OpenCode Server Unreachable',
          errorMessage: error.message,
          taskTitle: issue.title,
          details: `The OpenCode server became unreachable during task execution. Health checks failed after ${error.healthCheckAttempts || 3} attempts.\n\nFull orchestrator debug log is attached.`
        }, logFile);
      }

      // Mark as failed
      await this.stateManager.issueOps.addLabels(repo, taskIssueNumber, ['oc-ralph:failed']);

      throw error;
    }
  }

  /**
   * Build prompt for Craftsman agent
   */
  buildCraftsmanPrompt(issue, worktreePath, masterIssueNumber) {
    const repo = `${this.config.github.owner}/${this.config.github.repo}`;
    
    return `You are working on implementation task for master issue #${masterIssueNumber}.

## Task
${issue.title}

## Description
${issue.body}

## Instructions
1. Implement the required functionality in the worktree: ${worktreePath}
2. Make focused, clean code changes
3. Follow the codebase patterns and conventions
4. Write clear, descriptive commit messages
5. When complete, add label 'oc-ralph:agent-complete' to issue #${issue.number}
6. Update the issue with a summary of your changes

## Repository
${repo}

## Worktree Path
${worktreePath}

## Current Issue
https://github.com/${repo}/issues/${issue.number}

Begin implementation.`;
  }
}
