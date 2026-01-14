#!/bin/bash
# OmniNudge Production Deployment Script
# Usage: ./scripts/deploy.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVER="root@77.42.47.79"
SERVER_PATH="/var/www/omninudge"
PROJECT_ROOT="/Users/Nick_1/Documents/Personal_Projects/OmniNudge"

echo -e "${GREEN}Starting OmniNudge deployment...${NC}"
echo ""

# Step 1: Build frontend locally
echo -e "${YELLOW}Step 1: Building frontend locally...${NC}"
cd "$PROJECT_ROOT/frontend"
npm run build
echo -e "${GREEN}✓ Frontend built${NC}"
echo ""

# Step 2: Upload frontend build
echo -e "${YELLOW}Step 2: Uploading frontend build to server...${NC}"
rsync -avz --delete \
  "$PROJECT_ROOT/frontend/dist/" \
  "$SERVER:$SERVER_PATH/frontend/dist/"
echo -e "${GREEN}✓ Frontend uploaded${NC}"
echo ""

# Step 3: Upload backend code
echo -e "${YELLOW}Step 3: Uploading backend code...${NC}"
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.gocache' --exclude 'dist' --exclude 'build' \
  "$PROJECT_ROOT/backend/" \
  "$SERVER:$SERVER_PATH/backend/"
echo -e "${GREEN}✓ Backend code uploaded${NC}"
echo ""

# Step 4: Build and restart backend on server
echo -e "${YELLOW}Step 4: Building and restarting backend on server...${NC}"
ssh "$SERVER" << 'EOF'
cd /var/www/omninudge/backend
export PATH=$PATH:/usr/local/go/bin

# Build backend
echo "Building backend..."
go build -o omninudge-server ./cmd/server

# Restart backend service
echo "Restarting backend service..."
systemctl restart omninudge-backend

# Check status
sleep 2
systemctl status omninudge-backend --no-pager -n 3
EOF
echo -e "${GREEN}✓ Backend rebuilt and restarted${NC}"
echo ""

# Step 5: Verify deployment
echo -e "${YELLOW}Step 5: Verifying deployment...${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://omninudge.com")
if [ "$HTTP_STATUS" -eq 200 ]; then
  echo -e "${GREEN}✓ Site is responding (HTTP $HTTP_STATUS)${NC}"
else
  echo -e "${RED}✗ Site returned HTTP $HTTP_STATUS${NC}"
fi
echo ""

echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Visit https://omninudge.com to verify the deployment"
echo "  2. Check backend logs: ssh $SERVER 'journalctl -u omninudge-backend -f'"
echo ""
