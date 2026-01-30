/**
 * Configuration manager for oc-ralph
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export class ConfigManager {
  constructor(configPath = '.oc-ralph/config.yaml') {
    this.configPath = configPath;
    this.config = null;
  }

  /**
   * Load configuration from file with CLI overrides
   */
  load(cliOverrides = {}) {
    const yamlPath = this.configPath;
    const jsonPath = this.configPath.replace('.yaml', '.json');
    
    // Check if YAML exists
    if (fs.existsSync(yamlPath)) {
      const fileContent = fs.readFileSync(yamlPath, 'utf-8');
      this.config = yaml.load(fileContent);
    }
    // If no YAML but JSON exists, migrate automatically
    else if (fs.existsSync(jsonPath)) {
      console.log('⚠️  Found config.json - automatically migrating to config.yaml...');
      this.migrateFromJSON(jsonPath, yamlPath);
      // Load the newly created YAML
      const fileContent = fs.readFileSync(yamlPath, 'utf-8');
      this.config = yaml.load(fileContent);
      console.log('✅ Migration complete! Using config.yaml\n');
    }
    // Neither exists
    else {
      throw new Error(`Config file not found: ${yamlPath}. Run 'oc-ralph init' first.`);
    }

    // Apply CLI overrides
    this.config = this.mergeConfig(this.config, cliOverrides);

    // Validate
    this.validate();

    return this.config;
  }

  /**
   * Migrate from JSON to YAML
   */
  migrateFromJSON(jsonPath, yamlPath) {
    // Read JSON
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    const jsonConfig = JSON.parse(jsonContent);
    
    // Remove all _comment fields
    const cleanConfig = this.removeComments(jsonConfig);
    
    // Convert to YAML with comments
    const yamlContent = this.generateYAMLWithComments(cleanConfig);
    
    // Write YAML
    fs.writeFileSync(yamlPath, yamlContent);
    
    // Rename old JSON to .json.bak
    fs.renameSync(jsonPath, `${jsonPath}.bak`);
    console.log(`   📦 Backed up old config to ${jsonPath}.bak`);
  }

  /**
   * Generate YAML string with inline comments
   */
  generateYAMLWithComments(config) {
    // Start with header comment
    let yamlStr = '# oc-ralph configuration\n\n';
    
    // Convert to YAML
    yamlStr += yaml.dump(config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true
    });
    
    return yamlStr;
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

    if (!this.config.github?.repoPath) {
      throw new Error('Missing required config: github.repoPath (local path to the repository)');
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
   * Get local repository path
   */
  getRepoPath() {
    return this.config.github.repoPath;
  }

  /**
   * Generate example config
   */
  static generateExampleConfig() {
    return `# oc-ralph configuration

opencode:
  baseUrl: http://localhost:4096  # OpenCode server URL
  timeout: 300
  retries: 3
  pollInterval: 2000

agents:
  # Configure AI models for each agent type
  architect:
    model:
      providerID: openai  # Options: openai, anthropic, google, etc.
      modelID: gpt-5.2-codex
    agent: NightMutyur  # OpenCode agent name to use
    timeout: 180
  
  sculptor:
    model:
      providerID: openai
      modelID: gpt-5.2-codex
    agent: NightMutyur
    timeout: 180
  
  sentinel:
    model:
      providerID: openai
      modelID: gpt-5.2-codex
    agent: NightMutyur
    timeout: 180
  
  craftsman:
    model:
      providerID: openai
      modelID: gpt-5.2-codex
    agent: NightMutyur
    timeout: 600
  
  validator:
    model:
      providerID: openai
      modelID: gpt-5.2-codex
    agent: NightMutyur
    timeout: 300

github:
  owner: YOUR_GITHUB_ORG       # GitHub organization or username
  repo: YOUR_REPO_NAME          # Repository name
  repoPath: /path/to/your-repo  # Local path to the repository
  baseBranch: main              # Base branch for feature branches
  labelPrefix: "oc-ralph:"
  createPR: true
  autoMergePR: false
  closeSubIssuesOnCompletion: true

worktree:
  basePath: /tmp/oc-ralph-worktrees  # Directory for git worktrees
  cleanupOnCompletion: false
  cleanupOnFailure: false

discord:
  webhookUrl: https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
  notificationLevel: all-major-events  # Options: all-major-events, stage-transitions, errors-only
  mentionRoles: []

execution:
  parallel:
    maxConcurrency: auto  # Max parallel test agents
    enableSmartDependencies: true
  retry:
    maxAttempts: 3
    backoffMultiplier: 2
    initialDelayMs: 1000
  testing:
    continueOnFailure: true  # Continue running tests after failures

statusTable:
  updateIntervalSeconds: 60  # Status table update frequency
  showRetryHistory: true
  maxRetryHistoryEntries: 5

logging:
  level: info        # Options: debug, info, warn, error
  debugMode: false   # Enable verbose occlient logging
  logDir: ./logs
  debugLogDir: ./logs/debug

service:
  enabled: true
  port: 3000
  host: 0.0.0.0
  pollInterval: 60000          # GitHub polling interval in milliseconds (60s)
  queueLabel: "oc-ralph:queue"
  maxBufferSize: 10000

cron:
  enabled: false  # Set to true if running from cron
`;
  }
}
