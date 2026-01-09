# OmniNudge Deployment Guide for Beginners

**Goal:** Get omninudge.com live on the internet with HTTPS, databases, and everything working.

**Time Required:** 4-6 hours for first deployment

**Cost:** ~$20-30/month (VPS + storage)

---

## Table of Contents

1. [Overview: What We're Building](#overview)
2. [Step 1: Set Up Your VPS Server](#step-1-vps-setup)
3. [Step 2: Connect Your Domain](#step-2-domain-setup)
4. [Step 3: Install Required Software](#step-3-software-installation)
5. [Step 4: Set Up PostgreSQL Database](#step-4-database-setup)
6. [Step 5: Deploy Your Backend](#step-5-backend-deployment)
7. [Step 6: Deploy Your Frontend](#step-6-frontend-deployment)
8. [Step 7: Set Up Nginx (Web Server)](#step-7-nginx-setup)
9. [Step 8: Get Free SSL Certificate](#step-8-ssl-setup)
10. [Step 9: Set Up Automatic Backups](#step-9-backups)
11. [Step 10: Launch Checklist](#step-10-launch)
12. [Troubleshooting](#troubleshooting)

---

## Overview: What We're Building {#overview}

Here's what happens when someone visits omninudge.com:

```
User's Browser
    ↓
omninudge.com (Your Domain)
    ↓
Your VPS Server (DigitalOcean/Hetzner/Linode)
    ↓
Nginx (Routes traffic to frontend or backend)
    ↓
┌─────────────────┬──────────────────┐
│   Frontend      │    Backend       │
│   (React App)   │    (Go Server)   │
│   Port 3000     │    Port 8080     │
└─────────────────┴──────────────────┘
         │                  │
         └──────────────────┘
                   ↓
         PostgreSQL Database
              Port 5432
```

**What each piece does:**

- **Domain (omninudge.com)**: Your website address
- **VPS**: A remote computer that runs 24/7
- **Nginx**: Directs traffic and handles HTTPS
- **Frontend**: Your React app (what users see)
- **Backend**: Your Go server (handles logic, data)
- **PostgreSQL**: Stores all your data (users, posts, messages)

---

## Step 1: VPS Setup {#step-1-vps-setup}

### Choose a VPS Provider

I recommend **Hetzner** for best price/performance:

| Provider | Price/Month | RAM | CPU | Storage |
|----------|-------------|-----|-----|---------|
| **Hetzner CPX21** | €5.83 (~$6) | 4GB | 3 vCPU | 80GB SSD |
| DigitalOcean | $12 | 2GB | 1 vCPU | 50GB SSD |
| Linode | $12 | 4GB | 2 vCPU | 80GB SSD |

**Best Choice:** Hetzner CPX21 (€5.83/month)

### Create Your Server

1. **Sign up at Hetzner Cloud**: https://console.hetzner.cloud/
2. **Create a new project** called "OmniNudge"
3. **Click "Add Server"**
4. **Choose:**
   - Location: Closest to your target users (e.g., US East, EU)
   - Image: **Ubuntu 22.04 LTS**
   - Type: **CPX21** (4GB RAM)
   - SSH Key: We'll set this up now

### Set Up SSH Key (Mac/Linux)

SSH keys let you securely connect to your server without passwords.

**On your local Mac:**

```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "your-email@example.com"

# Press Enter 3 times (default location, no passphrase for simplicity)

# Copy your public key
cat ~/.ssh/id_ed25519.pub
```

**Copy the output** (starts with `ssh-ed25519 AAAA...`)

**In Hetzner dashboard:**
1. Go to "SSH Keys" section
2. Click "Add SSH Key"
3. Paste your public key
4. Name it "My Mac"
5. Click "Add SSH Key"

### Create the Server

1. Select your SSH key
2. Name the server: `omninudge-prod`
3. Click "Create & Buy now"

**Wait 1-2 minutes.** You'll see an IP address like `159.89.123.45`

### Connect to Your Server

```bash
# Replace with YOUR server's IP address
ssh root@YOUR_SERVER_IP

# First time, type 'yes' to accept fingerprint
```

**You're now inside your server!** 🎉

---

## Step 2: Domain Setup {#step-2-domain-setup}

You need to point omninudge.com to your server's IP address.

### Get Your Server IP

```bash
# On your server, run:
curl ifconfig.me

# This shows your public IP (like 159.89.123.45)
```

### Configure DNS on Cloudflare

Since you bought your domain on Cloudflare, DNS setup is easier and faster!

1. **Log in to Cloudflare:** https://dash.cloudflare.com/
2. **Click on "omninudge.com"** in your domains list
3. **Click "DNS" in the left sidebar**

4. **Add these DNS records:**

Click "Add record" for each:

| Type | Name | Content (IPv4 address) | Proxy status | TTL |
|------|------|------------------------|--------------|-----|
| A | @ | YOUR_SERVER_IP | DNS only (gray cloud) | Auto |
| A | www | YOUR_SERVER_IP | DNS only (gray cloud) | Auto |

**IMPORTANT:** Click the orange cloud to turn it **gray** (DNS only). This is required for SSL to work properly.

**Example:**
```
Type: A
Name: @
Content: 159.89.123.45
Proxy status: DNS only (gray cloud icon)
TTL: Auto
```

```
Type: A
Name: www
Content: 159.89.123.45
Proxy status: DNS only (gray cloud icon)
TTL: Auto
```

**What this does:**
- `omninudge.com` → Your server (direct connection)
- `www.omninudge.com` → Your server (direct connection)

**Why "DNS only" (gray cloud)?**
- Cloudflare proxy (orange cloud) conflicts with Let's Encrypt SSL
- Use gray cloud for initial setup
- Can enable Cloudflare proxy later if needed

**Wait 2-10 minutes** for DNS to propagate (Cloudflare is fast!).

**Check if it's working:**
```bash
# On your local Mac:
ping omninudge.com

# Should show your server's IP address

# Also check:
nslookup omninudge.com
# Should show your server IP
```

**Cloudflare Benefits:**
- ✅ Fast DNS propagation (minutes, not hours)
- ✅ Free DDoS protection
- ✅ Free analytics
- ✅ Can enable CDN later (turn cloud orange after SSL setup)

---

## Step 3: Software Installation {#step-3-software-installation}

Now we install everything your app needs.

### Update System

```bash
# On your server:
apt update && apt upgrade -y
```

### Install Go (Backend Language)

```bash
# Download Go 1.21
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz

# Extract to /usr/local
rm -rf /usr/local/go && tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz

# Add to PATH
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# Verify
go version
# Should show: go version go1.21.5 linux/amd64
```

### Install Node.js (Frontend Build Tool)

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify
node -v  # Should show v20.x.x
npm -v   # Should show 10.x.x
```

### Install PostgreSQL (Database)

```bash
# Install PostgreSQL 15
apt install -y postgresql postgresql-contrib

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Verify
systemctl status postgresql
# Should show "active (running)"
```

### Install Nginx (Web Server)

```bash
apt install -y nginx

# Start Nginx
systemctl start nginx
systemctl enable nginx

# Verify
systemctl status nginx
# Should show "active (running)"
```

### Install Certbot (SSL Certificates)

```bash
apt install -y certbot python3-certbot-nginx
```

---

## Step 4: Database Setup {#step-4-database-setup}

### Create PostgreSQL Database

```bash
# Switch to postgres user
sudo -u postgres psql

# Inside PostgreSQL shell:
CREATE DATABASE omninudge;
CREATE USER omninudge_user WITH PASSWORD 'CHOOSE_A_STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE omninudge TO omninudge_user;

# Exit PostgreSQL
\q
```

**⚠️ IMPORTANT:** Replace `CHOOSE_A_STRONG_PASSWORD_HERE` with a real password!

**Generate a strong password:**
```bash
# On your server:
openssl rand -base64 32
```

Copy this password somewhere safe (you'll need it later).

### Test Database Connection

```bash
# Connect as your new user
psql -U omninudge_user -d omninudge -h localhost

# Should prompt for password, then show:
# omninudge=>

# Exit
\q
```

### Create Database Tables

We'll run your migrations after deploying the backend (Step 5).

---

## Step 5: Backend Deployment {#step-5-backend-deployment}

### Create Application Directory

```bash
mkdir -p /var/www/omninudge
cd /var/www/omninudge
```

### Upload Your Code

**Option A: Using Git (Recommended)**

```bash
# On your server:
apt install -y git

# Clone your repository
git clone https://github.com/YOUR_USERNAME/OmniNudge.git
cd OmniNudge
```

**Option B: Upload via SCP**

```bash
# On your local Mac:
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# Upload to server (replace YOUR_SERVER_IP)
scp -r . root@YOUR_SERVER_IP:/var/www/omninudge/
```

### Create Environment File

```bash
# On your server:
cd /var/www/omninudge/backend

# Create .env file
nano .env
```

**Paste this (replace ALL_CAPS values):**

```bash
# Server Configuration
GIN_MODE=release
SERVER_PORT=8080
SERVER_HOST=0.0.0.0
ALLOWED_ORIGINS=https://omninudge.com,https://www.omninudge.com

# Database
DATABASE_URL=postgres://omninudge_user:YOUR_DB_PASSWORD@localhost:5432/omninudge?sslmode=disable

# Security
JWT_SECRET=YOUR_JWT_SECRET_HERE

# File Storage
UPLOAD_DIR=/var/www/omninudge/uploads
MAX_UPLOAD_SIZE=26214400

# Redis (optional for now)
REDIS_URL=redis://localhost:6379
```

**Generate JWT secret:**
```bash
openssl rand -base64 64
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

### Build Backend

```bash
cd /var/www/omninudge/backend

# Download dependencies
go mod download

# Build
go build -o omninudge-server ./cmd/server

# Verify
ls -lh omninudge-server
# Should show a file ~20-40MB
```

### Run Database Migrations

```bash
# If you have a migrations tool:
# go run ./cmd/migrate up

# Or manually run your SQL files:
psql -U omninudge_user -d omninudge -h localhost < migrations/001_initial_schema.sql
```

### Create Upload Directory

```bash
mkdir -p /var/www/omninudge/uploads
chmod 755 /var/www/omninudge/uploads
```

### Create Systemd Service

This keeps your backend running 24/7.

```bash
nano /etc/systemd/system/omninudge-backend.service
```

**Paste:**

```ini
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

# Environment
Environment="GIN_MODE=release"
EnvironmentFile=/var/www/omninudge/backend/.env

[Install]
WantedBy=multi-user.target
```

**Save and exit:** `Ctrl+X`, `Y`, `Enter`

### Start Backend

```bash
# Reload systemd
systemctl daemon-reload

# Start backend
systemctl start omninudge-backend

# Enable on boot
systemctl enable omninudge-backend

# Check status
systemctl status omninudge-backend
# Should show "active (running)"

# View logs
journalctl -u omninudge-backend -f
# Press Ctrl+C to exit logs
```

### Test Backend

```bash
# On your server:
curl http://localhost:8080/api/v1/health

# Should return: {"status":"ok"}
```

---

## Step 6: Frontend Deployment {#step-6-frontend-deployment}

### Update Frontend Environment

```bash
cd /var/www/omninudge/frontend

# Create production .env
nano .env.production
```

**Paste:**

```bash
VITE_API_URL=https://omninudge.com/api
VITE_WS_URL=wss://omninudge.com/ws
```

**Save and exit:** `Ctrl+X`, `Y`, `Enter`

### Build Frontend

```bash
cd /var/www/omninudge/frontend

# Install dependencies
npm install

# Build for production
npm run build

# Verify build
ls -lh dist/
# Should show files: index.html, assets/, etc.
```

---

## Step 7: Nginx Setup {#step-7-nginx-setup}

Nginx routes traffic to your frontend and backend.

### Create Nginx Configuration

```bash
nano /etc/nginx/sites-available/omninudge
```

**Paste:**

```nginx
# Redirect www to non-www
server {
    listen 80;
    server_name www.omninudge.com;
    return 301 https://omninudge.com$request_uri;
}

# Main server block
server {
    listen 80;
    server_name omninudge.com;

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
```

**Save and exit:** `Ctrl+X`, `Y`, `Enter`

### Enable Site

```bash
# Create symlink
ln -s /etc/nginx/sites-available/omninudge /etc/nginx/sites-enabled/

# Remove default site
rm /etc/nginx/sites-enabled/default

# Test configuration
nginx -t
# Should show: "syntax is ok" and "test is successful"

# Restart Nginx
systemctl restart nginx
```

### Test Website

```bash
# On your local Mac:
curl http://omninudge.com

# Should return HTML from your React app
```

**Open in browser:** http://omninudge.com (Not HTTPS yet!)

---

## Step 8: SSL Setup {#step-8-ssl-setup}

Let's Encrypt gives you free SSL certificates for HTTPS.

### Get SSL Certificate

```bash
# On your server:
certbot --nginx -d omninudge.com -d www.omninudge.com

# Follow prompts:
# - Enter your email
# - Agree to terms (Y)
# - Share email with EFF? (Your choice)
# - Redirect HTTP to HTTPS? Choose 2 (Yes)
```

**This automatically:**
1. Gets SSL certificate
2. Updates Nginx config
3. Sets up HTTPS redirect
4. Configures auto-renewal

### Verify HTTPS

**Open in browser:** https://omninudge.com

You should see:
- 🔒 Green padlock in address bar
- Your website loads
- No SSL warnings

### (Optional) Enable Cloudflare Proxy

Now that SSL is working, you can optionally enable Cloudflare's proxy for extra protection:

1. **Go to Cloudflare Dashboard:** https://dash.cloudflare.com/
2. **Click "omninudge.com"** → **"DNS"**
3. **For each A record**, click the **gray cloud** to turn it **orange**
4. **In Cloudflare, go to "SSL/TLS"** → Set mode to **"Full (strict)"**
5. **Wait 5 minutes**, test your site again

**Benefits of orange cloud (proxied):**
- ✅ DDoS protection
- ✅ CDN (faster loading worldwide)
- ✅ Hides your real server IP
- ✅ Web Application Firewall (WAF)

**Important Configuration for Orange Cloud:**

If you enable the proxy, you need to configure WebSockets:

```bash
# On your server, edit Nginx config
nano /etc/nginx/sites-available/omninudge

# Add this at the top, inside the server block:
# Set real IP from Cloudflare
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2c0f:f248::/32;
set_real_ip_from 2a06:98c0::/29;
real_ip_header CF-Connecting-IP;

# Then reload Nginx:
nginx -t
systemctl reload nginx
```

**Recommendation:** Start with **gray cloud** (DNS only). Enable orange cloud later if you need extra protection or global CDN.

### Test Auto-Renewal

```bash
# Dry run renewal
certbot renew --dry-run

# Should show: "Congratulations, all simulated renewals succeeded"
```

Certbot automatically renews certificates before they expire.

---

## Step 9: Backups {#step-9-backups}

### Create Backup Script

```bash
nano /root/backup-omninudge.sh
```

**Paste:**

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="omninudge"
DB_USER="omninudge_user"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/omninudge/uploads

# Delete backups older than 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
```

**Save and exit:** `Ctrl+X`, `Y`, `Enter`

**Make executable:**
```bash
chmod +x /root/backup-omninudge.sh
```

### Schedule Daily Backups

```bash
# Edit crontab
crontab -e

# Choose editor (nano = 1)
# Add this line at the end:
0 2 * * * /root/backup-omninudge.sh >> /var/log/omninudge-backup.log 2>&1
```

This runs backup daily at 2 AM.

**Save and exit:** `Ctrl+X`, `Y`, `Enter`

### Test Backup

```bash
/root/backup-omninudge.sh

# Check backups
ls -lh /root/backups/
```

---

## Step 10: Launch Checklist {#step-10-launch}

### Pre-Launch Security Checklist

```bash
# 1. Firewall setup
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable

# 2. Disable PostgreSQL external access
nano /etc/postgresql/*/main/postgresql.conf
# Find: listen_addresses = '*'
# Change to: listen_addresses = 'localhost'
systemctl restart postgresql

# 3. Set strong passwords
# Already done in Step 4

# 4. Keep system updated
apt update && apt upgrade -y
```

### Performance Checklist

```bash
# 1. Check backend is running
systemctl status omninudge-backend

# 2. Check Nginx is running
systemctl status nginx

# 3. Check SSL certificate
certbot certificates

# 4. Test website speed
curl -w "\nTime: %{time_total}s\n" https://omninudge.com
# Should be under 3 seconds
```

### Final Tests

**On your local computer:**

1. ✅ **Visit https://omninudge.com** - Should load
2. ✅ **Register a new account** - Should work
3. ✅ **Login** - Should work
4. ✅ **Create a post** - Should work
5. ✅ **Upload an image** - Should work
6. ✅ **Send a message** - Should work
7. ✅ **Browse Reddit posts** - Should work

### You're Live! 🎉

Your website is now:
- ✅ Accessible at https://omninudge.com
- ✅ Secured with HTTPS
- ✅ Database backed up daily
- ✅ Running 24/7

---

## Troubleshooting {#troubleshooting}

### Website Not Loading

```bash
# Check Nginx status
systemctl status nginx

# Check Nginx logs
tail -f /var/log/nginx/error.log

# Restart Nginx
systemctl restart nginx
```

### Backend Not Working

```bash
# Check backend status
systemctl status omninudge-backend

# View backend logs
journalctl -u omninudge-backend -n 100 --no-pager

# Restart backend
systemctl restart omninudge-backend
```

### Database Connection Error

```bash
# Check PostgreSQL is running
systemctl status postgresql

# Test connection
psql -U omninudge_user -d omninudge -h localhost

# Verify DATABASE_URL in .env
cat /var/www/omninudge/backend/.env | grep DATABASE_URL
```

### SSL Certificate Issues

```bash
# Check certificate status
certbot certificates

# Renew manually
certbot renew --force-renewal

# Check Nginx HTTPS config
nginx -t
```

### 502 Bad Gateway

```bash
# Backend probably crashed
systemctl status omninudge-backend
journalctl -u omninudge-backend -n 50

# Restart backend
systemctl restart omninudge-backend
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Find large files
du -h /var/www/omninudge | sort -rh | head -20

# Clean old logs
journalctl --vacuum-time=7d
```

---

## Monitoring & Maintenance

### Daily Health Checks

```bash
# Check all services
systemctl status nginx
systemctl status omninudge-backend
systemctl status postgresql

# Check disk space
df -h

# Check memory
free -h
```

### Weekly Tasks

1. Check backup files: `ls -lh /root/backups/`
2. Review logs for errors: `journalctl -u omninudge-backend --since "1 week ago"`
3. Update system: `apt update && apt upgrade -y`

### Monthly Tasks

1. Review database size: `psql -U omninudge_user -d omninudge -c "SELECT pg_size_pretty(pg_database_size('omninudge'));"`
2. Test backup restoration
3. Check SSL expiry: `certbot certificates`

---

## Next Steps

### After Launch

1. **Monitor for 24 hours** - Watch for errors, performance issues
2. **Invite beta users** - Start with 5-10 people you know
3. **Set up error tracking** - Consider Sentry.io (free tier)
4. **Set up uptime monitoring** - UptimeRobot.com (free)
5. **Create admin account** - Make yourself an admin user

### Scaling (When Needed)

When you reach 100+ concurrent users:

1. **Upgrade VPS** - More RAM and CPU
2. **Add Redis** - For session caching
3. **CDN** - CloudFlare for static assets
4. **Separate database server** - Move PostgreSQL to dedicated server
5. **Load balancer** - Multiple backend instances

---

## Emergency Contacts

**If something breaks:**

1. **Check logs first:** `journalctl -u omninudge-backend -n 100`
2. **Restart services:** `systemctl restart omninudge-backend nginx`
3. **Restore from backup** (if database corrupted)
4. **Contact your VPS provider** (if server unreachable)

---

## Congratulations! 🚀

You've deployed a production web application with:
- ✅ Custom domain
- ✅ HTTPS encryption
- ✅ Database
- ✅ Automated backups
- ✅ 24/7 uptime

**You're now a DevOps engineer!**

Keep this guide handy for future deployments and troubleshooting.
