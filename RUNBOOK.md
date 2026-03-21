# OmniNudge Production Runbook

**Server:** `root@77.42.47.79` (Hetzner, Helsinki)
**Domain:** `omninudge.com` | `api.omninudge.com`
**Deploy script:** `bash scripts/deploy-on.sh` (run from project root, any directory)

---

## Quick Reference — All Services

| Service | What it does | Check status | Restart |
|---|---|---|---|
| `omninudge-backend` | Go API server (port 8080) | `systemctl status omninudge-backend` | `systemctl restart omninudge-backend` |
| `nginx` | Reverse proxy / TLS / static files | `systemctl status nginx` | `systemctl restart nginx` |
| `postgresql@16-main` | Primary database | `systemctl status postgresql@16-main` | `systemctl restart postgresql@16-main` |
| `redis-server` | Cache + job queue (port 6379) | `systemctl status redis-server` | `systemctl restart redis-server` |
| `coturn` | TURN/STUN server for WebRTC calls | `systemctl status coturn` | `systemctl restart coturn` |
| `clamav-daemon` | Virus scanner (clamd socket) | `systemctl status clamav-daemon` | `systemctl restart clamav-daemon` |
| `clamav-freshclam` | Daily virus definition updater | `systemctl status clamav-freshclam` | `systemctl restart clamav-freshclam` |

**Check everything at once:**
```bash
ssh root@77.42.47.79 'systemctl is-active omninudge-backend nginx postgresql@16-main redis-server coturn clamav-daemon clamav-freshclam'
```

---

## Logs

```bash
# Backend (live tail)
ssh root@77.42.47.79 'journalctl -u omninudge-backend -f'

# Backend (last 100 lines)
ssh root@77.42.47.79 'journalctl -u omninudge-backend -n 100 --no-pager'

# Backend errors only (last hour)
ssh root@77.42.47.79 'journalctl -u omninudge-backend --since "1 hour ago" --no-pager | grep "\"level\":\"error\""'

# Nginx access log
ssh root@77.42.47.79 'tail -f /var/log/nginx/access.log'

# Nginx error log
ssh root@77.42.47.79 'tail -f /var/log/nginx/error.log'

# Any service
ssh root@77.42.47.79 'journalctl -u <service-name> -f'
```

---

## Deployment

```bash
# Normal deploy (builds frontend, backs up, uploads, builds backend, restarts)
bash scripts/deploy-on.sh
```

**What deploy-on.sh does:**
1. Builds frontend locally (`npm run build`)
2. Creates file + database backup on server (`/var/www/omninudge/backups/`)
3. Rsyncs frontend dist to server
4. Rsyncs backend code to server (excludes `.env`, binary, `.git`)
5. Builds backend on server with git version injected via ldflags
6. Restarts `omninudge-backend`
7. Curls `omninudge.com` — expects HTTP 200

**After deploy, on startup the backend:**
- Pre-warms Redis cache for `r/popular` (hot/new/top) to prevent Reddit rate-limit cold-start
- Runs database migrations automatically
- Connects to Redis, PostgreSQL, ClamAV

**⚠️ Multiple deploys in quick succession (<10 min apart):** The Reddit pre-warm will get 429'd and log warnings. Not fatal — the site works, just shows hub posts only in the home feed until Reddit's rate limit window clears (~10 min).

---

## Backups

**Location:** `/var/www/omninudge/backups/`
**Retention:** Last 5 file backups (`.tar.gz`), last 10 database backups (`.sql.gz`)
**Created automatically** on every deploy.

```bash
# List backups
ssh root@77.42.47.79 'ls -lht /var/www/omninudge/backups/'

# Restore files from backup
ssh root@77.42.47.79 'cd /var/www/omninudge && tar -xzf backups/<backup-name>.tar.gz'

# Restore database from backup
ssh root@77.42.47.79 '
  DB_USER=$(grep ^DB_USER= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_PASSWORD=$(grep ^DB_PASSWORD= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_NAME=$(grep ^DB_NAME= /var/www/omninudge/backend/.env | cut -d= -f2)
  PGPASSWORD=$DB_PASSWORD gunzip -c /var/www/omninudge/backups/<backup-name>.sql.gz \
    | psql -U $DB_USER -h localhost $DB_NAME
'
```

---

## Database

