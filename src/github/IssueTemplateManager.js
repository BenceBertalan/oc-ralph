/**
 * Issue template manager - creates sub-issues from templates
 */
import fs from 'fs';
import path from 'path';

export class IssueTemplateManager {
  constructor(issueOps, config, logger) {
    this.issueOps = issueOps;
    this.config = config;
    this.logger = logger;
    this.repo = `${config.github.owner}/${config.github.repo}`;
  }

  /**
   * Create implementation sub-issue
   */
  async createImplementationIssue(masterIssueNumber, task, worktreePath) {
    const body = `## Implementation Task

**Parent Issue:** #${masterIssueNumber}
**Task ID:** ${task.id}
**Assigned Agent:** Craftsman

### Task Description
${task.description}

### Acceptance Criteria
${task.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n')}

### Dependencies
${task.dependencies.length > 0 
  ? task.dependencies.map(d => `- Depends on: ${d}`).join('\n')
  : 'None'}

---

## Agent Instructions

You are **Craftsman**, an implementation agent. Your task:

1. **Read this issue carefully** - understand the task and acceptance criteria
2. **Work ONLY on this task** - do not modify unrelated code
3. **Make focused changes** - implement exactly what is described
4. **Update this issue** when done:
   - Comment with summary of changes
   - Check off completed acceptance criteria
   - Add label \`oc-ralph:agent-complete\`

### Constraints
- Work in the worktree: \`${worktreePath}\`
- Commit your changes with message: "feat: ${task.title} (${task.id})"
- DO NOT work on other issues or tasks
- Focus on quality and clarity

### Context
Review the parent issue #${masterIssueNumber} for overall context.

---

## Status
🔄 **Status:** Awaiting agent execution
📅 **Created:** ${new Date().toISOString()}
`;

    const issue = await this.issueOps.createIssue(this.repo, {
      title: `[Implementation] ${task.title}`,
      body,
      labels: ['oc-ralph:sub-issue', 'oc-ralph:implementation', 'oc-ralph:pending']
    });

    this.logger.info('Implementation sub-issue created', {
      issueNumber: issue.number,
      taskId: task.id,
      title: task.title
    });

    return issue.number;
  }

  /**
   * Create test sub-issue
   */
  async createTestIssue(masterIssueNumber, testTask, worktreePath) {
    const body = `## Test Task

**Parent Issue:** #${masterIssueNumber}
**Task ID:** ${testTask.id}
**Assigned Agent:** Validator
**Test Type:** ${testTask.type}

### Test Description
${testTask.description}

### Test Scenarios
${testTask.test_scenarios.map(s => `- [ ] ${s}`).join('\n')}

### Dependencies
${testTask.dependencies.length > 0 
  ? testTask.dependencies.map(d => `- Depends on: ${d}`).join('\n')
  : 'None'}

---

## Agent Instructions

You are **Validator**, a testing agent. Your task:

1. **Read this issue carefully** - understand what needs to be tested
2. **Execute ONLY these tests** - do not run unrelated tests
3. **Report results clearly** - document all test outcomes
4. **Update this issue** when done:
   - Comment with test results (pass/fail)
   - Check off completed scenarios
   - Add label \`oc-ralph:agent-complete\`

### Constraints
- Work in the worktree: \`${worktreePath}\`
- Run the specific tests described above
- DO NOT modify test code unless fixing issues
- Report failures with details

### Context
Review the parent issue #${masterIssueNumber} for overall context.

---

## Status
🔄 **Status:** Awaiting agent execution
📅 **Created:** ${new Date().toISOString()}
`;

    const issue = await this.issueOps.createIssue(this.repo, {
      title: `[Test] ${testTask.title}`,
      body,
      labels: ['oc-ralph:sub-issue', 'oc-ralph:test', 'oc-ralph:pending']
    });

    this.logger.info('Test sub-issue created', {
      issueNumber: issue.number,
      taskId: testTask.id,
      title: testTask.title
    });

    return issue.number;
  }

  /**
   * Check if agent has completed the issue
   */
  async isAgentComplete(issueNumber) {
    const labels = await this.issueOps.getIssue(this.repo, issueNumber);
    return labels.labels.some(l => l.name === 'oc-ralph:agent-complete');
  }

  /**
   * Get agent result from issue
   */
  async getAgentResult(issueNumber) {
    const issue = await this.issueOps.getIssue(this.repo, issueNumber);
    const comments = issue.comments || [];
    
    if (comments.length === 0) {
      return {
        success: false,
        summary: 'No agent response found',
        timestamp: new Date().toISOString()
      };
    }

    // Get last comment (should be from agent)
    const lastComment = comments[comments.length - 1];
    
    return {
      success: lastComment.body.includes('✅'),
      summary: lastComment.body,
      timestamp: lastComment.createdAt || new Date().toISOString()
    };
  }

  /**
   * Wait for agent to complete (poll for label)
   */
  async waitForAgentCompletion(issueNumber, timeoutSeconds = 600) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    this.logger.info('Waiting for agent completion', { 
      issueNumber, 
      timeoutSeconds 
    });

    while (true) {
      const elapsed = (Date.now() - startTime) / 1000;

      if (elapsed > timeoutSeconds) {
        throw new Error(`Agent did not complete within ${timeoutSeconds}s for issue #${issueNumber}`);
      }

      const isComplete = await this.isAgentComplete(issueNumber);

      if (isComplete) {
        this.logger.info('Agent completed', { issueNumber });
        return;
      }

      this.logger.debug('Agent still working...', { 
        issueNumber, 
        elapsed: Math.floor(elapsed) 
      });

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
}
