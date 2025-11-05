# HTTPS Setup Summary

## Overview

Promptly is now deployed with full HTTPS/TLS support using Let's Encrypt SSL certificates and nginx as a reverse proxy.

## Architecture

The HTTPS setup uses a **shared nginx proxy** approach:
- The existing `space-in-pigs-proxy` nginx container handles SSL termination for both space-in-pigs and promptly
- Both applications share ports 80 and 443
- SSL certificates are managed by Let's Encrypt/Certbot
- Automatic HTTP to HTTPS redirect is configured

## Configuration Files

### On Server: `/opt/space-in-pigs/infra/nginx/`

1. **promptly.conf** - Nginx configuration for promptly subdomain
   - Listens on ports 80 and 443
   - Handles `promptly.snowmonkey.co.uk`
   - Proxies to `promptly:3000` container
   - SSL certificate: `/etc/letsencrypt/live/promptly.snowmonkey.co.uk/`

2. **entrypoint.sh** - Modified to load multiple nginx configs
   - Loads both space-in-pigs and promptly configurations
   - Supports TLS enable/disable via `DISABLE_TLS` env var

3. **docker-compose.yml** - Updated space-in-pigs compose file
   - Proxy container now connects to both networks:
     - `default` (space-in-pigs internal network)
     - `promptly_promptly-network` (external network to reach promptly)
   - Mounts promptly.conf as a template

### In Repository: `/Users/nickpomfret/projects/promptly/infra/nginx/`

Local copies of nginx configuration files (for reference and version control):
- `default.conf` - Production config with TLS
- `local.conf` - Local development config without TLS
- `entrypoint.sh` - Nginx entrypoint script

## SSL Certificates

### Certificate Details
- Domain: `promptly.snowmonkey.co.uk`
- Issuer: Let's Encrypt
- Location: `/etc/letsencrypt/live/promptly.snowmonkey.co.uk/`
- Expiration: 2026-02-03 (auto-renewal configured)

### Certificate Renewal
Certbot is configured with automatic renewal:
- Renewal happens automatically via cron/systemd timer
- Certificates are renewed 30 days before expiration
- No manual intervention required

## URLs

### Production URLs
- **HTTPS (primary)**: `https://promptly.snowmonkey.co.uk`
- **HTTP (redirects)**: `http://promptly.snowmonkey.co.uk` → redirects to HTTPS

### Endpoints
- Health: `https://promptly.snowmonkey.co.uk/health`
- Projects: `https://promptly.snowmonkey.co.uk/projects`
- Enhance: `https://promptly.snowmonkey.co.uk/enhance?projectId=<id>`
- Ask: `https://promptly.snowmonkey.co.uk/ask?projectId=<id>`

## Network Architecture

```
Internet (HTTPS)
    ↓
nginx proxy (space-in-pigs-proxy)
    - Handles SSL termination
    - Listens on 80/443
    ↓
promptly container
    - Runs on port 3000 (internal only)
    - Connected to promptly_promptly-network
```

## Security Features

1. **TLS 1.2 and 1.3** - Modern encryption protocols
2. **HSTS** - HTTP Strict Transport Security header
3. **Automatic HTTP → HTTPS redirect** - All HTTP traffic redirected
4. **Let's Encrypt certificates** - Industry-standard SSL/TLS
5. **Regular certificate renewal** - Automatic via certbot

## Deployment Notes

### Initial Setup Steps Taken
1. Obtained Let's Encrypt certificate via certbot:
   ```bash
   certbot certonly --webroot -w /var/lib/letsencrypt/webroot \
     -d promptly.snowmonkey.co.uk --non-interactive --agree-tos \
     --email nick@snowmonkey.co.uk
   ```

2. Created nginx config for promptly subdomain

3. Updated space-in-pigs docker-compose to:
   - Mount promptly nginx config
   - Connect proxy to promptly network
   - Modified entrypoint to load multiple configs

4. Restarted space-in-pigs proxy to apply changes

### No Separate Proxy Needed
The promptly docker-compose.yml does **not** include its own nginx proxy:
- Uses `expose: 3000` instead of `ports: 3000:3000`
- Relies on the shared space-in-pigs-proxy for SSL termination
- This is the recommended approach when multiple apps share a server

## Testing

### Verify HTTPS is Working
```bash
# Health check
curl https://promptly.snowmonkey.co.uk/health

# List projects
curl https://promptly.snowmonkey.co.uk/projects

# Test redirect
curl -I http://promptly.snowmonkey.co.uk/health
# Should return: 301 Moved Permanently
# Location: https://promptly.snowmonkey.co.uk/health
```

### Check Certificate
```bash
# View certificate details
openssl s_client -connect promptly.snowmonkey.co.uk:443 -servername promptly.snowmonkey.co.uk < /dev/null
```

## Maintenance

### Certificate Renewal
Automatic renewal is configured. To manually renew:
```bash
ssh root@promptly.snowmonkey.co.uk 'certbot renew'
```

### Update nginx Configuration
If you need to update the nginx config:
```bash
# 1. Edit config on server
ssh root@promptly.snowmonkey.co.uk 'nano /opt/space-in-pigs/infra/nginx/promptly.conf'

# 2. Restart proxy
ssh root@promptly.snowmonkey.co.uk 'cd /opt/space-in-pigs && docker-compose restart proxy'
```

### View nginx Logs
```bash
ssh root@promptly.snowmonkey.co.uk 'docker logs space-in-pigs-proxy'
```

## Hook Scripts Updated

The example hook scripts have been updated to use HTTPS:
- `scripts/examples/prompt-enhancer.sh` - Uses `https://promptly.snowmonkey.co.uk`
- `scripts/examples/ask-the-expert.sh` - Uses `https://promptly.snowmonkey.co.uk`

## Troubleshooting

### Cannot Connect via HTTPS
1. Check if the proxy container is running:
   ```bash
   ssh root@promptly.snowmonkey.co.uk 'docker ps | grep proxy'
   ```

2. Check if certificates exist:
   ```bash
   ssh root@promptly.snowmonkey.co.uk 'ls -la /etc/letsencrypt/live/promptly.snowmonkey.co.uk/'
   ```

3. Check nginx logs:
   ```bash
   ssh root@promptly.snowmonkey.co.uk 'docker logs space-in-pigs-proxy --tail=50'
   ```

### 502 Bad Gateway
- Promptly container might not be running
- Network connection issue between proxy and promptly
- Check with: `docker ps` and verify promptly container is healthy

### Certificate Expired
- Automatic renewal should prevent this
- Manually renew: `certbot renew --force-renewal`
- Restart proxy after renewal

## Summary

✅ HTTPS fully configured and working
✅ Let's Encrypt SSL certificates installed
✅ Automatic HTTP → HTTPS redirect
✅ Shared nginx proxy (efficient resource usage)
✅ Auto-renewal configured
✅ All hook scripts updated to use HTTPS

**Primary URL**: https://promptly.snowmonkey.co.uk
