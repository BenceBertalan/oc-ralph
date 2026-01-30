/**
 * Cleanup command - Clean up stale worktrees
 */
import { ConfigManager } from '../core/ConfigManager.js';
import { WorktreeManager } from '../core/WorktreeManager.js';
import { StateManager } from '../core/StateManager.js';
import { GitHubClient } from '../github/GitHubClient.js';
import { IssueOperations } from '../github/IssueOperations.js';
import { LabelOperations } from '../github/LabelOperations.js';
import { GitOperations } from '../utils/GitOperations.js';
import fs from 'fs/promises';
import path from 'path';

export class CleanupCommand {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(options) {
    console.log('\n🧹 Cleaning up stale worktrees\n');

    // Load config
    const configManager = new ConfigManager(options.config);
    const config = configManager.load({
      debugMode: options.debug || false
    });

    // Initialize components
    const github = new GitHubClient(this.logger);
    const issueOps = new IssueOperations(github, this.logger);
    const labelOps = new LabelOperations(github, this.logger);
    const gitOps = new GitOperations(this.logger);
    
    const stateManager = new StateManager(labelOps, issueOps, config, this.logger);
    const worktreeManager = new WorktreeManager(gitOps, labelOps, config, this.logger);

    try {
      // Read worktrees.json
      const worktreesFile = path.join('.oc-ralph', 'worktrees.json');
      
      let worktrees = {};
      try {
        const data = await fs.readFile(worktreesFile, 'utf8');
        worktrees = JSON.parse(data);
      } catch (error) {
        console.log('No worktrees file found or empty.\n');
        return;
      }

      const issueNumbers = Object.keys(worktrees);
      
      if (issueNumbers.length === 0) {
        console.log('No worktrees to clean up.\n');
        return;
      }

      console.log(`Found ${issueNumbers.length} worktree(s) in registry.\n`);

      let cleaned = 0;
      let skipped = 0;
      let errors = 0;

      for (const issueNumber of issueNumbers) {
        const worktreeData = worktrees[issueNumber];
        const state = await stateManager.getCurrentState(parseInt(issueNumber));

        console.log(`Issue #${issueNumber}: ${state || 'no state'}`);

        // Determine if should clean
        const shouldClean = this.shouldCleanWorktree(state, worktreeData, options);

        if (shouldClean) {
          try {
            console.log(`  → Cleaning worktree: ${worktreeData.worktreePath}`);
            
            // Remove worktree
            await worktreeManager.cleanupWorktree(parseInt(issueNumber));
            
            console.log(`  ✅ Cleaned\n`);
            cleaned++;
          } catch (error) {
            console.error(`  ❌ Error: ${error.message}\n`);
            errors++;
          }
        } else {
          console.log(`  ⏭️  Skipped (in progress)\n`);
          skipped++;
        }
      }

      console.log('\n📊 Cleanup Summary:');
      console.log(`  - Cleaned: ${cleaned}`);
      console.log(`  - Skipped: ${skipped}`);
      console.log(`  - Errors: ${errors}\n`);

    } catch (error) {
      console.error('\n❌ Cleanup failed:', error.message);
      if (options.debug) {
        console.error('\nStack trace:', error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Determine if worktree should be cleaned
   */
  shouldCleanWorktree(state, worktreeData, options) {
    // Force mode cleans everything
    if (options.force) {
      return true;
    }

    // Clean completed orchestrations
    if (state === 'oc-ralph:completed' || state === 'oc-ralph:pr-created') {
      return true;
    }

    // Clean failed orchestrations
    if (state === 'oc-ralph:failed' || state === 'oc-ralph:rejected') {
      return true;
    }

    // Clean old worktrees (older than 7 days) regardless of state
    if (options.old) {
      const createdAt = new Date(worktreeData.createdAt);
      const now = new Date();
      const daysDiff = (now - createdAt) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 7) {
        return true;
      }
    }

    return false;
  }
}
