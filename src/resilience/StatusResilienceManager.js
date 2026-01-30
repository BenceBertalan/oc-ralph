/**
 * @fileoverview Status & Resilience Manager - Unified state management for oc-ralph
 * 
 * Single source of truth for:
 * - Orchestration state
 * - Health monitoring
 * - Failure detection & recovery
 * - GitHub issue updates
 * - Discord notifications
 */

import { SessionWatchdog } from './SessionWatchdog.js';
import { ModelFailoverManager } from './ModelFailoverManager.js';

/**
 * Unified manager for status reporting and resilience handling
 */
export class StatusResilienceManager {
  /**
   * @param {Object} config - Manager configuration
   * @param {Object} config.github - GitHub operations instance
   * @param {Object} config.discord - Discord notifier instance
   * @param {Object} config.occlient - OpenCode client instance
   * @param {Object} config.statusResilience - Resilience configuration
   * @param {Object} config.fullConfig - Full oc-ralph configuration (for model failover)
   * @param {Object} logger - Logger instance
   */
  constructor({ github, discord, occlient, statusResilience, fullConfig }, logger) {
    this.github = github;
    this.discord = discord;
    this.occlient = occlient;
    this.config = statusResilience || {};
    this.fullConfig = fullConfig; // Store full config for model failover
    this.logger = logger;
    
    // Orchestration state (per issue)
    this.state = new Map();
    
    // Feature flags
    this.features = this.config.features || {
      hangRecovery: true,
      useOcclientEvents: true,
      pollBasedFallback: false
    };
    
    // Initialize SessionWatchdog if hang recovery enabled
    if (this.features.hangRecovery) {
      this.sessionWatchdog = new SessionWatchdog(
        this.occlient,
        this.github,
        this.config.sessionWatchdog || {},
        this.logger
      );
    }
    
    // Initialize ModelFailoverManager
    this.modelFailoverManager = new ModelFailoverManager(
      this.fullConfig,
      this.logger,
      this.discord
    );
    
    this.logger.info('StatusResilienceManager initialized', {
      features: this.features,
      enabled: this.config.enabled !== false,
      hangRecoveryEnabled: !!this.sessionWatchdog,
      modelFailoverEnabled: this.modelFailoverManager.enabled
    });
  }
  
  /**
   * Report an event from any component
   * This is the main entry point for all status and resilience events
   * 
   * @param {Object} event - Event object
   * @param {string} event.type - Event type (e.g., 'session-hung', 'task-completed')
   * @param {number} event.issueNumber - Issue number
   * @param {Object} event.data - Event-specific data
   */
  async reportEvent(event) {
    const { type, issueNumber, data } = event;
    
    this.logger.debug('Event received', { type, issueNumber, data });
    
    try {
      // 1. Update internal state
      this._updateState(issueNumber, type, data);
      
      // 2. Handle event-specific logic
      await this._handleEvent(event);
      
      // 3. Update GitHub issue (debounced)
      await this._updateGitHubIssue(issueNumber);
      
      // 4. Send Discord notification (if configured)
      await this._sendDiscordNotification(event);
      
    } catch (error) {
      this.logger.error('Failed to handle event', { type, issueNumber, error: error.message });
    }
  }
  
  /**
   * Update internal state for an issue
   * @private
   */
  _updateState(issueNumber, eventType, data) {
    if (!this.state.has(issueNumber)) {
      this.state.set(issueNumber, {
        events: [],
        currentStage: 'unknown',
        lastUpdate: Date.now()
      });
    }
    
    const state = this.state.get(issueNumber);
    state.events.push({
      type: eventType,
      data,
      timestamp: Date.now()
    });
    state.lastUpdate = Date.now();
    
    // Update current stage based on event type
    if (eventType.includes('started')) {
      state.currentStage = eventType.replace('-started', '');
    }
  }
  
  /**
   * Handle event-specific logic
   * @private
   */
  async _handleEvent(event) {
    const { type, issueNumber, data } = event;
    
    switch (type) {
      case 'session-hung':
        await this._handleSessionHung(issueNumber, data);
        break;
        
      case 'model-timeout':
        await this._handleModelTimeout(issueNumber, data);
        break;
      
      case 'agent-completed':
        await this._handleAgentCompleted(issueNumber, data);
        break;
        
      case 'orchestration-started':
      case 'orchestration-completed':
      case 'orchestration-failed':
        // Lifecycle events - just log
        this.logger.info(`Orchestration ${type.replace('orchestration-', '')}`, { issueNumber });
        break;
        
      case 'task-completed':
      case 'task-failed':
        // Task events - log with details
        this.logger.info(`Task ${type.replace('task-', '')}`, { issueNumber, data });
        break;
        
      default:
        // Generic event handling
        this.logger.debug('Event processed', { type, issueNumber });
    }
  }
  
