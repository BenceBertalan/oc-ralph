/**
 * LogStreamManager - In-memory ring buffer for log streaming
 * Manages log buffer and WebSocket subscriptions for real-time streaming
 */

export class LogStreamManager {
  constructor(maxBufferSize = 10000) {
    this.buffer = [];
    this.maxSize = maxBufferSize;
    this.subscribers = new Set(); // WebSocket clients
  }

  /**
   * Add log entry to buffer and broadcast to subscribers
   */
  onLog(logEntry) {
    // Validate log entry
    if (!logEntry || typeof logEntry !== 'object') {
      return;
    }

    // Add to ring buffer
    this.buffer.push(logEntry);
    
    // Remove oldest entry if buffer full
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }

    // Broadcast to all connected clients
    this.broadcast(logEntry);
  }

  /**
   * Broadcast log entry to all WebSocket subscribers
   */
  broadcast(entry) {
    const message = JSON.stringify(entry);
    const deadClients = new Set();

    for (const ws of this.subscribers) {
      try {
        // Check WebSocket state (1 = OPEN)
        if (ws.readyState === 1) {
          ws.send(message);
        } else {
          // Mark for removal
          deadClients.add(ws);
        }
      } catch (error) {
        // Mark for removal on error
        deadClients.add(ws);
      }
    }

    // Clean up dead connections
    for (const ws of deadClients) {
      this.subscribers.delete(ws);
    }
  }

  /**
   * Subscribe WebSocket client to log stream
   */
  subscribe(ws) {
    this.subscribers.add(ws);
    
    // Send initial buffer to new client
    try {
      ws.send(JSON.stringify({ 
        type: 'init', 
        logs: this.buffer,
        count: this.buffer.length 
      }));
    } catch (error) {
      this.subscribers.delete(ws);
    }
  }

  /**
   * Unsubscribe WebSocket client
   */
  unsubscribe(ws) {
    this.subscribers.delete(ws);
  }

  /**
   * Get logs filtered by issue number
   */
  getLogsByIssue(issueNumber) {
    return this.buffer.filter(log => 
      log.issueNumber === issueNumber || 
      log.masterIssueNumber === issueNumber ||
      log.context?.issueNumber === issueNumber ||
      log.context?.masterIssueNumber === issueNumber
    );
  }

  /**
   * Get logs filtered by agent name
   */
  getLogsByAgent(agentName) {
    return this.buffer.filter(log =>
      log.agent === agentName ||
      log.agentName === agentName ||
      log.context?.agent === agentName ||
      log.context?.agentName === agentName
    );
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level) {
    return this.buffer.filter(log => log.level === level);
  }

  /**
   * Get recent N logs
   */
  getRecentLogs(count = 100) {
    return this.buffer.slice(-count);
  }

  /**
   * Get all logs
   */
  getAllLogs() {
    return [...this.buffer];
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      totalLogs: this.buffer.length,
      maxSize: this.maxSize,
      subscribers: this.subscribers.size,
      utilizationPercent: Math.round((this.buffer.length / this.maxSize) * 100)
    };
  }

  /**
   * Clear buffer (use with caution)
   */
  clear() {
    this.buffer = [];
  }
}
