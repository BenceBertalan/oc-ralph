/**
 * Aggregates test results from all test sub-issues
 * 
 * Responsibilities:
 * - Collect pass/fail status from all test sub-issues
 * - Generate comprehensive summary
 * - Count fix attempts per test
 */
export class TestResultAggregator {
  constructor(issueOps, logger) {
    this.issueOps = issueOps;
    this.logger = logger;
  }

  /**
   * Aggregate results from all test sub-issues
   * 
   * @param {Object} repo - Repository info
   * @param {Array} testIssues - All test sub-issues
   * @returns {Promise<Object>} Aggregated results
   */
  async aggregateResults(repo, testIssues) {
    this.logger.info('Aggregating test results', {
      totalTests: testIssues.length
    });

    let passed = 0;
    let failed = 0;
    const details = [];

    for (const testIssue of testIssues) {
      // Fetch fresh issue data
      const freshIssue = await this.issueOps.getIssue(
        repo.owner,
        repo.repo,
        testIssue.number
      );

      // Determine test status
      const status = await this.determineTestStatus(repo, freshIssue);
      
      if (status.passed) {
        passed++;
      } else {
        failed++;
      }

      details.push({
        issueNumber: freshIssue.number,
        title: freshIssue.title,
        passed: status.passed,
        fixAttempts: status.fixAttempts,
        maxAttemptsReached: status.maxAttemptsReached
      });
    }

    const summary = {
      passed,
      failed,
      total: testIssues.length,
      passRate: testIssues.length > 0 ? (passed / testIssues.length * 100).toFixed(1) : 0,
      details
    };

    this.logger.info('Test results aggregated', summary);

    return summary;
  }

  /**
   * Determine status of a single test
   * 
   * @param {Object} repo - Repository info
   * @param {Object} testIssue - Test sub-issue
   * @returns {Promise<Object>} Status info
   */
  async determineTestStatus(repo, testIssue) {
    const labels = testIssue.labels.map(l => l.name);

    // Check for failure labels
    const hasFailed = labels.some(l => 
      l === 'oc-ralph:test-failed' || 
      l === 'oc-ralph:failed' ||
      l === 'oc-ralph:max-attempts-reached'
    );

    // Check if max attempts reached
    const maxAttemptsReached = labels.includes('oc-ralph:max-attempts-reached');

    // Count fix attempts by finding fix sub-issues
    const fixAttempts = await this.countFixAttempts(repo, testIssue.number);

    return {
      passed: !hasFailed,
      fixAttempts,
      maxAttemptsReached
    };
  }

  /**
   * Count how many fix attempts were made for a test
   * 
   * @param {Object} repo - Repository info
   * @param {number} testIssueNumber - Test issue number
   * @returns {Promise<number>} Number of fix attempts
   */
  async countFixAttempts(repo, testIssueNumber) {
    try {
      // Find all fix sub-issues for this test
      const allIssues = await this.issueOps.getIssuesByLabel(
        repo.owner,
        repo.repo,
        `oc-ralph:test-${testIssueNumber}`
      );

      // Filter for fix attempts
      const fixIssues = allIssues.filter(issue =>
        issue.labels.some(l => l.name === 'oc-ralph:fix-attempt')
      );

      return fixIssues.length;
    } catch (error) {
      this.logger.error('Failed to count fix attempts', {
        error: error.message,
        testIssueNumber
      });
      return 0;
    }
  }

  /**
   * Generate a human-readable summary message
   * 
   * @param {Object} results - Aggregated results
   * @returns {string} Summary message
   */
  generateSummaryMessage(results) {
    if (results.total === 0) {
      return 'No tests were executed.';
    }

    const { passed, failed, total, passRate } = results;

    let message = `Test Results: ${passed}/${total} passed (${passRate}%)`;

    if (failed > 0) {
      message += `\n❌ ${failed} test(s) failed`;
      
      // List failed tests
      const failedTests = results.details.filter(d => !d.passed);
      for (const test of failedTests) {
        message += `\n  - #${test.issueNumber}: ${test.title}`;
        
        if (test.fixAttempts > 0) {
          message += ` (${test.fixAttempts} fix attempt(s))`;
        }
        
        if (test.maxAttemptsReached) {
          message += ` - MAX ATTEMPTS REACHED`;
        }
      }
    } else {
      message += '\n✅ All tests passed!';
    }

    return message;
  }
}
