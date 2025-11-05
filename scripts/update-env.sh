#!/bin/bash
# Update .env file on server and restart

set -e

if [ ! -f .env ]; then
    echo "Error: .env file not found locally"
    exit 1
fi

echo "Copying .env to server..."
scp .env root@promptly.snowmonkey.co.uk:/opt/promptly/.env

echo "Restarting application..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose restart'

echo ""
echo "Environment variables updated and application restarted!"
echo "View logs with: ./scripts/logs.sh"
