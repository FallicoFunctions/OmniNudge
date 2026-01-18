#!/bin/bash
#
# Safe Deployment Script with Automatic Rollback
# Usage: ./scripts/safe-deploy.sh [--skip-backup]
#

set -e  # Exit on error

SERVER="root@77.42.47.79"
DEPLOY_PATH="/var/www/omninudge"
BACKUP_DIR="/var/www/omninudge-backups"
SERVICE_NAME="omninudge-backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Safe Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Function to check if backup should be skipped
SKIP_BACKUP=false
if [ "$1" == "--skip-backup" ]; then
    SKIP_BACKUP=true
    echo -e "${YELLOW}Warning: Skipping backup as requested${NC}"
fi

# Step 1: Create backup on server
if [ "$SKIP_BACKUP" = false ]; then
    echo -e "\n${YELLOW}[1/7] Creating backup on production server...${NC}"
    ssh $SERVER << 'EOF'
set -e
BACKUP_DIR="/var/www/omninudge-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Create backup
echo "Creating backup at $BACKUP_PATH..."
cp -r /var/www/omninudge $BACKUP_PATH

# Keep only last 5 backups
cd $BACKUP_DIR
ls -t | tail -n +6 | xargs -r rm -rf

echo "Backup created successfully: $BACKUP_PATH"
echo $BACKUP_PATH > /tmp/last_backup_path
EOF

    BACKUP_PATH=$(ssh $SERVER "cat /tmp/last_backup_path")
    echo -e "${GREEN}✓ Backup created: $BACKUP_PATH${NC}"
else
    echo -e "${YELLOW}[1/7] Skipping backup${NC}"
fi

# Step 2: Build backend locally for Linux
echo -e "\n${YELLOW}[2/7] Building backend for Linux x86_64...${NC}"
cd backend
export PATH=$PATH:/usr/local/go/bin
# Cross-compile for Linux from Mac
GOOS=linux GOARCH=amd64 go build -o omninudge-server ./cmd/server
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Backend build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Backend built successfully for Linux${NC}"
cd ..

# Step 3: Build frontend locally
echo -e "\n${YELLOW}[3/7] Building frontend locally...${NC}"
cd frontend
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Frontend build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Frontend built successfully${NC}"
cd ..

# Step 4: Stop service before upload
echo -e "\n${YELLOW}[4/7] Stopping service for upload...${NC}"
ssh $SERVER "systemctl stop $SERVICE_NAME"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to stop service${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Service stopped${NC}"

# Step 5: Upload backend
echo -e "\n${YELLOW}[5/7] Uploading backend to production...${NC}"
scp backend/omninudge-server $SERVER:$DEPLOY_PATH/backend/
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Backend upload failed${NC}"
    # Try to restart service even if upload failed
    ssh $SERVER "systemctl start $SERVICE_NAME"
    exit 1
fi
echo -e "${GREEN}✓ Backend uploaded${NC}"

# Step 6: Upload frontend
echo -e "\n${YELLOW}[6/7] Uploading frontend to production...${NC}"
rsync -avz --delete frontend/dist/ $SERVER:/var/www/omninudge.com/
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Frontend upload failed${NC}"
    # Try to restart service even if upload failed
    ssh $SERVER "systemctl start $SERVICE_NAME"
    exit 1
fi
echo -e "${GREEN}✓ Frontend uploaded${NC}"

# Step 7: Start backend service
echo -e "\n${YELLOW}[7/8] Starting backend service...${NC}"
ssh $SERVER "systemctl start $SERVICE_NAME"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Service restart failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Service restarted${NC}"

# Step 8: Health check
echo -e "\n${YELLOW}[8/8] Running health check...${NC}"
sleep 3  # Give service time to start

# Check if service is running
ssh $SERVER "systemctl is-active --quiet $SERVICE_NAME"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Service is not running!${NC}"
    echo -e "${YELLOW}Checking logs...${NC}"
    ssh $SERVER "journalctl -u $SERVICE_NAME -n 20 --no-pager"

    if [ "$SKIP_BACKUP" = false ]; then
        echo -e "\n${RED}DEPLOYMENT FAILED${NC}"
        echo -e "${YELLOW}To rollback, run: ./scripts/rollback.sh${NC}"
    fi
    exit 1
fi

# Check if API is responding
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://api.omninudge.com/api/v1/health || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}✗ API health check failed (HTTP $HTTP_CODE)${NC}"

    if [ "$SKIP_BACKUP" = false ]; then
        echo -e "${YELLOW}To rollback, run: ./scripts/rollback.sh${NC}"
    fi
    exit 1
fi

echo -e "${GREEN}✓ Health check passed${NC}"

# Success
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "${GREEN}========================================${NC}"

if [ "$SKIP_BACKUP" = false ]; then
    echo -e "\n${YELLOW}If something goes wrong, rollback with:${NC}"
    echo -e "  ./scripts/rollback.sh"
fi

echo -e "\nCheck logs with:"
echo -e "  ssh $SERVER 'journalctl -u $SERVICE_NAME -f'"
