# Quick Start: Web UI

Get the oc-ralph web interface running in 3 steps.

## Prerequisites

- Node.js 18+
- npm installed
- oc-ralph repository cloned

## Installation

```bash
cd /root/development/oc/oc-ralph

# Install backend dependencies (already done)
npm install

# Install frontend dependencies
cd web
npm install
npm run build
cd ..
```

## Usage

### Option 1: Test Service (Mock Orchestrations)

Perfect for trying out the UI without GitHub integration:

```bash
node start-test-service.js
```

Then open: **http://localhost:3000**

The test service generates mock orchestrations that you can watch in real-time.

### Option 2: Production Service (Real GitHub)

For actual GitHub issue processing:

```bash
# Make sure config is set up
node bin/oc-ralph.js service --config .oc-ralph/config.yaml
```

Then open: **http://localhost:3000**

Add the `oc-ralph:queue` label to any GitHub issue to queue it for processing.

## What You'll See

- **Top Bar**: Connection status and log count
- **Left Panel**: Queue status (running, queued, completed, failed)
- **Right Panel**: Hierarchical log view
  - Click issues to expand stages
  - Click stages to see logs
  - Click logs to see context

## Testing

```bash
# Test backend only
node test-phase1.js

# Test full stack (requires service running)
# Terminal 1:
node start-test-service.js

# Terminal 2:
node test-phase2.js
```

## Troubleshooting

**WebSocket won't connect?**
```bash
# Check if service is running
curl http://localhost:3000/api/health
```

**Build failed?**
```bash
cd web
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Port 3000 already in use?**
```bash
# Change port in config.yaml
"service": {
  "port": 3001
}
```

Then update `web/.env`:
```bash
VITE_WS_URL=ws://localhost:3001/ws
VITE_API_URL=http://localhost:3001
```

## Development Mode

For frontend development with hot reload:

```bash
# Terminal 1: Backend
node start-test-service.js

# Terminal 2: Frontend dev server
cd web
npm run dev
# Opens on http://localhost:5173
```

## Next Steps

- Read `PHASE2_COMPLETE.md` for detailed documentation
- Read `WEB_UI_SUMMARY.md` for implementation overview
- Configure GitHub integration in `.oc-ralph/config.yaml`
- Add `oc-ralph:queue` label to issues to process them

---

**That's it!** The web UI is ready to monitor your orchestrations. 🎉
