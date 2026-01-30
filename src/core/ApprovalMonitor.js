/**
 * ApprovalMonitor - Poll master issue for approval/rejection labels
 */
export class ApprovalMonitor {
  constructor(issueOps, config, logger) {
    this.issueOps = issueOps;
    this.config = config;
    this.logger = logger;
    this.polling = false;
    this.pollInterval = null;
  }

  /**
   * Wait for approval or rejection
   */
  async waitForApproval(repo, issueNumber, pollIntervalMs = 5000, timeoutMs = null) {
    return new Promise((resolve, reject) => {
      this.polling = true;
      let elapsed = 0;

      this.logger.info('Starting approval monitor', { 
        issueNumber, 
        pollIntervalMs,
        timeoutMs: timeoutMs || 'none'
      });

      const checkStatus = async () => {
        if (!this.polling) {
          this.logger.debug('Approval monitor stopped');
          return;
        }

        try {
          const status = await this.checkApprovalStatus(repo, issueNumber);

          if (status.approved) {
            this.logger.info('Plan approved', { issueNumber });
            this.stop();
            resolve({ approved: true, rejected: false });
            return;
          }

          if (status.rejected) {
            this.logger.info('Plan rejected', { issueNumber });
            this.stop();
            resolve({ approved: false, rejected: true });
            return;
          }

          // Check timeout
          if (timeoutMs && elapsed >= timeoutMs) {
            this.logger.warn('Approval monitor timeout', { issueNumber, elapsed });
            this.stop();
            reject(new Error(`Approval timeout after ${elapsed}ms`));
            return;
          }

          // Continue polling
          this.logger.debug('Approval status check', { 
            issueNumber, 
            approved: false, 
            rejected: false,
            elapsed 
          });

          elapsed += pollIntervalMs;
          this.pollInterval = setTimeout(checkStatus, pollIntervalMs);

        } catch (error) {
          this.logger.error('Approval check failed', { 
            issueNumber, 
            error: error.message 
          });
          this.stop();
          reject(error);
        }
      };

      // Start polling
      checkStatus();
    });
  }

  /**
   * Check current approval status
   */
  async checkApprovalStatus(repo, issueNumber) {
    try {
      const issue = await this.issueOps.getIssue(repo, issueNumber);
      const labels = issue.labels.map(l => typeof l === 'string' ? l : l.name);

      const approved = labels.includes('oc-ralph:approved');
      const rejected = labels.includes('oc-ralph:rejected');

      return { approved, rejected };

    } catch (error) {
      this.logger.error('Failed to check approval status', {
        issueNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop polling
   */
  stop() {
    this.polling = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    this.logger.debug('Approval monitor stopped');
  }
}
