#!/usr/bin/env node

/**
 * Start service for testing with mock orchestrator
 */

const { ServiceCommand } = require('./src/commands/ServiceCommand');
const { Logger } = require('./src/logging/Logger');

const logger = new Logger({ level: 'info', logDir: './logs' });

// Mock config for testing
const testConfig = {
  service: {
    enabled: true,
    port: 3000,
    host: '0.0.0.0',
    pollInterval: 60000,
    queueLabel: 'oc-ralph:queue',
    maxBufferSize: 10000
  },
  github: {
    owner: 'test',
    repo: 'test',
    baseBranch: 'main'
  },
  logging: {
    level: 'info',
    logDir: './logs',
    debugMode: false
  }
};

// Mock orchestrator factory
function createMockOrchestratorFactory(logger) {
  return async function orchestratorFactory(issueNumber) {
    logger.info('Creating mock orchestrator', { issueNumber });
    
    return {
      async start() {
        logger.info('Mock orchestration started', { issueNumber });
        
        // Simulate orchestration with logs
        await new Promise(resolve => setTimeout(resolve, 500));
        logger.info('[Planning] Analyzing requirements', { issueNumber, stage: 'planning' });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        logger.info('[Planning] Creating implementation plan', { issueNumber, stage: 'planning' });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        logger.info('[Implementation] Starting implementation', { issueNumber, stage: 'implementing' });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        logger.info('[Implementation] Writing code', { issueNumber, stage: 'implementing' });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        logger.info('[Testing] Running tests', { issueNumber, stage: 'testing' });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        logger.info('[Testing] Tests passed', { issueNumber, stage: 'testing' });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        logger.info('[Completion] Orchestration complete', { issueNumber, stage: 'completing' });
        
        return { success: true };
      }
    };
  };
}

async function main() {
  console.log('🚀 Starting oc-ralph test service...\n');
  console.log('Web UI will be available at: http://localhost:3000\n');
  console.log('Press Ctrl+C to stop\n');
  
  const command = new ServiceCommand(testConfig, logger);
  
  // Override orchestrator factory with mock
  command.orchestratorFactory = createMockOrchestratorFactory(logger);
  
  try {
    await command.execute();
  } catch (error) {
    logger.error('Service failed', { error: error.message });
    process.exit(1);
  }
}

main();
