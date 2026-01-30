/**
 * Worktree manager for oc-ralph
 */
import fs from 'fs';
import path from 'path';

export class WorktreeManager {
  constructor(gitOps, labelOps, config, logger) {
    this.gitOps = gitOps;
    this.labelOps = labelOps;
    this.config = config;
    this.logger = logger;
    this.basePath = config.worktree.basePath;
    this.stateFile = '.oc-ralph/worktrees.json';
  }

  /**
   * Ensure base path exists
   */
  ensureBasePath() {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      this.logger.info('Created worktree base path', { path: this.basePath });
    }
  }

  /**
   * Load worktree state from file
   */
  loadWorktreeState() {
    if (!fs.existsSync(this.stateFile)) {
      return {};
    }
    try {
      const content = fs.readFileSync(this.stateFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warn('Failed to load worktree state, using empty state', { error: error.message });
      return {};
    }
  }

  /**
   * Save worktree state to file
   */
  saveWorktreeState(state) {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Store worktree path for issue
   */
  storeWorktreePath(issueNumber, worktreePath, branchName) {
    const state = this.loadWorktreeState();
    state[issueNumber] = { worktreePath, branchName, createdAt: new Date().toISOString() };
    this.saveWorktreeState(state);
    this.logger.debug('Stored worktree path', { issueNumber, worktreePath });
  }

  /**
   * Get worktree path for issue
   */
  getWorktreePath(issueNumber) {
    const state = this.loadWorktreeState();
    const entry = state[issueNumber];
    if (!entry) {
      throw new Error(`Worktree path not found for issue ${issueNumber}`);
    }
    return entry.worktreePath;
  }

  /**
   * Remove worktree path for issue
   */
  removeWorktreePath(issueNumber) {
    const state = this.loadWorktreeState();
    delete state[issueNumber];
    this.saveWorktreeState(state);
    this.logger.debug('Removed worktree path', { issueNumber });
  }

  /**
   * Create worktree for issue
   */
  async createWorktree(issueNumber, baseBranch = 'main') {
    this.ensureBasePath();
    
    const branchName = `oc-ralph/issue-${issueNumber}`;
    const worktreePath = path.join(
      this.basePath,
      `${this.config.github.repo}-${issueNumber}`
    );
    
    this.logger.info('Creating worktree', { 
      issueNumber, 
      branchName, 
      worktreePath 
    });

    // Create branch from base
    await this.gitOps.createBranch(branchName, baseBranch);

    // Add worktree
    await this.gitOps.addWorktree(worktreePath, branchName);

    // Store worktree path in local state file
    this.storeWorktreePath(issueNumber, worktreePath, branchName);

    this.logger.info('Worktree created', { 
      issueNumber, 
      branchName, 
      worktreePath 
    });

    return { branchName, worktreePath };
  }

  /**
   * Get worktree path from local state
   */
  async getWorktree(issueNumber) {
    return this.getWorktreePath(issueNumber);
  }

  /**
   * Get branch name for issue
   */
  getBranchName(issueNumber) {
    return `oc-ralph/issue-${issueNumber}`;
  }

  /**
   * Clean up worktree
   */
  async cleanupWorktree(issueNumber) {
    try {
      const worktreePath = await this.getWorktree(issueNumber);
      
      this.logger.info('Cleaning up worktree', { issueNumber, worktreePath });
      
      // Remove worktree
      await this.gitOps.removeWorktree(worktreePath);
      
      // Remove from local state
      this.removeWorktreePath(issueNumber);
      
      // Remove directory if exists
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
      
      this.logger.info('Worktree cleaned up', { issueNumber });
    } catch (error) {
      this.logger.error('Failed to cleanup worktree', {
        issueNumber,
        error: error.message
      });
    }
  }

  /**
   * Check if worktree exists
   */
  async worktreeExists(issueNumber) {
    try {
      const worktreePath = await this.getWorktree(issueNumber);
      return fs.existsSync(worktreePath);
    } catch (error) {
      return false;
    }
  }
}