  /**
   * Handle session hung event
   * @private
   */
  async _handleSessionHung(issueNumber, data) {
    if (!this.features.hangRecovery) {
      this.logger.warn('Hang recovery disabled, logging only', { issueNumber, data });
      return;
    }
    
    if (!this.sessionWatchdog) {
      this.logger.error('SessionWatchdog not initialized but hang recovery enabled', { issueNumber });
      return;
    }
    
    this.logger.warn('Session hung detected, initiating recovery', { issueNumber, data });
    
    // Send initial notification
    await this.discord.send({
      level: 'warning',
      title: `⚠️ Session Hung Detected`,
      description: `Issue #${issueNumber}: Initiating recovery for session ${data.sessionId}`,
      fields: [
        { name: 'Agent', value: data.agentName },
        { name: 'Hang Type', value: data.hangType },
        { name: 'Idle Time', value: `${data.idleTime}s` }
      ]
    });
    
    // Delegate to SessionWatchdog for recovery
    const recovery = await this.sessionWatchdog.handleHungSession(
      data.sessionId,
      data
    );
    
    // Report recovery outcome
    if (recovery.success) {
      await this.reportEvent({
        type: 'session-killed',
        issueNumber,
        data: {
          sessionId: data.sessionId,
          recoveryMethod: recovery.method,
          attempts: recovery.attempts,
          duration: recovery.duration
        }
      });
      
      await this.discord.send({
        level: 'success',
        title: `✅ Session Recovered`,
        description: `Issue #${issueNumber}: Session ${data.sessionId} recovered via ${recovery.method}`,
        fields: [
          { name: 'Method', value: recovery.method },
          { name: 'Attempts', value: String(recovery.attempts) },
          { name: 'Duration', value: `${recovery.duration}ms` }
        ]
      });
    } else {
      this.logger.error('Session recovery failed', { issueNumber, recovery });
      
      await this.discord.send({
        level: 'error',
        title: `❌ Session Recovery Failed`,
        description: `Issue #${issueNumber}: Could not recover session ${data.sessionId}`,
        fields: [
          { name: 'Method Tried', value: recovery.method || 'graceful-kill' },
          { name: 'Message', value: recovery.message || 'Unknown error' }
        ]
      });
    }
  }
  
  /**
   * Handle model timeout event - attempt failover to backup model
   * @private
   */
  async _handleModelTimeout(issueNumber, data) {
    const { agentName, sessionId, model, idleTimeSeconds, attemptNumber } = data;
    
    this.logger.warn('Model timeout detected, attempting failover', {
      issueNumber,
      agentName,
      sessionId,
      model: `${model.providerID}/${model.modelID}`,
      idleTimeSeconds,
      attemptNumber
    });
    
    // Attempt model failover
    const newModel = await this.modelFailoverManager.handleModelTimeout({
      agentName,
      sessionId,
      model,
      idleTimeSeconds,
      attemptNumber
    });
    
    if (newModel) {
      this.logger.info('Model failover successful', {
        issueNumber,
        agentName,
        newModel: `${newModel.providerID}/${newModel.modelID}`
      });
      
      // Store the new model for the agent executor to use on retry
      this._storeFailoverModel(issueNumber, agentName, newModel);
    } else {
      this.logger.error('Model failover failed - no fallback available', {
        issueNumber,
        agentName,
        currentModel: `${model.providerID}/${model.modelID}`
      });
    }
  }
  
  /**
   * Handle agent completion - reset failover state on success
   * @private
   */
  async _handleAgentCompleted(issueNumber, data) {
    const { agentName, duration } = data;
    
    this.logger.info('Agent completed successfully', {
      issueNumber,
      agentName,
      duration
    });
    
    // Reset failover state for this agent since it completed successfully
    this.modelFailoverManager.resetAgent(agentName);
  }
  
  /**
   * Store failover model for agent (to be retrieved on retry)
   * @private
   */
  _storeFailoverModel(issueNumber, agentName, model) {
    if (!this.state.has(issueNumber)) {
      this.state.set(issueNumber, {
        events: [],
        currentStage: 'unknown',
        lastUpdate: Date.now(),
        failoverModels: {}
      });
    }
    
    const state = this.state.get(issueNumber);
    if (!state.failoverModels) {
      state.failoverModels = {};
    }
    
    state.failoverModels[agentName.toLowerCase()] = model;
    
    this.logger.debug('Stored failover model', {
      issueNumber,
      agentName,
      model: `${model.providerID}/${model.modelID}`
    });
  }
  
  /**
   * Get current model for an agent (including failovers)
   * Called by AgentExecutor before each execution
   * @public
   */
  getCurrentModelForAgent(agentName, defaultModel) {
    return this.modelFailoverManager.getCurrentModel(agentName, defaultModel);
  }
  
  /**
   * Update GitHub issue with current state
   * @private
   */
  async _updateGitHubIssue(issueNumber) {
    // TODO: Implement GitHub issue update logic
    // This will replace StatusUpdater functionality
    this.logger.debug('GitHub issue update (not yet implemented)', { issueNumber });
  }
  
  /**
   * Send Discord notification for event
   * @private
   */
  async _sendDiscordNotification(event) {
    const { type, issueNumber } = event;
    
    // Only send notifications for important events
    const notifiableEvents = [
      'session-hung',
      'session-killed',
      'service-restarting',
      'service-restarted',
      'orchestration-completed',
      'orchestration-failed'
    ];
    
    if (!notifiableEvents.includes(type)) {
      return;
    }
    
    // Notification is already sent in event handlers
    // This is a placeholder for future notification logic
  }
  
  /**
   * Get current state for an issue
   * @param {number} issueNumber - Issue number
   * @returns {Object} Current state
   */
  getState(issueNumber) {
    return this.state.get(issueNumber) || null;
  }
  
  /**
   * Clear state for an issue (after completion/failure)
   * @param {number} issueNumber - Issue number
   */
  clearState(issueNumber) {
    this.state.delete(issueNumber);
    this.logger.debug('State cleared', { issueNumber });
  }
}
