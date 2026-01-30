import { IssueTemplateManager } from '../github/IssueTemplateManager.js';

/**
 * Handles test failures by creating fix sub-issues with detailed context
 * 
 * Responsibilities:
 * - Parse failure details from test sub-issues
 * - Get recent commits from worktree
 * - Create fix sub-issues with comprehensive context
 * - Track attempt numbers (1-10)
 */
export class TestFailureHandler {
  constructor(issueOps, issueTemplateManager, gitOps, config, logger) {
    this.issueOps = issueOps;
    this.issueTemplateManager = issueTemplateManager;
    this.gitOps = gitOps;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Handle a test failure by creating a fix sub-issue
   * 
   * @param {Object} repo - Repository info {owner, repo}
   * @param {Object} testIssue - The failing test sub-issue
   * @param {string} worktreePath - Path to the worktree
   * @param {number} attemptNumber - Current attempt number (1-10)
   * @returns {Promise<Object>} Created fix sub-issue
   */
  async handleTestFailure(repo, testIssue, worktreePath, attemptNumber) {
    this.logger.info('Handling test failure', {
      testIssue: testIssue.number,
      attemptNumber
    });

    try {
      // Parse failure details from test issue
      const failureDetails = await this.parseFailureDetails(testIssue);
      
      // Get recent commits for context
      const recentCommits = await this.getRecentCommits(worktreePath, 5);
      
      // Extract master issue number from test issue
      const masterIssueNumber = this.extractMasterIssueNumber(testIssue);
      
      // Create fix sub-issue
      const fixIssue = await this.createFixSubIssue(
        repo,
        masterIssueNumber,
        testIssue,
        failureDetails,
        recentCommits,
        attemptNumber
      );
      
      this.logger.info('Created fix sub-issue', {
        fixIssue: fixIssue.number,
        testIssue: testIssue.number,
        attemptNumber
      });
      
      return fixIssue;
    } catch (error) {
      this.logger.error('Failed to handle test failure', {
        error: error.message,
        stack: error.stack,
        testIssue: testIssue.number
      });
      throw error;
    }
  }

  /**
   * Parse failure details from test sub-issue
   * 
   * Looks for failure information in:
   * - Issue comments (agent output)
   * - Issue body (test description)
   * 
   * @param {Object} testIssue - The test sub-issue
   * @returns {Promise<Object>} Parsed failure details
   */
  async parseFailureDetails(testIssue) {
    this.logger.debug('Parsing failure details', {
      testIssue: testIssue.number
    });

    try {
      // Get all comments on the test issue
      const comments = await this.issueOps.getIssueComments(
        this.config.github.owner,
        this.config.github.repo,
        testIssue.number
      );

      // Look for failure information in comments
      let errorMessage = '';
      let stackTrace = '';
      let logs = '';

      // Search comments in reverse (most recent first)
      for (let i = comments.length - 1; i >= 0; i--) {
        const comment = comments[i];
        const body = comment.body;

        // Look for error patterns
        if (body.includes('Error:') || body.includes('FAILED') || body.includes('AssertionError')) {
          errorMessage = this.extractErrorMessage(body);
          stackTrace = this.extractStackTrace(body);
          logs = this.extractLogs(body);
          break;
        }
      }

      // If no failure info in comments, use placeholder
      if (!errorMessage) {
        errorMessage = 'Test failed. Check test output for details.';
      }

      return {
        error: errorMessage,
        stackTrace: stackTrace || 'No stack trace available',
        logs: logs || 'No additional logs available',
        testRequirements: testIssue.body || 'See parent test issue for requirements'
      };
    } catch (error) {
      this.logger.error('Failed to parse failure details', {
        error: error.message,
        testIssue: testIssue.number
      });

      // Return minimal failure details
      return {
        error: 'Test failed. Unable to parse detailed error information.',
        stackTrace: 'Not available',
        logs: 'Not available',
        testRequirements: testIssue.body || 'See parent test issue'
      };
    }
  }

  /**
   * Extract error message from text
   */
  extractErrorMessage(text) {
    // Look for common error patterns
    const patterns = [
      /Error: (.+?)(\n|$)/,
      /AssertionError: (.+?)(\n|$)/,
      /FAILED: (.+?)(\n|$)/,
      /Exception: (.+?)(\n|$)/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // If no pattern matches, return first 200 chars
    return text.substring(0, 200).trim();
  }

  /**
   * Extract stack trace from text
   */
  extractStackTrace(text) {
    // Look for stack trace section
    const stackTraceMatch = text.match(/at .+?:\d+:\d+/g);
    if (stackTraceMatch) {
      return stackTraceMatch.slice(0, 10).join('\n');
    }

    return '';
  }

  /**
   * Extract additional logs from text
   */
  extractLogs(text) {
    // Extract code blocks (often contain test output)
    const codeBlockMatch = text.match(/```[\s\S]*?```/g);
    if (codeBlockMatch) {
      return codeBlockMatch.join('\n\n');
    }

    return '';
  }

  /**
   * Get recent commits from worktree
   * 
   * @param {string} worktreePath - Path to worktree
   * @param {number} limit - Number of commits to get
   * @returns {Promise<Array>} Recent commits
   */
  async getRecentCommits(worktreePath, limit = 5) {
    this.logger.debug('Getting recent commits', {
      worktreePath,
      limit
    });

    try {
      const commits = await this.gitOps.getRecentCommits(worktreePath, limit);
      return commits;
    } catch (error) {
      this.logger.error('Failed to get recent commits', {
        error: error.message,
        worktreePath
      });
      return [];
    }
  }

  /**
   * Extract master issue number from test issue
   * 
   * Looks for "Master Issue: #123" in the test issue body
   */
  extractMasterIssueNumber(testIssue) {
    const match = testIssue.body.match(/Master Issue: #(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    // Fallback: try to get from labels
    const masterLabel = testIssue.labels.find(l => 
      l.name.startsWith('oc-ralph:master-')
    );
    if (masterLabel) {
      const numMatch = masterLabel.name.match(/oc-ralph:master-(\d+)/);
      if (numMatch) {
        return parseInt(numMatch[1], 10);
      }
    }

    throw new Error('Could not extract master issue number from test issue');
  }

  /**
   * Create fix sub-issue with comprehensive context
   * 
   * @param {Object} repo - Repository info
   * @param {number} masterIssueNumber - Master issue number
   * @param {Object} testIssue - Original test issue
   * @param {Object} failureDetails - Parsed failure details
   * @param {Array} recentCommits - Recent commits
   * @param {number} attemptNumber - Current attempt (1-10)
   * @returns {Promise<Object>} Created fix issue
   */
  async createFixSubIssue(repo, masterIssueNumber, testIssue, failureDetails, recentCommits, attemptNumber) {
    this.logger.info('Creating fix sub-issue', {
      testIssue: testIssue.number,
      masterIssueNumber,
      attemptNumber
    });

    // Build fix issue title
    const title = `[Fix] ${testIssue.title} (Attempt ${attemptNumber}/10)`;

    // Build fix issue body
    const body = this.buildFixIssueBody(
      masterIssueNumber,
      testIssue,
      failureDetails,
      recentCommits,
      attemptNumber
    );

    // Create the fix sub-issue
    const fixIssue = await this.issueOps.createIssue(
      repo.owner,
      repo.repo,
      title,
      body,
      [
        'oc-ralph:sub-issue',
        'oc-ralph:fix-attempt',
        'oc-ralph:implementation',
        `oc-ralph:master-${masterIssueNumber}`,
        `oc-ralph:test-${testIssue.number}`,
        `oc-ralph:attempt-${attemptNumber}`
      ]
    );

    // Add comment to test issue linking to fix
    await this.issueOps.createComment(
      repo.owner,
      repo.repo,
      testIssue.number,
      `🔧 Fix attempt ${attemptNumber}/10 created: #${fixIssue.number}`
    );

    return fixIssue;
  }

  /**
   * Build fix issue body with comprehensive context
   */
  buildFixIssueBody(masterIssueNumber, testIssue, failureDetails, recentCommits, attemptNumber) {
    const commitsSection = recentCommits.length > 0
      ? recentCommits.map(c => `- \`${c.hash}\`: ${c.message}`).join('\n')
      : 'No recent commits available';

    return `# Fix Test Failure - Attempt ${attemptNumber}/10

## Parent Test Issue
#${testIssue.number} - ${testIssue.title}

## Test Requirements
${failureDetails.testRequirements}

## Failure Details

### Error Message
\`\`\`
${failureDetails.error}
\`\`\`

### Stack Trace
\`\`\`
${failureDetails.stackTrace}
\`\`\`

### Additional Logs
${failureDetails.logs}

## Recent Commits
${commitsSection}

## Your Task

Fix the failing test by modifying the implementation code. After your fix:

1. ✅ The test should pass
2. ✅ No other tests should break
3. ✅ Commit your changes with a descriptive message

## Context
- Master Issue: #${masterIssueNumber}
- Previous Fix Attempts: ${attemptNumber - 1}

## Instructions

1. Review the test requirements and failure details above
2. Examine the recent commits to understand what changed
3. Identify the root cause of the test failure
4. Implement a fix that addresses the root cause
5. Verify the test passes after your fix
6. Ensure no other tests are broken by your changes
7. Commit your changes

**When you're done, add the \`oc-ralph:agent-complete\` label to this issue.**
`;
  }
}
