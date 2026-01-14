# Cloudflare Worker Setup - Reddit API Proxy

This guide shows you how to set up a Cloudflare Worker to proxy Reddit API requests, bypassing IP-based blocking.

## Why This Is Needed

Reddit blocks requests from datacenter IPs (like your Hetzner server). By routing requests through a Cloudflare Worker, Reddit sees Cloudflare's residential IPs instead of your server's IP.

## Setup Steps (10 minutes)

### Step 1: Create Cloudflare Worker

1. **Log in to Cloudflare Dashboard**
   - Go to: https://dash.cloudflare.com/
   - Click on "Workers & Pages" in the left sidebar

2. **Create a new Worker**
   - Click "Create application"
   - Click "Create Worker"
   - Name it: `reddit-proxy`
   - Click "Deploy"

3. **Edit the Worker code**
   - After deployment, click "Edit code"
   - **Delete all the default code**
   - Copy the entire contents of `cloudflare-worker-reddit-proxy.js` from your project
   - Paste it into the worker editor
   - Click "Save and Deploy"

4. **Note your Worker URL**
   - You'll see something like: `https://reddit-proxy.YOUR-SUBDOMAIN.workers.dev`
   - Copy this URL - you'll need it in Step 2

### Step 2: Update Backend to Use Worker

Now we need to update your backend to use the Cloudflare Worker instead of calling Reddit directly.

**On your Mac:**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge
```

Add an environment variable for the Reddit proxy URL. We'll update the backend `.env` file on the server:

```bash
ssh root@77.42.47.79
```

**On your server:**

```bash
# Add the Reddit proxy URL to backend .env
cat >> /var/www/omninudge/backend/.env <<EOF

# Reddit Proxy (Cloudflare Worker)
REDDIT_PROXY_URL=https://reddit-proxy.YOUR-SUBDOMAIN.workers.dev
EOF

# Replace YOUR-SUBDOMAIN with your actual worker URL
nano /var/www/omninudge/backend/.env
# Find the REDDIT_PROXY_URL line and update it with your actual worker URL
```

### Step 3: Update Go Code to Use Proxy

We need to modify the Reddit client to use the proxy URL.

**On your Mac:**

Edit `backend/internal/services/reddit.go` and update the `GetSubredditPosts` function to use the proxy:

Around line 363, change:
```go
// Build URL
url := fmt.Sprintf("https://www.reddit.com/r/%s/%s.json", subreddit, sort)
```

To:
```go
// Build URL - use proxy if configured
baseURL := "https://www.reddit.com"
if proxyURL := os.Getenv("REDDIT_PROXY_URL"); proxyURL != "" {
    baseURL = proxyURL
}
url := fmt.Sprintf("%s/r/%s/%s.json", baseURL, subreddit, sort)
```

You'll also need to add the `os` import at the top if it's not already there:
```go
import (
    "os"
    // ... other imports
)
```

### Step 4: Deploy Updated Code

**On your Mac:**

```bash
# Upload updated code
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.gocache' --exclude 'dist' --exclude 'build' \
  /Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend/internal/services/reddit.go \
  root@77.42.47.79:/var/www/omninudge/backend/internal/services/

# SSH into server
ssh root@77.42.47.79

# Rebuild and restart backend
cd /var/www/omninudge/backend
export PATH=$PATH:/usr/local/go/bin
go build -o omninudge-server ./cmd/server
systemctl restart omninudge-backend

# Test the feed
sleep 3
curl -s "http://localhost:8080/api/v1/feed/home?sort=hot&limit=5" | head -c 200
```

You should now see Reddit posts in the feed!

### Step 5: Verify Everything Works

1. **Check backend logs:**
   ```bash
   journalctl -u omninudge-backend -n 50 --no-pager
   ```
   - You should NOT see "Warning: Failed to fetch Reddit posts" anymore

2. **Visit your site:**
   - Go to: https://omninudge.com
   - You should see Reddit posts from r/popular on the homepage

3. **Check Cloudflare Worker analytics:**
   - Go to Cloudflare Dashboard → Workers & Pages → reddit-proxy
   - Click "Metrics" to see request count
   - You should see requests coming in

## Troubleshooting

### Worker returns 503 "Reddit API returned HTML"

This means Reddit is still blocking the Cloudflare Worker IPs. This is rare but can happen. Solutions:
1. Wait a few minutes and try again
2. Add a custom domain to your worker (makes it look more legitimate)
3. Contact Cloudflare support about Reddit blocking worker IPs

### Worker not found / 404

- Double-check your `REDDIT_PROXY_URL` in the backend `.env` file
- Make sure the worker is deployed (green checkmark in Cloudflare dashboard)

### CORS errors in browser

- Make sure the worker code includes your domain in `allowedOrigins`
- Check browser console for specific CORS error details

### Backend still getting 403 errors

- Check that the environment variable is set: `cat /var/www/omninudge/backend/.env | grep REDDIT_PROXY`
- Verify the Go code changes were applied
- Make sure you rebuilt and restarted the backend

## Cost

Cloudflare Workers free tier includes:
- **100,000 requests per day**
- More than enough for a small-to-medium site

If you exceed this, paid tier is:
- **$5/month for 10 million requests**

## Alternative: Custom Domain for Worker (Optional)

For better reliability, you can add a custom subdomain:

1. In Cloudflare Workers dashboard, click "Triggers"
2. Click "Add Custom Domain"
3. Enter: `reddit-api.omninudge.com`
4. Click "Add Custom Domain"

Then update your `REDDIT_PROXY_URL` to:
```bash
REDDIT_PROXY_URL=https://reddit-api.omninudge.com
```

This makes the worker look more legitimate to Reddit and may have better success rates.

## Monitoring

Keep an eye on:
- Cloudflare Worker request count (dashboard)
- Backend logs for Reddit errors
- Site performance (workers add ~50ms latency)

If the worker approach stops working in the future, you'll need to switch to Reddit's official API with credentials.
