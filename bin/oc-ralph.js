#!/usr/bin/env node

/**
 * oc-ralph CLI entry point
 */
import { program } from 'commander';
import { InitCommand } from '../src/commands/InitCommand.js';
import { StartCommand } from '../src/commands/StartCommand.js';
import { StatusCommand } from '../src/commands/StatusCommand.js';
import { ResumeCommand } from '../src/commands/ResumeCommand.js';
import { CleanupCommand } from '../src/commands/CleanupCommand.js';
import { Logger } from '../src/logging/Logger.js';

const logger = new Logger({ level: 'info' });

program
  .name('oc-ralph')
  .description('GitHub issue-driven development orchestrator')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize oc-ralph in the repository')
  .option('--repo <owner/repo>', 'GitHub repository')
  .option('--no-labels', 'Skip creating GitHub labels')
  .action(async (options) => {
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute(options);
    } catch (error) {
      logger.error('Init command failed', { error: error.message });
      process.exit(1);
    }
  });

program
  .command('start <issue-number>')
  .description('Start orchestration for a master issue')
  .option('--config <path>', 'Config file path', '.oc-ralph/config.json')
  .option('--debug', 'Enable debug mode')
  .action(async (issueNumber, options) => {
    try {
      const cmd = new StartCommand(logger);
      await cmd.execute(issueNumber, options);
    } catch (error) {
      logger.error('Start command failed', { error: error.message });
      process.exit(1);
    }
  });

program
  .command('status <issue-number>')
  .description('Check orchestration status')
  .option('--config <path>', 'Config file path', '.oc-ralph/config.json')
  .action(async (issueNumber, options) => {
    try {
      const cmd = new StatusCommand(logger);
      await cmd.execute(issueNumber, options);
    } catch (error) {
      logger.error('Status command failed', { error: error.message });
      process.exit(1);
    }
  });

program
  .command('resume <issue-number>')
  .description('Resume orchestration from current state')
  .option('--config <path>', 'Config file path', '.oc-ralph/config.json')
  .option('--debug', 'Enable debug mode')
  .action(async (issueNumber, options) => {
    try {
      const cmd = new ResumeCommand(logger);
      await cmd.execute(issueNumber, options);
    } catch (error) {
      logger.error('Resume command failed', { error: error.message });
      process.exit(1);
    }
  });

program
  .command('cleanup')
  .description('Clean up stale worktrees')
  .option('--config <path>', 'Config file path', '.oc-ralph/config.json')
  .option('--force', 'Force cleanup all worktrees')
  .option('--old', 'Clean worktrees older than 7 days')
  .option('--debug', 'Enable debug mode')
  .action(async (options) => {
    try {
      const cmd = new CleanupCommand(logger);
      await cmd.execute(options);
    } catch (error) {
      logger.error('Cleanup command failed', { error: error.message });
      process.exit(1);
    }
  });

program.parse();
