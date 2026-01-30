/**
 * Discord Notifier - Send webhook notifications for orchestration events
 */
import https from 'https';
import fs from 'fs';
import FormData from 'form-data';

export class DiscordNotifier {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.webhookUrl = config.discord?.webhookUrl;
    this.notificationLevel = config.discord?.notificationLevel || 'all-major-events';
    this.mentionRoles = config.discord?.mentionRoles || [];
    this.enabled = !!this.webhookUrl && this.webhookUrl.includes('discord.com');
  }
  
  /**
   * Send notification on event
   */
  async onEvent(event, data = {}) {
    if (!this.enabled) {
      this.logger.debug('Discord notifications disabled, skipping', { event });
      return;
    }
    
    // Filter based on notification level
    if (!this.shouldNotify(event)) {
      this.logger.debug('Event not in notification level, skipping', { event, level: this.notificationLevel });
      return;
    }
    
    const embed = this.buildEmbed(event, data);
    await this.send(embed);
  }
  
  /**
   * Convenience method - alias for onEvent
   */
  async notify(event, data = {}) {
    return this.onEvent(event, data);
  }
  
  /**
   * Check if event should trigger notification
   */
  shouldNotify(event) {
    const levels = {
      'errors-only': ['orchestration-failed', 'task-failed', 'test-failed', 'test-max-attempts-reached'],
      'stage-transitions': ['orchestration-started', 'planning-complete', 'implementation-started', 
                           'testing-started', 'orchestration-complete', 'orchestration-failed'],
      'all-major-events': ['orchestration-started', 'planning-complete', 'awaiting-approval',
                          'approved', 'implementation-started', 'task-completed', 
                          'testing-started', 'test-failed', 'test-fix-started', 'test-fix-completed',
                          'test-passed-after-fix', 'test-max-attempts-reached',
                          'orchestration-complete', 'orchestration-failed', 'task-failed', 'critical-error']
    };
    
    const eventsToNotify = levels[this.notificationLevel] || [];
    return eventsToNotify.includes(event);
  }
  
  /**
   * Build Discord embed
   */
  buildEmbed(event, data) {
    const { masterIssueNumber, issueUrl, taskTitle, error } = data;
    const repoName = `${this.config.github.owner}/${this.config.github.repo}`;
    
    const embedConfig = {
      'orchestration-started': {
        title: '🚀 Orchestration Started',
        description: `Starting orchestration for issue #${masterIssueNumber}`,
        color: 3447003, // blue
        url: issueUrl
      },
      'planning-complete': {
        title: '📋 Planning Complete',
        description: `Planning phase completed for issue #${masterIssueNumber}\n\n**Implementation Tasks**: ${data.implCount}\n**Test Tasks**: ${data.testCount}`,
        color: 15844367, // gold
        url: issueUrl
      },
      'awaiting-approval': {
        title: '⏳ Awaiting Approval',
        description: `Plan ready for review on issue #${masterIssueNumber}\n\nAdd label \`oc-ralph:approved\` to proceed.`,
        color: 16776960, // yellow
        url: issueUrl
      },
      'approved': {
        title: '✅ Plan Approved',
        description: `Plan approved for issue #${masterIssueNumber}\n\nStarting implementation...`,
        color: 5763719, // green
        url: issueUrl
      },
      'implementation-started': {
        title: '🔨 Implementation Started',
        description: `Implementation phase started for issue #${masterIssueNumber}`,
        color: 3066993, // blue
        url: issueUrl
      },
      'task-completed': {
        title: '✅ Task Completed',
        description: `Task completed: **${taskTitle}**\n\nIssue: #${data.taskIssueNumber}`,
        color: 5763719, // green
        url: data.taskIssueUrl
      },
      'testing-started': {
        title: '🧪 Testing Started',
        description: `Testing phase started for issue #${masterIssueNumber}`,
        color: 10181046, // purple
        url: issueUrl
      },
      'orchestration-complete': {
        title: '🎉 Orchestration Complete',
        description: `Successfully completed orchestration for issue #${masterIssueNumber}\n\n**Pull Request**: #${data.prNumber}\n**Implementation Tasks**: ${data.implTaskCount}\n**Tests Passed**: ${data.testsPassed}/${data.testsTotal}\n**Commits**: ${data.commitCount}\n**Files Changed**: ${data.filesChanged}\n\n[View PR](${data.prUrl})`,
        color: 5763719, // green
        url: data.prUrl || issueUrl
      },
      'orchestration-failed': {
        title: '❌ Orchestration Failed',
        description: `Orchestration failed for issue #${masterIssueNumber}\n\n**Error**: ${error || 'Unknown error'}`,
        color: 15158332, // red
        url: issueUrl
      },
      'task-failed': {
        title: '❌ Task Failed',
        description: `Task failed: **${taskTitle}**\n\nIssue: #${data.taskIssueNumber}\n**Error**: ${error || 'Unknown error'}`,
        color: 15158332, // red
        url: data.taskIssueUrl
      },
      'test-failed': {
        title: '❌ Test Failed',
        description: `Test failed: **${data.testTitle}**\n\nTest Issue: #${data.testIssue}\nStarting automatic fix attempts...`,
        color: 15158332, // red
        url: `https://github.com/${data.repo}/issues/${data.testIssue}`
      },
      'test-fix-started': {
        title: '🔧 Test Fix Started',
        description: `Attempting to fix test #${data.testIssue}\n\n**Fix Attempt**: ${data.attemptNumber}/${data.maxAttempts}\n**Fix Issue**: #${data.fixIssue}`,
        color: 16776960, // yellow
        url: `https://github.com/${data.repo}/issues/${data.fixIssue}`
      },
      'test-fix-completed': {
        title: '✅ Fix Applied',
        description: `Fix applied for test #${data.testIssue}\n\n**Fix Issue**: #${data.fixIssue}\nRe-running test...`,
        color: 3447003, // blue
        url: `https://github.com/${data.repo}/issues/${data.fixIssue}`
      },
      'test-passed-after-fix': {
        title: '🎉 Test Fixed Successfully',
        description: `Test #${data.testIssue} now passing!\n\n**Fix Attempts**: ${data.attemptNumber}\n**Fix Issue**: #${data.fixIssue}`,
        color: 5763719, // green
        url: `https://github.com/${data.repo}/issues/${data.testIssue}`
      },
      'test-max-attempts-reached': {
        title: '🚫 Max Fix Attempts Reached',
        description: `Test #${data.testIssue} could not be fixed after ${data.maxAttempts} attempts.\n\nOrchestration will fail.`,
        color: 10038562, // dark red
        url: `https://github.com/${data.repo}/issues/${data.testIssue}`
      },
      'critical-error': {
        title: `🚨 ${data.errorType || 'Critical Error'}`,
        description: `Critical error occurred during orchestration for issue #${masterIssueNumber}\n\n` +
                     `**Task/Test**: ${data.taskTitle || data.testTitle || 'N/A'}\n` +
                     `**Issue**: #${data.taskIssueNumber || data.testIssueNumber || 'N/A'}\n` +
                     `**Error**: ${data.errorMessage}\n\n` +
                     `${data.details || ''}`,
        color: 10038562, // dark red
        url: issueUrl
      }
    };
    
    const config = embedConfig[event] || {
      title: `Event: ${event}`,
      description: `Issue #${masterIssueNumber}`,
      color: 9807270,
      url: issueUrl
    };
    
    const embed = {
      embeds: [{
        title: config.title,
        description: config.description,
        color: config.color,
        url: config.url,
        footer: {
          text: `${repoName} | oc-ralph`
        },
        timestamp: new Date().toISOString()
      }]
    };
    
    // Add role mentions if configured
    if (this.mentionRoles.length > 0 && ['orchestration-failed', 'awaiting-approval', 'test-max-attempts-reached', 'critical-error'].includes(event)) {
      embed.content = this.mentionRoles.map(roleId => `<@&${roleId}>`).join(' ');
    }
    
    return embed;
  }
  
  /**
   * Send notification with file attachment
   */
  async onEventWithFile(event, data = {}, filePath = null) {
    if (!this.enabled) {
      this.logger.debug('Discord notifications disabled, skipping', { event });
      return;
    }
    
    // Filter based on notification level
    if (!this.shouldNotify(event)) {
      this.logger.debug('Event not in notification level, skipping', { event, level: this.notificationLevel });
      return;
    }
    
    const embed = this.buildEmbed(event, data);
    
    if (filePath && fs.existsSync(filePath)) {
      await this.sendWithAttachment(embed, filePath);
    } else {
      await this.send(embed);
    }
  }
  
  /**
   * Send webhook to Discord
   */
  async send(payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.webhookUrl);
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data, 'utf8')
        }
      };
      
      const req = https.request(options, (res) => {
        let responseBody = '';
        
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.logger.debug('Discord notification sent', { statusCode: res.statusCode });
            resolve();
          } else {
            this.logger.error('Discord notification failed', { 
              statusCode: res.statusCode,
              response: responseBody 
            });
            // Don't reject - just log and continue
            resolve();
          }
        });
      });
      
      req.on('error', (error) => {
        this.logger.error('Discord notification error', { error: error.message });
        // Don't reject - just log and continue
        resolve();
      });
      
      req.write(data);
      req.end();
    });
  }
  
  /**
   * Send webhook with file attachment to Discord
   */
  async sendWithAttachment(payload, filePath) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.webhookUrl);
      const form = new FormData();
      
      // Add the JSON payload
      form.append('payload_json', JSON.stringify(payload));
      
      // Add the file
      const fileName = filePath.split('/').pop();
      form.append('file', fs.createReadStream(filePath), {
        filename: fileName,
        contentType: 'text/plain'
      });
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: form.getHeaders()
      };
      
      const req = https.request(options, (res) => {
        let responseBody = '';
        
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.logger.debug('Discord notification with attachment sent', { 
              statusCode: res.statusCode,
              fileName 
            });
            resolve();
          } else {
            this.logger.error('Discord notification with attachment failed', { 
              statusCode: res.statusCode,
              response: responseBody 
            });
            // Don't reject - just log and continue
            resolve();
          }
        });
      });
      
      req.on('error', (error) => {
        this.logger.error('Discord notification with attachment error', { 
          error: error.message 
        });
        // Don't reject - just log and continue
        resolve();
      });
      
      form.pipe(req);
    });
  }
}
