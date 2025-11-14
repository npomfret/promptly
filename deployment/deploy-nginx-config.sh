#!/bin/bash
# Deploy the combined nginx configuration to the server

set -e

SERVER="root@promptly.snowmonkey.co.uk"
NGINX_CONFIG_DIR="/opt/space-in-pigs/infra/nginx"

echo "Deploying nginx configuration to $SERVER..."

# Copy the combined config to the server
scp deployment/nginx-combined.conf $SERVER:$NGINX_CONFIG_DIR/combined.conf

echo "Configuration copied. Restarting nginx proxy..."

# Update the docker-compose.yml to use the combined config (if not already set)
ssh $SERVER "cd /opt/space-in-pigs && \
    sed -i 's|./infra/nginx/default.conf:/etc/nginx/templates/default.conf:ro|./infra/nginx/combined.conf:/etc/nginx/templates/default.conf:ro|' docker-compose.yml"

# Restart the proxy
ssh $SERVER "cd /opt/space-in-pigs && docker-compose up -d proxy"

echo "Nginx proxy restarted successfully!"
echo "Testing connection..."

sleep 2
curl -I https://promptly.snowmonkey.co.uk | grep "HTTP"

echo "Deployment complete!"
