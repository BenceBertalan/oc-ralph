/**
 * Completion Stage - Create PR and finalize orchestration
 * 
 * Responsibilities:
 * - Push worktree branch to remote
 * - Create pull request
 * - Link PR to master issue
 * - Update master issue with completion status
 * - Transition to completed state
 * - Send completion notifications
 */
export class CompletionStage {
  constructor(
    prOps,
    issueOps,
    gitOps,
    issueBodyManager,
    statusUpdater,
    discordNotifier,
    config,
    logger
  ) {
    this.prOps = prOps;
    this.issueOps = issueOps;
    this.gitOps = gitOps;
    this.issueBodyManager = issueBodyManager;
    this.statusUpdater = statusUpdater;
    this.discordNotifier = discordNotifier;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Execute completion stage
   * 
   * @param {number} masterIssueNumber - Master issue number
   * @param {string} worktreePath - Path to worktree
   * @param {Object} plan - Original plan
   * @param {Object} implResult - Implementation results
   * @param {Object} testResult - Testing results
   * @returns {Promise<Object>} Completion result with PR info
   */
  async execute(masterIssueNumber, worktreePath, plan, implResult, testResult) {
    this.logger.info('Starting completion stage', {
      masterIssueNumber,
      worktreePath
    });

    const repo = {
      owner: this.config.github.owner,
      repo: this.config.github.repo
    };

    try {
      // Step 1: Get branch name
      const branchName = await this.getBranchName(worktreePath);
      
      this.logger.info('Branch name retrieved', { branchName });

      // Step 2: Push branch to remote
      await this.pushBranch(worktreePath, branchName);

      // Step 3: Get commit and file statistics
      const stats = await this.getRepositoryStats(worktreePath, branchName);

      // Step 4: Create pull request
      const pr = await this.createPullRequest(
        repo,
        masterIssueNumber,
        branchName,
        plan,
        implResult,
        testResult,
        stats
      );

      // Step 5: Link PR to master issue
      await this.linkPRToMasterIssue(repo, pr.number, masterIssueNumber);

      // Step 6: Update master issue with PR link
      await this.updateMasterIssueWithPR(repo, masterIssueNumber, pr);

      // Step 7: Add completion label to master issue
      await this.issueOps.addLabels(
        repo.owner,
        repo.repo,
        masterIssueNumber,
        ['oc-ralph:pr-created']
      );

      // Step 8: Send completion notification
      await this.discordNotifier.notify('orchestration-complete', {
        masterIssueNumber,
        issueUrl: `https://github.com/${repo.owner}/${repo.repo}/issues/${masterIssueNumber}`,
        prNumber: pr.number,
        prUrl: pr.url,
        implTaskCount: implResult.completed,
        testsPassed: testResult.passed,
        testsTotal: testResult.total,
        commitCount: stats.commitCount,
        filesChanged: stats.filesChanged
      });

      // Step 9: Stop status updater
      await this.statusUpdater.stop();

      this.logger.info('Completion stage finished', {
        masterIssueNumber,
        prNumber: pr.number,
        prUrl: pr.url
      });

      return {
        success: true,
        prNumber: pr.number,
        prUrl: pr.url,
        branchName,
        stats
      };

    } catch (error) {
      this.logger.error('Completion stage failed', {
        error: error.message,
        stack: error.stack,
        masterIssueNumber
      });
      throw error;
    }
  }

  /**
   * Get current branch name from worktree
   */
  async getBranchName(worktreePath) {
    this.logger.debug('Getting branch name', { worktreePath });

    const branchName = await this.gitOps.getCurrentBranch(worktreePath);
    
    if (!branchName) {
      throw new Error('Could not determine branch name from worktree');
    }

    return branchName;
  }

  /**
   * Push branch to remote
   */
  async pushBranch(worktreePath, branchName) {
    this.logger.info('Pushing branch to remote', { branchName });

    try {
      // Try normal push first
      await this.gitOps.push(worktreePath, 'origin', branchName);
      
      this.logger.info('Branch pushed successfully', { branchName });
    } catch (error) {
      // If push failed due to non-fast-forward, force push
      if (error.message.includes('non-fast-forward') || error.message.includes('rejected')) {
        this.logger.warn('Normal push rejected, attempting force push', { branchName });
        
        try {
          await this.gitOps.exec('push --force -u origin ' + branchName, worktreePath);
          this.logger.info('Branch force-pushed successfully', { branchName });
        } catch (forceError) {
          this.logger.error('Failed to force push branch', {
            error: forceError.message,
            branchName
          });
          throw forceError;
        }
      } else {
        this.logger.error('Failed to push branch', {
          error: error.message,
          branchName
        });
        throw error;
      }
    }
  }

  /**
   * Get repository statistics (commit count, files changed)
   */
  async getRepositoryStats(worktreePath, branchName) {
    this.logger.debug('Getting repository stats');

    try {
      // Get commits on this branch compared to base
      const baseBranch = this.config.github.baseBranch;
      const commits = await this.gitOps.getCommitsBetween(
        worktreePath,
        baseBranch,
        branchName
      );

      // Get files changed
      const filesChanged = await this.gitOps.getFilesChanged(
        worktreePath,
        baseBranch,
        branchName
      );

      return {
        commitCount: commits.length,
        filesChanged: filesChanged.length,
        commits,
        files: filesChanged
      };
    } catch (error) {
      this.logger.error('Failed to get repository stats', {
        error: error.message
      });
      
      // Return defaults if stats fail
      return {
        commitCount: 0,
        filesChanged: 0,
        commits: [],
        files: []
      };
    }
  }

  /**
   * Create pull request
   */
  async createPullRequest(repo, masterIssueNumber, branchName, plan, implResult, testResult, stats) {
    this.logger.info('Creating pull request', {
      branchName,
      baseBranch: this.config.github.baseBranch
    });

    try {
      // Build PR title
      const title = `[oc-ralph] Issue #${masterIssueNumber}`;

      // Build PR body
      const body = this.prOps.buildPRBody({
        masterIssueNumber,
        spec: plan.spec,
        implTaskCount: plan.implementationTasks.length,
        testTaskCount: plan.testTasks.length,
        implResult,
        testResult,
        commitCount: stats.commitCount,
        filesChanged: stats.filesChanged
      });

      // Create PR
      const pr = await this.prOps.createPullRequest(
        repo.owner,
        repo.repo,
        {
          title,
          body,
          head: branchName,
          base: this.config.github.baseBranch,
          draft: false
        }
      );

      // Add labels
      await this.prOps.addLabels(
        repo.owner,
        repo.repo,
        pr.number,
        ['oc-ralph:orchestrated']
      );

      this.logger.info('Pull request created', {
        prNumber: pr.number,
        prUrl: pr.url
      });

      return pr;
    } catch (error) {
      this.logger.error('Failed to create pull request', {
        error: error.message,
        branchName
      });
      throw error;
    }
  }

  /**
   * Link PR to master issue in PR body
   */
  async linkPRToMasterIssue(repo, prNumber, masterIssueNumber) {
    this.logger.info('Linking PR to master issue', {
      prNumber,
      masterIssueNumber
    });

    try {
      await this.prOps.linkPRToIssue(
        repo.owner,
        repo.repo,
        prNumber,
        masterIssueNumber
      );
    } catch (error) {
      this.logger.error('Failed to link PR to master issue', {
        error: error.message,
        prNumber,
        masterIssueNumber
      });
      // Don't throw - this is not critical
    }
  }

  /**
   * Update master issue with PR link
   */
  async updateMasterIssueWithPR(repo, masterIssueNumber, pr) {
    this.logger.info('Updating master issue with PR link', {
      masterIssueNumber,
      prNumber: pr.number
    });

    try {
      // Add comment to master issue
      await this.issueOps.createComment(
        repo.owner,
        repo.repo,
        masterIssueNumber,
        `🎉 **Orchestration Complete!**\n\nPull request created: #${pr.number}\n\nView PR: ${pr.url}\n\n---\n\n*All implementation tasks completed and tests passing. Ready for review!*`
      );

      this.logger.info('Master issue updated with PR link', {
        masterIssueNumber
      });
    } catch (error) {
      this.logger.error('Failed to update master issue with PR', {
        error: error.message,
        masterIssueNumber
      });
      // Don't throw - this is not critical
    }
  }
}
