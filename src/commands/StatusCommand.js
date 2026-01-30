/**
 * Status command - check orchestration status
 */
import { ConfigManager } from '../core/ConfigManager.js';
import { StateManager } from '../core/StateManager.js';
import { GitHubClient } from '../github/GitHubClient.js';
import { IssueOperations } from '../github/IssueOperations.js';
import { LabelOperations } from '../github/LabelOperations.js';

export class StatusCommand {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(issueNumber, options) {
    console.log(`\n🔍 Checking status for issue #${issueNumber}\n`);

    // Load config
    const configManager = new ConfigManager(options.config);
    const config = configManager.load();

    // Initialize components
    const github = new GitHubClient(this.logger);
    const issueOps = new IssueOperations(github, this.logger);
    const labelOps = new LabelOperations(github, this.logger);
    
    const stateManager = new StateManager(labelOps, issueOps, config, this.logger);

    try {
      const state = await stateManager.getCurrentState(issueNumber);
      const canResume = await stateManager.canResume(issueNumber);
      
      console.log(`Current State: ${state || 'Not started'}`);
      console.log(`Can Resume: ${canResume ? 'Yes' : 'No'}`);
      console.log(`\nView issue: https://github.com/${config.github.owner}/${config.github.repo}/issues/${issueNumber}\n`);
      
    } catch (error) {
      console.error('\n❌ Status check failed:', error.message);
      process.exit(1);
    }
  }
}
