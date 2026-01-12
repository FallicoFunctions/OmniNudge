# Quick Deploy Guide - Get OmniNudge Live in 2 Hours

**TL;DR:** Automated scripts to deploy omninudge.com with minimal manual work.

---

## What You Need

- ✅ Domain purchased: **omninudge.com**
- ⏱️ 2 hours of time
- 💳 VPS account (Hetzner recommended: €5.83/month)
- 💻 Your Mac with this codebase

---

## Option 1: Fully Automated (Recommended)

### Step 1: Create VPS Server (10 minutes)

**1.1. Sign up at Hetzner**
- Go to: https://console.hetzner.cloud/
- Create account

**1.2. Create project**
- Click "New Project"
- Name: `OmniNudge`
- Click "Create Project"

**1.3. Add SSH key**
On your Mac terminal:
```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "your-email@example.com"
# Press Enter 3 times to accept defaults

# Copy your public key
cat ~/.ssh/id_ed25519.pub
```
- In Hetzner, click "Security" → "SSH Keys" → "Add SSH Key"
- Paste the output from above
- Name: `mac-ssh-key`

**1.4. Create server (CPX21)**
- Click "Add Server"
- **Location:** Ashburn, VA (US East) or Falkenstein, Germany (EU)
- **Image:** Ubuntu 22.04
- **Type:** Shared vCPU → **CPX21** (4GB RAM, 3 vCPU, €5.83/month)
- **SSH keys:** Check your key from step 1.3
- **Name:** `omninudge-prod`
- Click "Create & Buy Now"

**1.5. Get server IP**
- Wait ~60 seconds for server to provision
- Copy the **IPv4 address** (e.g., `159.89.123.45`)
- **Save this IP** - you'll need it multiple times!

### Step 2: Point Domain to Server on Cloudflare (5 minutes)

1. **Log in to Cloudflare:** https://dash.cloudflare.com/
2. **Click "omninudge.com"** → **"DNS"** (left sidebar)
3. **Add these DNS records** (click "Add record"):

**First record:**
```
Type: A
Name: @
Content: YOUR_SERVER_IP
Proxy status: DNS only (click to turn cloud GRAY)
TTL: Auto
```

**Second record:**
```
Type: A
Name: www
Content: YOUR_SERVER_IP
Proxy status: DNS only (click to turn cloud GRAY)
TTL: Auto
```

**⚠️ IMPORTANT:** Make sure the cloud icon is **GRAY**, not orange! This is required for SSL setup.

Replace `YOUR_SERVER_IP` with your actual server IP (e.g., `159.89.123.45`).

**Wait 2-10 minutes** for DNS to propagate (Cloudflare is fast! ⚡).

**Test:** `ping omninudge.com` should show your server IP.

### Step 3: Consolidate Database Migrations (5 minutes)

Before deploying, consolidate your 48 development migrations into one production schema:

**On your Mac:**

```bash
# 1. Navigate to project
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# 2. Make consolidation script executable
chmod +x scripts/consolidate-migrations.sh

# 3. Run consolidation
bash scripts/consolidate-migrations.sh

# Follow prompts:
# - Database name: omninudge (or press Enter)
# - Database user: (press Enter for default)
# - Confirm: y
```

This creates one clean migration file instead of running 48 migrations. See [docs/MIGRATION_CONSOLIDATION.md](docs/MIGRATION_CONSOLIDATION.md) for details.

### Step 4: Run Automated Deployment (90 minutes)

**On your Mac:**

```bash
# 1. Navigate to project (if not already there)
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# 2. Upload scripts to server (replace YOUR_SERVER_IP)
scp scripts/deploy-*.sh root@YOUR_SERVER_IP:/root/

# 3. Upload code to server
rsync -avz --exclude 'node_modules' --exclude '.git' \
  . root@YOUR_SERVER_IP:/var/www/omninudge/

# 4. SSH into server
ssh root@YOUR_SERVER_IP
```

**On your server:**

```bash
# Step A: Install all software (5 minutes)
cd /root
bash deploy-setup.sh

# Step B: Set up database (2 minutes)
bash deploy-database.sh
# ⚠️ SAVE the credentials that appear!

# Step C: Deploy app (15 minutes)
bash deploy-app.sh
# Enter your domain: omninudge.com
# Enter your email for SSL

# Done! 🎉
```

### Step 5: Test Your Site (5 minutes)

**Visit:** https://omninudge.com

You should see:
- ✅ Your React app loads
- ✅ Green padlock (HTTPS working)
- ✅ Can register an account
- ✅ Can create a post

---

## Option 2: Manual Step-by-Step

If you prefer to understand each step, follow the detailed guide:

📖 **[Full Beginner Deployment Guide](docs/BEGINNER_DEPLOYMENT_GUIDE.md)**

This explains every command and why it's needed.

---

## Post-Deployment Checklist

### Verify Everything Works

```bash
# On your server:
systemctl status omninudge-backend  # Should be "active (running)"
systemctl status nginx              # Should be "active (running)"
systemctl status postgresql         # Should be "active (running)"

# Check SSL certificate
certbot certificates  # Should show omninudge.com

# Check backups
ls -lh /root/backups/  # Should have database and upload backups
```

### Create Your Admin Account

1. Visit https://omninudge.com
2. Register with your email
3. **On server**, make yourself admin:
   ```bash
   psql -U omninudge_user -d omninudge

   UPDATE users SET role = 'admin' WHERE username = 'YOUR_USERNAME';
   \q
   ```

### Monitor Your App

