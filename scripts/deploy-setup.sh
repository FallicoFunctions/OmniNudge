#!/bin/bash
# OmniNudge Server Setup Script
# Run this on your fresh Ubuntu 22.04 server

set -euo pipefail

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
echo "Step 2: Installing pinned Go and Node.js toolchains..."
apt install -y ca-certificates curl xz-utils

case "$(uname -m)" in
    x86_64)
        GO_ARCH="amd64"
        GO_SHA256="5c2c3b16caefa1d968a94c1daca04a7ca301a496d9b086e17ad77bb81393f053"
        NODE_ARCH="x64"
        NODE_SHA256="9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578"
        ;;
    aarch64|arm64)
        GO_ARCH="arm64"
        GO_SHA256="fe4789e92b1f33358680864bbe8704289e7bb5fc207d80623c308935bd696d49"
        NODE_ARCH="arm64"
        NODE_SHA256="0294e8b915ab75f92c7513d2fcb830ae06e10684e6c603e99a87dbf8835389c1"
        ;;
    *)
        echo "Unsupported architecture: $(uname -m)"
        exit 1
        ;;
esac

GO_VERSION="1.26.5"
GO_ARCHIVE="go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
if ! command -v go >/dev/null 2>&1 || [ "$(go version | awk '{print $3}')" != "go${GO_VERSION}" ]; then
    curl --fail --location --proto '=https' --tlsv1.2 \
        "https://go.dev/dl/${GO_ARCHIVE}" --output "/tmp/${GO_ARCHIVE}"
    echo "${GO_SHA256}  /tmp/${GO_ARCHIVE}" | sha256sum --check --strict
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "/tmp/${GO_ARCHIVE}"
    rm -f "/tmp/${GO_ARCHIVE}"
fi
ln -sfn /usr/local/go/bin/go /usr/local/bin/go
ln -sfn /usr/local/go/bin/gofmt /usr/local/bin/gofmt
echo "✓ Go installed: $(go version)"

NODE_VERSION="22.23.1"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
if ! command -v node >/dev/null 2>&1 || [ "$(node --version)" != "v${NODE_VERSION}" ]; then
    curl --fail --location --proto '=https' --tlsv1.2 \
        "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}" --output "/tmp/${NODE_ARCHIVE}"
    echo "${NODE_SHA256}  /tmp/${NODE_ARCHIVE}" | sha256sum --check --strict
    rm -rf "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
    mkdir -p /usr/local/lib/nodejs
    tar -C /usr/local/lib/nodejs -xJf "/tmp/${NODE_ARCHIVE}"
    rm -f "/tmp/${NODE_ARCHIVE}"
fi
for binary in node npm npx corepack; do
    ln -sfn "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-${NODE_ARCH}/bin/${binary}" "/usr/local/bin/${binary}"
done
echo "✓ Node.js installed: $(node --version)"

echo ""
echo "Step 3: Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
    echo "✓ PostgreSQL installed"
else
    echo "✓ PostgreSQL already installed"
fi

echo ""
echo "Step 4: Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
    systemctl start nginx
    systemctl enable nginx
    echo "✓ Nginx installed"
else
    echo "✓ Nginx already installed"
fi

echo ""
echo "Step 5: Installing Certbot (SSL)..."
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
    echo "✓ Certbot installed"
else
    echo "✓ Certbot already installed"
fi

echo ""
echo "Step 6: Installing Git..."
if ! command -v git &> /dev/null; then
    apt install -y git
    echo "✓ Git installed"
else
    echo "✓ Git already installed"
fi

echo ""
echo "Step 7: Setting up firewall..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
echo "y" | ufw enable
echo "✓ Firewall configured"

echo ""
echo "Step 8: Creating the unprivileged application account and directories..."
if ! id -u omninudge >/dev/null 2>&1; then
    useradd --system --home-dir /var/lib/omninudge --create-home --shell /usr/sbin/nologin omninudge
fi
install -d -o root -g www-data -m 0750 /var/www/omninudge
install -d -o omninudge -g www-data -m 2750 /var/www/omninudge/uploads
echo "✓ Created least-privilege application account and directories"

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
