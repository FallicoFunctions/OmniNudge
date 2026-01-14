# Reddit Proxy Quick Start - Fix "No Posts" Issue

Your site shows no Reddit posts because Reddit blocks datacenter IPs. This guide fixes that in 10 minutes using a free Cloudflare Worker.

## What You'll Do

Create a Cloudflare Worker that proxies Reddit API requests, bypassing IP blocking.

## Step 1: Create Cloudflare Worker (5 minutes)

1. **Go to Cloudflare Dashboard**
   - Visit: https://dash.cloudflare.com/
   - Click **"Workers & Pages"** (left sidebar)

2. **Create Worker**
   - Click **"Create application"**
   - Click **"Create Worker"**
   - Name: `reddit-proxy`
   - Click **"Deploy"**

3. **Edit Worker Code**
   - Click **"Edit code"** button
   - **Delete all the default code** (select all and delete)
   - Open `cloudflare-worker-reddit-proxy.js` from your project
   - **Copy all the code** and paste into the worker editor
   - Click **"Save and Deploy"**

4. **Copy Your Worker URL**
   - You'll see: `https://reddit-proxy.YOUR-SUBDOMAIN.workers.dev`
   - **Copy this URL** - you need it for Step 2

## Step 2: Deploy Updated Code (5 minutes)

**On your Mac terminal:**

```bash
# Navigate to project
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# Upload updated code to server
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.gocache' --exclude 'dist' --exclude 'build' \
  backend/internal/services/reddit.go scripts/setup-reddit-proxy.sh \
  root@77.42.47.79:/var/www/omninudge/

# Copy setup script to /root
scp scripts/setup-reddit-proxy.sh root@77.42.47.79:/root/

# SSH into server
ssh root@77.42.47.79
```

**On your server:**

```bash
# Run the setup script
bash /root/setup-reddit-proxy.sh

# When prompted:
# 1. Type 'y' to confirm you've created the worker
# 2. Paste your worker URL (from Step 1)
# 3. Wait for backend to restart

# The script will test the feed automatically
```

## Step 3: Verify It Works

1. **Visit your site:**
   - Go to: https://omninudge.com
   - You should now see Reddit posts from r/popular!

2. **If still no posts**, check backend logs:
   ```bash
   journalctl -u omninudge-backend -n 50 --no-pager | grep -i reddit
   ```

## Troubleshooting

### Still getting "No posts available"

**Check 1: Verify worker URL is set**
```bash
ssh root@77.42.47.79
cat /var/www/omninudge/backend/.env | grep REDDIT_PROXY
```
Should show: `REDDIT_PROXY_URL=https://reddit-proxy.YOUR-SUBDOMAIN.workers.dev`

**Check 2: Rebuild backend**
```bash
ssh root@77.42.47.79
cd /var/www/omninudge/backend
export PATH=$PATH:/usr/local/go/bin
go build -o omninudge-server ./cmd/server
systemctl restart omninudge-backend
```

**Check 3: Test worker directly**
```bash
curl -s "https://reddit-proxy.YOUR-SUBDOMAIN.workers.dev/r/popular/hot.json?limit=1" | head -c 200
```
Should return JSON starting with `{"kind":"Listing"`

### Worker returns HTML instead of JSON

This means Reddit is also blocking Cloudflare Worker IPs (rare). Solutions:

1. **Add custom domain to worker** (recommended):
   - In Cloudflare Workers dashboard → Triggers → Add Custom Domain
   - Use: `reddit-api.omninudge.com`
   - Update `REDDIT_PROXY_URL` to use the custom domain

2. **Wait and retry** - sometimes temporary

3. **Contact Cloudflare support** about Reddit blocking

## Cost

- **Free tier**: 100,000 requests/day (plenty for most sites)
- **Paid tier**: $5/month for 10 million requests (if needed)

## What Just Happened?

Before:
```
Your Server (IP: 77.42.47.79) → Reddit API → ❌ 403 Forbidden
```

After:
```
Your Server → Cloudflare Worker → Reddit API → ✅ 200 OK with posts
```

Reddit sees Cloudflare's IPs (not blocked) instead of your datacenter IP.

## Next Steps

After Reddit posts are working:

1. **Create your first hub** on the site
2. **Make a post** to test OmniNudge features
3. **Create admin account**:
   ```bash
   ssh root@77.42.47.79
   psql -U omninudge_user -d omninudge
   UPDATE users SET role = 'admin' WHERE username = 'YOUR_USERNAME';
   \q
   ```

Your site is now fully functional! 🎉
