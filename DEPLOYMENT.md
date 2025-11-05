# Deployment Guide

This guide covers deploying the Promptly application to a cloud server using Docker.

## Prerequisites

### Local Machine
- SSH access to your cloud server
- Git repository (optional, for tracking deployment configs)
- Valid `.env` file with your configuration

### Cloud Server
- Ubuntu/Debian-based Linux server (or similar)
- Root or sudo access
- Public IP or domain name
- Open port 3000 (or your chosen port)
- At least 1GB RAM, 1 CPU core, 10GB storage

The deployment script will automatically install:
- Docker
- Docker Compose

## Quick Start

### 1. Prepare Your Environment

Ensure you have a `.env` file with your configuration:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
GEMINI_API_KEY=your_api_key_here
CHECKOUT_DIR=/app/data/checkouts
HISTORY_DIR=/app/data/history
PORT=3000
SESSION_SECRET=your-secret-here
```

### 2. Configure Projects

Ensure you have a `projects.json` file:

```bash
cp projects.json.example projects.json
```

Edit `projects.json` to configure your repositories.

### 3. Deploy

Run the deployment script:

```bash
./deploy.sh
```

The script will:
1. Test SSH connection
2. Install Docker and Docker Compose on the server
3. Create deployment directory (`/opt/promptly`)
4. Copy application files
5. Build Docker image
6. Start the application

### 4. Verify Deployment

Once deployed, test the application:

```bash
curl http://promptly.snowmonkey.co.uk:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "projects": 1
}
```

## Manual Deployment Steps

If you prefer to deploy manually:

### 1. SSH to Your Server

```bash
ssh root@promptly.snowmonkey.co.uk
```

### 2. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### 3. Create Deployment Directory

```bash
mkdir -p /opt/promptly
cd /opt/promptly
```

### 4. Copy Files from Local Machine

From your local machine:

```bash
scp -r \
    src \
    prompts \
    package.json \
    package-lock.json \
    tsconfig.json \
    Dockerfile \
    docker-compose.yml \
    .dockerignore \
    .env \
    projects.json \
    root@promptly.snowmonkey.co.uk:/opt/promptly/
```

### 5. Create Data Directories

Back on the server:

```bash
mkdir -p /opt/promptly/data/checkouts
mkdir -p /opt/promptly/data/history
```

### 6. Build and Start

```bash
cd /opt/promptly
docker-compose build
docker-compose up -d
```

### 7. Check Status

```bash
docker-compose ps
docker-compose logs -f
```

## Docker Configuration

### Dockerfile

The application uses a multi-stage Dockerfile:

1. **Builder stage**: Type-checks the TypeScript code
2. **Production stage**: Runs the application with minimal dependencies

Key features:
- Node.js 18 Alpine (minimal image)
- Git installed for repository operations
- Non-root user for security
- Health check endpoint
- Persistent volumes for data

### docker-compose.yml

The compose file defines:

- **Service**: `promptly`
- **Port**: 3000:3000
- **Volumes**:
  - `./data/checkouts` - Cloned Git repositories
  - `./data/history` - Chat history logs
  - `./projects.json` - Projects configuration
  - `./prompts` - Custom prompts
- **Environment**: Loaded from `.env` file
- **Network**: Isolated bridge network
- **Health check**: Automatic container health monitoring

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

### Rebuild and Restart

```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose up -d --build'
```

### Update Code

To deploy new code changes:

```bash
# 1. Copy updated files
scp -r src root@promptly.snowmonkey.co.uk:/opt/promptly/

# 2. Rebuild and restart
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose up -d --build'
```

Or simply run:

```bash
./deploy.sh
```

### Access Container Shell

```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec promptly sh'
```

### View Container Stats

```bash
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker stats promptly'
```

## Firewall Configuration

Ensure port 3000 is open on your server:

### UFW (Ubuntu)

```bash
ufw allow 3000/tcp
ufw status
```

### iptables

```bash
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
iptables-save > /etc/iptables/rules.v4
```

### Cloud Provider Firewall

If using a cloud provider (AWS, GCP, DigitalOcean, etc.), ensure security groups/firewall rules allow TCP port 3000.

## SSL/TLS Configuration (Optional)

To enable HTTPS, you can use a reverse proxy like Nginx or Caddy.

### Option 1: Nginx + Let's Encrypt

```bash
# Install Nginx
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

