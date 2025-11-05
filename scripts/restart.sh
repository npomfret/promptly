#!/bin/bash
# Restart application on cloud server

echo "Restarting application..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose restart'
echo "Application restarted successfully!"
echo ""
echo "Check status with: ./scripts/status.sh"
echo "View logs with: ./scripts/logs.sh"
