/**
 * ModelFailoverManager - Handles automatic model failover when primary models timeout
 * 
 * Features:
 * - Detects when models fail to respond within timeout threshold
 * - Automatically switches to failback models
 * - Tracks failover history and statistics
 * - Integrates with Discord notifications
 * - Provides centralized logging
 * 
 * Architecture:
 * - Event-driven: listens for timeout events from occlient/StatusResilienceManager
 * - Stateful: tracks which models have failed and when
 * - Configurable: failback models defined per agent role
 */

export class ModelFailoverManager {
  constructor(config, logger, discord) {
    this.config = config;
    this.logger = logger;
    this.discord = discord;
    
    // Failover state tracking
    this.failoverHistory = new Map(); // agentName -> Array<{timestamp, from, to, reason}>
    this.currentModels = new Map();   // agentName -> currentModel
    this.failoverCounts = new Map();  // agentName -> count
    
    // Configuration
    this.enabled = config.statusResilience?.modelFailover?.enabled ?? true;
    this.timeoutThreshold = config.statusResilience?.modelFailover?.timeoutThresholdSeconds ?? 30;
    this.maxFailoversPerAgent = config.statusResilience?.modelFailover?.maxFailoversPerAgent ?? 2;
    this.failbackModels = config.statusResilience?.modelFailover?.failbackModels || {};
    
    this.logger.info('ModelFailoverManager initialized', {
      enabled: this.enabled,
      timeoutThreshold: this.timeoutThreshold,
      maxFailoversPerAgent: this.maxFailoversPerAgent,
      failbackModelsConfigured: Object.keys(this.failbackModels)
    });
  }

  /**
   * Get the current model for an agent (considering failovers)
   * @param {string} agentName - Agent name (e.g., 'architect', 'craftsman')
   * @param {Object} defaultModel - Default model from agent config
   * @returns {Object} Model configuration {providerID, modelID}
   */
  getCurrentModel(agentName, defaultModel) {
    if (!this.enabled) {
      return defaultModel;
    }

    const normalizedAgent = agentName.toLowerCase();
    const currentModel = this.currentModels.get(normalizedAgent);
    
    if (currentModel) {
      this.logger.debug('Using current model for agent', {
        agent: agentName,
        model: currentModel.modelID,
        provider: currentModel.providerID,
        isFailback: true
      });
      return currentModel;
    }

    // Initialize with default
    this.currentModels.set(normalizedAgent, defaultModel);
    return defaultModel;
  }

  /**
   * Handle model timeout event - switch to failback model if available
   * @param {Object} event - Timeout event details
   * @returns {Object|null} New model to use, or null if no failback available
   */
  async handleModelTimeout(event) {
    if (!this.enabled) {
      this.logger.warn('ModelFailoverManager disabled, cannot handle timeout', { event });
      return null;
    }

    const { agentName, sessionId, model, idleTimeSeconds, attemptNumber } = event;
    const normalizedAgent = agentName.toLowerCase();

    this.logger.warn('Model timeout detected', {
      agent: agentName,
      sessionId,
      currentModel: model?.modelID,
      idleTimeSeconds,
      attemptNumber
    });

    // Check if we've exceeded max failovers
    const failoverCount = this.failoverCounts.get(normalizedAgent) || 0;
    if (failoverCount >= this.maxFailoversPerAgent) {
      this.logger.error('Max failovers exceeded for agent', {
        agent: agentName,
        failoverCount,
        maxAllowed: this.maxFailoversPerAgent
      });

      await this._notifyMaxFailoversExceeded(agentName, sessionId, failoverCount);
      return null;
    }

    // Get failback model
    const failbackModel = this._getFailbackModel(normalizedAgent);
    if (!failbackModel) {
      this.logger.error('No failback model configured for agent', {
        agent: agentName,
        currentModel: model?.modelID
      });

      await this._notifyNoFailbackAvailable(agentName, sessionId, model);
      return null;
    }

    // Execute failover
    const previousModel = this.currentModels.get(normalizedAgent) || model;
    this.currentModels.set(normalizedAgent, failbackModel);
    this.failoverCounts.set(normalizedAgent, failoverCount + 1);

    // Record history
    const failoverRecord = {
      timestamp: new Date().toISOString(),
      from: previousModel,
      to: failbackModel,
      reason: `Timeout after ${idleTimeSeconds}s`,
      sessionId,
      attemptNumber
    };

    if (!this.failoverHistory.has(normalizedAgent)) {
      this.failoverHistory.set(normalizedAgent, []);
    }
    this.failoverHistory.get(normalizedAgent).push(failoverRecord);

    this.logger.info('Model failover executed', {
      agent: agentName,
      from: `${previousModel.providerID}/${previousModel.modelID}`,
      to: `${failbackModel.providerID}/${failbackModel.modelID}`,
      failoverCount: failoverCount + 1,
      sessionId
    });

    // Send notifications
    await this._notifyFailover(agentName, previousModel, failbackModel, failoverRecord);

    return failbackModel;
  }

