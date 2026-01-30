/**
 * Coordinates the test → fix → retest loop with self-healing logic
 * 
 * Responsibilities:
 * - Orchestrate the test failure recovery process
 * - Sequential fixing of failed tests (one at a time)
 * - Track fix attempts per test (max 10)
 * - Re-run tests after fixes
 * - Re-run dependent tests after each fix
 * - Send Discord notifications for each step
 * 
 * Self-Healing Loop:
 * Test Fails → Create Fix Sub-Issue → Run Craftsman Agent → Re-run Test
 * → Still Fails? → Repeat (max 10 times) → Max Attempts? → Fail Orchestration
 */
export class TestRetryCoordinator {
  constructor(
    testFailureHandler,
    agentExecutor,
    taskPoller,
    issueOps,
    dependencyResolver,
    statusUpdater,
    discordNotifier,
    config,
    logger
  ) {
    this.testFailureHandler = testFailureHandler;
    this.agentExecutor = agentExecutor;
    this.taskPoller = taskPoller;
    this.issueOps = issueOps;
    this.dependencyResolver = dependencyResolver;
    this.statusUpdater = statusUpdater;
    this.discordNotifier = discordNotifier;
    this.config = config;
    this.logger = logger;
    this.maxAttempts = 10;
  }

  /**
   * Coordinate fixing of a single failed test
   * 
   * @param {Object} repo - Repository info
   * @param {Object} testIssue - Failed test issue
   * @param {string} worktreePath - Path to worktree
   * @param {Array} allTests - All test issues (for dependency checks)
   * @param {number} masterIssueNumber - Master issue number
   * @returns {Promise<Object>} Result {success: boolean, attempts: number}
   */
  async coordinateTestFix(repo, testIssue, worktreePath, allTests, masterIssueNumber) {
    this.logger.info('Starting test fix coordination', {
      testIssue: testIssue.number,
      testTitle: testIssue.title
    });

    // Send initial failure notification
    await this.discordNotifier.notify('test-failed', {
      masterIssueNumber,
      testIssue: testIssue.number,
      testTitle: testIssue.title,
      repo: `${repo.owner}/${repo.repo}`
    });

    let attemptNumber = 1;
    let testPassed = false;

    // Attempt fixing up to maxAttempts times
    while (attemptNumber <= this.maxAttempts && !testPassed) {
      this.logger.info(`Fix attempt ${attemptNumber}/${this.maxAttempts}`, {
        testIssue: testIssue.number
      });

      try {
        // Step 1: Create fix sub-issue with failure context
        const fixIssue = await this.createFixIssue(
          repo,
          testIssue,
          worktreePath,
          attemptNumber
        );

        // Step 2: Run Craftsman agent on fix sub-issue
        await this.runFixAgent(repo, fixIssue, worktreePath, masterIssueNumber);

        // Step 3: Re-run the original test
        testPassed = await this.rerunTest(repo, testIssue, worktreePath);

        if (testPassed) {
          // Test passed! Close fix issue as successful
          await this.handleSuccessfulFix(repo, testIssue, fixIssue, attemptNumber, masterIssueNumber);
          
          // Re-run dependent tests to ensure nothing broke
          await this.rerunDependentTests(repo, testIssue, worktreePath, allTests, masterIssueNumber);
          
          return { success: true, attempts: attemptNumber };
        } else {
          // Test still failing
          this.logger.warn(`Test still failing after attempt ${attemptNumber}`, {
            testIssue: testIssue.number
          });

          // Leave fix issue open for audit trail
          await this.issueOps.createComment(
            repo.owner,
            repo.repo,
            fixIssue.number,
            `❌ Test still failing after this fix attempt. Moving to attempt ${attemptNumber + 1}/${this.maxAttempts}`
          );

          attemptNumber++;
        }
      } catch (error) {
        this.logger.error(`Fix attempt ${attemptNumber} failed with error`, {
          error: error.message,
          stack: error.stack,
          testIssue: testIssue.number
        });

        attemptNumber++;
      }
    }

    // Max attempts reached without success
    await this.handleMaxAttemptsReached(repo, testIssue, masterIssueNumber);
    return { success: false, attempts: this.maxAttempts };
  }

