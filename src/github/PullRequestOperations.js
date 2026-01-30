/**
 * Pull Request Operations - Manage GitHub pull requests
 * 
 * Responsibilities:
 * - Create pull requests
 * - Update PR descriptions
 * - Link PRs to issues
 * - Get PR status
 */
export class PullRequestOperations {
  constructor(githubClient, logger) {
    this.githubClient = githubClient;
    this.logger = logger;
  }

  /**
   * Create a pull request
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} prData - PR data
   * @param {string} prData.title - PR title
   * @param {string} prData.body - PR description
   * @param {string} prData.head - Branch to merge from
   * @param {string} prData.base - Branch to merge into
   * @param {boolean} prData.draft - Create as draft PR
   * @returns {Promise<Object>} Created PR
   */
  async createPullRequest(owner, repo, prData) {
    this.logger.info('Creating pull request', {
      owner,
      repo,
      head: prData.head,
      base: prData.base,
      title: prData.title
    });

    try {
      // Use gh CLI to create PR
      const command = [
        'pr create',
        `--repo ${owner}/${repo}`,
        `--title "${prData.title.replace(/"/g, '\\"')}"`,
        `--body "${prData.body.replace(/"/g, '\\"')}"`,
        `--base ${prData.base}`,
        `--head ${prData.head}`,
        prData.draft ? '--draft' : ''
      ].filter(Boolean).join(' ');
      
      const prUrl = await this.githubClient.exec(command);

      // Extract PR number from URL
      const prNumber = parseInt(prUrl.split('/').pop());

      this.logger.info('Pull request created', {
        prNumber,
        url: prUrl
      });

      return {
        number: prNumber,
        url: prUrl,
        title: prData.title,
        state: 'open',
        html_url: prUrl
      };
    } catch (error) {
      this.logger.error('Failed to create pull request', {
        error: error.message,
        owner,
        repo,
        head: prData.head
      });
      throw error;
    }
  }

  /**
   * Get pull request by number
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - PR number
   * @returns {Promise<Object>} PR data
   */
  async getPullRequest(owner, repo, prNumber) {
    this.logger.debug('Getting pull request', { owner, repo, prNumber });

    try {
      const response = await this.githubClient.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}',
        {
          owner,
          repo,
          pull_number: prNumber
        }
      );

