/**
 * GitHub CLI wrapper
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitHubClient {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Execute gh CLI command
   */
  async exec(command) {
    try {
      this.logger.debug(`Executing: gh ${command}`);
      const { stdout, stderr } = await execAsync(`gh ${command}`);
      
      if (stderr && !stderr.includes('warning')) {
        this.logger.warn('gh CLI stderr', { stderr });
      }
      
      return stdout.trim();
    } catch (error) {
      this.logger.error('gh CLI command failed', {
        command,
        error: error.message,
        stderr: error.stderr
      });
      throw new Error(`GitHub CLI error: ${error.message}`);
    }
  }

  /**
   * Execute gh CLI command and parse JSON response
   */
  async execJSON(command) {
    const output = await this.exec(command);
    try {
      return JSON.parse(output);
    } catch (error) {
      this.logger.error('Failed to parse JSON from gh CLI', { output });
      throw new Error(`Invalid JSON response from gh CLI: ${error.message}`);
    }
  }

  /**
   * Check if gh CLI is authenticated
   */
  async checkAuth() {
    try {
      await execAsync('gh auth status');
      return true;
    } catch (error) {
      return false;
    }
  }
}
