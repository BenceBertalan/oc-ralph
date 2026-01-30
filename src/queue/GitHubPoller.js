/**
 * GitHubPoller - Polls GitHub for issues with specific label
 * Automatically enqueues new issues for orchestration
 */

export class GitHubPoller {
  constructor(issueOps, queue, config, logger) {
    this.issueOps = issueOps;
    this.queue = queue;
    this.config = config;
    this.logger = logger;
    this.interval = null;
    this.pollInterval = config.service?.pollInterval || 60000; // 60s default
    this.queueLabel = config.service?.queueLabel || 'oc-ralph:queue';
    this.processingLabel = 'oc-ralph:processing';
    this.repo = `${config.github.owner}/${config.github.repo}`;
    this.isPolling = false;
  }

  /**
   * Start polling GitHub
   */
  async start() {
    this.logger.info('Starting GitHub poller', { 
      interval: `${this.pollInterval / 1000}s`,
      label: this.queueLabel,
      repo: this.repo
    });

    // Initial poll
    await this.poll();

    // Schedule recurring polls
    this.interval = setInterval(() => {
      this.poll().catch(error => {
        this.logger.error('Scheduled poll failed', { error: error.message });
      });
    }, this.pollInterval);

    this.logger.info('GitHub poller started');
  }

  /**
   * Poll GitHub for new issues
   */
  async poll() {
    if (this.isPolling) {
      this.logger.debug('Poll already in progress, skipping');
      return;
    }

    this.isPolling = true;

    try {
      this.logger.debug('Polling GitHub for queued issues');

      // Query issues with queue label using gh CLI
      const issuesJson = await this.issueOps.github.execJSON(
        `issue list --repo ${this.repo} --label "${this.queueLabel}" --state open --json number,title,labels --limit 100`
      );

      this.logger.debug('Polled GitHub', { 
        issuesFound: issuesJson.length 
      });

      for (const issue of issuesJson) {
        const issueNumber = issue.number;

        // Check if already queued or running
        if (this.queue.contains(issueNumber)) {
          this.logger.debug('Issue already in queue, skipping', { issueNumber });
          continue;
        }

        this.logger.info('New issue detected', { 
          issueNumber,
          title: issue.title 
        });

        try {
          // Remove queue label
          await this.issueOps.removeLabel(this.repo, issueNumber, this.queueLabel);
          this.logger.debug('Removed queue label', { issueNumber });

          // Add processing label
          await this.issueOps.addLabels(this.repo, issueNumber, [this.processingLabel]);
          this.logger.debug('Added processing label', { issueNumber });

          // Enqueue for orchestration
          this.queue.enqueue(issueNumber);

          this.logger.info('Issue enqueued for orchestration', { issueNumber });

        } catch (error) {
          this.logger.error('Failed to process issue', { 
            issueNumber,
            error: error.message 
          });
        }
      }

    } catch (error) {
      this.logger.error('Polling failed', { 
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.logger.info('GitHub poller stopped');
    }
  }

  /**
   * Get poller status
   */
  getStatus() {
    return {
      active: this.interval !== null,
      pollInterval: this.pollInterval,
      queueLabel: this.queueLabel,
      repo: this.repo,
      isPolling: this.isPolling
    };
  }

  /**
   * Trigger immediate poll (for testing)
   */
  async triggerPoll() {
    this.logger.info('Manual poll triggered');
    await this.poll();
  }
}
