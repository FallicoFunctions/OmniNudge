#!/bin/bash
# OmniNudge Application Deployment Script

set -euo pipefail

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
for required_variable in DB_PASSWORD DATABASE_URL JWT_SECRET; do
    if [ -z "${!required_variable:-}" ]; then
        echo "❌ Error: $required_variable is missing from /root/.omninudge-credentials"
        exit 1
    fi
done

if ! id -u omninudge >/dev/null 2>&1; then
    useradd --system --home-dir /var/lib/omninudge --create-home --shell /usr/sbin/nologin omninudge
fi

# Prompt for domain
read -r -p "Enter your domain (e.g., omninudge.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo "❌ Domain is required"
    exit 1
fi
if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] ||
    [[ "$DOMAIN" == *..* ]] || [[ "$DOMAIN" != *.* ]]; then
    echo "❌ Domain must be a valid DNS hostname"
    exit 1
fi

echo ""
echo "Configuration:"
echo "  Domain: $DOMAIN"
echo "  App directory: /var/www/omninudge"
echo ""
read -r -p "Continue? (y/n) " -n 1 REPLY
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

cd /var/www/omninudge
install -d -o root -g www-data -m 0750 /var/www/omninudge

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
APP_ENV=production
GIN_MODE=release
SERVER_PORT=8080
SERVER_HOST=127.0.0.1
FRONTEND_URL=https://$DOMAIN,https://www.$DOMAIN

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

# Redis (optional)
REDIS_ADDR=localhost:6379
EOF

chown root:omninudge backend/.env
chmod 640 backend/.env
echo "✓ Backend .env created"

echo ""
echo "Step 2: Creating frontend .env.production..."
cat > frontend/.env.production <<EOF
VITE_API_URL=https://$DOMAIN/api/v1
EOF

echo "✓ Frontend .env.production created"

echo ""
echo "Step 3: Building backend..."
cd backend
export PATH=$PATH:/usr/local/go/bin
go mod download
go build -o omninudge-server ./cmd/server
chown root:omninudge /var/www/omninudge/backend
chmod 750 /var/www/omninudge/backend
chown root:omninudge omninudge-server
chmod 750 omninudge-server
echo "✓ Backend built successfully"

echo ""
echo "Step 4: Building frontend..."
cd ../frontend
npm ci
npm run build
chown root:www-data /var/www/omninudge/frontend
chmod 750 /var/www/omninudge/frontend
chown -R root:www-data dist
find dist -type d -exec chmod 750 {} +
find dist -type f -exec chmod 640 {} +
echo "✓ Frontend built successfully"

echo ""
echo "Step 5: Creating upload directory..."
install -d -o omninudge -g www-data -m 2750 /var/www/omninudge/uploads
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
User=omninudge
Group=omninudge
SupplementaryGroups=www-data
WorkingDirectory=/var/www/omninudge/backend
ExecStart=/var/www/omninudge/backend/omninudge-server
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
UMask=0027

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictRealtime=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
CapabilityBoundingSet=
AmbientCapabilities=
ReadWritePaths=/var/www/omninudge/uploads

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
cat > /etc/nginx/snippets/omninudge-common-security.conf <<'NGINXEOF'
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "0" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy 'camera=(self "https://daily.co" "https://*.daily.co"), microphone=(self "https://daily.co" "https://*.daily.co"), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()' always;
NGINXEOF

cat > /etc/nginx/snippets/omninudge-frontend-csp.conf <<'NGINXEOF'
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' wss: https://*.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com; media-src 'self' blob: https:; worker-src 'self' blob:; frame-src 'self' https://daily.co https://*.daily.co; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" always;
NGINXEOF

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
    server_tokens off;

    # Frontend (React app)
    location / {
        root /var/www/omninudge/frontend/dist;
        try_files $uri $uri/ /index.html;
        include /etc/nginx/snippets/omninudge-common-security.conf;
        include /etc/nginx/snippets/omninudge-frontend-csp.conf;

        location = /index.html {
            expires -1;
            add_header Cache-Control "no-store" always;
            include /etc/nginx/snippets/omninudge-common-security.conf;
            include /etc/nginx/snippets/omninudge-frontend-csp.conf;
        }

        # Cache static assets
        location ~* \.(js|mjs|css|png|jpg|jpeg|gif|ico|svg|webp|avif|woff|woff2|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            include /etc/nginx/snippets/omninudge-common-security.conf;
            include /etc/nginx/snippets/omninudge-frontend-csp.conf;
        }
    }

    # WebSocket. Keep this exact location ahead of the general API proxy and
    # do not log the query string because it contains a five-minute token.
    location = /api/v1/ws {
        proxy_pass http://127.0.0.1:8080;
        access_log off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
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

    # Media uploads
    location /uploads/ {
        alias /var/www/omninudge/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        include /etc/nginx/snippets/omninudge-common-security.conf;
        add_header Content-Security-Policy "default-src 'none'; sandbox" always;
        add_header Cross-Origin-Resource-Policy "same-site" always;
    }

    # File upload size
    client_max_body_size 250M;
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
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --redirect --email "admin@$DOMAIN"

echo "✓ SSL certificate installed"

echo ""
echo "Step 10: Creating backup script..."
cat > /root/backup-omninudge.sh <<'BACKUPEOF'
#!/bin/bash

set -euo pipefail
umask 0077

BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="omninudge"
DB_USER="omninudge_user"

mkdir -p "$BACKUP_DIR"

# Backup database
pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Backup uploads
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" /var/www/omninudge/uploads 2>/dev/null

# Delete backups older than 7 days
find "$BACKUP_DIR" -type f -mtime +7 -delete

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
echo "Bootstrap complete."
echo "This script is for first-time server provisioning only."
echo "Routine production deploys should now use: bash scripts/deploy-on.sh"
echo "Manual rollback should use: bash scripts/rollback.sh"
echo ""
