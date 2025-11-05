#!/bin/bash
# Start application on cloud server

echo "Starting application..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose up -d'
echo "Application started!"
echo ""
echo "Check status with: ./scripts/status.sh"
