# oc-ralph Quick Start Guide

## Prerequisites Check

```bash
# Check Node.js version (need >=18)
node --version

# Check GitHub CLI authentication
gh auth status

# Check OpenCode server (should be running)
curl http://localhost:4096/health || echo "OpenCode not running"
```

## Installation (5 minutes)

### Step 1: Link oc-ralph CLI

```bash
cd /root/development/oc/oc-ralph
npm link
```

Expected output:
```
added 1 package in Xs
/usr/local/bin/oc-ralph -> /usr/local/lib/node_modules/oc-ralph/bin/oc-ralph.js
```

### Step 2: Verify Installation

```bash
oc-ralph --version
# Should output: 1.0.0

oc-ralph --help
# Should show available commands
```

## Project Setup (2 minutes)

### Step 1: Initialize Your Repository

```bash
cd /path/to/your/repository

# Initialize with label creation
oc-ralph init --repo your-org/your-repo

# Or skip label creation
oc-ralph init --repo your-org/your-repo --no-labels
```

This creates:
- `.oc-ralph/config.json` - Configuration file
- `.oc-ralph/.gitignore` - Git ignore rules
- GitHub labels (15 labels starting with `oc-ralph:`)

### Step 2: Configure

Edit `.oc-ralph/config.json`:

```json
{
  "opencode": {
    "baseUrl": "http://localhost:4096"  // ← Verify this URL
  },
  "github": {
    "owner": "your-org",                // ← Change this
    "repo": "your-repo",                // ← Change this
    "baseBranch": "main"                // ← Verify your default branch
  },
  "agents": {
    // Agent configs - can leave as default for now
  }
}
```

Minimum required changes:
1. `github.owner` - Your GitHub org/username
2. `github.repo` - Your repository name
3. Verify `opencode.baseUrl` is correct

## First Orchestration (10 minutes)

### Step 1: Create Master Issue

Go to GitHub and create a new issue with:

**Title:** "Add user authentication"

**Body:**
```markdown
## Description
Implement basic user authentication with email and password.

## Acceptance Criteria
- [ ] Users can register with email/password
- [ ] Users can log in with credentials
- [ ] Passwords are hashed securely
- [ ] Session management implemented

## Technical Context
- Use existing user database schema
- Integrate with authentication middleware
```

Note the issue number (e.g., #42).

### Step 2: Start Orchestration

```bash
oc-ralph start 42  # Replace 42 with your issue number
```

You'll see:
```
🎯 Starting orchestration for issue #42

[INFO] Starting orchestration...
[INFO] Worktree created...
[INFO] Executing Architect agent...
[INFO] Executing Sculptor and Sentinel in parallel...
[INFO] Creating sub-issues...

✅ Planning completed successfully!

Status: awaiting-approval

Next: Add label 'oc-ralph:approved' to issue #42 to proceed
View issue: https://github.com/your-org/your-repo/issues/42
```

### Step 3: Review the Plan

1. Go to your GitHub issue #42
2. You'll see new comments:
   - **Technical Specification** (from Architect)
   - **Plan Ready for Review** (summary of tasks)
3. You'll see new sub-issues created:
   - Implementation tasks (e.g., #43, #44, #45)
   - Test tasks (e.g., #46, #47)

### Step 4: Review Sub-Issues

Click through the sub-issues to review:
- Task descriptions
- Acceptance criteria
- Dependencies

### Step 5: Approve or Reject

**To approve:**
```bash
# Add label via CLI
gh issue edit 42 --add-label "oc-ralph:approved" --repo your-org/your-repo

# Or add via GitHub UI
```

**To reject:**
```bash
gh issue edit 42 --add-label "oc-ralph:rejected" --repo your-org/your-repo
```

### Step 6: Check Status

```bash
oc-ralph status 42
```

Output:
```
🔍 Checking status for issue #42

Current State: oc-ralph:awaiting-approval
Can Resume: Yes

View issue: https://github.com/your-org/your-repo/issues/42
```

## Understanding the Output

### Labels Created on Master Issue
- `oc-ralph:planning` - While creating plan
- `oc-ralph:awaiting-approval` - Plan ready for review
- `oc-ralph:approved` - You approved (add manually)
- `oc-ralph:rejected` - You rejected (add manually)

### Labels on Sub-Issues
- `oc-ralph:sub-issue` - Marks as sub-issue
- `oc-ralph:implementation` or `oc-ralph:test`
- `oc-ralph:pending` - Not started yet

### Worktree Location
Created at: `/tmp/oc-ralph-worktrees/your-repo-42/`

Branch name: `oc-ralph/issue-42`

## Debugging

### Enable Debug Mode

```bash
oc-ralph start 42 --debug
```

This shows:
- Every occlient event
- Tool executions
- Detailed agent logs

Debug logs saved to: `./logs/debug/`

### View Logs

```bash
# Today's log
tail -f logs/oc-ralph-$(date +%Y-%m-%d).log

# Debug logs
ls -la logs/debug/
cat logs/debug/Architect-*.json
```

### Common Issues

**"Config file not found"**
→ Run `oc-ralph init --repo owner/repo` first

**"GitHub CLI not authenticated"**
→ Run `gh auth login`

**"OpenCode connection failed"**
→ Start OpenCode server: Check localhost:4096

**Agent timeout**
→ Increase timeout in `.oc-ralph/config.json`:
```json
{
  "agents": {
    "architect": {
      "timeout": 300  // Increase from 180
    }
  }
}
```

## What Happens Next (Future Implementation)

After you add `oc-ralph:approved`:

1. **Implementation Stage** (not yet implemented)
   - Craftsman agents execute each implementation task
   - Updates sub-issues as work progresses
   
2. **Testing Stage** (not yet implemented)
   - Validator agents run tests in parallel
   - Reports pass/fail for each test

3. **PR Creation** (not yet implemented)
   - Creates pull request
   - Links to master issue
   - Closes sub-issues

## Current Limitations

✅ **Working Now:**
- Initialize repository
- Create GitHub labels
- Planning stage (Architect, Sculptor, Sentinel)
- Sub-issue creation
- State management
- Approval workflow

⏳ **Not Yet Implemented:**
- Implementation stage execution
- Test stage execution
- Live status table updates
- Discord notifications
- PR auto-creation
- Resume from interruption

## Next Steps

1. Try the planning stage on a real issue
2. Review the generated plan quality
3. Check the created sub-issues
4. Provide feedback on task breakdown

The planning stage is fully functional and demonstrates the core orchestration capabilities!

## Getting Help

- Check `README.md` for detailed documentation
- View `IMPLEMENTATION_SUMMARY.md` for architecture details
- Check logs in `./logs/` directory
- Review agent prompts in `./prompts/` directory

Happy orchestrating! 🚀
