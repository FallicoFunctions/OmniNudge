#!/bin/bash
#
# Rollback Script - Restore from git and rebuild
# Usage: ./scripts/rollback.sh [commit_hash]
#

set -e

SERVER="root@77.42.47.79"
SERVICE_NAME="omninudge-backend"
REPO_PATH="/var/www/omninudge"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-health-contract.sh"

# Canonical production health contract shared with scripts/deploy-on.sh:
# - server-local backend check: http://127.0.0.1:8080/health
# - public site check: https://omninudge.com
# - public API smoke check: https://api.omninudge.com/api/v1/ping
# - public asset check: fetched public index.html references the same boot
#   asset set as the local build, and each referenced asset returns HTTP 200

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
rsync -avz --delete dist/ "$SERVER:$REPO_PATH/frontend/dist/"

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
    # Health check
    echo -e "\n${YELLOW}Running canonical rollback health check...${NC}"
    echo "  - backend on server: http://127.0.0.1:8080/health"
    echo "  - public site: https://omninudge.com"
    echo "  - public API ping: https://api.omninudge.com/api/v1/ping"
    echo "  - public index.html boot asset set matches the local build"
    echo "  - every referenced public boot asset returns HTTP 200"
    sleep 3
    HTTP_CODE=$(ssh "$SERVER" 'code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/health 2>/dev/null) || code="000"; printf "%s" "$code"')

    if [ "$HTTP_CODE" != "200" ]; then
        echo -e "${RED}✗ Backend server-local /health check failed (HTTP $HTTP_CODE)${NC}"
        echo -e "${YELLOW}Check logs: ssh $SERVER 'journalctl -u $SERVICE_NAME -n 50'${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Backend server-local /health is responding${NC}"

    HTTP_STATUS=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "https://api.omninudge.com/api/v1/ping" 2>/dev/null || true)
    if [ "${HTTP_STATUS:-0}" != "200" ]; then
        if [ -z "$HTTP_STATUS" ] || [ "$HTTP_STATUS" = "000" ]; then
            echo -e "${RED}✗ Public API ping check failed: https://api.omninudge.com/api/v1/ping was unreachable${NC}"
        else
            echo -e "${RED}✗ Public API ping check failed: https://api.omninudge.com/api/v1/ping returned HTTP $HTTP_STATUS${NC}"
        fi
        exit 1
    fi
    echo -e "${GREEN}✓ Public API ping returned HTTP 200${NC}"

    verify_public_boot_asset_contract "frontend/dist/index.html" "https://omninudge.com" "https://omninudge.com"

    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}Rollback Successful!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "\nRolled back to commit: $COMMIT_HASH"
else
    echo -e "\n${RED}Rollback failed!${NC}"
    exit 1
fi
