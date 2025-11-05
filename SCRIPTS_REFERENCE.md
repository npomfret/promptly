# Deployment Scripts Quick Reference

Quick reference for all deployment management scripts.

## Essential Commands

### Deploy Application
```bash
./deploy.sh
```
Full deployment: installs prerequisites, copies files, builds, and starts application.

### Check Status
```bash
./scripts/status.sh
```
Shows container status, health check, and recent logs.

### View Logs
```bash
./scripts/logs.sh
```
Streams live application logs (Ctrl+C to exit).

### Restart
```bash
./scripts/restart.sh
```
Quick restart without rebuilding.

### Rebuild
```bash
./scripts/rebuild.sh
```
Copies code, rebuilds image, and restarts application.

## All Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Deploy** | `./deploy.sh` | Full deployment to server |
| **Status** | `./scripts/status.sh` | Check application status |
| **Logs** | `./scripts/logs.sh` | View live logs |
| **Restart** | `./scripts/restart.sh` | Restart container |
| **Rebuild** | `./scripts/rebuild.sh` | Rebuild and redeploy |
| **Start** | `./scripts/start.sh` | Start stopped application |
| **Stop** | `./scripts/stop.sh` | Stop application |
| **Shell** | `./scripts/shell.sh` | Open container shell |
| **Update Env** | `./scripts/update-env.sh` | Update .env file |
| **Update Projects** | `./scripts/update-projects.sh` | Update projects.json |
| **Backup** | `./scripts/backup.sh` | Backup all data |

## Common Workflows

### After Code Changes
```bash
./scripts/rebuild.sh
```

### After Config Changes (.env or projects.json)
```bash
./scripts/update-env.sh
# or
./scripts/update-projects.sh
```

### Troubleshooting
```bash
./scripts/status.sh     # Check status
./scripts/logs.sh       # View logs
./scripts/restart.sh    # Try restarting
```

### Backup Before Major Changes
```bash
./scripts/backup.sh
```

### Access Container
```bash
./scripts/shell.sh
```

## Direct SSH Commands

If you prefer SSH directly:

```bash
# View logs
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose logs -f'

# Check status
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose ps'

# Restart
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose restart'

# Stop
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose down'

# Start
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose up -d'

# Access shell
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec promptly sh'
```

## Health Check

Test if application is running:

```bash
# From server
ssh root@promptly.snowmonkey.co.uk 'curl http://localhost:3000/health'

# From external (requires firewall configuration)
curl http://promptly.snowmonkey.co.uk:3000/health
```

## Server Information

- **Server**: root@promptly.snowmonkey.co.uk
- **Deployment Directory**: /opt/promptly
- **Port**: 3000
- **Container Name**: promptly

## Data Locations

- **Repositories**: /opt/promptly/data/checkouts
- **History**: /opt/promptly/data/history
- **Backups**: ./backups/ (local)

## Need Help?

See detailed documentation:
- `README.md` - Complete application and deployment guide
- `DEPLOYMENT.md` - Detailed deployment instructions
- `DEPLOYMENT_SUMMARY.md` - Deployment summary and status
