/**
 * Structured JSON logger for oc-ralph
 */
import fs from 'fs';
import path from 'path';

export class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.logDir = options.logDir || './logs';
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.streamManager = options.streamManager || null;
    
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4
    };
    
    // Ensure log directory exists
    if (this.enableFile) {
      this.ensureLogDir();
    }
  }

  /**
   * Set stream manager for real-time log streaming
   */
  setStreamManager(streamManager) {
    this.streamManager = streamManager;
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  formatMessage(level, message, context = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    };
  }

  log(level, message, context = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatMessage(level, message, context);
    const logString = JSON.stringify(logEntry);

    // Stream to real-time subscribers
    if (this.streamManager) {
      this.streamManager.onLog(logEntry);
    }

    // Console output with colors
    if (this.enableConsole) {
      const colors = {
        debug: '\x1b[36m',
        info: '\x1b[32m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
        fatal: '\x1b[35m'
      };
      const reset = '\x1b[0m';
      const color = colors[level] || '';
      
      console.log(`${color}[${level.toUpperCase()}]${reset} ${message}`, 
        Object.keys(context).length > 0 ? context : '');
    }

    // File output
    if (this.enableFile) {
      const logFile = path.join(this.logDir, `oc-ralph-${new Date().toISOString().split('T')[0]}.log`);
      fs.appendFileSync(logFile, logString + '\n');
    }
  }

  debug(message, context) {
    this.log('debug', message, context);
  }

  info(message, context) {
    this.log('info', message, context);
  }

  warn(message, context) {
    this.log('warn', message, context);
  }

  error(message, context) {
    this.log('error', message, context);
  }

  fatal(message, context) {
    this.log('fatal', message, context);
  }

  /**
   * Get the path to the current log file
   */
  getCurrentLogFile() {
    if (!this.enableFile) {
      return null;
    }
    return path.join(this.logDir, `oc-ralph-${new Date().toISOString().split('T')[0]}.log`);
  }
}
