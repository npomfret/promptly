#!/bin/bash
# Backup application data from cloud server

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/promptly_backup_$TIMESTAMP.tar.gz"

echo "Creating backup directory..."
mkdir -p "$BACKUP_DIR"

echo "Backing up data from server..."
ssh root@promptly.snowmonkey.co.uk "cd /opt/promptly && tar -czf /tmp/promptly_backup.tar.gz data/"

echo "Downloading backup..."
scp root@promptly.snowmonkey.co.uk:/tmp/promptly_backup.tar.gz "$BACKUP_FILE"

echo "Cleaning up remote backup file..."
ssh root@promptly.snowmonkey.co.uk "rm /tmp/promptly_backup.tar.gz"

echo ""
echo "Backup completed: $BACKUP_FILE"
echo "Backup contains:"
tar -tzf "$BACKUP_FILE" | head -10
echo "..."
