/**
 * @fileoverview Session Watchdog - Handles hung session recovery
 * 
 * Recovery flow:
 * 1. Attempt graceful kill via occlient.killSession()
 * 2. Verify session is gone via occlient.sessionExists()
 * 3. If verification fails → escalate to service restart
 */

/**
 * Watchdog for detecting and recovering from hung sessions
 */
export class SessionWatchdog {
  /**
   * @param {Object} occlient - OpenCode client instance
   * @param {Object} githubOps - GitHub operations instance
   * @param {Object} config - Watchdog configuration
   * @param {Object} logger - Logger instance
   */
  constructor(occlient, githubOps, config, logger) {
    this.occlient = occlient;
    this.githubOps = githubOps;
    this.config = config;
    this.logger = logger;
  }
  
  /**
   * Handle hung session with graceful kill → verify → escalate flow
   * 
   * @param {string} sessionId - Hung session ID
   * @param {Object} hangData - Hang detection data
   * @returns {Promise<Object>} Recovery result
   */
  async handleHungSession(sessionId, hangData) {
    this.logger.warn('Handling hung session', { sessionId, hangData });
    
    // Step 1: Attempt graceful kill
    try {
      this.logger.info('Attempting graceful session kill', { sessionId });
      await this.occlient.killSession(sessionId);
      this.logger.info('Graceful kill command sent', { sessionId });
    } catch (error) {
      this.logger.error('Graceful kill command failed', { 
        sessionId, 
        error: error.message 
      });
      // Continue to verification - maybe it worked despite error
    }
    
    // Step 2: Verify session is gone
    const verification = await this.verifySessionGone(sessionId);
    
    if (verification.verified) {
      // Success! Session killed gracefully
      this.logger.info('Hang recovered via graceful kill', { 
        sessionId, 
        attempts: verification.attempts,
        duration: verification.totalWaitMs
      });
      
      return {
        method: 'graceful-kill',
        success: true,
        attempts: verification.attempts,
        duration: verification.totalWaitMs
      };
    }
    
    // Step 3: Graceful kill failed - escalate to service restart
    this.logger.error('Graceful kill failed, escalating to service restart', {
      sessionId,
      verificationAttempts: verification.attempts,
      reason: verification.reason || verification.error
    });
    
    return await this.handleFailedTermination(sessionId, hangData);
  }
  
  /**
   * Verify session is truly gone after kill attempt
   * Uses exponential backoff: 1s, 2s, 4s
   * 
   * @param {string} sessionId - Session ID to verify
   * @param {number} maxAttempts - Max verification attempts (default 3)
   * @returns {Promise<Object>} Verification result
   */
  async verifySessionGone(sessionId, maxAttempts = 3) {
    // Check if occlient has sessionExists method (backward compatibility)
    if (typeof this.occlient.sessionExists !== 'function') {
      this.logger.warn('occlient.sessionExists() not available, assuming session killed', {
        sessionId,
        occlientVersion: this.occlient.version || 'unknown'
      });
      return { 
        verified: true, 
        attempts: 0, 
        assumedSuccess: true,
        totalWaitMs: 0
      };
    }
    
    let totalWaitMs = 0;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Wait with exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        totalWaitMs += delayMs;
        
        // Check if session still exists
        const exists = await this.occlient.sessionExists(sessionId);
        
        if (!exists) {
          this.logger.info('Session verified gone', { 
            sessionId, 
            attempt,
            totalWaitMs
          });
          return { verified: true, attempts: attempt, totalWaitMs };
        }
        
        this.logger.warn('Session still exists after kill', { 
          sessionId, 
          attempt,
          remainingAttempts: maxAttempts - attempt
        });
        
      } catch (error) {
        // If sessionExists() fails, we can't verify - assume worst case
        this.logger.error('Failed to verify session termination', { 
          sessionId, 
          attempt, 
          error: error.message 
        });
        
        // On last attempt, return failure
        if (attempt === maxAttempts) {
          return { 
            verified: false, 
            attempts: attempt, 
            error: error.message,
            totalWaitMs
          };
        }
      }
    }
    
    // All attempts exhausted, session still exists
    return { 
      verified: false, 
      attempts: maxAttempts,
      reason: 'session-still-exists',
      totalWaitMs
    };
  }
  
  /**
   * Handle failed graceful termination by resetting task
   * Note: Service restart functionality will be added in later phase
   * 
   * @param {string} sessionId - Session ID
   * @param {Object} hangData - Hang detection data
   * @returns {Promise<Object>} Recovery result
   */
  async handleFailedTermination(sessionId, hangData) {
    this.logger.error('Graceful termination failed', { 
      sessionId, 
      hangData 
    });
    
    // For now, just log and return failure
    // In future phases, this will:
    // 1. Reset task to pending
    // 2. Restart OpenCode service
    // 3. Reset all in-progress tasks
    
    return {
      method: 'failed-termination',
      success: false,
      sessionId,
      hangData,
      message: 'Service restart not yet implemented'
    };
  }
}