  /**
   * Create fix sub-issue with comprehensive context
   */
  async createFixIssue(repo, testIssue, worktreePath, attemptNumber) {
    this.logger.info('Creating fix sub-issue', {
      testIssue: testIssue.number,
      attemptNumber
    });

    const fixIssue = await this.testFailureHandler.handleTestFailure(
      repo,
      testIssue,
      worktreePath,
      attemptNumber
    );

    // Notify Discord
    await this.discordNotifier.notify('test-fix-started', {
      masterIssueNumber: this.extractMasterIssueNumber(testIssue),
      testIssue: testIssue.number,
      fixIssue: fixIssue.number,
      attemptNumber,
      maxAttempts: this.maxAttempts,
      repo: `${repo.owner}/${repo.repo}`
    });

    // Update status table
    await this.statusUpdater.notifyTaskUpdate();

    return fixIssue;
  }

  /**
   * Run Craftsman agent on fix sub-issue
   */
  async runFixAgent(repo, fixIssue, worktreePath, masterIssueNumber) {
    this.logger.info('Running Craftsman agent on fix sub-issue', {
      fixIssue: fixIssue.number
    });

    try {
      // Execute Craftsman agent
      await this.agentExecutor.executeAgent(
        'craftsman',
        {
          issueNumber: fixIssue.number,
          worktreePath,
          masterIssueNumber
        }
      );

      // Poll for completion
      const result = await this.taskPoller.pollForCompletion(
        repo.owner,
        repo.repo,
        fixIssue.number,
        this.config.agents.craftsman.timeout * 1000
      );

      if (result.timedOut) {
        throw new Error(`Fix agent timed out after ${this.config.agents.craftsman.timeout}s`);
      }

      this.logger.info('Fix agent completed', {
        fixIssue: fixIssue.number
      });

      // Notify Discord
      await this.discordNotifier.notify('test-fix-completed', {
        masterIssueNumber,
        fixIssue: fixIssue.number,
        repo: `${repo.owner}/${repo.repo}`
      });
    } catch (error) {
      this.logger.error('Fix agent execution failed', {
        error: error.message,
        fixIssue: fixIssue.number
      });
      throw error;
    }
  }

