# Pre-Deployment Checklist

Complete these tasks **before** deploying to production.

---

## ✅ Phase 1: Prepare Your Code

### 1. Consolidate Database Migrations

**Why:** You have 48 development migrations. Consolidate into 1 clean production schema.

**How:**
```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# Make script executable
chmod +x scripts/consolidate-migrations.sh

# Run consolidation
bash scripts/consolidate-migrations.sh
# Enter: omninudge (database name)
# Enter: (press Enter for username)
# Confirm: y
```

**Result:**
- ✅ One file: `backend/internal/database/migrations/001_production_schema.up.sql`
- ✅ Old migrations archived to `migrations_archive/`

**Verify:**
```bash
# Test on fresh database
createdb test_omninudge
psql -d test_omninudge -f backend/internal/database/migrations/001_production_schema.up.sql
psql -d test_omninudge -c "\dt"  # Should show all tables
dropdb test_omninudge  # Clean up
```

- [ ] Migrations consolidated
- [ ] Tested on fresh database
- [ ] All tables created successfully

---

### 2. Review Environment Variables

Check what your app needs in production:

```bash
# Check backend .env.example or current dev .env
cat backend/.env
```

**Required variables:**
- `JWT_SECRET` - Will be auto-generated (64+ characters)
- `DATABASE_URL` - Will be auto-generated
- `ALLOWED_ORIGINS` - Will be set to your domain
- `GIN_MODE` - Will be set to "release"
- `UPLOAD_DIR` - Will be set to `/var/www/omninudge/uploads`

- [ ] Reviewed required environment variables
- [ ] No hardcoded secrets in code

---

### 3. Test Local Build

Ensure your app builds successfully:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# Test backend build
cd backend
go build -o omninudge-server ./cmd/server
# Should complete without errors
rm omninudge-server  # Clean up

# Test frontend build
cd ../frontend
npm install
npm run build
# Should create dist/ directory
```

- [ ] Backend builds successfully
- [ ] Frontend builds successfully
- [ ] No build errors

---

### 4. Commit and Push (Optional but Recommended)

Save your current state:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

git add .
git commit -m "Pre-production: consolidated migrations and deployment scripts"
git push  # If using remote repo
```

- [ ] Code committed to git
- [ ] Consolidated migrations committed

---

## ✅ Phase 2: Prepare Your Server

### 5. Create VPS Account

**Recommended:** Hetzner Cloud

1. Sign up: https://console.hetzner.cloud/
2. Add payment method
3. Verify email

- [ ] VPS account created
- [ ] Payment method added

---

### 6. Set Up SSH Key

**On your Mac:**

```bash
# Check if you have an SSH key
ls ~/.ssh/id_ed25519.pub

# If not, create one:
ssh-keygen -t ed25519 -C "your-email@example.com"
# Press Enter 3 times (default location, no passphrase)

# Display your public key
cat ~/.ssh/id_ed25519.pub
# Copy the output (starts with ssh-ed25519...)
```

**In Hetzner Dashboard:**
1. Click "SSH Keys"
2. "Add SSH Key"
3. Paste your public key
4. Name: "My Mac"
5. Save

- [ ] SSH key generated
- [ ] SSH key added to Hetzner

---

### 7. Create Server

**In Hetzner Dashboard:**

1. Click "Add Server"
2. **Location:** US East or EU (closest to your users)
3. **Image:** Ubuntu 22.04 LTS
4. **Type:** CPX21 (4GB RAM, €5.83/month)
5. **SSH Keys:** Select your key
6. **Name:** omninudge-prod
7. Click "Create & Buy now"

**Wait 2 minutes**, then:

```bash
# Copy server IP from dashboard
# Test SSH connection:
ssh root@YOUR_SERVER_IP
# Type 'yes' if asked about fingerprint
# You should be logged in!
# Type 'exit' to disconnect
```

- [ ] Server created
- [ ] Server IP address copied: `_________________`
- [ ] SSH connection tested

---

## ✅ Phase 3: Configure Domain

### 8. Set Up Cloudflare DNS

**In Cloudflare Dashboard:**

1. Go to: https://dash.cloudflare.com/
2. Click "omninudge.com"
3. Click "DNS" (left sidebar)
4. Click "Add record"

**Record 1:**
- Type: `A`
- Name: `@`
- Content: `YOUR_SERVER_IP` (from step 7)
- Proxy status: **Click to turn GRAY** (DNS only)
- TTL: Auto
- Save

