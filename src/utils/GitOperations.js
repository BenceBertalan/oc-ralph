/**
 * Git operations wrapper
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitOperations {
  constructor(logger, workingDir = process.cwd()) {
    this.logger = logger;
    this.workingDir = workingDir;
  }

  /**
   * Execute git command
   */
  async exec(command, cwd = this.workingDir) {
    try {
      this.logger.debug(`Executing: git ${command}`, { cwd });
      const { stdout, stderr } = await execAsync(`git ${command}`, { cwd });
      
      if (stderr && !stderr.includes('warning')) {
        this.logger.debug('git stderr', { stderr });
      }
      
      return stdout.trim();
    } catch (error) {
      this.logger.error('git command failed', {
        command,
        cwd,
        error: error.message
      });
      throw new Error(`Git error: ${error.message}`);
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName, baseBranch = 'main', cwd = this.workingDir) {
    this.logger.info('Creating branch', { branchName, baseBranch });
    
    // Fetch latest
    await this.exec(`fetch origin ${baseBranch}`, cwd);
    
    // Create branch
    await this.exec(`branch ${branchName} origin/${baseBranch}`, cwd);
    
    this.logger.info('Branch created', { branchName });
  }

  /**
   * Add worktree
   */
  async addWorktree(path, branchName, cwd = this.workingDir) {
    this.logger.info('Adding worktree', { path, branchName });
    
    await this.exec(`worktree add ${path} ${branchName}`, cwd);
    
    this.logger.info('Worktree added', { path, branchName });
  }

  /**
   * Remove worktree
   */
  async removeWorktree(path, cwd = this.workingDir) {
    this.logger.info('Removing worktree', { path });
    
    try {
      await this.exec(`worktree remove ${path} --force`, cwd);
      this.logger.info('Worktree removed', { path });
    } catch (error) {
      this.logger.warn('Failed to remove worktree', { path, error: error.message });
    }
  }

  /**
   * List worktrees
   */
  async listWorktrees(cwd = this.workingDir) {
    const output = await this.exec('worktree list --porcelain', cwd);
    
    const worktrees = [];
    const lines = output.split('\n');
    let current = {};
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current);
        }
        current = { path: line.substring(9) };
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7);
      }
    }
    
    if (current.path) {
      worktrees.push(current);
    }
    
    return worktrees;
  }

  /**
   * Commit changes
   */
  async commit(message, cwd) {
    this.logger.info('Committing changes', { message, cwd });
    
    await this.exec('add .', cwd);
    await this.exec(`commit -m "${message}"`, cwd);
    
    this.logger.info('Changes committed', { message });
  }

  /**
   * Push to remote
   */
  async push(cwd, remote, branchName) {
    this.logger.info('Pushing to remote', { remote, branchName, cwd });
    
    await this.exec(`push -u ${remote} ${branchName}`, cwd);
    
    this.logger.info('Pushed to remote', { branchName });
  }

  /**
   * Get current branch
   */
  async getCurrentBranch(cwd = this.workingDir) {
    return await this.exec('branch --show-current', cwd);
  }

  /**
   * Check if worktree has uncommitted changes
   */
  async hasUncommittedChanges(cwd) {
    const status = await this.exec('status --porcelain', cwd);
    return status.length > 0;
  }

  /**
   * Get commits between two branches
   */
  async getCommitsBetween(cwd, baseBranch, headBranch) {
    this.logger.debug('Getting commits between branches', { baseBranch, headBranch });
    
    const output = await this.exec(
      `log ${baseBranch}..${headBranch} --pretty=format:"%H|%s|%an|%ad" --date=iso`,
      cwd
    );
    
    if (!output) {
      return [];
    }
    
    const commits = output.split('\n').map(line => {
      const [hash, message, author, date] = line.split('|');
      return { hash, message, author, date };
    });
    
    return commits;
  }

  /**
   * Get files changed between two branches
   */
  async getFilesChanged(cwd, baseBranch, headBranch) {
    this.logger.debug('Getting files changed between branches', { baseBranch, headBranch });
    
    const output = await this.exec(
      `diff --name-only ${baseBranch}..${headBranch}`,
      cwd
    );
    
    if (!output) {
      return [];
    }
    
    return output.split('\n').filter(line => line.length > 0);
  }

  /**
   * Get recent commits (last N commits)
   */
  async getRecentCommits(cwd, limit = 5) {
    this.logger.debug('Getting recent commits', { limit, cwd });
    
    const output = await this.exec(
      `log -${limit} --pretty=format:"%h|%s|%an|%ad" --date=short`,
      cwd
    );
    
    if (!output) {
      return [];
    }
    
    const commits = output.split('\n').map(line => {
      const [hash, message, author, date] = line.split('|');
      return { hash, message, author, date };
    });
    
    return commits;
  }
}
