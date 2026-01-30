/**
 * Debug logger with verbose occlient logging
 */
import fs from 'fs';
import path from 'path';

export class DebugLogger {
  constructor(baseLogger, debugMode = false) {
    this.baseLogger = baseLogger;
    this.debugMode = debugMode;
    this.agentLogs = [];
    this.debugLogDir = './logs/debug';
    this.streamManager = null;
    
    if (this.debugMode) {
      this.ensureDebugLogDir();
    }
  }

  /**
   * Set stream manager for real-time log streaming
   */
  setStreamManager(streamManager) {
    this.streamManager = streamManager;
  }

  ensureDebugLogDir() {
    if (!fs.existsSync(this.debugLogDir)) {
      fs.mkdirSync(this.debugLogDir, { recursive: true });
    }
  }
  
  /**
   * General debug logging method
   */
  debug(message, data = {}) {
    if (!this.debugMode) return;
    
    this.baseLogger.debug(message, data);
    
    // Also pretty-print to console for visibility
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ${message}`);
    if (Object.keys(data).length > 0) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  /**
   * Wrap agent execution with verbose logging
   */
  async executeAgentWithDebug(agentName, executeFn, context) {
    if (!this.debugMode) {
      return executeFn();
    }

    const agentLogId = `${agentName}-${Date.now()}`;
    const startTime = Date.now();
    
    console.log(`\n${'═'.repeat(100)}`);
    console.log(`🚀 STARTING AGENT: ${agentName}`);
    console.log(`   Log ID: ${agentLogId}`);
    console.log(`   Context:`, JSON.stringify(context, null, 2));
    console.log(`${'═'.repeat(100)}\n`);
    
    this.baseLogger.debug(`[DEBUG] Starting agent: ${agentName}`, {
      agentLogId,
      context
    });

    try {
      // Execute with verbose occlient logging
      const result = await this.wrapWithVerboseLogging(
        agentLogId,
        agentName,
        executeFn
      );
      
      const duration = Date.now() - startTime;
      
      console.log(`\n${'═'.repeat(100)}`);
      console.log(`✅ AGENT COMPLETED: ${agentName}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Response length: ${result.response?.length || 0} chars`);
      console.log(`${'═'.repeat(100)}\n`);
      
      this.baseLogger.debug(`[DEBUG] Agent completed: ${agentName}`, {
        agentLogId,
        duration,
        success: true
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.log(`\n${'═'.repeat(100)}`);
      console.log(`❌ AGENT FAILED: ${agentName}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Error: ${error.message}`);
      console.log(`${'═'.repeat(100)}\n`);
      
      this.baseLogger.debug(`[DEBUG] Agent failed: ${agentName}`, {
        agentLogId,
        duration,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Wrap occlient execution with detailed logging
   */
  async wrapWithVerboseLogging(agentLogId, agentName, executeFn) {
    const events = [];
    
    const progressCallback = (event) => {
      events.push({
        timestamp: new Date().toISOString(),
        type: event.type,
        data: event.data || {}
      });
      
      // Send event to stream manager if available
      if (this.streamManager) {
        this.streamManager.onLog({
          timestamp: new Date().toISOString(),
          level: 'debug',
          message: `[${agentName}] occlient event: ${event.type}`,
          agentName,
          agentLogId,
          eventType: event.type,
          eventData: event.data
        });
      }
      
      // Log event type and basic info
      this.baseLogger.debug(`[DEBUG] [${agentName}] occlient event: ${event.type}`, {
        agentLogId,
        eventType: event.type
      });
      
      // Log detailed information based on event type with enhanced formatting
      if (event.type === 'prompt-sent' && event.data?.prompt) {
        console.log(`\n${'═'.repeat(100)}`);
        console.log(`📤 [${agentName}] PROMPT SENT`);
        console.log(`${'═'.repeat(100)}`);
        console.log(event.data.prompt);
        console.log(`${'═'.repeat(100)}\n`);
      }
      
      if (event.type === 'message-received' && event.data?.content) {
        console.log(`\n${'═'.repeat(100)}`);
        console.log(`💬 [${agentName}] MESSAGE RECEIVED`);
        console.log(`${'═'.repeat(100)}`);
        console.log(event.data.content);
        console.log(`${'═'.repeat(100)}\n`);
      }
      
      if (event.type === 'tool-active' && event.data?.tool) {
        console.log(`\n${'─'.repeat(100)}`);
        console.log(`🔧 [${agentName}] TOOL ACTIVE: ${event.data.tool}`);
        if (event.data.parameters) {
          console.log(`   Parameters:`, JSON.stringify(event.data.parameters, null, 2));
        }
        console.log(`${'─'.repeat(100)}\n`);
      }
      
      if (event.type === 'tool-completed' && event.data?.tool) {
        console.log(`\n${'─'.repeat(100)}`);
        console.log(`✅ [${agentName}] TOOL COMPLETED: ${event.data.tool}`);
        if (event.data.result) {
          const resultStr = typeof event.data.result === 'string' 
            ? event.data.result 
            : JSON.stringify(event.data.result, null, 2);
          const preview = resultStr.substring(0, 1000);
          console.log(`   Result (${resultStr.length} chars):`);
          console.log(`   ${preview}${resultStr.length > 1000 ? '\n   ... (truncated)' : ''}`);
        }
        console.log(`${'─'.repeat(100)}\n`);
      }
      
      if (event.type === 'completed') {
        console.log(`\n${'🎉'.repeat(50)}`);
        console.log(`✅ [${agentName}] EXECUTION COMPLETED`);
        if (event.data?.response) {
          console.log(`   Response length: ${event.data.response.length} chars`);
        }
        console.log(`${'🎉'.repeat(50)}\n`);
      }
      
      if (event.type === 'retry' || event.type === 'hang-detected') {
        console.log(`\n${'⚠️ '.repeat(50)}`);
        console.log(`⚠️  [${agentName}] ${event.type.toUpperCase()}`);
        if (event.data) {
          console.log(JSON.stringify(event.data, null, 2));
        }
        console.log(`${'⚠️ '.repeat(50)}\n`);
      }
      
      if (event.type === 'error') {
        console.log(`\n${'❌ '.repeat(50)}`);
        console.log(`❌ [${agentName}] ERROR`);
        if (event.data) {
          console.log(JSON.stringify(event.data, null, 2));
        }
        console.log(`${'❌ '.repeat(50)}\n`);
      }
    };

    // Execute with progress tracking
    const result = await executeFn({ progressCallback });

    // Store detailed logs
    this.agentLogs.push({
      agentLogId,
      agentName,
      events,
      result
    });

    // Write to debug log file
    await this.writeDebugLog(agentLogId, agentName, events, result);

    return result;
  }

  /**
   * Write detailed debug log to file
   */
  async writeDebugLog(agentLogId, agentName, events, result) {
    const logPath = path.join(this.debugLogDir, `${agentLogId}.json`);
    
    const debugData = {
      agentLogId,
      agentName,
      timestamp: new Date().toISOString(),
      events,
      result: {
        success: result.success,
        response: result.response,
        sessionId: result.sessionId,
        duration: result.duration,
        attempts: result.attempts,
        toolsExecuted: result.toolsExecuted
      }
    };

    await fs.promises.writeFile(
      logPath,
      JSON.stringify(debugData, null, 2)
    );

    console.log(`\n📝 Debug log written to: ${logPath}\n`);

    this.baseLogger.debug(`[DEBUG] Debug log written: ${logPath}`, {
      agentLogId
    });
  }
}
