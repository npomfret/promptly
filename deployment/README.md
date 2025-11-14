# Promptly Deployment Guide

## Current Server Setup

The Promptly application is deployed on `promptly.snowmonkey.co.uk` using a shared nginx reverse proxy with the Space in Pigs project.

### Architecture

```
Internet
   ↓
nginx (space-in-pigs-proxy) - ports 80/443
   ├─> space-in-pigs.snowmonkey.co.uk → space-in-pigs services
   └─> promptly.snowmonkey.co.uk → promptly:3000
```

### Services

1. **promptly container**: Runs the Node.js application on port 3000
2. **space-in-pigs-proxy**: Shared nginx reverse proxy handling SSL/TLS and routing for both domains

### nginx Configuration

The nginx proxy uses a combined configuration file located at:
`/opt/space-in-pigs/infra/nginx/combined.conf`

This file contains server blocks for both:
- `space-in-pigs.snowmonkey.co.uk`
- `promptly.snowmonkey.co.uk`

Each domain has its own SSL certificate from Let's Encrypt.

### Deployment Steps

1. Build the Docker image:
   ```bash
   ssh root@promptly.snowmonkey.co.uk
   cd /opt/promptly
   docker build -t promptly:latest .
   ```

2. Deploy with docker-compose:
   ```bash
   cd /opt/promptly
   docker-compose up -d
   ```

3. The nginx proxy should already be configured. If needed, update the combined config:
   ```bash
   cd /opt/space-in-pigs
   # Edit infra/nginx/combined.conf if needed
   docker-compose up -d proxy
   ```

### SSL Certificates

SSL certificates are managed via Let's Encrypt and stored in:
- `/etc/letsencrypt/live/promptly.snowmonkey.co.uk/`

The nginx proxy mounts these certificates as read-only volumes.

### Network Configuration

The promptly container must be connected to the space-in-pigs network to be accessible by the proxy:

```bash
docker network connect space-in-pigs_default promptly
```

This is required for the nginx proxy to route requests to the promptly container.

### Standalone Deployment

To deploy Promptly standalone with its own nginx proxy, use the included `docker-compose.yml` which includes a proxy service. This is useful for:
- Local development with HTTPS
- Deploying on a dedicated server
- Testing the full stack locally

Note: The standalone deployment binds ports 80/443, so it cannot run on the same server as the current shared setup.
