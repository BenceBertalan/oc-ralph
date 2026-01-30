# oc-ralph

> **GitHub Issue-Driven Development Orchestrator**

Fully autonomous orchestration system that transforms GitHub issues into pull requests through AI-powered planning, implementation, testing, and self-healing.

## 🌟 Features

- **📋 Intelligent Planning** - Architect, Sculptor, and Sentinel agents create comprehensive specifications and task breakdowns
- **⚡ Parallel Execution** - Implementation and test tasks execute concurrently with dependency management
- **🔧 Self-Healing Tests** - Automatically fixes failing tests up to 10 attempts with detailed context
- **🔄 Live Status Updates** - Real-time status table in master issue with 60-second refresh
- **💬 Discord Notifications** - Webhook notifications for all major orchestration events
- **🎯 Approval Gates** - Review and approve plans before implementation begins
- **🚀 Full Automation** - From issue to PR without manual intervention
- **🌐 Web UI** - Real-time monitoring dashboard with hierarchical log display (NEW!)

## 📦 Installation

```bash
npm install -g oc-ralph
```

## 🚀 Quick Start

### 1. Initialize in your repository

```bash
cd /path/to/your/repo
oc-ralph init --repo owner/repo
```

This creates:
- `.oc-ralph/config.yaml` - Configuration file
- `.oc-ralph/worktrees.json` - Worktree registry
- All required GitHub labels

### 2. Configure

Edit `.oc-ralph/config.yaml`:

```yaml
github:
  owner: your-username
  repo: your-repo
  baseBranch: main

agents:
  architect:
    timeout: 300
  sculptor:
    timeout: 300
  sentinel:
    timeout: 300
  craftsman:
    timeout: 600
  janos:
    timeout: 600

execution:
  parallel:
    maxConcurrency: auto
  retry:
    maxAttempts: 3
    baseDelayMs: 1000

worktree:
  basePath: /tmp/oc-ralph-worktrees
  cleanupOnFailure: false

discord:
  webhookUrl: https://discord.com/api/webhooks/...
  notificationLevel: all-major-events

statusTable:
  updateIntervalSeconds: 60

logging:
  level: info
  debugMode: false
```

> **Note**: If you have an existing `config.json`, it will be automatically converted to `config.yaml` the first time you run any command. Your old file will be backed up as `config.json.bak`.

### 3. Create a master issue

Create a GitHub issue describing the feature or fix you want:

```markdown
# Feature: Add user authentication

Implement a complete user authentication system with:
- User registration with email validation
- Login/logout functionality
- Password reset flow
- Session management
- Protected routes

## Requirements
- Use JWT for tokens
- Hash passwords with bcrypt
- Add rate limiting on auth endpoints
```

### 4. Start orchestration

```bash
oc-ralph start <issue-number>
```

### 5. Approve the plan

After planning completes:
1. Review the generated specification and task breakdown in the master issue
2. Add the `oc-ralph:approved` label to proceed
3. Orchestrator automatically continues to implementation and testing

### 6. Get your pull request! 🎉

When complete, a pull request is automatically created with:
- All implementation tasks completed
- All tests passing (with automatic fixing if needed)
- Comprehensive PR description with statistics
- Link back to master issue

## 📖 Commands

### `oc-ralph init`

Initialize oc-ralph in your repository.

```bash
oc-ralph init --repo owner/repo [--no-labels]
```

Options:
- `--repo` - GitHub repository (owner/repo)
- `--no-labels` - Skip creating GitHub labels

### `oc-ralph start <issue-number>`

Start a new orchestration for a master issue.

```bash
oc-ralph start 123 [--config path] [--debug]
```

Options:
- `--config` - Config file path (default: `.oc-ralph/config.yaml`)
- `--debug` - Enable debug mode with verbose logging

### `oc-ralph service`

**NEW!** Start the web service for continuous orchestration with real-time monitoring.

```bash
oc-ralph service [--config path]
```

The service:
- Polls GitHub every 60s for issues labeled `oc-ralph:queue`
- Automatically processes issues sequentially
- Provides a web UI at `http://localhost:3000`
- Streams logs in real-time via WebSocket
- Shows queue status and orchestration history

**Web UI Features:**
- 📊 Hierarchical log view (Issues → Stages → Logs)
- 🔄 Real-time updates via WebSocket
- 📱 Mobile-responsive design
- 🎯 Queue status monitoring
- 📈 Success rate and history tracking

**Quick Start:**
```bash
# Add service config to .oc-ralph/config.yaml
service:
  enabled: true
  port: 3000
  host: 0.0.0.0
  pollInterval: 60000
  queueLabel: "oc-ralph:queue"

# Start service
oc-ralph service --config .oc-ralph/config.yaml

# Open web UI
open http://localhost:3000

# Add oc-ralph:queue label to any issue to process it
```

See `WEB_UI_QUICKSTART.md` for detailed setup instructions.

### `oc-ralph status <issue-number>`

Check orchestration status.

```bash
oc-ralph status 123 [--config path]
```

### `oc-ralph resume <issue-number>`

Resume orchestration from current state.

```bash
oc-ralph resume 123 [--config path] [--debug]
```

Supports resuming from:
- `awaiting-approval` - Restarts approval polling
- `implementing` - Continues implementation tasks
- `testing` - Continues testing with self-healing
- `completing` - Retries PR creation

### `oc-ralph cleanup`

Clean up stale worktrees.

```bash
oc-ralph cleanup [--force] [--old] [--config path]
```

