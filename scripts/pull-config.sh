#!/bin/bash
# Pull configuration files (.env and projects.json) from server

set -e

SERVER="root@promptly.snowmonkey.co.uk"
DEPLOY_DIR="/opt/promptly"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  Pulling Config from Server${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check if files exist locally and warn user
if [ -f .env ] || [ -f projects.json ]; then
    echo -e "${YELLOW}Warning: This will overwrite your local configuration files!${NC}"
    echo ""
    [ -f .env ] && echo "  - .env (exists locally)"
    [ -f projects.json ] && echo "  - projects.json (exists locally)"
    echo ""
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Create backups of local files if they exist
if [ -f .env ]; then
    echo -e "${BLUE}Creating backup:${NC} .env -> .env.backup"
    cp .env .env.backup
fi

if [ -f projects.json ]; then
    echo -e "${BLUE}Creating backup:${NC} projects.json -> projects.json.backup"
    cp projects.json projects.json.backup
fi

echo ""
echo -e "${BLUE}Pulling files from server...${NC}"

# Pull .env
if ssh "$SERVER" "[ -f $DEPLOY_DIR/.env ]"; then
    scp "$SERVER:$DEPLOY_DIR/.env" .env
    echo -e "${GREEN}✓${NC} Downloaded .env"
else
    echo -e "${YELLOW}⚠${NC}  .env not found on server"
fi

# Pull projects.json
if ssh "$SERVER" "[ -f $DEPLOY_DIR/projects.json ]"; then
    scp "$SERVER:$DEPLOY_DIR/projects.json" projects.json
    echo -e "${GREEN}✓${NC} Downloaded projects.json"
else
    echo -e "${YELLOW}⚠${NC}  projects.json not found on server"
fi

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Configuration files pulled!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo "Backups saved as:"
echo "  - .env.backup"
echo "  - projects.json.backup"
echo ""
