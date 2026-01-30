/**
 * Configuration manager for oc-ralph
 */
import fs from 'fs';
import path from 'path';

export class ConfigManager {
  constructor(configPath = '.oc-ralph/config.json') {
    this.configPath = configPath;
    this.config = null;
  }

  /**
   * Load configuration from file with CLI overrides
   */
  load(cliOverrides = {}) {
    // Load from file
    if (fs.existsSync(this.configPath)) {
      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(fileContent);
    } else {
      throw new Error(`Config file not found: ${this.configPath}. Run 'oc-ralph init' first.`);
    }

    // Remove comment fields
    this.config = this.removeComments(this.config);

    // Apply CLI overrides
    this.config = this.mergeConfig(this.config, cliOverrides);

    // Validate
    this.validate();

    return this.config;
  }

  /**
   * Remove comment fields (fields starting with _comment)
   */
  removeComments(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeComments(item));
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!key.startsWith('_comment')) {
        cleaned[key] = this.removeComments(value);
      }
    }
    return cleaned;
  }

  /**
   * Merge CLI overrides into config
   */
  mergeConfig(config, overrides) {
    const merged = { ...config };

    if (overrides.opencodeUrl) {
      merged.opencode.baseUrl = overrides.opencodeUrl;
    }

    if (overrides.discordWebhook) {
      merged.discord.webhookUrl = overrides.discordWebhook;
    }

    if (overrides.maxRetries) {
      merged.execution.retry.maxAttempts = overrides.maxRetries;
    }

    if (overrides.concurrency) {
      merged.execution.parallel.maxConcurrency = overrides.concurrency;
    }

    if (overrides.debugMode !== undefined) {
      merged.logging.debugMode = overrides.debugMode;
    }

    if (overrides.noNotifications) {
      merged.discord.webhookUrl = null;
    }

    return merged;
  }

  /**
   * Validate configuration
   */
  validate() {
    // Required fields
    if (!this.config.opencode?.baseUrl) {
      throw new Error('Missing required config: opencode.baseUrl');
    }

    if (!this.config.github?.owner || !this.config.github?.repo) {
      throw new Error('Missing required config: github.owner and github.repo');
    }

    // Validate agent configs
    const requiredAgents = ['architect', 'sculptor', 'sentinel', 'craftsman', 'validator'];
    for (const agent of requiredAgents) {
      if (!this.config.agents?.[agent]) {
        throw new Error(`Missing agent config: ${agent}`);
      }
    }

    return true;
  }

  /**
   * Get agent config
   */
  getAgentConfig(agentName) {
    const agentConfig = this.config.agents[agentName];
    if (!agentConfig) {
      throw new Error(`Agent config not found: ${agentName}`);
    }
    return agentConfig;
  }

  /**
   * Get GitHub repo string (owner/repo)
   */
  getGitHubRepo() {
    return `${this.config.github.owner}/${this.config.github.repo}`;
  }

  /**
   * Generate example config
   */
  static generateExampleConfig() {
    return {
      "_comment": "oc-ralph configuration - Fill in your values",
      
      "opencode": {
        "baseUrl": "http://localhost:4096",
        "_comment_baseUrl": "OpenCode server URL",
        "timeout": 300,
        "retries": 3,
        "pollInterval": 2000
      },
      
      "agents": {
        "_comment": "Configure AI models for each agent type",
        "architect": {
          "model": {
            "providerID": "openai",
            "_comment_providerID": "Options: openai, anthropic, google, etc.",
            "modelID": "gpt-5.2-codex",
            "_comment_modelID": "Model identifier"
          },
          "agent": "NightMutyur",
          "_comment_agent": "OpenCode agent name to use",
          "timeout": 180
        },
        "sculptor": {
          "model": { "providerID": "openai", "modelID": "gpt-5.2-codex" },
          "agent": "NightMutyur",
          "timeout": 180
        },
        "sentinel": {
          "model": { "providerID": "openai", "modelID": "gpt-5.2-codex" },
          "agent": "NightMutyur",
          "timeout": 180
        },
        "craftsman": {
          "model": { "providerID": "openai", "modelID": "gpt-5.2-codex" },
          "agent": "NightMutyur",
          "timeout": 600
        },
        "validator": {
          "model": { "providerID": "openai", "modelID": "gpt-5.2-codex" },
          "agent": "NightMutyur",
          "timeout": 300
        }
      },
      
      "github": {
        "owner": "YOUR_GITHUB_ORG",
        "_comment_owner": "GitHub organization or username",
        "repo": "YOUR_REPO_NAME",
        "_comment_repo": "Repository name",
        "baseBranch": "main",
        "_comment_baseBranch": "Base branch for feature branches",
        "labelPrefix": "oc-ralph:",
        "createPR": true,
        "autoMergePR": false,
        "closeSubIssuesOnCompletion": true
      },
      
      "worktree": {
        "basePath": "/tmp/oc-ralph-worktrees",
        "_comment_basePath": "Directory for git worktrees",
        "cleanupOnCompletion": false,
        "cleanupOnFailure": false
      },
      
      "discord": {
        "webhookUrl": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN",
        "_comment_webhookUrl": "Discord webhook URL (optional)",
        "notificationLevel": "all-major-events",
        "_comment_notificationLevel": "Options: all-major-events, stage-transitions, errors-only",
        "mentionRoles": []
      },
      
      "execution": {
        "parallel": {
          "maxConcurrency": "auto",
          "_comment_maxConcurrency": "Max parallel test agents",
          "enableSmartDependencies": true
        },
        "retry": {
          "maxAttempts": 3,
          "backoffMultiplier": 2,
          "initialDelayMs": 1000
        },
        "testing": {
          "continueOnFailure": true,
          "_comment_continueOnFailure": "Continue running tests after failures"
        }
      },
      
      "statusTable": {
        "updateIntervalSeconds": 60,
        "_comment_updateIntervalSeconds": "Status table update frequency",
        "showRetryHistory": true,
        "maxRetryHistoryEntries": 5
      },
      
      "logging": {
        "level": "info",
        "_comment_level": "Options: debug, info, warn, error",
        "debugMode": false,
        "_comment_debugMode": "Enable verbose occlient logging",
        "logDir": "./logs",
        "debugLogDir": "./logs/debug"
      },
      
      "cron": {
        "enabled": false,
        "_comment_enabled": "Set to true if running from cron"
      }
    };
  }
}
