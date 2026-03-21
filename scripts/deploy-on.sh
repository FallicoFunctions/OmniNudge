#!/bin/bash
# OmniNudge Production Deployment Script
# Usage: deploy-on
#   (Can be run from any directory)

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (absolute paths)
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

# Step 2: Create backup on server (files + database)
echo -e "${YELLOW}Step 2: Creating backup on server...${NC}"
BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
ssh "$SERVER" bash << EOF
  set -eo pipefail
  mkdir -p /var/www/omninudge/backups

  echo "Creating file backup: ${BACKUP_NAME}.tar.gz"
  cd /var/www/omninudge
  tar -czf backups/${BACKUP_NAME}.tar.gz \
    --exclude='backups' \
    --exclude='*.log' \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.gocache' \
    --exclude='.cache' \
    --exclude='bin' \
    --exclude='omninudge-server' \
    --exclude='*.test' \
    --exclude='dump.rdb' \
    --exclude='uploads' \
    backend frontend

  # Database backup — load credentials from the .env file written by deploy-app.sh
  if [ -f /var/www/omninudge/backend/.env ]; then
    DB_USER=\$(grep '^DB_USER=' /var/www/omninudge/backend/.env | cut -d= -f2)
    DB_PASSWORD=\$(grep '^DB_PASSWORD=' /var/www/omninudge/backend/.env | cut -d= -f2)
    DB_NAME=\$(grep '^DB_NAME=' /var/www/omninudge/backend/.env | cut -d= -f2)
    if [ -n "\$DB_USER" ] && [ -n "\$DB_NAME" ]; then
      echo "Creating database backup: ${BACKUP_NAME}.sql.gz"
      PGPASSWORD="\$DB_PASSWORD" pg_dump -U "\$DB_USER" -h localhost "\$DB_NAME" \
        | gzip > /var/www/omninudge/backups/${BACKUP_NAME}.sql.gz
      echo "✓ Database backed up (\$(du -sh /var/www/omninudge/backups/${BACKUP_NAME}.sql.gz | cut -f1))"
    else
      echo "❌ Could not read DB credentials — aborting deploy (no database backup)"
      exit 1
    fi
  else
    echo "❌ No .env file found — aborting deploy (no database backup)"
    exit 1
  fi

  echo "Recent backups:"
  ls -lht /var/www/omninudge/backups/ 2>/dev/null | head -8 || echo "This is the first backup"

  # Keep last 5 file backups, last 10 database backups
  ls -t /var/www/omninudge/backups/*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm
  ls -t /var/www/omninudge/backups/*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm
EOF
echo -e "${GREEN}✓ Backup created: ${BACKUP_NAME} (files + database)${NC}"
echo ""

# Step 3: Upload frontend build
echo -e "${YELLOW}Step 3: Uploading frontend build to server...${NC}"
rsync -avz --delete \
  "$PROJECT_ROOT/frontend/dist/" \
  "$SERVER:$SERVER_PATH/frontend/dist/"
echo -e "${GREEN}✓ Frontend uploaded${NC}"
echo ""

# Step 4: Upload backend code (excluding locally-built binary)
echo -e "${YELLOW}Step 4: Uploading backend code...${NC}"
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.gocache' --exclude 'dist' --exclude 'build' --exclude 'omninudge-server' --exclude '.env' \
  "$PROJECT_ROOT/backend/" \
  "$SERVER:$SERVER_PATH/backend/"
echo -e "${GREEN}✓ Backend code uploaded${NC}"
echo ""

# Step 5: Build and restart backend on server
echo -e "${YELLOW}Step 5: Building and restarting backend on server...${NC}"
# Compute version locally (server has no .git — rsync excludes it)
BUILD_VERSION=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "Version: ${BUILD_VERSION}"
ssh "$SERVER" BUILD_VERSION="$BUILD_VERSION" bash << 'EOF'
set -eo pipefail
cd /var/www/omninudge/backend
export PATH=$PATH:/usr/local/go/bin

# Build backend
echo "Building backend..."
go build -ldflags="-X main.appVersion=${BUILD_VERSION}" -o omninudge-server ./cmd/server

# Restart backend service
echo "Restarting backend service..."
systemctl restart omninudge-backend

# Check status
sleep 2
systemctl status omninudge-backend --no-pager -n 3
EOF
echo -e "${GREEN}✓ Backend rebuilt and restarted${NC}"
echo ""

# Step 6: Verify deployment
echo -e "${YELLOW}Step 6: Verifying deployment...${NC}"
HTTP_STATUS=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "https://omninudge.com" 2>/dev/null || true)
if [ "${HTTP_STATUS:-0}" = "200" ]; then
  echo -e "${GREEN}✓ Site is responding (HTTP $HTTP_STATUS)${NC}"
elif [ -z "$HTTP_STATUS" ] || [ "$HTTP_STATUS" = "000" ]; then
  echo -e "${RED}✗ Site unreachable (curl failed or timed out)${NC}"
else
  echo -e "${RED}✗ Site returned HTTP $HTTP_STATUS${NC}"
fi
echo ""

echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Backup created: ${BACKUP_NAME} (.tar.gz + .sql.gz)"
echo ""
echo "Next steps:"
echo "  1. Visit https://omninudge.com to verify the deployment"
echo "  2. Check backend logs: ssh $SERVER 'journalctl -u omninudge-backend -f'"
echo ""
echo "To restore from backup if needed:"
echo "  Files:    ssh $SERVER 'cd /var/www/omninudge && tar -xzf backups/${BACKUP_NAME}.tar.gz'"
echo "  Database: ssh $SERVER 'DB_USER=\$(grep ^DB_USER= /var/www/omninudge/backend/.env | cut -d= -f2); DB_PASSWORD=\$(grep ^DB_PASSWORD= /var/www/omninudge/backend/.env | cut -d= -f2); DB_NAME=\$(grep ^DB_NAME= /var/www/omninudge/backend/.env | cut -d= -f2); PGPASSWORD=\$DB_PASSWORD gunzip -c /var/www/omninudge/backups/${BACKUP_NAME}.sql.gz | psql -U \$DB_USER -h localhost \$DB_NAME'"
echo ""
