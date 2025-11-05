#!/bin/bash
set -e

# Configuration
SERVER="root@promptly.snowmonkey.co.uk"
APP_NAME="promptly"
DEPLOY_DIR="/opt/$APP_NAME"
REPO_URL="$(git config --get remote.origin.url 2>/dev/null || echo '')"
BRANCH="$(git branch --show-current 2>/dev/null || echo 'main')"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  Deploying $APP_NAME to Cloud Server${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please create a .env file with your configuration."
    exit 1
fi

# Check if projects.json exists
if [ ! -f projects.json ]; then
    echo -e "${YELLOW}Warning: projects.json not found. Using example file.${NC}"
    if [ -f projects.json.example ]; then
        cp projects.json.example projects.json
    else
        echo -e "${RED}Error: Neither projects.json nor projects.json.example found!${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}[1/6]${NC} Testing SSH connection..."
if ssh -o ConnectTimeout=5 "$SERVER" "echo 'Connection successful'" >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} SSH connection successful"
else
    echo -e "${RED}✗${NC} Cannot connect to $SERVER"
    echo "Please check your SSH credentials and network connection."
    exit 1
fi

echo ""
echo -e "${BLUE}[2/6]${NC} Checking server prerequisites..."
ssh "$SERVER" bash <<'ENDSSH'
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        echo "Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        systemctl enable docker
        systemctl start docker
        rm get-docker.sh
    fi

    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        echo "Installing Docker Compose..."
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi

    echo "Docker version: $(docker --version)"
    echo "Docker Compose version: $(docker-compose --version)"
ENDSSH
echo -e "${GREEN}✓${NC} Prerequisites installed"

echo ""
echo -e "${BLUE}[3/6]${NC} Creating deployment directory..."
ssh "$SERVER" "mkdir -p $DEPLOY_DIR"
echo -e "${GREEN}✓${NC} Directory created: $DEPLOY_DIR"

echo ""
echo -e "${BLUE}[4/6]${NC} Copying application files..."
# Copy application files
scp -r \
    src \
    prompts \
    package.json \
    package-lock.json \
    tsconfig.json \
    Dockerfile \
    docker-compose.yml \
    .dockerignore \
    .env \
    projects.json \
    "$SERVER:$DEPLOY_DIR/"

echo -e "${GREEN}✓${NC} Files copied successfully"

echo ""
echo -e "${BLUE}[5/6]${NC} Creating data directories..."
ssh "$SERVER" "mkdir -p $DEPLOY_DIR/data/checkouts $DEPLOY_DIR/data/history"
echo -e "${GREEN}✓${NC} Data directories created"

echo ""
echo -e "${BLUE}[6/6]${NC} Building and starting Docker containers..."
ssh "$SERVER" bash <<ENDSSH
    cd $DEPLOY_DIR

    # Stop existing containers
    echo "Stopping existing containers..."
    docker-compose down 2>/dev/null || true

    # Build new image
    echo "Building Docker image..."
    docker-compose build --no-cache

    # Start containers
    echo "Starting containers..."
    docker-compose up -d

    # Wait for health check
    echo "Waiting for application to be healthy..."
    sleep 5

    # Check container status
    docker-compose ps

    # Show logs
    echo ""
    echo "Recent logs:"
    docker-compose logs --tail=20
ENDSSH

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "Application URL: ${BLUE}http://promptly.snowmonkey.co.uk:3000${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:    ssh $SERVER 'cd $DEPLOY_DIR && docker-compose logs -f'"
echo "  Restart:      ssh $SERVER 'cd $DEPLOY_DIR && docker-compose restart'"
echo "  Stop:         ssh $SERVER 'cd $DEPLOY_DIR && docker-compose down'"
echo "  Rebuild:      ssh $SERVER 'cd $DEPLOY_DIR && docker-compose up -d --build'"
echo ""
