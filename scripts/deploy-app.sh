#!/bin/bash
# OmniNudge Application Deployment Script

set -e

echo "================================"
echo "OmniNudge Application Deployment"
echo "================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo bash deploy-app.sh"
    exit 1
fi

# Check if credentials file exists
if [ ! -f /root/.omninudge-credentials ]; then
    echo "❌ Error: Database credentials not found"
    echo "Run deploy-database.sh first!"
    exit 1
fi

# Load credentials
source /root/.omninudge-credentials

# Prompt for domain
read -p "Enter your domain (e.g., omninudge.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo "❌ Domain is required"
    exit 1
fi

echo ""
echo "Configuration:"
echo "  Domain: $DOMAIN"
echo "  App directory: /var/www/omninudge"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

cd /var/www/omninudge

# Check if code exists
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Backend or frontend directory not found in /var/www/omninudge"
    echo "Please upload your code first!"
    exit 1
fi

echo ""
echo "Step 1: Creating backend .env file..."
cat > backend/.env <<EOF
# Server Configuration
GIN_MODE=release
SERVER_PORT=8080
SERVER_HOST=0.0.0.0
ALLOWED_ORIGINS=https://$DOMAIN,https://www.$DOMAIN

# Database - Individual variables
DB_HOST=localhost
DB_PORT=5432
DB_USER=omninudge_user
DB_PASSWORD=$DB_PASSWORD
DB_NAME=omninudge
DB_SSLMODE=disable
DB_AUTO_MIGRATE=false

# Database - Connection URL (for tools that use it)
DATABASE_URL=$DATABASE_URL

# Security
JWT_SECRET=$JWT_SECRET

# File Storage
UPLOAD_DIR=/var/www/omninudge/uploads
MAX_UPLOAD_SIZE=26214400

# Redis (optional)
REDIS_URL=redis://localhost:6379
EOF

chmod 600 backend/.env
echo "✓ Backend .env created"

echo ""
echo "Step 2: Creating frontend .env.production..."
cat > frontend/.env.production <<EOF
VITE_API_URL=https://$DOMAIN/api/v1
VITE_WS_URL=wss://$DOMAIN/ws
EOF

echo "✓ Frontend .env.production created"

echo ""
echo "Step 3: Building backend..."
cd backend
export PATH=$PATH:/usr/local/go/bin
go mod download
go build -o omninudge-server ./cmd/server
echo "✓ Backend built successfully"

echo ""
echo "Step 4: Building frontend..."
cd ../frontend
npm install --production=false
npm run build
echo "✓ Frontend built successfully"

echo ""
echo "Step 5: Creating upload directory..."
mkdir -p /var/www/omninudge/uploads
chmod 755 /var/www/omninudge/uploads
echo "✓ Upload directory created"

echo ""
echo "Step 6: Running database migrations..."
cd /var/www/omninudge/backend/internal/database

# Check if consolidated migration exists, otherwise run all migrations
if [ -f "migrations/001_production_schema.up.sql" ]; then
    echo "Using consolidated production schema..."
    PGPASSWORD="$DB_PASSWORD" psql -U omninudge_user -d omninudge -h localhost \
        -f migrations/001_production_schema.up.sql
    echo "✓ Database schema created"
else
    echo "Running individual migrations..."
    for migration in migrations/*.up.sql; do
        if [ -f "$migration" ]; then
            echo "  Running: $(basename $migration)"
            PGPASSWORD="$DB_PASSWORD" psql -U omninudge_user -d omninudge -h localhost -f "$migration"
        fi
    done
    echo "✓ All migrations completed"
fi

echo ""
echo "Step 7: Creating systemd service..."
cat > /etc/systemd/system/omninudge-backend.service <<EOF
[Unit]
Description=OmniNudge Backend Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/omninudge/backend
ExecStart=/var/www/omninudge/backend/omninudge-server
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

Environment="GIN_MODE=release"
EnvironmentFile=/var/www/omninudge/backend/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable omninudge-backend
systemctl restart omninudge-backend

echo "✓ Backend service started"

echo ""
echo "Step 8: Configuring Nginx..."
cat > /etc/nginx/sites-available/omninudge <<'NGINXEOF'
# Redirect www to non-www
server {
    listen 80;
    server_name www.DOMAIN_PLACEHOLDER;
    return 301 https://DOMAIN_PLACEHOLDER$request_uri;
}

# Main server block
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    # Frontend (React app)
    location / {
        root /var/www/omninudge/frontend/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Media uploads
    location /uploads/ {
        alias /var/www/omninudge/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # File upload size
    client_max_body_size 25M;
}
NGINXEOF

# Replace domain placeholder
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/omninudge

# Enable site
ln -sf /etc/nginx/sites-available/omninudge /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t
systemctl reload nginx

echo "✓ Nginx configured"

echo ""
echo "Step 9: Setting up SSL with Let's Encrypt..."
echo "Running certbot..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --redirect --email admin@$DOMAIN

echo "✓ SSL certificate installed"

echo ""
echo "Step 10: Creating backup script..."
cat > /root/backup-omninudge.sh <<'BACKUPEOF'
#!/bin/bash

BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="omninudge"
DB_USER="omninudge_user"

mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/omninudge/uploads 2>/dev/null

# Delete backups older than 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
BACKUPEOF

chmod +x /root/backup-omninudge.sh

# Add to crontab if not already there
(crontab -l 2>/dev/null | grep -v backup-omninudge; echo "0 2 * * * /root/backup-omninudge.sh >> /var/log/omninudge-backup.log 2>&1") | crontab -

echo "✓ Backup script created (runs daily at 2 AM)"

echo ""
echo "================================"
echo "✓ Deployment complete!"
echo "================================"
echo ""
echo "Your app is now live at: https://$DOMAIN"
echo ""
echo "Service management:"
echo "  - View logs: journalctl -u omninudge-backend -f"
echo "  - Restart backend: systemctl restart omninudge-backend"
echo "  - Restart nginx: systemctl restart nginx"
echo ""
echo "Credentials saved in: /root/.omninudge-credentials"
echo ""
echo "Next steps:"
echo "1. Visit https://$DOMAIN and test"
echo "2. Create your admin account"
echo "3. Monitor logs for any errors"
echo ""
