/**
 * Groups flat log array into hierarchical structure
 * Structure: Root → Stages (Planning/Implementation/Testing) → Tasks
 */

/**
 * Extracts issue number from context or message
 */
function extractIssueNumber(log) {
  return log.context?.issueNumber || log.context?.issue || null;
}

/**
 * Determines stage from log message and context
 */
function identifyStage(log) {
  const msg = log.message.toLowerCase();
  const agent = log.context?.agent?.toLowerCase() || '';
  
  // Check for explicit stage markers
  if (msg.includes('planning') || agent.includes('architect')) {
    return 'planning';
  }
  if (msg.includes('implementing') || msg.includes('implementation') || agent.includes('sculptor') || agent.includes('craftsman')) {
    return 'implementing';
  }
  if (msg.includes('testing') || msg.includes('test') || agent.includes('validator') || agent.includes('janos') || agent.includes('sentinel')) {
    return 'testing';
  }
  if (msg.includes('completing') || msg.includes('completed') || msg.includes('done')) {
    return 'completing';
  }
  
  return 'general';
}

/**
 * Infers status from log messages
 */
function inferStatus(logs) {
  if (!logs || logs.length === 0) return 'pending';
  
  const lastLog = logs[logs.length - 1];
  const msg = lastLog.message.toLowerCase();
  
  if (msg.includes('error') || msg.includes('failed')) {
    return 'failed';
  }
  if (msg.includes('completed') || msg.includes('done') || msg.includes('success')) {
    return 'completed';
  }
  if (msg.includes('starting') || msg.includes('running') || msg.includes('processing')) {
    return 'running';
  }
  
  return 'running';
}

/**
 * Builds hierarchical tree structure from flat logs
 * @param {Array} logs - Flat array of log entries
 * @returns {Array} - Hierarchical tree structure
 */
export function groupLogs(logs) {
  if (!logs || logs.length === 0) {
    return [];
  }

  const issueMap = new Map();
  
  // Group logs by issue number
  logs.forEach(log => {
    const issueNum = extractIssueNumber(log);
    if (!issueNum) {
      // Logs without issue number go to root
      if (!issueMap.has('root')) {
        issueMap.set('root', {
          id: 'root',
          type: 'root',
          title: 'System Logs',
          logs: [],
          stages: new Map(),
        });
      }
      issueMap.get('root').logs.push(log);
    } else {
      if (!issueMap.has(issueNum)) {
        issueMap.set(issueNum, {
          id: `issue-${issueNum}`,
          type: 'issue',
          issueNumber: issueNum,
          title: `Issue #${issueNum}`,
          logs: [],
          stages: new Map(),
        });
      }
      issueMap.get(issueNum).logs.push(log);
    }
  });

  // Build tree structure for each issue
  const tree = [];
  
  issueMap.forEach((issueGroup, key) => {
    const stages = new Map();
    
    // Group logs by stage
    issueGroup.logs.forEach(log => {
      const stageName = identifyStage(log);
      
      if (!stages.has(stageName)) {
        stages.set(stageName, {
          id: `${issueGroup.id}-${stageName}`,
          type: 'stage',
          name: stageName,
          title: stageName.charAt(0).toUpperCase() + stageName.slice(1),
          logs: [],
        });
      }
      
      stages.get(stageName).logs.push(log);
    });

    // Convert stages map to array and add status
    const stageArray = Array.from(stages.values()).map(stage => ({
      ...stage,
      status: inferStatus(stage.logs),
    }));

    tree.push({
      ...issueGroup,
      stages: stageArray,
      status: inferStatus(issueGroup.logs),
    });
  });

  // Sort by issue number (root first, then by number)
  tree.sort((a, b) => {
    if (a.type === 'root') return -1;
    if (b.type === 'root') return 1;
    return a.issueNumber - b.issueNumber;
  });

  return tree;
}

/**
 * Formats timestamp to human-readable format
 */
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  // Less than 1 minute
  if (diff < 60000) {
    return 'just now';
  }
  
  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  
  // More than 24 hours - show full date/time
  return date.toLocaleString();
}

/**
 * Gets color class based on log level
 */
export function getLevelColor(level) {
  switch (level) {
    case 'error':
      return 'text-red-400';
    case 'warn':
      return 'text-yellow-400';
    case 'info':
      return 'text-blue-400';
    case 'debug':
      return 'text-gray-400';
    default:
      return 'text-gray-300';
  }
}

/**
 * Gets status icon and color
 */
export function getStatusIcon(status) {
  switch (status) {
    case 'running':
      return { icon: '⟳', color: 'text-blue-400' };
    case 'completed':
      return { icon: '✓', color: 'text-green-400' };
    case 'failed':
      return { icon: '✗', color: 'text-red-400' };
    case 'pending':
      return { icon: '○', color: 'text-gray-400' };
    default:
      return { icon: '•', color: 'text-gray-400' };
  }
}
