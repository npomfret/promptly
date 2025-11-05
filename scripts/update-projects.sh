#!/bin/bash
# Update projects.json on server and restart

set -e

if [ ! -f projects.json ]; then
    echo "Error: projects.json file not found locally"
    exit 1
fi

echo "Copying projects.json to server..."
scp projects.json root@promptly.snowmonkey.co.uk:/opt/promptly/projects.json

echo "Restarting application..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose restart'

echo ""
echo "Projects configuration updated and application restarted!"
echo "View logs with: ./scripts/logs.sh"
