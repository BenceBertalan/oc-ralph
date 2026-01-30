/**
 * Retry manager with exponential backoff
 */
export class RetryManager {
  constructor(config, logger) {
    this.config = config.execution.retry;
    this.logger = logger;
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry(fn, context = {}) {
    const maxAttempts = context.maxRetries || this.config.maxAttempts;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.info('Executing attempt', {
          attempt,
          maxAttempts,
          context: context.taskId || context.name
        });

        const result = await fn(attempt);
        
        this.logger.info('Execution succeeded', {
          attempt,
          context: context.taskId || context.name
        });

        return result;

      } catch (error) {
        lastError = error;
        
        this.logger.warn('Execution failed', {
          attempt,
          maxAttempts,
          error: error.message,
          context: context.taskId || context.name
        });

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          this.logger.error('Error is not retryable, stopping', {
            error: error.message
          });
          throw error;
        }

        // Don't retry if this was the last attempt
        if (attempt >= maxAttempts) {
          break;
        }

        // Calculate backoff delay
        const delay = this.calculateBackoff(attempt);
        
        this.logger.info('Retrying after backoff', {
          attempt: attempt + 1,
          delayMs: delay
        });

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    this.logger.error('All retry attempts exhausted', {
      maxAttempts,
      lastError: lastError.message
    });

    throw new Error(`Failed after ${maxAttempts} attempts: ${lastError.message}`);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    const nonRetryablePatterns = [
      'rate limit',
      'quota exceeded',
      'authentication',
      'not found',
      'permission denied'
    ];

    const errorMessage = error.message.toLowerCase();
    
    for (const pattern of nonRetryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateBackoff(attempt) {
    const baseDelay = this.config.initialDelayMs;
    const multiplier = this.config.backoffMultiplier;
    
    return baseDelay * Math.pow(multiplier, attempt - 1);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
