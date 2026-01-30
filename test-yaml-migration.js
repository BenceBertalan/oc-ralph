#!/usr/bin/env node

/**
 * Test YAML migration functionality
 */

import { ConfigManager } from './src/core/ConfigManager.js';
import fs from 'fs';
import path from 'path';

console.log('🧪 Testing YAML Configuration Migration\n');

// Test 1: Load existing YAML config
console.log('Test 1: Load existing YAML config...');
try {
  const manager1 = new ConfigManager('.oc-ralph/config.yaml');
  const config1 = manager1.load();
  console.log('  ✅ Successfully loaded config.yaml');
  console.log(`  ✅ Config has ${Object.keys(config1).length} top-level keys`);
  console.log(`  ✅ GitHub: ${config1.github.owner}/${config1.github.repo}`);
} catch (error) {
  console.log(`  ❌ Failed: ${error.message}`);
  process.exit(1);
}

// Test 2: Test auto-migration (create a temp JSON file)
console.log('\nTest 2: Test auto-migration from JSON...');
const testDir = './test-migration-temp';
const testJsonPath = path.join(testDir, 'config.json');
const testYamlPath = path.join(testDir, 'config.yaml');

try {
  // Create test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  // Create a test JSON config
  const testConfig = {
    "_comment": "Test config",
    "opencode": {
      "baseUrl": "http://localhost:4096",
      "_comment_baseUrl": "This is a comment",
      "timeout": 300,
      "retries": 3,
      "pollInterval": 2000
    },
    "github": {
      "owner": "test-owner",
      "repo": "test-repo",
      "_comment_repo": "Repository name",
      "baseBranch": "main"
    },
    "agents": {
      "architect": {
        "model": { "providerID": "openai", "modelID": "gpt-4" },
        "agent": "TestAgent",
        "timeout": 180,
        "_comment_timeout": "Timeout in seconds"
      },
      "sculptor": {
        "model": { "providerID": "openai", "modelID": "gpt-4" },
        "agent": "TestAgent",
        "timeout": 180
      },
      "sentinel": {
        "model": { "providerID": "openai", "modelID": "gpt-4" },
        "agent": "TestAgent",
        "timeout": 180
      },
      "craftsman": {
        "model": { "providerID": "openai", "modelID": "gpt-4" },
        "agent": "TestAgent",
        "timeout": 600
      },
      "validator": {
        "model": { "providerID": "openai", "modelID": "gpt-4" },
        "agent": "TestAgent",
        "timeout": 300
      }
    }
  };
  
  fs.writeFileSync(testJsonPath, JSON.stringify(testConfig, null, 2));
  console.log('  ✅ Created test config.json');

  // Try to load - should trigger migration
  const manager2 = new ConfigManager(testYamlPath);
  const config2 = manager2.load();
  
  // Verify migration happened
  if (!fs.existsSync(testYamlPath)) {
    throw new Error('config.yaml was not created');
  }
  console.log('  ✅ Auto-migration created config.yaml');

  if (!fs.existsSync(testJsonPath + '.bak')) {
    throw new Error('config.json.bak was not created');
  }
  console.log('  ✅ Original JSON backed up as config.json.bak');

  // Verify no _comment fields in loaded config
  const hasCommentFields = JSON.stringify(config2).includes('_comment');
  if (hasCommentFields) {
    throw new Error('Config still has _comment fields');
  }
  console.log('  ✅ No _comment fields in migrated config');

  // Verify values preserved
  if (config2.github.owner !== 'test-owner') {
    throw new Error('Config values not preserved correctly');
  }
  console.log('  ✅ Config values preserved correctly');

  // Read YAML file and verify format
  const yamlContent = fs.readFileSync(testYamlPath, 'utf-8');
  if (!yamlContent.startsWith('# oc-ralph configuration')) {
    throw new Error('YAML missing header comment');
  }
  console.log('  ✅ YAML file has proper header');

  // Cleanup
  fs.rmSync(testDir, { recursive: true });
  console.log('  ✅ Cleanup complete');

} catch (error) {
  console.log(`  ❌ Failed: ${error.message}`);
  // Cleanup on error
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  process.exit(1);
}

// Test 3: Verify YAML syntax is valid
console.log('\nTest 3: Verify YAML syntax...');
try {
  const yamlContent = fs.readFileSync('.oc-ralph/config.yaml', 'utf-8');
  
  // Check for common YAML issues
  if (yamlContent.includes('\t')) {
    throw new Error('YAML contains tabs (should use spaces)');
  }
  console.log('  ✅ No tabs in YAML (proper indentation)');

  // Verify it has comments
  if (!yamlContent.includes('#')) {
    throw new Error('YAML has no comments');
  }
  console.log('  ✅ YAML contains comments');

  // Verify structure
  if (!yamlContent.includes('github:') || !yamlContent.includes('agents:')) {
    throw new Error('YAML missing expected sections');
  }
  console.log('  ✅ YAML has all expected sections');

} catch (error) {
  console.log(`  ❌ Failed: ${error.message}`);
  process.exit(1);
}

console.log('\n==================================================');
console.log('All YAML Migration Tests Passed! ✅');
console.log('==================================================\n');

console.log('Summary:');
console.log('✅ YAML config loads successfully');
console.log('✅ Auto-migration works (JSON → YAML)');
console.log('✅ Backup files created');
console.log('✅ Comment fields removed');
console.log('✅ Values preserved');
console.log('✅ YAML syntax valid');
console.log('\n🎉 Migration system is working correctly!\n');