```bash
# Connect to psql
ssh root@77.42.47.79 'su - postgres -c "psql omninudge"'

# Connect directly as postgres superuser (no credentials needed — simplest)
ssh root@77.42.47.79 'su - postgres -c "psql omninudge"'

# NOTE: Do NOT use "source .env" — it breaks on special chars in REDDIT_USER_AGENT.
# All commands below extract credentials with grep instead.

# Connect as app user
ssh root@77.42.47.79 '
  DB_USER=$(grep ^DB_USER= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_PASSWORD=$(grep ^DB_PASSWORD= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_NAME=$(grep ^DB_NAME= /var/www/omninudge/backend/.env | cut -d= -f2)
  PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h localhost $DB_NAME
'

# Run a migration manually
ssh root@77.42.47.79 '
  DB_USER=$(grep ^DB_USER= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_PASSWORD=$(grep ^DB_PASSWORD= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_NAME=$(grep ^DB_NAME= /var/www/omninudge/backend/.env | cut -d= -f2)
  PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h localhost $DB_NAME \
    -f /var/www/omninudge/backend/internal/database/migrations/<migration>.sql
'

# Check current migration version
ssh root@77.42.47.79 '
  DB_USER=$(grep ^DB_USER= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_PASSWORD=$(grep ^DB_PASSWORD= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_NAME=$(grep ^DB_NAME= /var/www/omninudge/backend/.env | cut -d= -f2)
  PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h localhost $DB_NAME \
    -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 5;"
'

# Check materialized views (refreshed every 5 min by background job)
ssh root@77.42.47.79 '
  DB_USER=$(grep ^DB_USER= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_PASSWORD=$(grep ^DB_PASSWORD= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_NAME=$(grep ^DB_NAME= /var/www/omninudge/backend/.env | cut -d= -f2)
  PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h localhost $DB_NAME \
    -c "SELECT schemaname, matviewname FROM pg_matviews;"
'

# Refresh materialized views manually (if job isn't running)
ssh root@77.42.47.79 '
  DB_USER=$(grep ^DB_USER= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_PASSWORD=$(grep ^DB_PASSWORD= /var/www/omninudge/backend/.env | cut -d= -f2)
  DB_NAME=$(grep ^DB_NAME= /var/www/omninudge/backend/.env | cut -d= -f2)
  PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h localhost $DB_NAME -c "
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_post_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY hub_activity_stats;
  "
'
```

---

## Redis

```bash
# Check Redis is responding
ssh root@77.42.47.79 'redis-cli ping'  # → PONG

# List all cached keys
ssh root@77.42.47.79 'redis-cli keys "*"'

# Check Reddit cache (populated at startup and every 5 min by requests)
ssh root@77.42.47.79 'redis-cli keys "sr:*"'

# Flush Reddit cache (forces fresh fetch on next request)
ssh root@77.42.47.79 'redis-cli --scan --pattern "sr:*" | xargs -r redis-cli del'

# Check queue workers (Asynq)
ssh root@77.42.47.79 'redis-cli keys "asynq:*"'

# Flush all cache (nuclear option — do not do in prod unless necessary)
# ssh root@77.42.47.79 'redis-cli flushall'
```

---

## Reddit Proxy & Rate Limiting

The backend proxies all Reddit API requests through a Cloudflare Worker at `REDDIT_PROXY_URL`.

**If home feed shows no Reddit posts:**
1. Check logs for `429`: `journalctl -u omninudge-backend -n 50 --no-pager | grep 429`
2. If 429s present, wait ~10 minutes for Reddit's rate limit window to reset
3. Verify the Worker is reachable: `curl -s -o /dev/null -w "%{http_code}" "https://reddit-proxy.nickf2632.workers.dev/r/popular/hot.json?limit=1"`
4. If the Worker returns 200, the next user request to the home feed will populate the cache and fix itself

**Reddit cache TTL:** 300 seconds (5 minutes), configured via `REDIS_TTL_SECONDS` in `.env`

---

## ClamAV Virus Scanner

Used to scan user-uploaded files (images, audio, etc.) asynchronously after upload.

```bash
# Check daemon is running
ssh root@77.42.47.79 'systemctl status clamav-daemon'

# Test the scanner is responding (must be uppercase PING)
ssh root@77.42.47.79 'echo "PING" | nc -U /var/run/clamav/clamd.ctl'  # → PONG

# Check virus definition age (should update daily)
ssh root@77.42.47.79 'ls -lh /var/lib/clamav/'

# Force a definition update now
ssh root@77.42.47.79 'systemctl stop clamav-freshclam && freshclam && systemctl start clamav-freshclam'
```

**If clamd is down:** Uploads still work. The virus scan job will retry. `VIRUS_SCAN_FAIL_CLOSED=false` in production — unscanned files are served rather than blocked, so a clamd outage is degraded (no scanning) not breaking.

