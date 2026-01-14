#!/bin/bash
# Setup script for Reddit proxy configuration

set -e

echo "================================"
echo "Reddit Proxy Setup"
echo "================================"
echo ""

# Check if running on server
if [ ! -f /var/www/omninudge/backend/.env ]; then
    echo "❌ Error: This script must be run on the production server"
    echo "Run this after deploying the app"
    exit 1
fi

echo "This script will configure your backend to use a Cloudflare Worker for Reddit API requests."
echo ""
echo "Before running this script, make sure you've:"
echo "1. Created a Cloudflare Worker named 'reddit-proxy'"
echo "2. Deployed the worker code from cloudflare-worker-reddit-proxy.js"
echo "3. Noted your worker URL (e.g., https://reddit-proxy.YOUR-SUBDOMAIN.workers.dev)"
echo ""

read -p "Have you completed these steps? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Please complete the setup steps first. See docs/CLOUDFLARE_WORKER_SETUP.md for details."
    exit 1
fi

echo ""
read -p "Enter your Cloudflare Worker URL: " WORKER_URL

if [ -z "$WORKER_URL" ]; then
    echo "❌ Worker URL is required"
    exit 1
fi

# Validate URL format
if [[ ! $WORKER_URL =~ ^https:// ]]; then
    echo "❌ Worker URL must start with https://"
    exit 1
fi

# Check if already configured
if grep -q "REDDIT_PROXY_URL" /var/www/omninudge/backend/.env; then
    echo ""
    echo "⚠️  REDDIT_PROXY_URL is already configured in .env"
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Update existing line
        sed -i "s|REDDIT_PROXY_URL=.*|REDDIT_PROXY_URL=$WORKER_URL|" /var/www/omninudge/backend/.env
        echo "✓ Updated REDDIT_PROXY_URL in backend .env"
    else
        echo "Skipping .env update"
    fi
else
    # Add new line
    echo "" >> /var/www/omninudge/backend/.env
    echo "# Reddit Proxy (Cloudflare Worker)" >> /var/www/omninudge/backend/.env
    echo "REDDIT_PROXY_URL=$WORKER_URL" >> /var/www/omninudge/backend/.env
    echo "✓ Added REDDIT_PROXY_URL to backend .env"
fi

echo ""
echo "Restarting backend service..."
systemctl restart omninudge-backend
sleep 3

echo ""
echo "Testing Reddit feed..."
RESPONSE=$(curl -s "http://localhost:8080/api/v1/feed/home?sort=hot&limit=5")

# Check if we got posts
if echo "$RESPONSE" | grep -q '"total":0'; then
    echo "⚠️  Warning: Feed returned 0 posts"
    echo "Response: $RESPONSE"
    echo ""
    echo "Check backend logs for errors:"
    echo "  journalctl -u omninudge-backend -n 50 --no-pager"
else
    echo "✓ Reddit feed is working!"
    echo ""
fi

echo ""
echo "================================"
echo "Setup complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Visit https://omninudge.com and check if Reddit posts appear"
echo "2. Monitor Cloudflare Worker metrics in the dashboard"
echo "3. Check backend logs: journalctl -u omninudge-backend -f"
echo ""