# Configure Nginx
cat > /etc/nginx/sites-available/promptly <<EOF
server {
    listen 80;
    server_name promptly.snowmonkey.co.uk;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/promptly /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Get SSL certificate
certbot --nginx -d promptly.snowmonkey.co.uk
```

### Option 2: Caddy (Simpler)

```bash
# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy

# Configure Caddy
cat > /etc/caddy/Caddyfile <<EOF
promptly.snowmonkey.co.uk {
    reverse_proxy localhost:3000
}
EOF

# Restart Caddy (automatic HTTPS!)
systemctl restart caddy
```

## Monitoring and Maintenance

### Set Up Automatic Restarts

The docker-compose configuration uses `restart: unless-stopped`, so containers will automatically restart:
- On boot
- After crashes
- After Docker daemon restarts

### Monitor Disk Usage

```bash
# Check Docker disk usage
ssh root@promptly.snowmonkey.co.uk 'docker system df'

# Clean up unused Docker resources
ssh root@promptly.snowmonkey.co.uk 'docker system prune -a'
```

### Backup Data

```bash
# Backup checkout data and history
ssh root@promptly.snowmonkey.co.uk 'tar -czf /tmp/promptly-backup.tar.gz /opt/promptly/data'
scp root@promptly.snowmonkey.co.uk:/tmp/promptly-backup.tar.gz ./backups/
```

### Update Dependencies

To update npm dependencies:

```bash
# Locally update package.json
npm update

# Redeploy
./deploy.sh
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose logs'

# Check container status
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose ps'
```

### Permission Issues

```bash
# Fix ownership of data directories
ssh root@promptly.snowmonkey.co.uk 'chown -R 1001:1001 /opt/promptly/data'
```

### Out of Memory

```bash
# Check memory usage
ssh root@promptly.snowmonkey.co.uk 'free -h'

# Add swap if needed (2GB example)
ssh root@promptly.snowmonkey.co.uk 'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile'
```

### Can't Connect to Gemini API

```bash
# Verify API key is set
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec promptly env | grep GEMINI'

# Test network connectivity
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec promptly ping -c 3 8.8.8.8'
```

### Health Check Failing

```bash
# Check health status
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose ps'

# Test health endpoint manually
ssh root@promptly.snowmonkey.co.uk 'curl http://localhost:3000/health'
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key |
| `CHECKOUT_DIR` | Yes | - | Directory for cloned repositories |
| `HISTORY_DIR` | No | - | Directory for chat history logs |
| `PORT` | No | 3000 | Server port |
| `SESSION_SECRET` | No | auto-generated | Session encryption secret |

## Security Best Practices

1. **Use strong secrets**: Generate a random `SESSION_SECRET`
   ```bash
   openssl rand -base64 32
   ```

2. **Limit SSH access**: Use SSH keys, disable password authentication
   ```bash
   # Edit /etc/ssh/sshd_config
   PasswordAuthentication no
   PermitRootLogin prohibit-password
   ```

3. **Enable firewall**: Only open necessary ports
   ```bash
   ufw default deny incoming
   ufw default allow outgoing
   ufw allow ssh
   ufw allow 3000/tcp
   ufw enable
   ```

4. **Keep system updated**:
   ```bash
   apt update && apt upgrade -y
   ```

5. **Use HTTPS**: Set up SSL/TLS with Nginx or Caddy (see SSL Configuration above)

6. **Monitor logs**: Regularly check application and system logs for suspicious activity

7. **Backup regularly**: Automate backups of data directories and configuration

## Production Checklist

- [ ] `.env` file configured with production values
- [ ] `projects.json` configured with your repositories
- [ ] Server SSH access verified
- [ ] Firewall configured (port 3000 open)
- [ ] Docker and Docker Compose installed
- [ ] Application deployed and running
- [ ] Health check endpoint responding
- [ ] SSL/TLS configured (if using HTTPS)
- [ ] Monitoring set up (logs, health checks)
- [ ] Backup strategy implemented
- [ ] Domain name configured (if applicable)

## Next Steps

After successful deployment:

1. Test the application endpoints
2. Configure projects via the UI or API
3. Set up monitoring and alerts
4. Configure automatic backups
5. Set up SSL/TLS for production use
6. Consider setting up a reverse proxy (Nginx/Caddy)
7. Implement rate limiting if needed

## Support

For issues or questions:
- Check application logs: `docker-compose logs -f`
- Review this deployment guide
- Check the main README.md for application usage
- Verify server resources (CPU, memory, disk)
