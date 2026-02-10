# OmniNudge Deployment Guide

## Quick Deploy (Recommended)

### Deploy New Code
```bash
deploy-on
```

This script will:
1. ✅ Build frontend locally
2. ✅ Upload frontend to production
3. ✅ Upload backend code to production (excludes .env and binary)
4. ✅ Build backend on server
5. ✅ Restart service
6. ✅ Verify deployment

**Important:** The deployment script excludes `.env` from uploads to protect production credentials.

### If Deployment Fails

To rollback to a previous commit:

```bash
./scripts/rollback.sh
```

Or rollback to a specific commit:
```bash
./scripts/rollback.sh <commit_hash>
```

## Production Environment

### Critical Files on Server

**`.env` file location:** `/var/www/omninudge/backend/.env`

This file must contain:
```bash
DATABASE_URL=postgres://omninudge_user:***@localhost:5432/omninudge?sslmode=disable
DB_HOST=localhost
DB_PORT=5432
DB_USER=omninudge_user
DB_PASSWORD=***
DB_NAME=omninudge
JWT_SECRET=***
DB_AUTO_MIGRATE=false
REDDIT_USER_AGENT=web:com.omninudge:1.0.0 (by /u/omninudge)
REDDIT_PROXY_URL=https://reddit-proxy.nickf2632.workers.dev
TURNSTILE_SECRET_KEY=0x4AAAAAACNKx99chDHhKXNDWgEqDqI1iYY
```

**Note:** The deployment script excludes `.env` from rsync to prevent overwriting production credentials.

## Health Checks

### Check Service Status
```bash
ssh root@77.42.47.79 "systemctl status omninudge-backend"
```

### Check Logs
```bash
ssh root@77.42.47.79 "journalctl -u omninudge-backend -n 50 --no-pager"
```

### Follow Logs (Real-time)
```bash
ssh root@77.42.47.79 "journalctl -u omninudge-backend -f"
```

### Test API Health
```bash
curl https://api.omninudge.com/api/v1/health
```

### Test Frontend
```bash
curl -I https://omninudge.com
```

## Features Currently Deployed

### Cloudflare Turnstile (CAPTCHA)
- Integrated on user registration
- Frontend: Turnstile widget in signup form
- Backend: Token verification via Cloudflare API

### Keep Me Logged In
- Checkbox on login form
- Checked: 30-day JWT token stored in localStorage
- Unchecked: 24-hour JWT token stored in sessionStorage

### Reddit Posts via Cloudflare Worker
- Bypasses Reddit API rate limits
- Proxy URL: `https://reddit-proxy.nickf2632.workers.dev`

## Testing After Deployment

1. **Test Turnstile on Registration:**
   - Go to https://omninudge.com
   - Click "Sign Up"
   - Fill form - Turnstile widget should appear
   - Complete Turnstile
   - Submit form - should create account

2. **Test Keep Me Logged In:**
   - Logout
   - Click "Login"
   - Check "Keep me logged in" checkbox
   - Login successfully
   - Close browser completely
   - Reopen browser - should still be logged in

3. **Test Without Keep Me Logged In:**
   - Logout
   - Login WITHOUT checking box
   - Close browser tab (not whole browser)
   - Reopen tab - should still be logged in (session storage)
   - Close whole browser and reopen - should be logged out

## Troubleshooting

### Service Won't Start
```bash
# Check logs for errors
ssh root@77.42.47.79 "journalctl -u omninudge-backend -n 100 --no-pager"

# Check if port is in use
ssh root@77.42.47.79 "lsof -i :8080"

# Rollback immediately
./scripts/rollback.sh
```

### Builds Fail Locally
```bash
# Backend build issues
cd backend
go mod tidy
go build -o omninudge-server ./cmd/server

# Frontend build issues
cd frontend
npm install
npm run build
```

### Reddit Posts Not Showing
```bash
# Verify proxy URL has https://
ssh root@77.42.47.79 "cat /var/www/omninudge/backend/.env | grep REDDIT"

# Should show:
# REDDIT_PROXY_URL=https://reddit-proxy.nickf2632.workers.dev

# Test Cloudflare Worker directly
curl -s "https://reddit-proxy.nickf2632.workers.dev/r/popular/hot.json?limit=1" | head -c 200
```

### Environment Variables Not Loading
```bash
# Check .env file exists and has correct permissions
ssh root@77.42.47.79 "ls -la /var/www/omninudge/backend/.env"

# Verify systemd service config
ssh root@77.42.47.79 "cat /etc/systemd/system/omninudge-backend.service | grep EnvironmentFile"

# After any systemd service file changes, reload daemon
ssh root@77.42.47.79 "systemctl daemon-reload && systemctl restart omninudge-backend"
```

## Emergency Procedures

### Site is Down
1. **Check service**: `ssh root@77.42.47.79 "systemctl status omninudge-backend"`
2. **Check logs**: `ssh root@77.42.47.79 "journalctl -u omninudge-backend -n 50"`
3. **Rollback**: `./scripts/rollback.sh`
4. **If rollback fails**: Manually restore from backup

### Database Issues
```bash
# Check database connection
ssh root@77.42.47.79 "psql -U omninudge_user -d omninudge -c 'SELECT COUNT(*) FROM users;'"

# Check .env has correct DB credentials
ssh root@77.42.47.79 "cat /var/www/omninudge/backend/.env | grep DB_"
```

### Out of Disk Space
```bash
# Check disk usage
ssh root@77.42.47.79 "df -h"

# Clean old backups
ssh root@77.42.47.79 "cd /var/www/omninudge-backups && ls -t | tail -n +3 | xargs -r rm -rf"

# Clean logs
ssh root@77.42.47.79 "journalctl --vacuum-time=7d"
```
