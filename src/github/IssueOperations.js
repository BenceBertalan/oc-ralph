/**
 * GitHub Issue operations
 */
export class IssueOperations {
  constructor(github, logger) {
    this.github = github;
    this.logger = logger;
  }

  /**
   * Get issue by number
   */
  async getIssue(repo, issueNumber) {
    this.logger.debug('Getting issue', { repo, issueNumber });
    
    const issue = await this.github.execJSON(
      `issue view ${issueNumber} --repo ${repo} --json number,title,body,state,labels,comments`
    );
    
    return issue;
  }

  /**
   * Create new issue
   */
  async createIssue(repo, options) {
    this.logger.info('Creating issue', { repo, title: options.title });
    
    let command = `issue create --repo ${repo} --title "${options.title}"`;
    
    if (options.body) {
      // Escape body for shell
      const bodyFile = `/tmp/oc-ralph-issue-${Date.now()}.md`;
      const fs = await import('fs');
      fs.writeFileSync(bodyFile, options.body);
      command += ` --body-file "${bodyFile}"`;
    }
    
    if (options.labels && options.labels.length > 0) {
      command += ` --label "${options.labels.join(',')}"`;
    }
    
    const output = await this.github.exec(command);
    
    // Extract issue number from URL
    const urlMatch = output.match(/\/issues\/(\d+)/);
    const issueNumber = urlMatch ? parseInt(urlMatch[1]) : null;
    
    this.logger.info('Issue created', { repo, issueNumber });
    
    return { number: issueNumber, url: output };
  }

  /**
   * Update issue
   */
  async updateIssue(repo, issueNumber, updates) {
    this.logger.debug('Updating issue', { repo, issueNumber });
    
    let command = `issue edit ${issueNumber} --repo ${repo}`;
    
    if (updates.title) {
      command += ` --title "${updates.title}"`;
    }
    
    if (updates.body) {
      const bodyFile = `/tmp/oc-ralph-issue-update-${Date.now()}.md`;
      const fs = await import('fs');
      fs.writeFileSync(bodyFile, updates.body);
      command += ` --body-file "${bodyFile}"`;
    }
    
    await this.github.exec(command);
    
    this.logger.debug('Issue updated', { repo, issueNumber });
  }

  /**
   * Close issue
   */
  async closeIssue(repo, issueNumber, comment = null) {
    this.logger.info('Closing issue', { repo, issueNumber });
    
    if (comment) {
      await this.addComment(repo, issueNumber, comment);
    }
    
    await this.github.exec(`issue close ${issueNumber} --repo ${repo}`);
    
    this.logger.info('Issue closed', { repo, issueNumber });
  }

  /**
   * Add comment to issue
   */
  async addComment(repo, issueNumber, body) {
    this.logger.debug('Adding comment to issue', { repo, issueNumber });
    
    const bodyFile = `/tmp/oc-ralph-comment-${Date.now()}.md`;
    const fs = await import('fs');
    fs.writeFileSync(bodyFile, body);
    
    await this.github.exec(
      `issue comment ${issueNumber} --repo ${repo} --body-file "${bodyFile}"`
    );
    
    this.logger.debug('Comment added', { repo, issueNumber });
  }

  /**
   * Add labels to issue
   */
  async addLabels(repo, issueNumber, labels) {
    if (!labels || labels.length === 0) return;
    
    this.logger.debug('Adding labels to issue', { repo, issueNumber, labels });
    
    const labelStr = labels.join(',');
    await this.github.exec(
      `issue edit ${issueNumber} --repo ${repo} --add-label "${labelStr}"`
    );
    
    this.logger.debug('Labels added', { repo, issueNumber });
  }

  /**
   * Remove labels from issue
   */
  async removeLabels(repo, issueNumber, labels) {
    if (!labels || labels.length === 0) return;
    
    this.logger.debug('Removing labels from issue', { repo, issueNumber, labels });
    
    const labelStr = labels.join(',');
    await this.github.exec(
      `issue edit ${issueNumber} --repo ${repo} --remove-label "${labelStr}"`
    );
    
    this.logger.debug('Labels removed', { repo, issueNumber });
  }

  /**
   * Get comments for issue
   */
  async getComments(repo, issueNumber) {
    this.logger.debug('Getting comments', { repo, issueNumber });
    
    const issue = await this.getIssue(repo, issueNumber);
    return issue.comments || [];
  }

  /**
   * List issues with filters
   */
  async listIssues(repo, filters = {}) {
    this.logger.debug('Listing issues', { repo, filters });
    
    let command = `issue list --repo ${repo} --json number,title,state,labels --limit 100`;
    
    if (filters.label) {
      command += ` --label "${filters.label}"`;
    }
    
    if (filters.state) {
      command += ` --state ${filters.state}`;
    }
    
    const issues = await this.github.execJSON(command);
    return issues;
  }

  /**
   * Get issues by label
   */
  async getIssuesByLabel(owner, repo, label) {
    this.logger.debug('Getting issues by label', { owner, repo, label });
    
    const repoPath = `${owner}/${repo}`;
    const issues = await this.listIssues(repoPath, { label });
    
    return issues;
  }
}