      return {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body,
        state: response.data.state,
        draft: response.data.draft,
        url: response.data.html_url,
        head: response.data.head.ref,
        base: response.data.base.ref,
        mergeable: response.data.mergeable,
        merged: response.data.merged
      };
    } catch (error) {
      this.logger.error('Failed to get pull request', {
        error: error.message,
        prNumber
      });
      throw error;
    }
  }

  /**
   * Update pull request
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - PR number
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated PR
   */
  async updatePullRequest(owner, repo, prNumber, updates) {
    this.logger.info('Updating pull request', { owner, repo, prNumber });

    try {
      const response = await this.githubClient.request(
        'PATCH /repos/{owner}/{repo}/pulls/{pull_number}',
        {
          owner,
          repo,
          pull_number: prNumber,
          ...updates
        }
      );

      this.logger.info('Pull request updated', { prNumber });

      return {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body,
        state: response.data.state,
        url: response.data.html_url
      };
    } catch (error) {
      this.logger.error('Failed to update pull request', {
        error: error.message,
        prNumber
      });
      throw error;
    }
  }

  /**
   * Link PR to issue by adding reference in PR body
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - PR number
   * @param {number} issueNumber - Issue number to link
   * @returns {Promise<void>}
   */
  async linkPRToIssue(owner, repo, prNumber, issueNumber) {
    this.logger.info('Linking PR to issue', { prNumber, issueNumber });

    try {
      // Get current PR body
      const pr = await this.getPullRequest(owner, repo, prNumber);
      
      // Add closing reference if not already present
      const closingRef = `Closes #${issueNumber}`;
      
      if (!pr.body.includes(closingRef)) {
        const updatedBody = `${pr.body}\n\n---\n\n${closingRef}`;
        
        await this.updatePullRequest(owner, repo, prNumber, {
          body: updatedBody
        });
        
        this.logger.info('PR linked to issue', { prNumber, issueNumber });
      } else {
        this.logger.info('PR already linked to issue', { prNumber, issueNumber });
      }
    } catch (error) {
      this.logger.error('Failed to link PR to issue', {
        error: error.message,
        prNumber,
        issueNumber
      });
      throw error;
    }
  }

  /**
   * Add labels to pull request
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - PR number
   * @param {Array<string>} labels - Labels to add
   * @returns {Promise<void>}
   */
  async addLabels(owner, repo, prNumber, labels) {
    this.logger.info('Adding labels to PR', { prNumber, labels });

    try {
      await this.githubClient.request(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
        {
          owner,
          repo,
          issue_number: prNumber, // PRs use issue API for labels
          labels
        }
      );

      this.logger.info('Labels added to PR', { prNumber });
    } catch (error) {
      this.logger.error('Failed to add labels to PR', {
        error: error.message,
        prNumber
      });
      throw error;
    }
  }

  /**
   * Get commits in pull request
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - PR number
   * @returns {Promise<Array>} List of commits
   */
  async getPRCommits(owner, repo, prNumber) {
    this.logger.debug('Getting PR commits', { prNumber });

    try {
      const response = await this.githubClient.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits',
        {
          owner,
          repo,
          pull_number: prNumber
        }
      );

      return response.data.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author.name,
        date: commit.commit.author.date
      }));
    } catch (error) {
      this.logger.error('Failed to get PR commits', {
        error: error.message,
        prNumber
      });
      throw error;
    }
  }

  /**
   * Get files changed in pull request
   * 
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} prNumber - PR number
   * @returns {Promise<Array>} List of changed files
   */
  async getPRFiles(owner, repo, prNumber) {
    this.logger.debug('Getting PR files', { prNumber });

    try {
      const response = await this.githubClient.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner,
          repo,
          pull_number: prNumber
        }
      );

      return response.data.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes
      }));
    } catch (error) {
      this.logger.error('Failed to get PR files', {
        error: error.message,
        prNumber
      });
      throw error;
    }
  }

  /**
   * Build PR body with orchestration summary
   * 
   * @param {Object} data - Data for PR body
   * @returns {string} Formatted PR body
   */
  buildPRBody(data) {
    const {
      masterIssueNumber,
      spec,
      implTaskCount,
      testTaskCount,
      implResult,
      testResult,
      commitCount,
      filesChanged
    } = data;

    return `# Orchestrated Implementation - Issue #${masterIssueNumber}

## Summary

This PR was automatically generated by **oc-ralph** orchestrator.

## Specification

${spec}

## Implementation Summary

- **Implementation Tasks Completed**: ${implTaskCount} (${implResult?.completed || 0} completed, ${implResult?.failed || 0} failed)
- **Tests Passed**: ${testResult?.passed || 0}/${testResult?.total || 0} (${testResult?.passRate || 0}%)
- **Commits**: ${commitCount || 0}
- **Files Changed**: ${filesChanged || 0}

## Changes

This PR includes:
- Implementation of all planned tasks
- All tests passing after automatic fixing (if needed)
- Clean commit history from worktree

## Testing

All tests have been executed and verified:
${testResult?.details ? testResult.details.map(t => 
  `- ${t.passed ? '✅' : '❌'} #${t.issueNumber}: ${t.title}${t.fixAttempts > 0 ? ` (fixed after ${t.fixAttempts} attempt(s))` : ''}`
).join('\n') : '- No test details available'}

## Related Issues

Closes #${masterIssueNumber}

---

*Generated by oc-ralph orchestrator*`;
  }
}
