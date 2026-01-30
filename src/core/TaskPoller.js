/**
 * TaskPoller - Poll sub-issues for completion labels
 */
export class TaskPoller {
  constructor(issueOps, logger) {
    this.issueOps = issueOps;
    this.logger = logger;
  }

  /**
   * Wait for task completion
   */
  async waitForCompletion(repo, issueNumber, timeoutMs) {
    const startTime = Date.now();
    const pollIntervalMs = 2000; // 2 seconds
    
    this.logger.info('Waiting for task completion', { issueNumber, timeoutMs });
    
    return new Promise((resolve, reject) => {
      const checkCompletion = async () => {
        try {
          const elapsed = Date.now() - startTime;
          
          // Check for timeout
          if (elapsed >= timeoutMs) {
            this.logger.error('Task completion timeout', { issueNumber, elapsed });
            reject(new Error(`Task timeout after ${timeoutMs}ms`));
            return;
          }
          
          // Check completion status
          const isComplete = await this.checkCompletionStatus(repo, issueNumber);
          
          if (isComplete) {
            this.logger.info('Task completed', { issueNumber, elapsed });
            resolve();
            return;
          }
          
          // Log progress at debug level
          this.logger.debug('Task still in progress', { issueNumber, elapsed });
          
          // Continue polling
          setTimeout(checkCompletion, pollIntervalMs);
          
        } catch (error) {
          this.logger.error('Task polling failed', {
            issueNumber,
            error: error.message
          });
          reject(error);
        }
      };
      
      // Start polling
      checkCompletion();
    });
  }

  /**
   * Check if task has completion label
   */
  async checkCompletionStatus(repo, issueNumber) {
    try {
      const issue = await this.issueOps.getIssue(repo, issueNumber);
      const labels = issue.labels.map(l => typeof l === 'string' ? l : l.name);
      
      return labels.includes('oc-ralph:agent-complete');
      
    } catch (error) {
      this.logger.error('Failed to check completion status', {
        issueNumber,
        error: error.message
      });
      throw error;
    }
  }
}