```bash
# View live backend logs
journalctl -u omninudge-backend -f

# Press Ctrl+C to exit
```

---

## Common Issues & Fixes

### "502 Bad Gateway"

Backend crashed. Restart it:

```bash
systemctl restart omninudge-backend
journalctl -u omninudge-backend -n 50  # See what went wrong
```

### "Site not loading"

Check Nginx:

```bash
systemctl status nginx
nginx -t  # Test config
systemctl restart nginx
```

### "Database connection error"

Check PostgreSQL:

```bash
systemctl status postgresql
systemctl restart postgresql
```

### "SSL certificate error"

Re-run certbot:

```bash
certbot --nginx -d omninudge.com -d www.omninudge.com --force-renewal
```

---

## Daily Operations

### View Backend Logs

```bash
ssh root@YOUR_SERVER_IP
journalctl -u omninudge-backend -f
```

### Restart Backend

```bash
ssh root@YOUR_SERVER_IP
systemctl restart omninudge-backend
```

### Deploy Updates

```bash
# On your Mac:
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# Upload new code
rsync -avz --exclude 'node_modules' --exclude '.git' \
  . root@YOUR_SERVER_IP:/var/www/omninudge/

# On server:
ssh root@YOUR_SERVER_IP
cd /var/www/omninudge

# Rebuild and restart
cd backend
go build -o omninudge-server ./cmd/server
systemctl restart omninudge-backend

cd ../frontend
npm run build
systemctl reload nginx
```

### Check Disk Space

```bash
df -h  # Should have plenty of space left
```

### Manual Backup

```bash
/root/backup-omninudge.sh
ls -lh /root/backups/
```

---

## Scaling Tips

### When You Reach 100+ Users

1. **Upgrade VPS:**
   - Hetzner CPX31: 8GB RAM, €11.90/month
   - Or CPX41: 16GB RAM, €23.90/month

2. **Add Redis** for caching:
   ```bash
   apt install redis-server
   systemctl enable redis-server
   ```

3. **Add monitoring:**
   - UptimeRobot.com (free) - alerts if site goes down
   - Sentry.io (free tier) - error tracking

### When You Reach 1000+ Users

1. **Separate database server**
2. **Add CDN** (CloudFlare - free)
3. **Multiple backend instances** with load balancer
4. **Object storage** for uploads (S3/R2)

---

## Security Checklist

**Before announcing your launch:**

- ✅ HTTPS enabled (green padlock)
- ✅ Firewall configured (only ports 22, 80, 443 open)
- ✅ PostgreSQL only accepts local connections
- ✅ Strong passwords for database
- ✅ JWT secret is 64+ characters
- ✅ Backups running daily
- ✅ System updates installed
- ✅ Admin account created (not "admin" username)

**Check firewall:**
```bash
ufw status  # Should show 22, 80, 443 allowed
```

**Check PostgreSQL security:**
```bash
cat /etc/postgresql/*/main/postgresql.conf | grep listen_addresses
# Should show: listen_addresses = 'localhost'
```

---

## Emergency Procedures

### Site is Down - Quick Recovery

```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Restart everything
systemctl restart omninudge-backend
systemctl restart nginx
systemctl restart postgresql

# Check what broke
journalctl -u omninudge-backend -n 100 --no-pager
```

### Restore from Backup

```bash
# List backups
ls -lh /root/backups/

# Restore database (replace DATE with actual date)
gunzip < /root/backups/db_DATE.sql.gz | psql -U omninudge_user -d omninudge

# Restore uploads
tar -xzf /root/backups/uploads_DATE.tar.gz -C /
```

### Server Completely Unresponsive

1. Log in to Hetzner Cloud Console
2. Access server via web console
3. Reboot server
4. Wait 2 minutes, try SSH again

---

## Cost Breakdown

**Monthly costs for first 100-500 users:**

- VPS (Hetzner CPX21): €5.83 (~$6.50)
- Domain: $1/month (already purchased)
- **Total: ~$7.50/month**

**That's it!** Everything else is free:
- SSL certificate (Let's Encrypt): Free
- Database (PostgreSQL): Included in VPS
- Backups: Stored on same VPS
- Nginx: Free

---

## Support Resources

### Documentation

- Full deployment guide: [docs/BEGINNER_DEPLOYMENT_GUIDE.md](docs/BEGINNER_DEPLOYMENT_GUIDE.md)
- Backend API docs: [backend/docs/API.md](backend/docs/API.md)
- Database schema: [docs/technical/database-schema.md](docs/technical/database-schema.md)

### Learning Resources

- **Nginx basics:** https://nginx.org/en/docs/beginners_guide.html
- **PostgreSQL tutorial:** https://www.postgresqltutorial.com/
- **Systemd services:** https://www.digitalocean.com/community/tutorials/how-to-use-systemctl-to-manage-systemd-services-and-units
- **Let's Encrypt:** https://letsencrypt.org/getting-started/

### When You're Stuck

1. **Check logs first:** `journalctl -u omninudge-backend -n 100`
2. **Google the error message**
3. **Restart services:** `systemctl restart omninudge-backend nginx`
4. **Ask ChatGPT/Claude** with your error logs

---

## Congratulations! 🎉

You now have a production web application running with:

- ✅ Custom domain (omninudge.com)
- ✅ HTTPS encryption
- ✅ Database with backups
- ✅ 24/7 uptime
- ✅ Professional infrastructure

**You're officially a full-stack developer AND a DevOps engineer!**

Welcome to production! 🚀
