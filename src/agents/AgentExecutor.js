/**
 * Agent executor - wraps OpenCode client
 */
import { OpenCodeClient } from '../../../occlient/index.js';
import { ServerUnreachableError } from '../../../occlient/errors.js';

export class AgentExecutor {
  constructor(config, logger, debugLogger) {
    this.config = config;
    this.logger = logger;
    this.debugLogger = debugLogger;
    
    // Create OpenCode client
    this.client = new OpenCodeClient({
      baseUrl: config.opencode.baseUrl,
      defaultTimeout: config.opencode.timeout,
      defaultRetries: config.opencode.retries,
      onQuestionOrPermission: 'retry',
      responseFormat: 'text',
      pollInterval: config.opencode.pollInterval
    });
  }

  /**
   * Execute agent with prompt
   */
  async execute(agentName, prompt, options = {}) {
    const agentConfig = this.config.agents[agentName.toLowerCase()];
    
    if (!agentConfig) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    this.logger.info(`Executing ${agentName} agent`, {
      agent: agentConfig.agent,
      model: agentConfig.model.modelID
    });
    
    // Log full request details in debug mode
    if (this.debugLogger && this.debugLogger.debugMode) {
      // Create safe options object for logging (exclude circular references)
      const safeOptions = {
        ...options,
        statusUpdater: options.statusUpdater ? '[StatusUpdater]' : undefined,
        progressCallback: options.progressCallback ? '[Function]' : undefined
      };
      
      this.debugLogger.debug(`[AgentExecutor] Starting ${agentName} execution`, {
        agentConfig,
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
        options: safeOptions
      });
    }

    // Track execution metadata
    const startTime = Date.now();
    let attempts = 0;
    let toolsExecuted = 0;
    let lastError = null;
    let lastAgentMessage = null;

    // Wrap with progress tracking
    const executeFn = async (callbackOptions = {}) => {
      attempts++;
      const progressCallback = callbackOptions.progressCallback || options.progressCallback;
      
      // CHECK OPENCODE SERVER HEALTH BEFORE EXECUTION
      try {
        const isHealthy = await this.checkOpenCodeHealth();
        if (!isHealthy) {
          const error = new Error('OpenCode server is unreachable or not responding');
          error.code = 'SERVER_UNREACHABLE';
          
          // Send Discord notification if available
          if (options.discordNotifier) {
            await options.discordNotifier.onEvent('critical-error', {
              masterIssueNumber: options.issueNumber || 'unknown',
              error: 'OpenCode server health check failed',
              details: `Agent: ${agentName}, Server: ${this.config.opencode.baseUrl}`
            });
          }
          
          this.logger.error('OpenCode server health check failed', {
            agent: agentName,
            baseUrl: this.config.opencode.baseUrl
          });
          
          throw error;
        }
      } catch (healthError) {
        // If health check throws an error, treat it as server unreachable
        if (!healthError.code) {
          healthError.code = 'SERVER_UNREACHABLE';
        }
        throw healthError;
      }
      
      // Enhanced progress callback with logging and status updates
      const enhancedProgressCallback = async (event) => {
        if (this.debugLogger && this.debugLogger.debugMode) {
          this.debugLogger.debug(`[AgentExecutor] Progress event for ${agentName}`, {
            eventType: event.type,
            sessionId: event.sessionId,
            data: event.data
          });
        }
        
        // === NEW: Handle hang detection from occlient ===
        if (event.type === 'hang-detected') {
          this.logger.warn('Session hang detected by occlient', {
            issueNumber: options.issueNumber,
            agentName,
            sessionId: event.sessionId,
            hangType: event.data?.type,
            idleTime: event.data?.idleTime
          });
          
          // Report to StatusResilienceManager for recovery
          if (options.statusResilienceManager) {
            await options.statusResilienceManager.reportEvent({
              type: 'session-hung',
              issueNumber: options.issueNumber,
              data: {
                sessionId: event.sessionId,
                agentName,
                hangType: event.data?.type,     // 'session' or 'tool'
                idleTime: event.data?.idleTime,  // seconds
                timestamp: Date.now()
              }
            });
          }
          
          return; // Don't propagate hang to other handlers
        }
        
        // Track retry events
        if (event.type === 'retry' && options.statusUpdater && options.issueNumber) {
          await options.statusUpdater.updateTaskProgress(options.issueNumber, {
            retryCount: event.data?.attemptNumber || attempts,
            lastRetryTime: new Date().toISOString()
          });
        }
        
        // Track tool executions
        if (event.type === 'tool-completed') {
          toolsExecuted += (event.data?.count || 1);
          
          // Update tool usage in status table
          if (options.statusUpdater && options.issueNumber) {
            await options.statusUpdater.updateTaskProgress(options.issueNumber, {
              toolsUsed: toolsExecuted
            });
          }
        }
        
        // Track agent messages
        if (event.type === 'message-received' && event.data) {
          // Extract text content from the latest message
          if (event.data.content) {
            lastAgentMessage = event.data.content;
          } else if (event.data.count && event.data.total) {
            lastAgentMessage = `Processing... (${event.data.count}/${event.data.total})`;
          }
          
          // Update agent message in status table
          if (lastAgentMessage && options.statusUpdater && options.issueNumber) {
            await options.statusUpdater.updateTaskProgress(options.issueNumber, {
              agentMessage: lastAgentMessage
            });
          }
        }
        
        // Call original callback if provided
        if (progressCallback) {
          progressCallback(event);
        }
      };
      
      // Get current model (may have been changed by failover)
      // Declare outside try block so it's accessible in catch
      let currentModel = agentConfig.model;
      
      try {
        if (options.statusResilienceManager) {
          currentModel = options.statusResilienceManager.getCurrentModelForAgent(
            agentName,
            agentConfig.model
          );
          
          // Log if using failback model
          if (currentModel.modelID !== agentConfig.model.modelID) {
            this.logger.info('Using failback model for agent', {
              agent: agentName,
              original: `${agentConfig.model.providerID}/${agentConfig.model.modelID}`,
              failback: `${currentModel.providerID}/${currentModel.modelID}`,
              attempt: attempts
            });
          }
        }
        
        const result = await this.client.execute(prompt, {
          model: currentModel, // Use potentially failed-over model
          agent: agentConfig.agent,
          timeout: options.timeout || agentConfig.timeout,
          responseFormat: options.responseFormat || 'text',
          progressCallback: enhancedProgressCallback
        });
        
        // Log full response in debug mode
        if (this.debugLogger && this.debugLogger.debugMode) {
          this.debugLogger.debug(`[AgentExecutor] ${agentName} completed successfully`, {
            responseLength: result.response?.length || 0,
            responsePreview: result.response?.substring(0, 500) + (result.response?.length > 500 ? '...' : ''),
            fullResponse: result.response,
            sessionId: result.sessionId,
            toolsUsed: toolsExecuted,
            duration: Date.now() - startTime
          });
        }
        
        // Report successful completion to reset failover state
        if (options.statusResilienceManager) {
          await options.statusResilienceManager.reportEvent({
            type: 'agent-completed',
            issueNumber: options.issueNumber,
            data: {
              agentName,
              duration: Date.now() - startTime,
              attempts,
              toolsExecuted
            }
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (this.debugLogger && this.debugLogger.debugMode) {
          this.debugLogger.debug(`[AgentExecutor] ${agentName} attempt ${attempts} failed`, {
            error: error.message,
            errorType: error.name,
            errorCode: error.code,
            stack: error.stack,
            duration: Date.now() - startTime
          });
        }
        
        // Check if error is timeout-related (SESSION_HUNG code from occlient)
        const isTimeout = error.code === 'SESSION_HUNG' || 
                         error.message?.includes('hung') ||
                         error.message?.includes('timeout');
        
        if (isTimeout && options.statusResilienceManager) {
          this.logger.warn('Model timeout detected, reporting to resilience manager', {
            agent: agentName,
            attempt: attempts,
            error: error.message
          });
          
          // Report model timeout for failover attempt
          await options.statusResilienceManager.reportEvent({
            type: 'model-timeout',
            issueNumber: options.issueNumber,
            data: {
              agentName,
              sessionId: error.sessionId || 'unknown',
              model: currentModel, // Report the model that timed out
              idleTimeSeconds: 30, // From hang threshold
              attemptNumber: attempts,
              error: error.message
            }
          });
          
          // Mark as non-retryable to stop occlient's retry loop
          // oc-ralph will handle retry with failback model
          error.shouldRetry = false;
        }
        
        // Check if error is ServerUnreachableError - these should bubble up immediately
        if (error instanceof ServerUnreachableError || error.code === 'SERVER_UNREACHABLE') {
          this.logger.error(`OpenCode server is unreachable`, {
            error: error.message,
            attempts: error.healthCheckAttempts || 3
          });
          // Mark as non-retryable and throw
          error.shouldRetry = false;
        }
        
        throw error;
      }
    };

    // Retry loop for failover handling
    let result;
    let failoverAttempts = 0;
    const maxFailoverAttempts = 3; // Max retries after failover
    
    while (failoverAttempts < maxFailoverAttempts) {
      try {
        if (this.debugLogger && this.debugLogger.debugMode) {
          result = await this.debugLogger.executeAgentWithDebug(
            agentName,
            executeFn,
            options.context || {}
          );
        } else {
          result = await executeFn();
        }
        break; // Success - exit loop
      } catch (error) {
        // Check if this was a timeout error that triggered failover
        const isTimeout = error.code === 'SESSION_HUNG' || 
                         error.message?.includes('hung') ||
                         error.message?.includes('timeout');
        
        if (isTimeout && options.statusResilienceManager && failoverAttempts < maxFailoverAttempts - 1) {
          this.logger.info('Retrying with failback model after timeout', {
            agent: agentName,
            failoverAttempt: failoverAttempts + 1,
            maxAttempts: maxFailoverAttempts
          });
          failoverAttempts++;
          // Loop will retry with getCurrentModelForAgent() returning failback model
          continue;
        }
        
        // Not a timeout, or max retries exceeded, or no failover configured
        throw error;
      }
    }
    
    // Add metadata to result
    result.duration = Date.now() - startTime;
    result.attempts = attempts;
    result.toolsExecuted = toolsExecuted;

    this.logger.info(`${agentName} agent completed`, {
      duration: result.duration,
      attempts: result.attempts,
      toolsExecuted: result.toolsExecuted
    });
    
    // Final debug log with complete execution summary
    if (this.debugLogger && this.debugLogger.debugMode) {
      this.debugLogger.debug(`[AgentExecutor] ${agentName} execution summary`, {
        success: true,
        duration: result.duration,
        attempts: result.attempts,
        toolsExecuted: result.toolsExecuted,
        responseLength: result.response?.length || 0,
        sessionId: result.sessionId
      });
    }

    return result;
  }

  /**
   * Execute agent with structured response
   */
  async executeStructured(agentName, prompt, options = {}) {
    const result = await this.execute(agentName, prompt, {
      ...options,
      responseFormat: 'structured'
    });

    return result;
  }

  /**
   * Check if OpenCode server is healthy and reachable
   * @returns {Promise<boolean>} true if server is healthy, false otherwise
   */
  async checkOpenCodeHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(
        `${this.config.opencode.baseUrl}/api/session`,
        { 
          method: 'GET',
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      const isHealthy = response.ok && response.status < 500;
      
      if (!isHealthy) {
        this.logger.warn('OpenCode health check returned unhealthy status', {
          status: response.status,
          statusText: response.statusText
        });
      }
      
      return isHealthy;
    } catch (error) {
      this.logger.warn('OpenCode health check failed', { 
        error: error.message,
        baseUrl: this.config.opencode.baseUrl
      });
      return false;
    }
  }
}