**Socket path:** `/var/run/clamav/clamd.ctl`

---

## TURN Server (coturn)

Used for WebRTC video/audio calls when direct peer connection fails (NAT traversal).

```bash
# Check coturn is running
ssh root@77.42.47.79 'systemctl status coturn'

# Check coturn logs
ssh root@77.42.47.79 'journalctl -u coturn -n 50 --no-pager'

# Config file
ssh root@77.42.47.79 'cat /etc/turnserver.conf'
```

**Ports used:**
- `3478` UDP/TCP — STUN/TURN
- `5349` TCP/UDP — TURNS (TLS)
- `49152–49300` UDP — media relay range

**If calls fail:** The frontend falls back to STUN-only (Google's public STUN servers). Calls may fail on symmetric NATs. Check that UDP 49152–49300 is open in the firewall: `ufw status`.

**Credentials:** Time-limited HMAC-SHA1 (24h expiry), generated by the backend at `/api/v1/calls/ice-servers`. The shared secret lives in `.env` as `TURN_SECRET` and in `/etc/turnserver.conf` as `static-auth-secret`.

---

## TLS Certificates (Certbot)

```bash
# Check certificate expiry
ssh root@77.42.47.79 'certbot certificates'

# Renew (runs automatically via systemd certbot.timer, but can be forced)
ssh root@77.42.47.79 'certbot renew --dry-run'  # test first
ssh root@77.42.47.79 'certbot renew'
```

Certificates cover: `omninudge.com`, `www.omninudge.com`, `api.omninudge.com`, `ifo.omninudge.com`

---

## Disk Space

**Current usage:** ~57% of 38GB
**Threshold to act:** >80%

```bash
# Overall usage
ssh root@77.42.47.79 'df -h /'

# What's using space
ssh root@77.42.47.79 'du -sh /var/www/omninudge/backups/ /var/lib/clamav/ /var/log/ /root/go/pkg/mod/ /var/cache/apt/'

# Clean old backups manually (deploy script auto-retains last 5/10)
ssh root@77.42.47.79 'ls -lht /var/www/omninudge/backups/'

# Trim systemd journal (capped at 500MB via /etc/systemd/journald.conf.d/size.conf)
ssh root@77.42.47.79 'journalctl --disk-usage && journalctl --vacuum-size=300M'

# Clean apt cache
ssh root@77.42.47.79 'apt-get clean'
```

---

## Environment Variables

**Location:** `/var/www/omninudge/backend/.env`
**Never committed to git.** Contains database credentials, JWT secret, TURN secret, R2 keys, Mailgun API key, etc.

```bash
# View (careful — contains secrets)
ssh root@77.42.47.79 'cat /var/www/omninudge/backend/.env'

# Add/change a variable (then restart backend)
ssh root@77.42.47.79 'echo "KEY=value" >> /var/www/omninudge/backend/.env'
ssh root@77.42.47.79 'systemctl restart omninudge-backend'
```

---

## Incident Playbooks

### Site is down (HTTP ≠ 200)

```bash
# 1. Check backend
ssh root@77.42.47.79 'systemctl status omninudge-backend'
ssh root@77.42.47.79 'journalctl -u omninudge-backend -n 30 --no-pager'

# 2. Check nginx
ssh root@77.42.47.79 'systemctl status nginx'
ssh root@77.42.47.79 'nginx -t'  # syntax check — runs on server

# 3. Check postgres (backend won't start without it)
ssh root@77.42.47.79 'systemctl status postgresql@16-main'

# 4. Restart in order if needed
# Note: postgres must be up before backend (backend exits fatally without it)
#       Redis failure is non-fatal — backend degrades to in-memory cache
ssh root@77.42.47.79 'systemctl restart postgresql@16-main'
ssh root@77.42.47.79 'systemctl restart redis-server omninudge-backend nginx'
```

### Backend crashed / won't start

```bash
# Check why it crashed
ssh root@77.42.47.79 'journalctl -u omninudge-backend -n 50 --no-pager'

# Common causes:
# - .env missing or malformed → check file exists and has no syntax errors
# - Port 8080 already in use → lsof -i :8080
# - Database unreachable → check postgresql@16-main
# - Bad migration → check migration logs, may need to roll back

# Roll back to last backup (restores source; binary must be rebuilt)
# IMPORTANT: The file backup (.tar.gz) and database backup (.sql.gz) must be from the
# SAME backup name (same timestamp). Restoring mismatched backups (e.g., newer DB with
# older code, or older DB with newer code) can cause schema/migration mismatches and
# data corruption. Always restore both from the same <backup-name>.
# 1. Restore files from backup
ssh root@77.42.47.79 'cd /var/www/omninudge && tar -xzf backups/<backup-name>.tar.gz'
# 2. Restore database from the matching backup
ssh root@77.42.47.79 'DB_USER=$(grep ^DB_USER= /var/www/omninudge/backend/.env | cut -d= -f2); DB_PASSWORD=$(grep ^DB_PASSWORD= /var/www/omninudge/backend/.env | cut -d= -f2); DB_NAME=$(grep ^DB_NAME= /var/www/omninudge/backend/.env | cut -d= -f2); PGPASSWORD=$DB_PASSWORD gunzip -c /var/www/omninudge/backups/<backup-name>.sql.gz | psql -U $DB_USER -h localhost $DB_NAME'
# 3. Rebuild the binary (binary is excluded from backup)
ssh root@77.42.47.79 'cd /var/www/omninudge/backend && export PATH=$PATH:/usr/local/go/bin && go build -o omninudge-server ./cmd/server'
# 4. Restart
ssh root@77.42.47.79 'systemctl restart omninudge-backend'

# Or: roll back via git and re-deploy (cleaner)
#   git checkout <previous-sha> -- backend/ frontend/
#   bash scripts/deploy-on.sh
```

### Database issues

```bash
# Check postgres logs
ssh root@77.42.47.79 'journalctl -u postgresql@16-main -n 50 --no-pager'

# Check connections
ssh root@77.42.47.79 'su - postgres -c "psql -c \"SELECT count(*) FROM pg_stat_activity;\""'

# Kill idle connections if pool is exhausted (excludes current connection)
ssh root@77.42.47.79 'su - postgres -c "psql -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = '\''idle'\'' AND query_start < now() - interval '\''5 minutes'\'' AND pid <> pg_backend_pid();\""'
```

### Home feed empty (no Reddit posts)

See **Reddit Proxy & Rate Limiting** section above. Almost always a transient 429 — wait 10 minutes.

### File uploads failing

```bash
# Check ClamAV
ssh root@77.42.47.79 'systemctl status clamav-daemon'
ssh root@77.42.47.79 'echo "PING" | nc -U /var/run/clamav/clamd.ctl'

# Check R2 / storage — look for storage errors in backend logs
ssh root@77.42.47.79 'journalctl -u omninudge-backend -n 50 --no-pager | grep -i "storage\|upload\|r2\|s3"'
```

### Calls not connecting

```bash
# Check TURN server
ssh root@77.42.47.79 'systemctl status coturn'

# Verify TURN ports are open
ssh root@77.42.47.79 'ufw status | grep -E "3478|5349|49152"'

# Check ICE server endpoint returns TURN credentials (requires a valid JWT)
# Easiest to verify via backend logs after a call attempt, or check coturn logs directly
ssh root@77.42.47.79 'journalctl -u coturn -n 20 --no-pager'
```

### Disk space >80%

```bash
ssh root@77.42.47.79 'du -sh /var/www/omninudge/backups/ /var/lib/clamav/ /var/log/ /root/go/pkg/mod/'

# Quick wins in order:
# 1. Old backups (deploy script keeps last 5/10, but check for strays)
ssh root@77.42.47.79 'ls -lht /var/www/omninudge/backups/ | tail -20'

# 2. Journal logs
ssh root@77.42.47.79 'journalctl --vacuum-size=100M'

# 3. Go module cache (can always be re-downloaded, go is at /usr/local/go/bin/)
ssh root@77.42.47.79 'du -sh /root/go/pkg/mod/ && /usr/local/go/bin/go clean -modcache'

# 4. Apt cache
ssh root@77.42.47.79 'apt-get clean'
```

---

## Architecture at a Glance

```
Browser/App
    │
    ├── HTTPS → nginx (443)
    │       ├── /              → /var/www/omninudge/frontend/dist (static)
    │       └── /api/*         → localhost:8080 (omninudge-backend)
    │
    └── WebRTC → coturn (3478/5349 + UDP 49152-49300)

omninudge-backend (port 8080)
    ├── PostgreSQL (localhost:5432) — primary data store
    ├── Redis (localhost:6379)      — cache + Asynq job queue
    ├── ClamAV (/var/run/clamav/clamd.ctl) — virus scan worker jobs
    ├── Cloudflare R2               — file storage (images, audio, video)
    ├── Cloudflare Worker           — Reddit API proxy
    ├── Mailgun                     — transactional email
    └── coturn (localhost:3478)     — TURN credential generation only
```
