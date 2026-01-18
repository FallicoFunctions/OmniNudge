#!/bin/bash
#
# Rollback Script - Restore from git and rebuild
# Usage: ./scripts/rollback.sh [commit_hash]
#

set -e

SERVER="root@77.42.47.79"
SERVICE_NAME="omninudge-backend"
REPO_PATH="/var/www/omninudge"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}========================================${NC}"
echo -e "${RED}Rollback Script${NC}"
echo -e "${RED}========================================${NC}"

# Get commit hash to rollback to
if [ -n "$1" ]; then
    COMMIT="$1"
    echo -e "${YELLOW}Rolling back to commit: $COMMIT${NC}"
else
    # Show recent commits
    echo -e "${YELLOW}Recent commits:${NC}"
    git log --oneline -10
    echo ""
    read -p "Enter commit hash to rollback to (or press Enter for HEAD~1): " COMMIT
    if [ -z "$COMMIT" ]; then
        COMMIT="HEAD~1"
    fi
fi

# Confirm rollback
echo -e "\n${RED}WARNING: This will rollback code to: $COMMIT${NC}"
read -p "Are you sure you want to rollback? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Rollback cancelled${NC}"
    exit 0
fi

# Get actual commit hash if using HEAD~1
COMMIT_HASH=$(git rev-parse "$COMMIT" 2>/dev/null)
if [ $? -ne 0 ]; then
    echo -e "${RED}Invalid commit: $COMMIT${NC}"
    exit 1
fi

echo -e "${YELLOW}Resolved to: $COMMIT_HASH${NC}"

# Execute rollback on server
echo -e "\n${YELLOW}[1/4] Checking out commit on server...${NC}"
ssh $SERVER << EOF
set -e
cd $REPO_PATH

# Stash any local changes
git stash

# Checkout the commit
git checkout $COMMIT_HASH

echo "Checked out commit: $COMMIT_HASH"
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to checkout commit${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Code rolled back${NC}"

# Rebuild backend on server
echo -e "\n${YELLOW}[2/4] Rebuilding backend on server...${NC}"
ssh $SERVER << 'EOF'
set -e
cd /var/www/omninudge/backend

# Stop service before rebuild
systemctl stop omninudge-backend

# Build for Linux
export PATH=$PATH:/usr/local/go/bin
go build -o omninudge-server ./cmd/server

if [ $? -ne 0 ]; then
    echo "Backend build failed"
    # Try to restart with old binary
    systemctl start omninudge-backend
    exit 1
fi

echo "Backend rebuilt successfully"
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Backend rebuild failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Backend rebuilt${NC}"

# Rebuild frontend locally and upload
echo -e "\n${YELLOW}[3/4] Rebuilding and uploading frontend...${NC}"

# Checkout same commit locally
git stash
git checkout $COMMIT_HASH

cd frontend
npm install
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Frontend build failed${NC}"
    cd ..
    git checkout -
    exit 1
fi

# Upload frontend
rsync -avz --delete dist/ $SERVER:/var/www/omninudge.com/

cd ..
git checkout -
echo -e "${GREEN}✓ Frontend rebuilt and uploaded${NC}"

# Start service
echo -e "\n${YELLOW}[4/4] Starting service...${NC}"
ssh $SERVER << 'EOF'
systemctl start omninudge-backend

# Wait for service to start
sleep 2

# Check if running
if systemctl is-active --quiet omninudge-backend; then
    echo "Service is running"
else
    echo "ERROR: Service failed to start"
    journalctl -u omninudge-backend -n 20 --no-pager
    exit 1
fi
EOF

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}Rollback Successful!${NC}"
    echo -e "${GREEN}========================================${NC}"

    # Health check
    echo -e "\n${YELLOW}Running health check...${NC}"
    sleep 3
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://api.omninudge.com/api/v1/health || echo "000")

    if [ "$HTTP_CODE" == "200" ]; then
        echo -e "${GREEN}✓ API is responding${NC}"
        echo -e "\nRolled back to commit: $COMMIT_HASH"
    else
        echo -e "${RED}✗ API health check failed (HTTP $HTTP_CODE)${NC}"
        echo -e "${YELLOW}Check logs: ssh $SERVER 'journalctl -u $SERVICE_NAME -n 50'${NC}"
    fi
else
    echo -e "\n${RED}Rollback failed!${NC}"
    exit 1
fi
