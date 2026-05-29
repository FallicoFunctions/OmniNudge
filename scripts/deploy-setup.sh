#!/bin/bash
# OmniNudge Server Setup Script
# Run this on your fresh Ubuntu 22.04 server

set -e  # Exit on error

echo "================================"
echo "OmniNudge Server Setup"
echo "================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo bash deploy-setup.sh"
    exit 1
fi

echo "Step 1: Updating system packages..."
apt update
apt upgrade -y

echo ""
echo "Step 2: Installing Go 1.21..."
if ! command -v go &> /dev/null; then
    cd /tmp
    wget -q https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> /root/.bashrc
    export PATH=$PATH:/usr/local/go/bin
    echo "✓ Go installed: $(go version)"
else
    echo "✓ Go already installed: $(go version)"
fi

echo ""
echo "Step 3: Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "✓ Node.js installed: $(node -v)"
else
    echo "✓ Node.js already installed: $(node -v)"
fi

echo ""
echo "Step 4: Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
    echo "✓ PostgreSQL installed"
else
    echo "✓ PostgreSQL already installed"
fi

echo ""
echo "Step 5: Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
    systemctl start nginx
    systemctl enable nginx
    echo "✓ Nginx installed"
else
    echo "✓ Nginx already installed"
fi

echo ""
echo "Step 6: Installing Certbot (SSL)..."
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
    echo "✓ Certbot installed"
else
    echo "✓ Certbot already installed"
fi

echo ""
echo "Step 7: Installing Git..."
if ! command -v git &> /dev/null; then
    apt install -y git
    echo "✓ Git installed"
else
    echo "✓ Git already installed"
fi

echo ""
echo "Step 8: Setting up firewall..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
echo "y" | ufw enable
echo "✓ Firewall configured"

echo ""
echo "Step 9: Creating application directory..."
mkdir -p /var/www/omninudge
echo "✓ Created /var/www/omninudge"

echo ""
echo "================================"
echo "✓ Server setup complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Run: bash scripts/deploy-database.sh (to set up PostgreSQL)"
echo "2. Upload/bootstrap your code into /var/www/omninudge"
echo "3. If this server still needs first-time app provisioning, use the legacy bootstrap script: bash scripts/deploy-app.sh"
echo "4. For routine production deploys after bootstrap, run from your local repo: bash scripts/deploy-on.sh"
echo ""
