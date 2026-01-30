/**
 * Status Table - Generate markdown status tables for orchestration progress
 */
import { StatusUpdater } from '../core/StatusUpdater.js';

export class StatusTable {
  constructor(issueOps, config, logger) {
    this.issueOps = issueOps;
    this.config = config;
    this.logger = logger;
    this.repo = `${config.github.owner}/${config.github.repo}`;
  }
  
  /**
   * Generate complete status table markdown
   */
  async generate(masterIssueNumber, plan, planningStatus) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Determine overall status
    const overallStatus = this.calculateOverallStatus(plan, planningStatus);
    
    let table = `## 📈 Live Status Table\n\n`;
    table += `**Last Updated**: ${timestamp} UTC  \n`;
    table += `**Overall Status**: ${overallStatus}\n\n`;
    
    // Planning tasks table
    if (planningStatus) {
      table += this.buildPlanningTable(planningStatus);
    }
    
    // Implementation tasks table
    if (plan && plan.implementationIssues && plan.implementationIssues.length > 0) {
      const implTasks = await this.fetchTaskStatuses(plan.implementationIssues);
      table += this.buildImplementationTable(plan.implementationTasks, implTasks);
    }
    
    // Test tasks table
    if (plan && plan.testIssues && plan.testIssues.length > 0) {
      const testTasks = await this.fetchTaskStatuses(plan.testIssues);
      table += this.buildTestTable(plan.testTasks, testTasks);
    }
    
    // Progress summary
    table += this.buildProgressSummary(planningStatus, plan);
    
    // Legend
    table += `**Status Legend**: ✅ Complete | 🔄 In Progress | ⏸️ Pending | ❌ Failed | 🔧 Fixing | 🚫 Max Attempts\n`;
    
