/**
 * WebServer - Express + WebSocket server for real-time log streaming
 * Provides REST API and WebSocket endpoints for web interface
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebServer {
  constructor(logStreamManager, queue, config, logger) {
    this.streamManager = logStreamManager;
    this.queue = queue;
    this.config = config;
    this.logger = logger;
    this.app = express();
    this.wss = null;
    this.server = null;
  }

  /**
   * Start web server
   */
  async start(port = 3000, host = '0.0.0.0') {
    // JSON body parser
    this.app.use(express.json());

    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      next();
    });

    // Setup API routes
    this.setupRoutes();

    // Serve static files (will be web/build in production)
    const webBuildPath = path.join(__dirname, '../../web/build');
    this.app.use(express.static(webBuildPath));

    // SPA fallback - serve index.html for all non-API routes
    this.app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
        return next();
      }
      res.sendFile(path.join(webBuildPath, 'index.html'));
    });

    // Start HTTP server
    this.server = this.app.listen(port, host);
    this.logger.info('Web server started', { port, host });

    // Start WebSocket server
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    this.logger.info('WebSocket server started', { path: '/ws' });

    return this.server;
  }

  /**
   * Setup REST API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Queue status
    this.app.get('/api/queue', (req, res) => {
      try {
        const status = this.queue.getStatus();
        res.json(status);
      } catch (error) {
        this.logger.error('Queue status error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Queue statistics
    this.app.get('/api/queue/stats', (req, res) => {
      try {
        const stats = this.queue.getStats();
        res.json(stats);
      } catch (error) {
        this.logger.error('Queue stats error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Get logs for specific issue
    this.app.get('/api/logs/issue/:issueNumber', (req, res) => {
      try {
        const issueNumber = parseInt(req.params.issueNumber);
        const logs = this.streamManager.getLogsByIssue(issueNumber);
        res.json({ issueNumber, count: logs.length, logs });
      } catch (error) {
        this.logger.error('Get logs by issue error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Get logs by agent
    this.app.get('/api/logs/agent/:agentName', (req, res) => {
      try {
        const agentName = req.params.agentName;
        const logs = this.streamManager.getLogsByAgent(agentName);
        res.json({ agentName, count: logs.length, logs });
      } catch (error) {
        this.logger.error('Get logs by agent error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Get recent logs
    this.app.get('/api/logs', (req, res) => {
      try {
        const count = parseInt(req.query.count) || 100;
        const logs = this.streamManager.getRecentLogs(count);
        res.json({ count: logs.length, logs });
      } catch (error) {
        this.logger.error('Get recent logs error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Get log stream statistics
    this.app.get('/api/logs/stats', (req, res) => {
      try {
        const stats = this.streamManager.getStats();
        res.json(stats);
      } catch (error) {
        this.logger.error('Log stats error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Manually enqueue issue (for testing/manual trigger)
    this.app.post('/api/queue', (req, res) => {
      try {
        const { issueNumber } = req.body;
        
        if (!issueNumber) {
          return res.status(400).json({ error: 'issueNumber is required' });
        }

        const result = this.queue.enqueue(parseInt(issueNumber));
        res.json({ success: true, ...result });
      } catch (error) {
        this.logger.error('Enqueue error', { error: error.message });
        res.status(400).json({ error: error.message });
      }
    });

    // Remove issue from queue
    this.app.delete('/api/queue/:issueNumber', (req, res) => {
      try {
        const issueNumber = parseInt(req.params.issueNumber);
        const result = this.queue.remove(issueNumber);
        res.json(result);
      } catch (error) {
        this.logger.error('Remove from queue error', { error: error.message });
        res.status(400).json({ error: error.message });
      }
    });

    // Clear queue
    this.app.post('/api/queue/clear', (req, res) => {
      try {
        const result = this.queue.clear();
        res.json(result);
      } catch (error) {
        this.logger.error('Clear queue error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Handle WebSocket connection
   */
  handleConnection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    this.logger.info('WebSocket client connected', { clientIp });

    // Subscribe to log stream
    this.streamManager.subscribe(ws);

    // Handle client messages (for future features)
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      } catch (error) {
        this.logger.error('WebSocket message error', { error: error.message });
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      this.streamManager.unsubscribe(ws);
      this.logger.info('WebSocket client disconnected', { clientIp });
    });

    // Handle errors
    ws.on('error', (error) => {
      this.logger.error('WebSocket error', { 
        clientIp,
        error: error.message 
      });
    });
  }

  /**
   * Handle messages from client (for future features)
   */
  handleClientMessage(ws, message) {
    this.logger.debug('Client message received', { type: message.type });

    // Future: handle filter requests, subscriptions, etc.
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      
      case 'subscribe-issue':
        // Future: filter logs by specific issue
        break;

      default:
        this.logger.debug('Unknown message type', { type: message.type });
    }
  }

  /**
   * Stop web server
   */
  async stop() {
    return new Promise((resolve, reject) => {
      if (this.wss) {
        this.wss.close(() => {
          this.logger.info('WebSocket server stopped');
        });
      }

      if (this.server) {
        this.server.close((error) => {
          if (error) {
            this.logger.error('Error stopping web server', { error: error.message });
            reject(error);
          } else {
            this.logger.info('Web server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
