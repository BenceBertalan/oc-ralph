# YAML Configuration Migration Guide

## Overview

oc-ralph now uses **YAML** for configuration instead of JSON. This provides better readability, native comment support, and follows industry standards for configuration files.

---

## What Changed?

| Before | After |
|--------|-------|
| `.oc-ralph/config.json` | `.oc-ralph/config.yaml` |
| `_comment` fields | Native `#` comments |
| JSON syntax | YAML syntax |

---

## Why YAML?

✅ **Native Comments** - No more cluttered `_comment` fields  
✅ **More Readable** - Cleaner syntax with less punctuation  
✅ **Industry Standard** - Used by Kubernetes, Docker Compose, GitHub Actions  
✅ **Multi-line Strings** - Better for documentation  
✅ **Less Verbose** - No quotes needed for most strings  

---

## Automatic Migration

**You don't need to do anything!** 

The first time you run any oc-ralph command with an existing `config.json`, it will:

1. ✅ Detect the JSON file
2. ✅ Convert it to `config.yaml`
3. ✅ Remove all `_comment` fields
4. ✅ Backup the old file as `config.json.bak`
5. ✅ Use the new YAML file going forward

### Example

```bash
$ oc-ralph start 123

⚠️  Found config.json - automatically migrating to config.yaml...
   📦 Backed up old config to .oc-ralph/config.json.bak
✅ Migration complete! Using config.yaml

[orchestration continues...]
```

---

## Manual Migration (Optional)

If you prefer to migrate manually:

### Using Node.js

```javascript
import yaml from 'js-yaml';
import fs from 'fs';

// Read JSON
const json = JSON.parse(fs.readFileSync('.oc-ralph/config.json', 'utf-8'));

// Remove _comment fields (function not shown)
const clean = removeComments(json);

// Write YAML
const yamlStr = yaml.dump(clean, { indent: 2 });
fs.writeFileSync('.oc-ralph/config.yaml', `# oc-ralph configuration\n\n${yamlStr}`);
```

### Using Online Tools

1. Go to https://www.json2yaml.com/
2. Paste your `config.json` content
3. Remove all `_comment` fields
4. Save as `.oc-ralph/config.yaml`

### Using Command Line (with yq)

```bash
# Install yq if needed: brew install yq

# Convert JSON to YAML
yq -P .oc-ralph/config.json > .oc-ralph/config.yaml

# Manually remove _comment fields and add real comments
vim .oc-ralph/config.yaml

# Backup old file
mv .oc-ralph/config.json .oc-ralph/config.json.bak
```

---

## YAML Syntax Quick Reference

### Before (JSON)

```json
{
  "_comment": "GitHub configuration",
  "github": {
    "owner": "my-org",
    "_comment_owner": "GitHub organization",
    "repo": "my-repo",
    "_comment_repo": "Repository name",
    "baseBranch": "main"
  }
}
```

### After (YAML)

```yaml
# GitHub configuration
github:
  owner: my-org       # GitHub organization
  repo: my-repo       # Repository name
  baseBranch: main
```

### Key Differences

| Feature | JSON | YAML |
|---------|------|------|
| Comments | ❌ `_comment` fields | ✅ `# comment` |
| Quotes | Required for strings | Optional |
| Commas | Required | Not needed |
| Braces | `{ }` for objects | Indentation |
| Brackets | `[ ]` for arrays | `- item` or inline |
| Indentation | Any | **Must be consistent (use spaces)** |

---

## YAML Basics

### Simple Key-Value

```yaml
key: value
number: 123
boolean: true
```

### Nested Objects

```yaml
parent:
  child: value
  another: value
```

### Arrays

```yaml
# Block style
items:
  - item1
  - item2
  - item3

# Inline style
items: [item1, item2, item3]
```

### Comments

```yaml
# This is a comment
key: value  # Inline comment
```

### Multi-line Strings

```yaml
# Preserves line breaks
description: |
  This is line 1
  This is line 2
  
# Folds into single line
description: >
  This is a long
  description that
  will be one line
```

### Strings

```yaml
# No quotes needed
simple: hello world

# Quotes for special characters
special: "value: with colon"

# Single or double quotes
quoted1: 'hello'
quoted2: "hello"
```

---

## New Installations

Running `oc-ralph init` now generates `.oc-ralph/config.yaml` directly:

```bash
$ oc-ralph init --repo owner/repo

🚀 Initializing oc-ralph...

1. Validating GitHub authentication...
   ✅ GitHub authentication successful

2. Creating .oc-ralph directory...
   ✅ Directory created

3. Generating config.yaml with example data...
   ✅ Config file created at .oc-ralph/config.yaml

4. Creating GitHub labels...
   ✅ Created 7 new labels

✅ oc-ralph initialization complete!
```

---

## Example Config (Full)

