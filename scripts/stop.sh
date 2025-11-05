#!/bin/bash
# Stop application on cloud server

echo "Stopping application..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose down'
echo "Application stopped."