    return table;
  }
  
  /**
   * Build planning tasks table
   */
  buildPlanningTable(planningStatus) {
    let table = `### Planning Tasks\n\n`;
    table += `| Status | Task | Details |\n`;
    table += `|--------|------|----------|\n`;
    
    const tasks = [
      { 
        name: 'Architect Specification', 
        status: planningStatus.architectComplete ? '✅' : '🔄',
        details: 'Generated technical spec'
      },
      { 
        name: 'Implementation Planning (Sculptor)', 
        status: planningStatus.sculptorComplete ? '✅' : '⏸️',
        details: `Created ${planningStatus.implTaskCount || 0} implementation tasks`
      },
      { 
        name: 'Test Planning (Sentinel)', 
        status: planningStatus.sentinelComplete ? '✅' : '⏸️',
        details: `Created ${planningStatus.testTaskCount || 0} test scenarios`
      }
    ];
    
    tasks.forEach(task => {
      table += `| ${task.status} | ${task.name} | ${task.details} |\n`;
    });
    
    table += `\n`;
    return table;
  }
  
  /**
   * Build implementation tasks table
   */
  buildImplementationTable(tasks, taskStatuses) {
    let table = `### Implementation Tasks\n\n`;
    table += `| Status | Task | Issue | Agent Message | Tools | Retries | Last Retry | Updated |\n`;
    table += `|--------|------|-------|---------------|-------|---------|------------|----------|\n`;
    
    tasks.forEach((task, i) => {
      const status = taskStatuses[i];
      const statusEmoji = this.parseStatus(status.labels);
      const updated = status.updated || '-';
      const issueNumber = status.number;
      const agentMessage = this.truncateMessage(status.agentMessage || '-');
      const toolUsage = status.toolsUsed || '-';
      const retries = status.retryCount || 0;
      const lastRetry = status.lastRetryTime ? this.formatTimeSince(status.lastRetryTime) : '-';
      
      table += `| ${statusEmoji} | ${task.title} | #${issueNumber} | ${agentMessage} | ${toolUsage} | ${retries} | ${lastRetry} | ${updated} |\n`;
    });
    
    table += `\n`;
    return table;
  }
  
  /**
   * Build test tasks table (with fix attempts column)
   */
  buildTestTable(tasks, taskStatuses) {
    let table = `### Test Tasks\n\n`;
    table += `| Status | Task | Issue | Agent Message | Tools | Fix Attempts | Retries | Last Retry | Updated |\n`;
    table += `|--------|------|-------|---------------|-------|--------------|---------|------------|----------|\n`;
    
    tasks.forEach((task, i) => {
      const status = taskStatuses[i];
      const statusEmoji = this.parseTestStatus(status.labels, status.fixAttempts);
      const updated = status.updated || '-';
      const issueNumber = status.number;
      const fixAttemptsDisplay = this.formatFixAttempts(status.fixAttempts, status.labels);
      const agentMessage = this.truncateMessage(status.agentMessage || '-');
      const toolUsage = status.toolsUsed || '-';
      const retries = status.retryCount || 0;
      const lastRetry = status.lastRetryTime ? this.formatTimeSince(status.lastRetryTime) : '-';
      
      table += `| ${statusEmoji} | ${task.title} | #${issueNumber} | ${agentMessage} | ${toolUsage} | ${fixAttemptsDisplay} | ${retries} | ${lastRetry} | ${updated} |\n`;
    });
    
    table += `\n`;
    return table;
  }
  
  /**
   * Fetch status for all task issues (including fix attempts for tests)
   */
  async fetchTaskStatuses(issueRefs) {
    const statuses = [];
    
    for (const ref of issueRefs) {
      try {
        const repo = `${this.config.github.owner}/${this.config.github.repo}`;
        const issue = await this.issueOps.getIssue(
          repo,
          ref.issueNumber
        );
        
        // Count fix attempts for test issues
        let fixAttempts = 0;
        const isTestIssue = issue.labels.some(l => l.name === 'oc-ralph:test');
        
        if (isTestIssue) {
          fixAttempts = await this.countFixAttempts(issue.number);
        }
        
        // Parse agent progress from issue body
        const agentMessage = StatusUpdater.parseHTMLComment(issue.body, 'agent-message');
        const toolsUsed = StatusUpdater.parseHTMLComment(issue.body, 'tools-used');
        const retryCount = StatusUpdater.parseHTMLComment(issue.body, 'retry-count');
        const lastRetryTime = StatusUpdater.parseHTMLComment(issue.body, 'last-retry-time');
        
        statuses.push({
          number: issue.number,
          labels: issue.labels.map(l => l.name),
          updated: this.formatTimestamp(issue.updated_at),
          fixAttempts,
          agentMessage: agentMessage,
          toolsUsed: toolsUsed,
          retryCount: retryCount ? parseInt(retryCount) : 0,
          lastRetryTime: lastRetryTime
        });
      } catch (error) {
        this.logger.error('Failed to fetch task status', { 
          issueNumber: ref.issueNumber, 
          error: error.message 
        });
        statuses.push({
          number: ref.issueNumber,
          labels: [],
          updated: '-',
          fixAttempts: 0,
          agentMessage: null,
          toolsUsed: null
        });
      }
    }
    
    return statuses;
  }
  
  /**
   * Parse labels to status emoji
   */
  parseStatus(labels) {
    if (labels.includes('oc-ralph:agent-complete')) return '✅';
    if (labels.includes('oc-ralph:in-progress')) return '🔄';
    if (labels.includes('oc-ralph:failed')) return '❌';
    return '⏸️';
  }
  
  /**
   * Calculate overall status
   */
  calculateOverallStatus(plan, planningStatus) {
    if (!planningStatus) {
      return '🔵 Initializing';
    }
    
    if (!planningStatus.allComplete) {
      return `🟡 Planning (${planningStatus.completedCount}/3 planning tasks completed)`;
    }
    
    if (plan && plan.approved) {
      // Check implementation progress
      const implTotal = plan.implementationTasks?.length || 0;
      const testTotal = plan.testTasks?.length || 0;
      
      // For now, assume all pending until implementation stage
      return `🟡 Implementation (0/${implTotal} tasks completed)`;
    }
    
    return '⏳ Planning Complete - Awaiting Approval';
  }
  
  /**
   * Build progress summary
   */
  buildProgressSummary(planningStatus, plan) {
    let summary = `**Progress**: `;
    
    if (planningStatus) {
      summary += `Planning: ${planningStatus.completedCount}/3`;
    }
    
    if (plan) {
      const implCount = plan.implementationTasks?.length || 0;
      const testCount = plan.testTasks?.length || 0;
      summary += ` | Implementation: 0/${implCount} | Tests: 0/${testCount}`;
    }
    
    summary += `  \n`;
    return summary;
  }
  
  /**
   * Format timestamp
   */
  formatTimestamp(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toISOString().substring(11, 19); // HH:MM:SS
  }
  
  /**
   * Parse labels to status emoji for tests (includes fixing status)
   */
  parseTestStatus(labels, fixAttempts) {
    if (labels.includes('oc-ralph:max-attempts-reached')) return '❌ (Max)';
    if (labels.includes('oc-ralph:test-failed') && fixAttempts > 0) return '🔧';
    if (labels.includes('oc-ralph:agent-complete') && !labels.includes('oc-ralph:test-failed')) return '✅';
    if (labels.includes('oc-ralph:in-progress')) return '🔄';
    if (labels.includes('oc-ralph:failed') || labels.includes('oc-ralph:test-failed')) return '❌';
    return '⏸️';
  }
  
  /**
   * Format fix attempts display
   */
  formatFixAttempts(fixAttempts, labels) {
    if (fixAttempts === 0) {
      return '-';
    }
    
    const maxAttemptsReached = labels.includes('oc-ralph:max-attempts-reached');
    const emoji = maxAttemptsReached ? '🚫' : '🔧';
    
    return `${emoji} ${fixAttempts}/10`;
  }
  
  /**
   * Count fix attempts for a test issue
   */
  async countFixAttempts(testIssueNumber) {
    try {
      // Find all fix sub-issues for this test
      const allIssues = await this.issueOps.getIssuesByLabel(
        this.config.github.owner,
        this.config.github.repo,
        `oc-ralph:test-${testIssueNumber}`
      );

      // Filter for fix attempts
      const fixIssues = allIssues.filter(issue =>
        issue.labels.some(l => l.name === 'oc-ralph:fix-attempt')
      );

      return fixIssues.length;
    } catch (error) {
      this.logger.error('Failed to count fix attempts', {
        error: error.message,
        testIssueNumber
      });
      return 0;
    }
  }
  
  /**
   * Truncate agent message for table display
   */
  truncateMessage(message, maxLength = 50) {
    if (!message || message === '-') return '-';
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * Format time since a timestamp (for last retry display)
   */
  formatTimeSince(timestamp) {
    if (!timestamp) return '-';
    
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffSec < 60) {
      return `${diffSec}s ago`;
    } else if (diffMin < 60) {
      return `${diffMin}m ago`;
    } else {
      return `${diffHour}h ago`;
    }
  }
}