```yaml
# oc-ralph configuration

opencode:
  baseUrl: http://localhost:4096  # OpenCode server URL
  timeout: 300
  retries: 3
  pollInterval: 2000

agents:
  # Configure AI models for each agent type
  architect:
    model:
      providerID: openai  # Options: openai, anthropic, google, etc.
      modelID: gpt-5.2-codex
    agent: NightMutyur  # OpenCode agent name to use
    timeout: 180
  
  sculptor:
    model:
      providerID: openai
      modelID: gpt-5.2-codex
    agent: NightMutyur
    timeout: 180
  
  sentinel:
    model:
      providerID: openai
      modelID: gpt-5.2-codex
    agent: NightMutyur
    timeout: 180
  
  craftsman:
    model:
      providerID: openai
      modelID: gpt-5.2-codex
    agent: NightMutyur
    timeout: 600
  
  validator:
    model:
      providerID: openai
      modelID: gpt-5.2-codex
    agent: NightMutyur
    timeout: 300

github:
  owner: YOUR_GITHUB_ORG       # GitHub organization or username
  repo: YOUR_REPO_NAME          # Repository name
  baseBranch: main              # Base branch for feature branches
  labelPrefix: "oc-ralph:"
  createPR: true
  autoMergePR: false
  closeSubIssuesOnCompletion: true

worktree:
  basePath: /tmp/oc-ralph-worktrees  # Directory for git worktrees
  cleanupOnCompletion: false
  cleanupOnFailure: false

discord:
  webhookUrl: https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
  notificationLevel: all-major-events  # Options: all-major-events, stage-transitions, errors-only
  mentionRoles: []

execution:
  parallel:
    maxConcurrency: auto  # Max parallel test agents
    enableSmartDependencies: true
  retry:
    maxAttempts: 3
    backoffMultiplier: 2
    initialDelayMs: 1000
  testing:
    continueOnFailure: true  # Continue running tests after failures

statusTable:
  updateIntervalSeconds: 60  # Status table update frequency
  showRetryHistory: true
  maxRetryHistoryEntries: 5

logging:
  level: info        # Options: debug, info, warn, error
  debugMode: false   # Enable verbose occlient logging
  logDir: ./logs
  debugLogDir: ./logs/debug

service:
  enabled: true
  port: 3000
  host: 0.0.0.0
  pollInterval: 60000          # GitHub polling interval in milliseconds (60s)
  queueLabel: "oc-ralph:queue"
  maxBufferSize: 10000

cron:
  enabled: false  # Set to true if running from cron
```

---

## Troubleshooting

### Error: "Config file not found"

**Problem:** Neither `config.yaml` nor `config.json` exists.

**Solution:**
```bash
oc-ralph init --repo owner/repo
```

### Error: "Invalid YAML syntax"

**Problem:** YAML has syntax errors (usually indentation issues).

**Common causes:**
- Using tabs instead of spaces
- Inconsistent indentation
- Missing colon after key
- Unquoted strings with special characters

**Solution:**
1. Validate your YAML: https://www.yamllint.com/
2. Check indentation (use 2 spaces consistently)
3. Add quotes around strings with colons or special chars

**Example of bad YAML:**
```yaml
github:
  owner: my-org
	repo: my-repo  # ❌ Tab used here!
baseBranch: main  # ❌ Wrong indentation level
```

**Fixed:**
```yaml
github:
  owner: my-org
  repo: my-repo  # ✅ Spaces used
  baseBranch: main  # ✅ Correct indentation
```

### Error: "Missing required config"

**Problem:** Required fields are missing from config.

**Solution:** Make sure your config has all required sections:
- `opencode.baseUrl`
- `github.owner` and `github.repo`
- All 5 agent configs (architect, sculptor, sentinel, craftsman, validator)

### Want to revert to JSON?

While not recommended, you can convert back:

```bash
# Using yq
yq -o json .oc-ralph/config.yaml > .oc-ralph/config.json

# Or restore from backup
cp .oc-ralph/config.json.bak .oc-ralph/config.json
```

**Note:** You'll need to add `_comment` fields back manually if you want them.

---

## FAQ

**Q: What happens to my old config.json?**  
A: It's automatically backed up as `config.json.bak`. You can safely delete it after verifying the migration worked.

**Q: Can I use both config.json and config.yaml?**  
A: No, only YAML is supported now. If both exist, YAML takes precedence.

**Q: Do I need to update my CI/CD scripts?**  
A: Only if they explicitly reference `config.json`. Update paths to `config.yaml`.

**Q: Are there any breaking changes?**  
A: No, all configuration values work the same. Only the file format changed.

**Q: Can I use YAML features like anchors and aliases?**  
A: Yes! YAML anchors (`&`) and aliases (`*`) work. Example:

```yaml
# Define anchor
default_model: &default_model
  providerID: openai
  modelID: gpt-5.2-codex

agents:
  architect:
    model: *default_model  # Reuse with alias
    timeout: 180
  
  sculptor:
    model: *default_model  # Reuse again
    timeout: 180
```

**Q: How do I validate my YAML?**  
A: Use online validators:
- https://www.yamllint.com/
- https://jsonformatter.org/yaml-validator

Or install `yamllint`:
```bash
# macOS
brew install yamllint

# Use
yamllint .oc-ralph/config.yaml
```

---

## Resources

- **YAML Specification:** https://yaml.org/spec/
- **YAML Tutorial:** https://www.cloudbees.com/blog/yaml-tutorial-everything-you-need-get-started
- **JSON to YAML Converter:** https://www.json2yaml.com/
- **YAML Validator:** https://www.yamllint.com/

---

## Summary

✅ **Automatic migration** - No manual work required  
✅ **Backward compatible** - Old JSON configs are auto-converted  
✅ **Better syntax** - Cleaner, more readable  
✅ **Native comments** - No more `_comment` fields  
✅ **Industry standard** - YAML is the standard for config files  

Migration is seamless and happens automatically. Just run any oc-ralph command! 🚀