Options:
- `--force` - Clean all worktrees regardless of state
- `--old` - Clean worktrees older than 7 days
- `--config` - Config file path

## 🔄 Orchestration Flow

```
1. PLANNING STAGE
   ├─ Architect: Generate technical specification
   ├─ Sculptor: Break down into implementation tasks
   └─ Sentinel: Create test scenarios
   
2. APPROVAL GATE ⏳
   ├─ Update master issue with plan
   ├─ Poll for oc-ralph:approved label
   └─ Auto-continue when approved
   
3. IMPLEMENTATION STAGE
   ├─ Execute tasks in parallel batches
   ├─ Respect task dependencies
   ├─ Retry on failures (max 3 attempts)
   └─ Update status table in real-time
   
4. TESTING STAGE (Self-Healing)
   ├─ Execute tests in parallel batches
   ├─ Detect test failures
   ├─ For each failure:
   │  ├─ Create fix sub-issue with context
   │  ├─ Run Craftsman agent to fix
   │  ├─ Re-run test
   │  └─ Repeat up to 10 times
   └─ Validate dependent tests after fixes
   
5. COMPLETION STAGE
   ├─ Push branch to remote
   ├─ Create pull request
   ├─ Link PR to master issue
   └─ Send completion notifications
```

## 🏷️ State Labels

The orchestrator uses GitHub labels to track state:

| Label | Description |
|-------|-------------|
| `oc-ralph:planning` | Planning stage in progress |
| `oc-ralph:awaiting-approval` | Plan ready for review |
| `oc-ralph:approved` | Plan approved, proceeding |
| `oc-ralph:implementing` | Implementation in progress |
| `oc-ralph:testing` | Testing in progress |
| `oc-ralph:completing` | Creating pull request |
| `oc-ralph:completed` | Orchestration complete |
| `oc-ralph:pr-created` | PR successfully created |
| `oc-ralph:failed` | Orchestration failed |
| `oc-ralph:rejected` | Plan rejected by user |

## 🧪 Self-Healing Tests

When tests fail, the orchestrator automatically:

1. **Captures failure context** - Error messages, stack traces, test output
2. **Gets recent commits** - Last 5 commits for context
3. **Creates fix sub-issue** - Comprehensive description with all context
4. **Runs Craftsman agent** - AI agent fixes the implementation
5. **Re-runs test** - Validates the fix
6. **Re-runs dependent tests** - Ensures fix didn't break anything
7. **Repeats up to 10 times** - Persistent fixing with incremental improvements

If a test can't be fixed after 10 attempts, the orchestration fails with detailed logs.

## 📊 Status Table

The master issue body is automatically updated with a live status table:

```markdown
## 📈 Live Status Table

**Last Updated**: 2026-01-29 15:30:00 UTC
**Overall Status**: 🟡 Testing (45/50 tasks completed)

### Implementation Tasks
| Status | Task | Issue | Complexity | Updated |
|--------|------|-------|------------|---------|
| ✅ | Create user model | #124 | medium | 15:25:30 |
| ✅ | Add auth endpoints | #125 | high | 15:28:15 |
| 🔄 | Setup JWT tokens | #126 | medium | 15:30:00 |

### Test Tasks
| Status | Task | Issue | Type | Fix Attempts | Updated |
|--------|------|-------|------|--------------|---------|
| ✅ | Test user registration | #127 | integration | - | 15:20:00 |
| 🔧 | Test login flow | #128 | integration | 🔧 2/10 | 15:29:45 |
```

## 🔔 Discord Notifications

Configure Discord webhooks for real-time notifications:

**Notification Levels:**
- `errors-only` - Only failures
- `stage-transitions` - Major stage changes
- `all-major-events` - All important events (recommended)

**Events notified:**
- Orchestration started/completed/failed
- Planning complete
- Awaiting approval
- Implementation started
- Task completed/failed
- Testing started
- Test failed/fixed/max-attempts-reached
- PR created

## 🛠️ Configuration Reference

### GitHub Settings

```json
{
  "github": {
    "owner": "username",         // Repository owner
    "repo": "repo-name",         // Repository name
    "baseBranch": "main"         // Base branch for PRs
  }
}
```

### Agent Timeouts

```json
{
  "agents": {
    "architect": { "timeout": 300 },   // Spec generation (seconds)
    "sculptor": { "timeout": 300 },    // Task breakdown (seconds)
    "sentinel": { "timeout": 300 },    // Test planning (seconds)
    "craftsman": { "timeout": 600 },   // Implementation (seconds)
    "janos": { "timeout": 600 }        // Testing (seconds)
  }
}
```

### Execution Settings

```json
{
  "execution": {
    "parallel": {
      "maxConcurrency": "auto"   // "auto" or number (e.g., 4)
    },
    "retry": {
      "maxAttempts": 3,          // Max retries per task
      "baseDelayMs": 1000        // Exponential backoff base
    }
  }
}
```

### Worktree Settings

```json
{
  "worktree": {
    "basePath": "/tmp/oc-ralph-worktrees",  // Where to create worktrees
    "cleanupOnFailure": false                // Auto-cleanup on failure
  }
}
```

## 🔐 Environment Variables

Required:
- `GITHUB_TOKEN` or `GH_TOKEN` - GitHub personal access token with repo access

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built with:
- GitHub CLI (`gh`)
- OpenCode AI agents
- Node.js

---

**Made with ❤️ by the oc-ralph team**