  /**
   * Reset failover state for an agent (e.g., after successful completion)
   * @param {string} agentName - Agent name
   */
  resetAgent(agentName) {
    const normalizedAgent = agentName.toLowerCase();
    
    const hadFailovers = this.failoverCounts.get(normalizedAgent) > 0;
    
    this.currentModels.delete(normalizedAgent);
    this.failoverCounts.delete(normalizedAgent);

    if (hadFailovers) {
      this.logger.info('Agent failover state reset', {
        agent: agentName,
        reason: 'Successful completion'
      });
    }
  }

  /**
   * Get failback model for agent role
   * @private
   */
  _getFailbackModel(normalizedAgent) {
    const failbackConfig = this.failbackModels[normalizedAgent];
    if (!failbackConfig) {
      return null;
    }

    return {
      providerID: failbackConfig.providerID,
      modelID: failbackConfig.modelID
    };
  }

  /**
   * Send Discord notification for model failover
   * @private
   */
  async _notifyFailover(agentName, previousModel, newModel, record) {
    if (!this.discord?.enabled) {
      return;
    }

    const message = {
      content: `⚠️ **Model Failover** - ${agentName}`,
      embeds: [{
        title: '🔄 Automatic Model Failover',
        description: `Agent **${agentName}** switched models due to timeout`,
        color: 0xFFA500, // Orange
        fields: [
          {
            name: '❌ Previous Model',
            value: `\`${previousModel.providerID}/${previousModel.modelID}\``,
            inline: true
          },
          {
            name: '✅ New Model',
            value: `\`${newModel.providerID}/${newModel.modelID}\``,
            inline: true
          },
          {
            name: '⏱️ Reason',
            value: record.reason,
            inline: false
          },
          {
            name: '🔗 Session',
            value: `\`${record.sessionId.substring(0, 20)}...\``,
            inline: true
          },
          {
            name: '🔄 Attempt',
            value: `#${record.attemptNumber}`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'oc-ralph Model Failover System'
        }
      }]
    };

    try {
      await this.discord.send(message);
    } catch (error) {
      this.logger.error('Failed to send failover Discord notification', {
        error: error.message,
        agent: agentName
      });
    }
  }

  /**
   * Notify when max failovers exceeded
   * @private
   */
  async _notifyMaxFailoversExceeded(agentName, sessionId, failoverCount) {
    if (!this.discord?.enabled) {
      return;
    }

    const message = {
      content: `🚨 **Critical: Max Failovers Exceeded** - ${agentName}`,
      embeds: [{
        title: '🚨 Maximum Model Failovers Exceeded',
        description: `Agent **${agentName}** has exhausted all failover attempts`,
        color: 0xFF0000, // Red
        fields: [
          {
            name: '🔄 Failover Count',
            value: `${failoverCount} / ${this.maxFailoversPerAgent}`,
            inline: true
          },
          {
            name: '🔗 Session',
            value: `\`${sessionId.substring(0, 20)}...\``,
            inline: true
          },
          {
            name: '⚠️ Action Required',
            value: 'Manual intervention needed - check model configurations and OpenCode service health',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'oc-ralph Model Failover System'
        }
      }]
    };

    try {
      await this.discord.send(message);
    } catch (error) {
      this.logger.error('Failed to send max failovers notification', {
        error: error.message,
        agent: agentName
      });
    }
  }

  /**
   * Notify when no failback model available
   * @private
   */
  async _notifyNoFailbackAvailable(agentName, sessionId, currentModel) {
    if (!this.discord?.enabled) {
      return;
    }

    const message = {
      content: `⚠️ **No Failback Model** - ${agentName}`,
      embeds: [{
        title: '⚠️ No Failback Model Configured',
        description: `Agent **${agentName}** timed out but no failback model is configured`,
        color: 0xFFA500, // Orange
        fields: [
          {
            name: '❌ Failed Model',
            value: `\`${currentModel?.providerID}/${currentModel?.modelID}\``,
            inline: false
          },
          {
            name: '🔗 Session',
            value: `\`${sessionId.substring(0, 20)}...\``,
            inline: true
          },
          {
            name: '💡 Recommendation',
            value: 'Add failback model configuration for this agent in config.json',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'oc-ralph Model Failover System'
        }
      }]
    };

    try {
      await this.discord.send(message);
    } catch (error) {
      this.logger.error('Failed to send no failback notification', {
        error: error.message,
        agent: agentName
      });
    }
  }

  /**
   * Get failover statistics for reporting
   */
  getStatistics() {
    const stats = {
      enabled: this.enabled,
      totalFailovers: 0,
      agentStats: {}
    };

    for (const [agent, history] of this.failoverHistory.entries()) {
      stats.totalFailovers += history.length;
      stats.agentStats[agent] = {
        failoverCount: history.length,
        currentModel: this.currentModels.get(agent),
        lastFailover: history[history.length - 1],
        history: history
      };
    }

    return stats;
  }

  /**
   * Get failover status for an agent
   */
  getAgentStatus(agentName) {
    const normalizedAgent = agentName.toLowerCase();
    
    return {
      agent: agentName,
      currentModel: this.currentModels.get(normalizedAgent),
      failoverCount: this.failoverCounts.get(normalizedAgent) || 0,
      maxFailovers: this.maxFailoversPerAgent,
      history: this.failoverHistory.get(normalizedAgent) || [],
      canFailover: (this.failoverCounts.get(normalizedAgent) || 0) < this.maxFailoversPerAgent
    };
  }
}
