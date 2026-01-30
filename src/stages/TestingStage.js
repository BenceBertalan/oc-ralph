/**
 * Testing Stage - Execute all tests with automatic failure recovery
 * 
 * Responsibilities:
 * - Execute tests in parallel batches (respecting dependencies)
 * - For each failed test, invoke TestRetryCoordinator
 * - Track test results and fix attempts
 * - Return comprehensive test summary
 * 
 * Flow:
 * 1. Get all test sub-issues
 * 2. Batch tests by dependencies
 * 3. Execute each batch in parallel
 * 4. For failed tests, coordinate fix attempts
 * 5. Aggregate final results
 */
export class TestingStage {
  constructor(
    issueOps,
    agentExecutor,
    taskPoller,
    testRetryCoordinator,
    testResultAggregator,
    dependencyResolver,
    statusUpdater,
    discordNotifier,
    config,
    logger
  ) {
    this.issueOps = issueOps;
    this.agentExecutor = agentExecutor;
    this.taskPoller = taskPoller;
    this.testRetryCoordinator = testRetryCoordinator;
    this.testResultAggregator = testResultAggregator;
    this.dependencyResolver = dependencyResolver;
    this.statusUpdater = statusUpdater;
    this.discordNotifier = discordNotifier;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Execute all tests with automatic failure recovery
   * 
   * @param {number} masterIssueNumber - Master issue number
   * @param {string} worktreePath - Path to worktree
   * @returns {Promise<Object>} Test results summary
   */
  async execute(masterIssueNumber, worktreePath) {
    this.logger.info('Starting testing stage', {
      masterIssueNumber,
      worktreePath
    });

    const repo = {
      owner: this.config.github.owner,
      repo: this.config.github.repo
    };

    try {
      // Step 1: Get all test sub-issues
      const testIssues = await this.getTestSubIssues(repo, masterIssueNumber);
      
      if (testIssues.length === 0) {
        this.logger.warn('No test sub-issues found');
        return {
          passed: 0,
          failed: 0,
          total: 0,
          message: 'No tests to run'
        };
      }

      this.logger.info(`Found ${testIssues.length} test(s) to execute`);

      // Step 2: Execute tests in parallel batches
      await this.executeTestsInBatches(repo, testIssues, worktreePath, masterIssueNumber);

      // Step 3: Check for failures and coordinate fixes
      const failedTests = await this.identifyFailedTests(repo, testIssues);
      
      if (failedTests.length > 0) {
        this.logger.info(`${failedTests.length} test(s) failed, starting fix coordination`);
        
        // Fix failed tests sequentially
        const fixResults = await this.fixFailedTests(
          repo,
          failedTests,
          testIssues,
          worktreePath,
          masterIssueNumber
        );

        // Check if any tests still failed after max attempts
        const permanentlyFailed = fixResults.filter(r => !r.success);
        
        if (permanentlyFailed.length > 0) {
          throw new Error(
            `${permanentlyFailed.length} test(s) could not be fixed after maximum attempts`
          );
        }
      }

      // Step 4: Aggregate final results
      const results = await this.testResultAggregator.aggregateResults(
        repo,
        testIssues
      );

      this.logger.info('Testing stage completed', results);
      
      return results;
    } catch (error) {
      this.logger.error('Testing stage failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get all test sub-issues for master issue
   */
  async getTestSubIssues(repo, masterIssueNumber) {
    this.logger.info('Fetching test sub-issues', { masterIssueNumber });

    const issues = await this.issueOps.getIssuesByLabel(
      repo.owner,
      repo.repo,
      `oc-ralph:master-${masterIssueNumber}`
    );

    // Filter for test issues (have oc-ralph:test label)
    const testIssues = issues.filter(issue => 
      issue.labels.some(l => l.name === 'oc-ralph:test')
    );

    return testIssues;
  }

  /**
   * Execute tests in parallel batches respecting dependencies
   */
  async executeTestsInBatches(repo, testIssues, worktreePath, masterIssueNumber) {
    this.logger.info('Executing tests in parallel batches');

    // Create batches based on dependencies
    const batches = this.dependencyResolver.createBatches(testIssues);
    
    this.logger.info(`Created ${batches.length} test batch(es)`);

    // Execute batches sequentially, tests within batch in parallel
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      this.logger.info(`Executing batch ${i + 1}/${batches.length} with ${batch.length} test(s)`);
      
      await this.executeBatch(repo, batch, worktreePath, masterIssueNumber);
    }
  }

  /**
   * Execute a single batch of tests in parallel
   */
  async executeBatch(repo, batch, worktreePath, masterIssueNumber) {
    const maxConcurrency = this.getMaxConcurrency();
    
    // Execute tests with concurrency limit
    const executing = [];
    
    for (const testIssue of batch) {
      const promise = this.executeTest(repo, testIssue, worktreePath, masterIssueNumber);
      executing.push(promise);
      
      // Respect max concurrency
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        executing.splice(
          executing.findIndex(p => p.status === 'fulfilled' || p.status === 'rejected'),
          1
        );
      }
    }
    
    // Wait for remaining tests
    await Promise.allSettled(executing);
  }

  /**
   * Execute a single test
   */
  async executeTest(repo, testIssue, worktreePath, masterIssueNumber) {
    this.logger.info('Executing test', {
      testIssue: testIssue.number,
      testTitle: testIssue.title
    });

    try {
      // Execute Janos test agent
      await this.agentExecutor.executeAgent(
        'janos',
        {
          issueNumber: testIssue.number,
          worktreePath,
          masterIssueNumber,
          statusUpdater: this.statusUpdater
        }
      );

      // Poll for completion
      const result = await this.taskPoller.pollForCompletion(
        repo.owner,
        repo.repo,
        testIssue.number,
        this.config.agents.janos.timeout * 1000
      );

      if (result.timedOut) {
        this.logger.error('Test execution timed out', {
          testIssue: testIssue.number
        });
        
        // Mark as failed
        await this.issueOps.addLabels(
          repo.owner,
          repo.repo,
          testIssue.number,
          ['oc-ralph:test-failed']
        );
      } else {
        this.logger.info('Test execution completed', {
          testIssue: testIssue.number
        });
      }

      // Update status table
      await this.statusUpdater.notifyTaskUpdate();
    } catch (error) {
      this.logger.error('Test execution failed', {
        error: error.message,
        errorType: error.name,
        errorCode: error.code,
        testIssue: testIssue.number
      });
      
      // Check if error is SERVER_UNREACHABLE
      if (error.code === 'SERVER_UNREACHABLE' || error.name === 'ServerUnreachableError') {
        // Get the current log file
        const logFile = this.logger.getCurrentLogFile();
        
        // Send Discord notification with log file attachment
        await this.discordNotifier.onEventWithFile('critical-error', {
          masterIssueNumber: this.masterIssueNumber,
          testIssueNumber: testIssue.number,
          errorType: 'OpenCode Server Unreachable',
          errorMessage: error.message,
          testTitle: testIssue.title,
          details: `The OpenCode server became unreachable during test execution. Health checks failed after ${error.healthCheckAttempts || 3} attempts.\n\nFull orchestrator debug log is attached.`
        }, logFile);
      }
      
      // Mark as failed
      await this.issueOps.addLabels(
        repo.owner,
        repo.repo,
        testIssue.number,
        ['oc-ralph:test-failed']
      );
    }
  }

  /**
   * Identify tests that failed
   */
  async identifyFailedTests(repo, testIssues) {
    this.logger.info('Identifying failed tests');

    const failedTests = [];

    for (const testIssue of testIssues) {
      // Fetch fresh issue data
      const freshIssue = await this.issueOps.getIssue(
        repo.owner,
        repo.repo,
        testIssue.number
      );

      // Check for failure labels
      const hasFailed = freshIssue.labels.some(l => 
        l.name === 'oc-ralph:test-failed' || l.name === 'oc-ralph:failed'
      );

      if (hasFailed) {
        failedTests.push(freshIssue);
      }
    }

    this.logger.info(`Found ${failedTests.length} failed test(s)`);
    
    return failedTests;
  }

  /**
   * Fix failed tests sequentially using TestRetryCoordinator
   */
  async fixFailedTests(repo, failedTests, allTests, worktreePath, masterIssueNumber) {
    this.logger.info('Starting sequential test fixing', {
      failedCount: failedTests.length
    });

    const results = [];

    // Fix tests one at a time (sequential)
    for (const failedTest of failedTests) {
      this.logger.info(`Fixing test ${failedTest.number}`, {
        title: failedTest.title
      });

      try {
        const result = await this.testRetryCoordinator.coordinateTestFix(
          repo,
          failedTest,
          worktreePath,
          allTests,
          masterIssueNumber
        );

        results.push({
          testIssue: failedTest.number,
          success: result.success,
          attempts: result.attempts
        });

        if (!result.success) {
          this.logger.error('Test could not be fixed', {
            testIssue: failedTest.number,
            attempts: result.attempts
          });
        }
      } catch (error) {
        this.logger.error('Error fixing test', {
          error: error.message,
          testIssue: failedTest.number
        });

        results.push({
          testIssue: failedTest.number,
          success: false,
          attempts: 0,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get max concurrency from config
   */
  getMaxConcurrency() {
    const maxConcurrency = this.config.execution?.parallel?.maxConcurrency;

    if (maxConcurrency === 'auto') {
      // Use CPU count
      return require('os').cpus().length;
    }

    return parseInt(maxConcurrency) || 4;
  }
}