  /**
   * Re-run the original test to check if fix worked
   * 
   * @returns {Promise<boolean>} True if test passed
   */
  async rerunTest(repo, testIssue, worktreePath) {
    this.logger.info('Re-running test', {
      testIssue: testIssue.number
    });

    try {
      // Remove completion label if present
      await this.issueOps.removeLabel(
        repo.owner,
        repo.repo,
        testIssue.number,
        'oc-ralph:agent-complete'
      );

      // Remove any previous failure markers
      const labels = await this.issueOps.getIssueLabels(
        repo.owner,
        repo.repo,
        testIssue.number
      );
      
      const failureLabels = labels.filter(l => 
        l.name === 'oc-ralph:test-failed' || l.name === 'oc-ralph:failed'
      );
      
      for (const label of failureLabels) {
        await this.issueOps.removeLabel(
          repo.owner,
          repo.repo,
          testIssue.number,
          label.name
        );
      }

      // Re-run Janos test agent
      const masterIssueNumber = this.extractMasterIssueNumber(testIssue);
      
      await this.agentExecutor.executeAgent(
        'janos',
        {
          issueNumber: testIssue.number,
          worktreePath,
          masterIssueNumber
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
        throw new Error(`Test re-run timed out after ${this.config.agents.janos.timeout}s`);
      }

      // Check if test passed
      const updatedLabels = await this.issueOps.getIssueLabels(
        repo.owner,
        repo.repo,
        testIssue.number
      );

      const testPassed = !updatedLabels.some(l => 
        l.name === 'oc-ralph:test-failed' || l.name === 'oc-ralph:failed'
      );

      this.logger.info('Test re-run completed', {
        testIssue: testIssue.number,
        passed: testPassed
      });

      return testPassed;
    } catch (error) {
      this.logger.error('Test re-run failed', {
        error: error.message,
        testIssue: testIssue.number
      });
      return false;
    }
  }

  /**
   * Handle successful fix - close fix issue and notify
   */
  async handleSuccessfulFix(repo, testIssue, fixIssue, attemptNumber, masterIssueNumber) {
    this.logger.info('Test passed after fix!', {
      testIssue: testIssue.number,
      fixIssue: fixIssue.number,
      attemptNumber
    });

    // Close fix issue with success comment
    await this.issueOps.createComment(
      repo.owner,
      repo.repo,
      fixIssue.number,
      `✅ Test passed after this fix! Attempt ${attemptNumber}/${this.maxAttempts} was successful.`
    );

    await this.issueOps.closeIssue(
      repo.owner,
      repo.repo,
      fixIssue.number
    );

    // Add success comment to test issue
    await this.issueOps.createComment(
      repo.owner,
      repo.repo,
      testIssue.number,
      `✅ Test fixed successfully after ${attemptNumber} attempt(s)!`
    );

    // Notify Discord
    await this.discordNotifier.notify('test-passed-after-fix', {
      masterIssueNumber,
      testIssue: testIssue.number,
      fixIssue: fixIssue.number,
      attemptNumber,
      repo: `${repo.owner}/${repo.repo}`
    });

    // Update status table
    await this.statusUpdater.notifyTaskUpdate();
  }

  /**
   * Re-run dependent tests to ensure fix didn't break anything
   */
  async rerunDependentTests(repo, testIssue, worktreePath, allTests, masterIssueNumber) {
    this.logger.info('Checking for dependent tests to re-run', {
      testIssue: testIssue.number
    });

    try {
      // Get test dependencies
      const dependencies = this.dependencyResolver.resolveDependencies(allTests);
      
      // Find tests that depend on this test
      const dependentTests = allTests.filter(t => {
        const testDeps = dependencies[t.number] || [];
        return testDeps.includes(testIssue.number);
      });

      if (dependentTests.length === 0) {
        this.logger.info('No dependent tests to re-run');
        return;
      }

      this.logger.info(`Re-running ${dependentTests.length} dependent test(s)`, {
        dependentTests: dependentTests.map(t => t.number)
      });

      // Re-run each dependent test
      for (const depTest of dependentTests) {
        const passed = await this.rerunTest(repo, depTest, worktreePath);
        
        if (!passed) {
          this.logger.warn('Dependent test failed after fix', {
            testIssue: testIssue.number,
            dependentTest: depTest.number
          });
          
          throw new Error(
            `Fix for test #${testIssue.number} broke dependent test #${depTest.number}`
          );
        }
      }

      this.logger.info('All dependent tests still passing');
    } catch (error) {
      this.logger.error('Failed to re-run dependent tests', {
        error: error.message,
        testIssue: testIssue.number
      });
      throw error;
    }
  }

  /**
   * Handle max attempts reached - mark as permanently failed
   */
  async handleMaxAttemptsReached(repo, testIssue, masterIssueNumber) {
    this.logger.error('Max fix attempts reached', {
      testIssue: testIssue.number,
      maxAttempts: this.maxAttempts
    });

    // Add permanent failure label
    await this.issueOps.addLabels(
      repo.owner,
      repo.repo,
      testIssue.number,
      ['oc-ralph:max-attempts-reached', 'oc-ralph:test-failed']
    );

    // Add comment
    await this.issueOps.createComment(
      repo.owner,
      repo.repo,
      testIssue.number,
      `❌ Maximum fix attempts (${this.maxAttempts}) reached. Test could not be fixed automatically.`
    );

    // Notify Discord
    await this.discordNotifier.notify('test-max-attempts-reached', {
      masterIssueNumber,
      testIssue: testIssue.number,
      maxAttempts: this.maxAttempts,
      repo: `${repo.owner}/${repo.repo}`
    });

    // Update status table
    await this.statusUpdater.notifyTaskUpdate();
  }

  /**
   * Extract master issue number from test issue labels
   */
  extractMasterIssueNumber(testIssue) {
    const masterLabel = testIssue.labels.find(l => 
      l.name.startsWith('oc-ralph:master-')
    );
    
    if (masterLabel) {
      const match = masterLabel.name.match(/oc-ralph:master-(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    throw new Error('Could not extract master issue number from test issue');
  }
}
