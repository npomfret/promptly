# Deployment Summary

**Date**: November 5, 2025
**Server**: promptly.snowmonkey.co.uk
**Status**: ✅ **SUCCESSFULLY DEPLOYED**

## Deployment Overview

Your Promptly application has been successfully deployed to your cloud server using Docker containers.

### Application URL
🌐 **http://promptly.snowmonkey.co.uk:3000**

### Health Check
```bash
curl http://promptly.snowmonkey.co.uk:3000/health
```

Response:
```json
{
  "status": "ok",
  "sessions": 0,
  "systemPrompt": "Multi-project server"
}
```

## What Was Deployed

### Created Files

1. **Dockerfile** - Multi-stage Docker build configuration
   - Type-checking in build stage
   - Production-optimized Node.js 18 Alpine image
   - Non-root user for security (UID 1001)
   - Git support for repository operations
   - Health check endpoint

2. **docker-compose.yml** - Container orchestration
   - Port mapping: 3000:3000
   - Environment variable management
   - Volume mounts for persistent data
   - Automatic restart policy
   - Health monitoring

3. **.dockerignore** - Build optimization
   - Excludes unnecessary files from Docker context

4. **deploy.sh** - Automated deployment script
   - Tests SSH connection
   - Installs Docker & Docker Compose
   - Copies files to server
   - Builds and starts containers

5. **DEPLOYMENT.md** - Complete deployment documentation

6. **package.json** - Updated for production
   - Moved `tsx` to production dependencies
   - Simplified start script (removed type-check from runtime)

## Server Configuration

**Server Details**:
- Hostname: promptly.snowmonkey.co.uk
- OS: Ubuntu 18.04.5 LTS
- Docker: v24.0.2
- Docker Compose: v2.40.3

**Deployment Directory**: `/opt/promptly`

**Container Status**: Healthy ✅

## Current Configuration

### Environment Variables
The application is configured with:
- `GEMINI_API_KEY`: Configured from .env file
- `CHECKOUT_DIR`: /app/data/checkouts
- `HISTORY_DIR`: /app/data/history
- `PORT`: 3000
- `SESSION_SECRET`: Auto-generated

### Projects
Currently configured with 1 project:
- **splitifyd**: https://github.com/npomfret/splitifyd.git (branch: main)

**Note**: The private repository "space-in-pigs" was temporarily removed from projects.json because it requires authentication. See "Adding Private Repositories" below to configure it.

### Data Persistence
Persistent volumes mounted:
- `/opt/promptly/data/checkouts` - Cloned Git repositories
- `/opt/promptly/data/history` - Chat history logs

Permissions set to UID 1001 (nodejs user in container)

## Managing the Deployment

### View Logs
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose logs -f'
```

### Restart Application
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose restart'
```

### Stop Application
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose down'
```

### Start Application
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose up -d'
```

### Rebuild and Deploy
```bash
./deploy.sh
```

### Check Container Status
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose ps'
```

### Access Container Shell
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec promptly sh'
```

## Testing the Deployment

### Health Check
```bash
curl http://promptly.snowmonkey.co.uk:3000/health
```

### List Projects
```bash
curl http://promptly.snowmonkey.co.uk:3000/projects
```

### Send a Test Message (requires projectId)
```bash
curl -X POST http://promptly.snowmonkey.co.uk:3000/enhance?projectId=cec04d6b28ab \
  -H "Content-Type: application/json" \
  -d '{"message": "What files are in this project?"}'
```

## Next Steps

### 1. Adding Private Repositories

To add the private "space-in-pigs" repository, you need to configure Git credentials in the container:

**Option A: Use Personal Access Token (Recommended)**

1. Create a GitHub Personal Access Token:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate new token with `repo` scope
   - Copy the token

2. Update projects.json on the server:
```bash
ssh root@promptly.snowmonkey.co.uk 'cat > /opt/promptly/projects.json << EOF
{
  "projects": [
    {
      "gitUrl": "https://github.com/npomfret/splitifyd.git",
      "branch": "main"
    },
    {
      "gitUrl": "https://YOUR_TOKEN@github.com/npomfret/space-in-pigs",
      "branch": "main"
    }
  ]
}
EOF'
```