**Record 2:**
- Type: `A`
- Name: `www`
- Content: `YOUR_SERVER_IP` (same as above)
- Proxy status: **Click to turn GRAY** (DNS only)
- TTL: Auto
- Save

**IMPORTANT:** Both clouds must be **GRAY**, not orange!

**Wait 5-10 minutes**, then test:

```bash
# On your Mac:
ping omninudge.com
# Should show YOUR_SERVER_IP

nslookup omninudge.com
# Should show YOUR_SERVER_IP
```

- [ ] A record added for @
- [ ] A record added for www
- [ ] Both set to DNS only (gray cloud)
- [ ] DNS resolves to server IP

---

## ✅ Phase 4: Pre-Deploy Checks

### 9. Make Deployment Scripts Executable

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

chmod +x scripts/deploy-*.sh
chmod +x scripts/consolidate-migrations.sh
```

- [ ] Scripts made executable

---

### 10. Review Deployment Plan

You'll be running these commands (in order):

```bash
# Upload scripts
scp scripts/deploy-*.sh root@YOUR_SERVER_IP:/root/

# Upload code
rsync -avz --exclude 'node_modules' --exclude '.git' \
  . root@YOUR_SERVER_IP:/var/www/omninudge/

# SSH into server
ssh root@YOUR_SERVER_IP

# On server:
bash /root/deploy-setup.sh       # Installs software (~15 min)
bash /root/deploy-database.sh    # Creates database (~2 min)
bash /root/deploy-app.sh         # Deploys app + SSL (~20 min)
```

- [ ] Understand deployment steps
- [ ] Have all scripts ready

---

## ✅ Phase 5: Security Preparations

### 11. Prepare Secure Passwords

The scripts will generate these, but you should:

1. Have a password manager ready (1Password, Bitwarden, LastPass, etc.)
2. Be ready to save:
   - Database password
   - JWT secret
   - Server root password

- [ ] Password manager ready
- [ ] Ready to save credentials securely

---

### 12. Plan for Monitoring

After deployment, you'll need to monitor:

**Free tools:**
- **UptimeRobot** (https://uptimerobot.com) - Alerts if site goes down
- **Cloudflare Analytics** - Traffic stats (built-in)

Consider signing up for UptimeRobot now (free tier).

- [ ] Considered monitoring tools
- [ ] (Optional) UptimeRobot account created

---

## ✅ Final Checklist Before Deploy

Review everything:

**Code:**
- [ ] Migrations consolidated (1 file instead of 48)
- [ ] Backend builds successfully
- [ ] Frontend builds successfully
- [ ] Code committed to git

**Infrastructure:**
- [ ] VPS server created and accessible via SSH
- [ ] Server IP address: `_________________`
- [ ] DNS configured on Cloudflare (gray clouds!)
- [ ] DNS resolves to server IP

**Scripts:**
- [ ] All deployment scripts executable
- [ ] Consolidation script tested
- [ ] Scripts uploaded to server

**Security:**
- [ ] Password manager ready
- [ ] SSH key configured
- [ ] No secrets in code

**Readiness:**
- [ ] Read Quick Deploy guide
- [ ] Understand deployment flow
- [ ] Ready to spend ~2 hours

---

## 🚀 You're Ready to Deploy!

**Everything checked?** Proceed to:

📖 **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** - Option 1 (Fully Automated)

**Estimated time:** 2 hours
**Difficulty:** Follow copy-paste commands
**Result:** Live website at https://omninudge.com

---

## Troubleshooting Resources

If anything goes wrong during deployment:

1. **Check deployment script output** - Error messages are usually clear
2. **Beginner Deployment Guide** - [docs/BEGINNER_DEPLOYMENT_GUIDE.md](docs/BEGINNER_DEPLOYMENT_GUIDE.md) - Manual steps explained
3. **Migration Guide** - [docs/MIGRATION_CONSOLIDATION.md](docs/MIGRATION_CONSOLIDATION.md) - Database issues
4. **Cloudflare Guide** - [docs/CLOUDFLARE_SETUP.md](docs/CLOUDFLARE_SETUP.md) - DNS/SSL issues

---

## After Deployment

Once live, complete:

1. **Test all features** - Register, post, message, upload
2. **Create admin account** - Make yourself admin in database
3. **Set up monitoring** - UptimeRobot for downtime alerts
4. **Enable backups** - Already configured, verify running
5. **Invite beta users** - Start with 5-10 people

---

**Ready? Let's deploy! 🎉**
