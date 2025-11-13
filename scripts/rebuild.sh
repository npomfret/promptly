#!/bin/bash
# Rebuild and restart the application

set -e

echo "Stopping application..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose down'

echo ""
echo "Copying updated files..."
scp -r \
    src \
    views \
    public \
    prompts \
    package.json \
    package-lock.json \
    tsconfig.json \
    Dockerfile \
    root@promptly.snowmonkey.co.uk:/opt/promptly/

echo ""
echo "Rebuilding Docker image..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker build -t promptly:latest .'

echo ""
echo "Starting application..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose up -d'

echo ""
echo "Waiting for application to start..."
sleep 5

echo ""
echo "=== Application Status ==="
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose ps'

echo ""
echo "Rebuild complete!"
echo "View logs with: ./scripts/logs.sh"
