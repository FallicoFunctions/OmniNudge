#!/bin/bash
# OmniNudge Database Setup Script

set -e

echo "================================"
echo "OmniNudge Database Setup"
echo "================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo bash scripts/deploy-database.sh"
    exit 1
fi

echo "This script will create:"
echo "  - Database: omninudge"
echo "  - User: omninudge_user"
echo "  - Random secure password"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Generate random password
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)

echo ""
echo "Creating database and user..."

# Create database and user
sudo -u postgres psql <<EOF
CREATE DATABASE omninudge;
CREATE USER omninudge_user WITH PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE omninudge TO omninudge_user;
ALTER DATABASE omninudge OWNER TO omninudge_user;
EOF

echo "✓ Database created"
echo ""

# Save credentials to file
cat > /root/.omninudge-credentials <<EOF
# OmniNudge Database Credentials
# Generated: $(date)

DATABASE_URL=postgres://omninudge_user:$DB_PASSWORD@localhost:5432/omninudge?sslmode=disable
DB_USER=omninudge_user
DB_PASSWORD=$DB_PASSWORD
DB_NAME=omninudge

# JWT Secret (for backend .env)
JWT_SECRET=$JWT_SECRET
EOF

chmod 600 /root/.omninudge-credentials

echo "================================"
echo "✓ Database setup complete!"
echo "================================"
echo ""
echo "Credentials saved to: /root/.omninudge-credentials"
echo ""
echo "DATABASE_URL:"
echo "postgres://omninudge_user:$DB_PASSWORD@localhost:5432/omninudge?sslmode=disable"
echo ""
echo "JWT_SECRET:"
echo "$JWT_SECRET"
echo ""
echo "⚠️  SAVE THESE CREDENTIALS SECURELY!"
echo ""
echo "Next step: finish initial server bootstrap only if this machine is being provisioned for the first time."
echo "Bootstrap-only path: bash scripts/deploy-app.sh"
echo "Routine production deploys should use: bash scripts/deploy-on.sh"
echo ""
