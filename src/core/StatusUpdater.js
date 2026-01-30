/**
 * Status Updater - Background + event-based status table updates
 */
export class StatusUpdater {
  constructor(issueOps, issueBodyManager, statusTable, discordNotifier, config, logger) {
    this.issueOps = issueOps;
    this.issueBodyManager = issueBodyManager;
    this.statusTable = statusTable;
    this.discordNotifier = discordNotifier;
    this.config = config;
    this.logger = logger;
    this.repo = `${config.github.owner}/${config.github.repo}`;
    
    this.intervalId = null;
    this.isUpdating = false;
    this.lastUpdate = null;
    this.masterIssueNumber = null;
    this.plan = null;
    this.planningStatus = null;
    
    // Pending progress updates (keyed by issueNumber)
    this.pendingProgressUpdates = new Map();
    this.progressUpdateTimers = new Map();
  }
  
  /**
   * Start background interval updates
   */
  start(masterIssueNumber, plan, planningStatus) {
    this.masterIssueNumber = masterIssueNumber;
    this.plan = plan;
    this.planningStatus = planningStatus;
    
    this.stop(); // Clear any existing interval
    
    const intervalMs = this.config.statusTable.updateIntervalSeconds * 1000;
    this.intervalId = setInterval(
      () => this.updateStatusTable(),
      intervalMs
    );
    
    this.logger.info('Status updater started', { 
      masterIssueNumber, 
      intervalSeconds: this.config.statusTable.updateIntervalSeconds 
    });
    
    // Immediate first update
    this.updateStatusTable();
  }
  
  /**
   * Stop background updates
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Status updater stopped');
    }
  }
  
  /**
   * Update planning status (used during planning phase)
   */
  updatePlanningStatus(status) {
    this.planningStatus = status;
  }
  
  /**
   * Update plan (used after plan created)
   */
  updatePlan(plan) {
    this.plan = plan;
  }
  
  /**
   * Single status table update
   */
  async updateStatusTable() {
    if (this.isUpdating) {
      this.logger.debug('Status update already in progress, skipping');
      return;
    }
    
    if (!this.masterIssueNumber) {
      this.logger.debug('No master issue number set, skipping status update');
      return;
    }
    
    this.isUpdating = true;
    try {
      // 1. Generate new status table
      const newTable = await this.statusTable.generate(
        this.masterIssueNumber, 
        this.plan,
        this.planningStatus
      );
      
      // 2. Fetch current issue body
      const issue = await this.issueOps.getIssue(this.repo, this.masterIssueNumber);
      
      // 3. Update only status table section
      const newBody = this.issueBodyManager.updateStatusTable(issue.body, newTable);
      
      // 4. Update issue
      await this.issueOps.updateIssue(this.repo, this.masterIssueNumber, { body: newBody });
      
      this.lastUpdate = new Date();
      this.logger.debug('Status table updated', { masterIssueNumber: this.masterIssueNumber });
      
    } catch (error) {
      this.logger.error('Failed to update status table', { 
        masterIssueNumber: this.masterIssueNumber, 
        error: error.message 
      });
    } finally {
      this.isUpdating = false;
    }
  }
  
  /**
   * Update task progress (agent message & tool usage)
   * Uses debouncing to batch rapid updates
   */
  async updateTaskProgress(issueNumber, progress) {
    // Merge with pending updates for this issue
    const pending = this.pendingProgressUpdates.get(issueNumber) || {};
    
    if (progress.agentMessage !== undefined) {
      pending.agentMessage = progress.agentMessage;
    }
    if (progress.toolsUsed !== undefined) {
      pending.toolsUsed = progress.toolsUsed;
    }
    if (progress.retryCount !== undefined) {
      pending.retryCount = progress.retryCount;
    }
    if (progress.lastRetryTime !== undefined) {
      pending.lastRetryTime = progress.lastRetryTime;
    }
    
    this.pendingProgressUpdates.set(issueNumber, pending);
    
    // Clear existing timer
    if (this.progressUpdateTimers.has(issueNumber)) {
      clearTimeout(this.progressUpdateTimers.get(issueNumber));
    }
    
    // Set new timer to flush updates after 500ms
    const timer = setTimeout(async () => {
      await this._flushProgressUpdate(issueNumber);
    }, 500);
    
    this.progressUpdateTimers.set(issueNumber, timer);
  }
  
  /**
   * Flush pending progress updates to GitHub
   * @private
   */
  async _flushProgressUpdate(issueNumber) {
    const pending = this.pendingProgressUpdates.get(issueNumber);
    if (!pending) return;
    
    try {
      // Fetch current issue
      const issue = await this.issueOps.getIssue(this.repo, issueNumber);
      let body = issue.body || '';
      
      // Apply all pending updates
      if (pending.agentMessage !== undefined) {
        body = this._updateHTMLComment(body, 'agent-message', pending.agentMessage);
      }
      
      if (pending.toolsUsed !== undefined) {
        body = this._updateHTMLComment(body, 'tools-used', pending.toolsUsed.toString());
      }
      
      if (pending.retryCount !== undefined) {
        body = this._updateHTMLComment(body, 'retry-count', pending.retryCount.toString());
      }
      
      if (pending.lastRetryTime !== undefined) {
        body = this._updateHTMLComment(body, 'last-retry-time', pending.lastRetryTime);
      }
      
      // Update issue with new body
      await this.issueOps.updateIssue(this.repo, issueNumber, { body });
      
      this.logger.debug('Task progress flushed', { 
        issueNumber, 
        hasAgentMessage: pending.agentMessage !== undefined,
        hasToolsUsed: pending.toolsUsed !== undefined,
        toolsUsed: pending.toolsUsed,
        retryCount: pending.retryCount
      });
      
      // Clear pending updates
      this.pendingProgressUpdates.delete(issueNumber);
      this.progressUpdateTimers.delete(issueNumber);
    } catch (error) {
      this.logger.error('Failed to flush task progress', { 
        issueNumber, 
        error: error.message 
      });
    }
  }
  
  /**
   * Update or add HTML comment marker in issue body
   */
  _updateHTMLComment(body, key, value) {
    const commentRegex = new RegExp(`<!-- ${key}: (.*?) -->`, 'g');
    const newComment = `<!-- ${key}: ${value} -->`;
    
    if (commentRegex.test(body)) {
      // Replace existing comment
      return body.replace(commentRegex, newComment);
    } else {
      // Add new comment at the end
      return body + `\n${newComment}`;
    }
  }
  
  /**
   * Parse HTML comment value from issue body
   */
  static parseHTMLComment(body, key) {
    if (!body) return null;
    const commentRegex = new RegExp(`<!-- ${key}: (.*?) -->`, 'g');
    const match = commentRegex.exec(body);
    return match ? match[1] : null;
  }
  
  /**
   * Event-based update hook
   */
  async onEvent(event, data = {}) {
    this.logger.debug('Status update triggered by event', { event, data });
    
    // Notify Discord
    if (this.discordNotifier) {
      try {
        await this.discordNotifier.onEvent(event, {
          masterIssueNumber: this.masterIssueNumber,
          ...data
        });
      } catch (error) {
        this.logger.error('Discord notification failed', { event, error: error.message });
      }
    }
    
    // Update status table
    await this.updateStatusTable();
  }
}
