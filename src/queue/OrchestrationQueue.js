/**
 * OrchestrationQueue - FIFO queue for processing GitHub issues sequentially
 * Handles one orchestration at a time to avoid resource conflicts
 */

export class OrchestrationQueue {
  constructor(orchestratorFactory, logger) {
    this.queue = [];
    this.running = null;
    this.completed = [];
    this.failed = [];
    this.orchestratorFactory = orchestratorFactory;
    this.logger = logger;
    this.processing = false;
    this.maxHistorySize = 50; // Keep last 50 completed/failed
  }

  /**
   * Add issue to queue
   */
  enqueue(issueNumber) {
    if (this.contains(issueNumber)) {
      throw new Error(`Issue #${issueNumber} already in queue or running`);
    }

    this.queue.push(issueNumber);
    this.logger.info('Issue enqueued', { 
      issueNumber, 
      position: this.queue.length,
      queueLength: this.queue.length
    });

    // Start processing if not already running
    if (!this.processing) {
      // Use setImmediate to avoid blocking
      setImmediate(() => this.processQueue());
    }

    return {
      issueNumber,
      position: this.queue.length,
      status: 'queued'
    };
  }

  /**
   * Process queue sequentially
   */
  async processQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    this.logger.info('Starting queue processing');

    while (this.queue.length > 0) {
      const issueNumber = this.queue.shift();
      this.running = issueNumber;

      this.logger.info('Starting orchestration', { 
        issueNumber,
        remaining: this.queue.length 
      });

      const startTime = Date.now();

      try {
        // Create fresh orchestrator instance
        const orchestrator = await this.orchestratorFactory();
        
        // Run orchestration
        await orchestrator.start(issueNumber);

        const duration = Date.now() - startTime;

        // Record success
        this.completed.push({
          issueNumber,
          timestamp: new Date().toISOString(),
          duration,
          success: true
        });

        // Trim history
        if (this.completed.length > this.maxHistorySize) {
          this.completed.shift();
        }

        this.logger.info('Orchestration completed', { 
          issueNumber,
          duration: `${(duration / 1000).toFixed(2)}s`
        });

      } catch (error) {
        const duration = Date.now() - startTime;

        // Record failure
        this.failed.push({
          issueNumber,
          timestamp: new Date().toISOString(),
          duration,
          error: error.message,
          stack: error.stack
        });

        // Trim history
        if (this.failed.length > this.maxHistorySize) {
          this.failed.shift();
        }

        this.logger.error('Orchestration failed', { 
          issueNumber,
          error: error.message,
          duration: `${(duration / 1000).toFixed(2)}s`
        });
      }

      this.running = null;
    }

    this.processing = false;
    this.logger.info('Queue empty, waiting for new issues');
  }

  /**
   * Check if issue is in queue or running
   */
  contains(issueNumber) {
    return this.running === issueNumber || 
           this.queue.includes(issueNumber);
  }

  /**
   * Get queue status for API/UI
   */
  getStatus() {
    return {
      running: this.running,
      queued: [...this.queue],
      queueLength: this.queue.length,
      completed: this.completed.slice(-10), // Last 10
      failed: this.failed.slice(-10), // Last 10
      totalCompleted: this.completed.length,
      totalFailed: this.failed.length,
      processing: this.processing
    };
  }

  /**
   * Get detailed statistics
   */
  getStats() {
    const allCompleted = this.completed.filter(c => c.success);
    const avgDuration = allCompleted.length > 0
      ? allCompleted.reduce((sum, c) => sum + c.duration, 0) / allCompleted.length
      : 0;

    return {
      queueLength: this.queue.length,
      running: this.running,
      totalCompleted: this.completed.length,
      totalFailed: this.failed.length,
      successRate: this.completed.length + this.failed.length > 0
        ? (this.completed.length / (this.completed.length + this.failed.length) * 100).toFixed(2) + '%'
        : 'N/A',
      averageDuration: avgDuration > 0 ? `${(avgDuration / 1000).toFixed(2)}s` : 'N/A'
    };
  }

  /**
   * Remove issue from queue (if not running)
   */
  remove(issueNumber) {
    if (this.running === issueNumber) {
      throw new Error(`Cannot remove issue #${issueNumber} - currently running`);
    }

    const index = this.queue.indexOf(issueNumber);
    if (index === -1) {
      throw new Error(`Issue #${issueNumber} not in queue`);
    }

    this.queue.splice(index, 1);
    this.logger.info('Issue removed from queue', { issueNumber });

    return { success: true, issueNumber };
  }

  /**
   * Clear queue (does not affect running orchestration)
   */
  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    this.logger.info('Queue cleared', { clearedCount: cleared });
    return { clearedCount: cleared };
  }
}
