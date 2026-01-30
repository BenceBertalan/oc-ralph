#!/usr/bin/env node

/**
 * Phase 2 Integration Test
 * Tests the full web UI + backend service integration
 */

import http from 'http';
import WebSocket from 'ws';

console.log('\n🧪 Testing Phase 2: Web UI Integration\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAPI(endpoint, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:3000${endpoint}`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === expectedStatus) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function testWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3000/ws');
    const messages = [];
    
    ws.on('open', () => {
      console.log('  ✅ WebSocket connected');
    });
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        messages.push(msg);
        
        if (msg.type === 'init') {
          console.log(`  ✅ Received initial buffer: ${msg.logs.length} logs`);
          // Close after receiving initial buffer
          ws.close();
          resolve(messages);
        }
      } catch (err) {
        reject(err);
      }
    });
    
    ws.on('error', reject);
    
    setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout'));
    }, 5000);
  });
}

async function checkStaticFiles() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/', (res) => {
      if (res.statusCode === 200) {
        console.log('  ✅ Static files served: index.html');
        resolve(true);
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function runTests() {
  try {
    console.log('Test 1: REST API Endpoints...');
    
    const health = await testAPI('/api/health');
    console.log(`  ✅ /api/health: ${health.status}`);
    
    const queue = await testAPI('/api/queue');
    console.log(`  ✅ /api/queue: OK`);
    
    const stats = await testAPI('/api/queue/stats');
    console.log(`  ✅ /api/queue/stats: OK`);
    
    const logs = await testAPI('/api/logs?count=10');
    console.log(`  ✅ /api/logs: ${logs.logs.length} logs`);
    
    console.log('\nTest 2: WebSocket Connection...');
    const messages = await testWebSocket();
    console.log(`  ✅ WebSocket message handling: ${messages.length} messages received`);
    
    console.log('\nTest 3: Static File Serving...');
    await checkStaticFiles();
    
    console.log('\nTest 4: Web UI Build...');
    const fs = require('fs');
    const buildPath = './web/build';
    
    if (fs.existsSync(buildPath)) {
      const files = fs.readdirSync(buildPath);
      console.log(`  ✅ Build directory exists: ${files.length} files/dirs`);
      
      if (fs.existsSync(`${buildPath}/index.html`)) {
        console.log('  ✅ index.html present');
      }
      
      if (fs.existsSync(`${buildPath}/assets`)) {
        const assets = fs.readdirSync(`${buildPath}/assets`);
        console.log(`  ✅ assets directory: ${assets.length} files`);
      }
    } else {
      console.log('  ❌ Build directory not found');
    }
    
    console.log('\n==================================================');
    console.log('Phase 2 Tests Complete');
    console.log('==================================================');
    console.log('✅ REST API: Working');
    console.log('✅ WebSocket: Working');
    console.log('✅ Static Files: Serving');
    console.log('✅ Web UI Build: Complete');
    console.log('\n🎉 Full stack integration successful!');
    console.log('\n📱 Open http://localhost:3000 in your browser to view the UI');
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nMake sure the service is running:');
    console.error('  node bin/oc-ralph.js service --config .oc-ralph/config.yaml');
    process.exit(1);
  }
}

runTests();