3. Restart the container:
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose restart'
```

**Option B: Use SSH Keys**

1. Generate SSH key in container:
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec -u nodejs promptly ssh-keygen -t ed25519 -C "promptly@snowmonkey.co.uk"'
```

2. Add the public key to GitHub:
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec -u nodejs promptly cat /home/nodejs/.ssh/id_ed25519.pub'
```

3. Update projects.json to use SSH URL:
```json
{
  "gitUrl": "git@github.com:npomfret/space-in-pigs.git",
  "branch": "main"
}
```

### 2. Configure Firewall

Ensure port 3000 is open:
```bash
ssh root@promptly.snowmonkey.co.uk 'ufw allow 3000/tcp && ufw status'
```

### 3. Set Up SSL/TLS (Optional but Recommended)

For production use, set up HTTPS with Nginx or Caddy reverse proxy. See `DEPLOYMENT.md` for detailed instructions.

### 4. Set Up Monitoring

Consider setting up:
- Log aggregation
- Uptime monitoring
- Resource monitoring (CPU, memory, disk)
- Automated backups

### 5. Update DNS (Optional)

If you want a cleaner URL, create a subdomain:
- Create A record: `api.snowmonkey.co.uk` → Server IP
- Access via: `http://api.snowmonkey.co.uk:3000`

## Troubleshooting

### Container Keeps Restarting

Check logs:
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose logs --tail=100'
```

Common issues:
- Missing or invalid `GEMINI_API_KEY`
- Permission issues with data directories
- Failed to clone repositories

### Permission Denied Errors

Fix data directory permissions:
```bash
ssh root@promptly.snowmonkey.co.uk 'chown -R 1001:1001 /opt/promptly/data'
```

### Cannot Connect to Application

1. Check container is running:
```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose ps'
```

2. Check firewall:
```bash
ssh root@promptly.snowmonkey.co.uk 'ufw status | grep 3000'
```

3. Test locally on server:
```bash
ssh root@promptly.snowmonkey.co.uk 'curl http://localhost:3000/health'
```

### Out of Disk Space

Check disk usage:
```bash
ssh root@promptly.snowmonkey.co.uk 'df -h && docker system df'
```

Clean up old Docker resources:
```bash
ssh root@promptly.snowmonkey.co.uk 'docker system prune -a'
```

## Files Modified/Created Locally

The following files were created or modified in your local repository:

### Created Files
- `Dockerfile` - Container build configuration
- `docker-compose.yml` - Container orchestration
- `.dockerignore` - Build optimization
- `deploy.sh` - Automated deployment script
- `DEPLOYMENT.md` - Detailed deployment guide
- `DEPLOYMENT_SUMMARY.md` - This file

### Modified Files
- `package.json` - Moved `tsx` to production dependencies, simplified start script

### Recommended Next Steps for Version Control

```bash
# Review changes
git status
git diff

# Stage and commit deployment files
git add Dockerfile docker-compose.yml .dockerignore deploy.sh DEPLOYMENT.md DEPLOYMENT_SUMMARY.md package.json
git commit -m "feat: add Docker deployment configuration

- Add Dockerfile with multi-stage build
- Add docker-compose.yml for container orchestration
- Add deployment script and documentation
- Update package.json for production deployment

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to remote
git push
```

## Success Metrics

✅ Docker installed on server
✅ Docker Compose installed
✅ Application containerized
✅ Container built successfully
✅ Container running and healthy
✅ Health endpoint responding
✅ Port 3000 accessible externally
✅ Data persistence configured
✅ Automatic restart enabled
✅ Git repositories cloning successfully

## Support

For detailed deployment instructions, see:
- `DEPLOYMENT.md` - Complete deployment guide
- `README.md` - Application usage guide

For application management commands:
```bash
# View all available endpoints
curl http://promptly.snowmonkey.co.uk:3000/health

# Access project-specific UI
http://promptly.snowmonkey.co.uk:3000/project/cec04d6b28ab
```

---

**Deployment completed successfully!** 🎉

Your Promptly application is now running in a Docker container on your cloud server and is ready to use.
