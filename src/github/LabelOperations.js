/**
 * GitHub Label operations
 */
export class LabelOperations {
  constructor(github, logger) {
    this.github = github;
    this.logger = logger;
  }

  /**
   * Get all labels for an issue
   */
  async getLabels(repo, issueNumber) {
    const issue = await this.github.execJSON(
      `issue view ${issueNumber} --repo ${repo} --json labels`
    );
    return issue.labels.map(l => l.name);
  }

  /**
   * Add label to issue
   */
  async addLabel(repo, issueNumber, label) {
    this.logger.debug('Adding label', { repo, issueNumber, label });
    
    // For dynamic labels (like worktree labels), ensure they exist first
    if (label.startsWith('oc-ralph:worktree:')) {
      await this.ensureLabelExists(repo, label);
    }
    
    await this.github.exec(
      `issue edit ${issueNumber} --repo ${repo} --add-label "${label}"`
    );
    
    this.logger.debug('Label added', { repo, issueNumber, label });
  }

  /**
   * Ensure a single label exists (create if not)
   */
  async ensureLabelExists(repo, labelName) {
    const existingLabels = await this.listLabels(repo);
    const exists = existingLabels.some(l => l.name === labelName);
    
    if (!exists) {
      this.logger.debug('Creating dynamic label', { repo, label: labelName });
      
      // Determine color based on label type
      let color = 'EDEDED'; // default gray
      let description = 'oc-ralph: Auto-generated label';
      
      if (labelName.startsWith('oc-ralph:worktree:')) {
        color = 'C5DEF5'; // light blue
        description = 'oc-ralph: Worktree path (auto-generated)';
      }
      
      await this.createLabel(repo, { name: labelName, color, description });
    }
  }

  /**
   * Remove label from issue
   */
  async removeLabel(repo, issueNumber, label) {
    this.logger.debug('Removing label', { repo, issueNumber, label });
    
    await this.github.exec(
      `issue edit ${issueNumber} --repo ${repo} --remove-label "${label}"`
    );
    
    this.logger.debug('Label removed', { repo, issueNumber, label });
  }

  /**
   * List all labels in repository
   */
  async listLabels(repo) {
    const labels = await this.github.execJSON(
      `label list --repo ${repo} --json name,color,description --limit 1000`
    );
    return labels;
  }

  /**
   * Create a label
   */
  async createLabel(repo, label) {
    this.logger.debug('Creating label', { repo, label: label.name });
    
    await this.github.exec(
      `label create "${label.name}" --repo ${repo} --color ${label.color} --description "${label.description}"`
    );
    
    this.logger.debug('Label created', { repo, label: label.name });
  }

  /**
   * Ensure all required oc-ralph labels exist
   */
  async ensureLabelsExist(repo) {
    this.logger.info('Checking required labels...', { repo });
    
    const requiredLabels = this.getRequiredLabels();
    const existingLabels = await this.listLabels(repo);
    const existingNames = existingLabels.map(l => l.name);
    
    const missingLabels = requiredLabels.filter(
      label => !existingNames.includes(label.name)
    );
    
    if (missingLabels.length === 0) {
      this.logger.info('All required labels exist', { repo });
      return { created: [], existing: existingNames.length };
    }
    
    this.logger.info('Creating missing labels', { 
      repo,
      missing: missingLabels.length 
    });
    
    const created = [];
    for (const label of missingLabels) {
      try {
        await this.createLabel(repo, label);
        created.push(label.name);
      } catch (error) {
        this.logger.error('Failed to create label', {
          repo,
          label: label.name,
          error: error.message
        });
        throw error;
      }
    }
    
    this.logger.info('Labels verified', {
      repo,
      created: created.length,
      existing: existingNames.length
    });
    
    return { created, existing: existingNames.length };
  }

  /**
   * Get list of all required labels
   */
  getRequiredLabels() {
    return [
      { name: 'oc-ralph:planning', color: '0E8A16', description: 'oc-ralph: Planning stage in progress' },
      { name: 'oc-ralph:awaiting-approval', color: 'FBCA04', description: 'oc-ralph: Plan ready, awaiting user approval' },
      { name: 'oc-ralph:approved', color: '0E8A16', description: 'oc-ralph: Plan approved by user' },
      { name: 'oc-ralph:rejected', color: 'D93F0B', description: 'oc-ralph: Plan rejected by user' },
      { name: 'oc-ralph:implementing', color: '1D76DB', description: 'oc-ralph: Implementation stage in progress' },
      { name: 'oc-ralph:testing', color: '5319E7', description: 'oc-ralph: Testing stage in progress' },
      { name: 'oc-ralph:completing', color: '1D76DB', description: 'oc-ralph: Creating pull request' },
      { name: 'oc-ralph:completed', color: '0E8A16', description: 'oc-ralph: Orchestration completed successfully' },
      { name: 'oc-ralph:pr-created', color: '0E8A16', description: 'oc-ralph: Pull request created' },
      { name: 'oc-ralph:failed', color: 'D93F0B', description: 'oc-ralph: Orchestration failed' },
      { name: 'oc-ralph:paused', color: 'FBCA04', description: 'oc-ralph: Paused, manual intervention required' },
      { name: 'oc-ralph:sub-issue', color: 'C5DEF5', description: 'oc-ralph: Sub-issue created by orchestrator' },
      { name: 'oc-ralph:implementation', color: '1D76DB', description: 'oc-ralph: Implementation task' },
      { name: 'oc-ralph:test', color: '5319E7', description: 'oc-ralph: Test task' },
      { name: 'oc-ralph:fix-attempt', color: 'FBCA04', description: 'oc-ralph: Test fix attempt' },
      { name: 'oc-ralph:test-failed', color: 'D93F0B', description: 'oc-ralph: Test failed' },
      { name: 'oc-ralph:max-attempts-reached', color: 'B60205', description: 'oc-ralph: Test failed after max fix attempts' },
      { name: 'oc-ralph:pending', color: 'EDEDED', description: 'oc-ralph: Task pending execution' },
      { name: 'oc-ralph:in-progress', color: 'FEF2C0', description: 'oc-ralph: Task currently being executed' },
      { name: 'oc-ralph:agent-complete', color: '0E8A16', description: 'oc-ralph: Agent finished working on this issue' },
      { name: 'oc-ralph:orchestrated', color: '1D76DB', description: 'oc-ralph: PR created by orchestrator' }
    ];
  }
}
