# Promptly - Quick Start Guide

## You're Already Deployed! ✅

Your application is **running** on: `http://promptly.snowmonkey.co.uk:3000`

## Daily Commands (What You'll Actually Use)

```bash
# Check if everything is working
./scripts/status.sh

# View what's happening
./scripts/logs.sh

# Something broken? Restart it
./scripts/restart.sh

# Changed code? Redeploy it
./scripts/rebuild.sh
```

That's it. Those 4 commands handle 95% of what you need.

## When You Need More

### Update Configuration
```bash
# Edit .env locally, then:
./scripts/update-env.sh

# Edit projects.json locally, then:
./scripts/update-projects.sh
```

### Backup Your Data
```bash
./scripts/backup.sh
```

### Access the Container
```bash
./scripts/shell.sh
```

## Application URLs

- Health Check: `http://promptly.snowmonkey.co.uk:3000/health`
- Projects List: `http://promptly.snowmonkey.co.uk:3000/projects`
- Enhance Endpoint: `http://promptly.snowmonkey.co.uk:3000/enhance?projectId=<id>`

**Note**: External access requires cloud provider firewall configuration for port 3000.

## What's Running

- **Server**: promptly.snowmonkey.co.uk
- **Location**: /opt/promptly
- **Container**: promptly (Node.js 18 Alpine)
- **Port**: 3000
- **Status**: Healthy and auto-restarting

## Current Setup

**Projects Loaded**: 1
- splitifyd (https://github.com/npomfret/splitifyd.git)

**Data Persistence**:
- Cloned repos: `/opt/promptly/data/checkouts`
- Chat history: `/opt/promptly/data/history`

## Need More Details?

- `SCRIPTS_REFERENCE.md` - All available commands
- `README.md` - Complete documentation
- `DEPLOYMENT.md` - Deployment guide
- `DEPLOYMENT_SUMMARY.md` - Deployment details

## Something Wrong?

```bash
# 1. Check status
./scripts/status.sh

# 2. Check logs
./scripts/logs.sh

# 3. Try restarting
./scripts/restart.sh

# 4. Still broken? Full rebuild
./scripts/rebuild.sh
```

## Adding Your Private Repository

The "space-in-pigs" repo needs authentication. Two options:

**Option 1: GitHub Token (Easier)**
1. Create token at: https://github.com/settings/tokens
2. Edit projects.json:
   ```json
   {
     "gitUrl": "https://YOUR_TOKEN@github.com/npomfret/space-in-pigs",
     "branch": "main"
   }
   ```
3. Run: `./scripts/update-projects.sh`

**Option 2: SSH Key**
1. Generate key: `./scripts/shell.sh` then `ssh-keygen`
2. Add to GitHub: https://github.com/settings/keys
3. Update URL in projects.json to use SSH
4. Run: `./scripts/update-projects.sh`

---

**Remember**: You don't need to memorize all this. Just use:
- `./scripts/status.sh` to check
- `./scripts/logs.sh` to watch
- `./scripts/restart.sh` to fix

Everything else is in the docs when you need it.
