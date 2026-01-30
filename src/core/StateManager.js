/**
 * State manager using GitHub labels
 */
export class StateManager {
  constructor(labelOps, issueOps, config, logger) {
    this.labelOps = labelOps;
    this.issueOps = issueOps;
    this.config = config;
    this.logger = logger;
    this.repo = `${config.github.owner}/${config.github.repo}`;
  }

  /**
   * Get current state from labels
   */
  async getCurrentState(issueNumber) {
    const labels = await this.labelOps.getLabels(this.repo, issueNumber);
    
    const stateLabels = [
      'oc-ralph:planning',
      'oc-ralph:awaiting-approval',
      'oc-ralph:approved',
      'oc-ralph:implementing',
      'oc-ralph:testing',
      'oc-ralph:completing',
      'oc-ralph:completed',
      'oc-ralph:pr-created',
      'oc-ralph:failed',
      'oc-ralph:rejected',
      'oc-ralph:paused'
    ];
    
    for (const stateLabel of stateLabels) {
      if (labels.includes(stateLabel)) {
        return stateLabel;
      }
    }
    
    return null;
  }

  /**
   * Transition to new state
   */
  async transitionTo(issueNumber, newState) {
    this.logger.info('State transition', { issueNumber, newState });
    
    const currentState = await this.getCurrentState(issueNumber);
    
    // Remove current state label if exists
    if (currentState) {
      await this.labelOps.removeLabel(this.repo, issueNumber, currentState);
    }
    
    // Add new state label
    await this.labelOps.addLabel(this.repo, issueNumber, newState);
    
    this.logger.info('State transitioned', {
      issueNumber,
      from: currentState,
      to: newState
    });
  }

  /**
   * Check if can resume orchestration
   */
  async canResume(issueNumber) {
    const state = await this.getCurrentState(issueNumber);
    
    const resumableStates = [
      'oc-ralph:planning',
      'oc-ralph:awaiting-approval',
      'oc-ralph:approved',
      'oc-ralph:implementing',
      'oc-ralph:testing',
      'oc-ralph:completing'
    ];
    
    return resumableStates.includes(state);
  }

  /**
   * Get active sub-issues
   */
  async getActiveSubIssues(issueNumber) {
    // Get all sub-issues linked to this master issue
    const allIssues = await this.issueOps.listIssues(this.repo, {
      label: 'oc-ralph:sub-issue',
      state: 'open'
    });
    
    // Filter by master issue reference in body
    // This is a simple approach - could be improved with better linking
    const subIssues = [];
    for (const issue of allIssues) {
      const issueData = await this.issueOps.getIssue(this.repo, issue.number);
      if (issueData.body && issueData.body.includes(`#${issueNumber}`)) {
        subIssues.push(issue);
      }
    }
    
    return subIssues;
  }

  /**
   * Mark sub-state during planning
   */
  async markSubState(issueNumber, subState) {
    const comment = `🔄 Planning sub-state: ${subState}`;
    await this.issueOps.addComment(this.repo, issueNumber, comment);
    
    this.logger.debug('Sub-state marked', { issueNumber, subState });
  }
}
