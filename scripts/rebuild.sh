#!/bin/bash
# Rebuild Docker image on server (no file copying)

set -e

SERVER="root@promptly.snowmonkey.co.uk"
DEPLOY_DIR="/opt/promptly"

echo "🔨 Rebuilding Docker image on server..."

ssh $SERVER bash <<ENDSSH
    cd $DEPLOY_DIR

    echo "Pulling latest code from git..."
    git fetch origin
    git reset --hard origin/main

    echo "Stopping containers..."
    docker-compose down

    echo "Building new image..."
    docker build -t promptly:latest .

    echo "Starting containers..."
    docker-compose up -d

    echo "Waiting for startup..."
    sleep 5

    echo ""
    echo "Container status:"
    docker-compose ps
ENDSSH

echo ""
echo "✅ Rebuild complete!"
echo "View logs with: ./scripts/logs.sh"
