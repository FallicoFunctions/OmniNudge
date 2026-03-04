#!/bin/bash
# OmniNudge Database Anonymization Script
#
# Purpose: Scrub all PII from a database so it can safely be used in
#          staging/dev environments, shared with contractors, or used
#          for debugging without exposing real user data.
#
# Usage (on the server):
#   bash anonymize-db.sh --source omninudge --target omninudge_staging
#
#   This creates a full copy of --source, then overwrites all PII columns
#   in --target with deterministic fake data. The source database is
#   never modified.
#
# Usage (local restore from prod dump):
#   bash anonymize-db.sh --dump /path/to/backup.sql.gz --target omninudge_staging
#
# What gets anonymized:
#   users          — email, password_hash, reddit tokens, bio, avatar_url,
#                    encrypted_private_key, access_token, refresh_token
#   messages       — encrypted_content replaced with placeholder
#   bug_reports    — description, page_url
#   invitations    — invitation_code, invitation_link
#   media_files    — original_filename, storage_url, storage_path, thumbnail_url
#   audit_logs     — details column (may contain request metadata)
#   notifications  — content column
#
# What is NOT anonymized (safe, non-PII):
#   - IDs, timestamps, counts, votes, karma
#   - Hub/subreddit names, post titles, comment structure
#   - Settings flags (booleans), role assignments
#   - Relationship tables (blocked_users, subscriptions, etc.)
#
# Requirements: psql, pg_dump, gunzip (all standard on a Postgres server)

set -euo pipefail

# ─── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ─── Defaults ────────────────────────────────────────────────────────────────
SOURCE_DB=""
TARGET_DB=""
DUMP_FILE=""
DB_HOST="localhost"
DB_PORT="5432"

# ─── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)   SOURCE_DB="$2";  shift 2 ;;
    --target)   TARGET_DB="$2";  shift 2 ;;
    --dump)     DUMP_FILE="$2";  shift 2 ;;
    --host)     DB_HOST="$2";    shift 2 ;;
    --port)     DB_PORT="$2";    shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [ -z "$TARGET_DB" ]; then
  echo -e "${RED}Error: --target is required${NC}"
  echo "Usage: $0 --source <db> --target <db>"
  echo "       $0 --dump <file.sql.gz> --target <db>"
  exit 1
fi

if [ -z "$SOURCE_DB" ] && [ -z "$DUMP_FILE" ]; then
  echo -e "${RED}Error: either --source or --dump is required${NC}"
  exit 1
fi

# ─── Load DB credentials ──────────────────────────────────────────────────────
ENV_FILE="/var/www/omninudge/backend/.env"
if [ -f "$ENV_FILE" ]; then
  DB_USER=$(grep '^DB_USER=' "$ENV_FILE" | cut -d= -f2)
  DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2)
else
  # Fall back to env vars (useful in CI or local dev)
  DB_USER="${DB_USER:-omninudge_user}"
  DB_PASSWORD="${DB_PASSWORD:-}"
fi

export PGPASSWORD="$DB_PASSWORD"

PSQL="psql -U $DB_USER -h $DB_HOST -p $DB_PORT"
PGDUMP="pg_dump -U $DB_USER -h $DB_HOST -p $DB_PORT"

# ─── Safety check ─────────────────────────────────────────────────────────────
if [ "$TARGET_DB" = "$SOURCE_DB" ] || [ "$TARGET_DB" = "omninudge" ]; then
  echo -e "${RED}Error: refusing to anonymize the production database.${NC}"
  echo "TARGET must be a different database name (e.g. omninudge_staging)."
  exit 1
fi

echo -e "${GREEN}OmniNudge Database Anonymization${NC}"
echo ""
echo "  Source:  ${SOURCE_DB:-$DUMP_FILE}"
echo "  Target:  $TARGET_DB"
echo "  Host:    $DB_HOST:$DB_PORT"
echo ""
echo -e "${YELLOW}This will DROP and recreate '$TARGET_DB'. Continue? (y/n)${NC}"
read -r -n 1 CONFIRM
echo
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# ─── Step 1: Create/recreate target database ──────────────────────────────────
echo -e "${YELLOW}Step 1: Recreating target database...${NC}"
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $TARGET_DB;" 2>/dev/null || true
$PSQL -d postgres -c "CREATE DATABASE $TARGET_DB OWNER $DB_USER;"
echo -e "${GREEN}✓ Database '$TARGET_DB' created${NC}"

# ─── Step 2: Load data into target ───────────────────────────────────────────
echo -e "${YELLOW}Step 2: Loading data into target...${NC}"
if [ -n "$DUMP_FILE" ]; then
  if [[ "$DUMP_FILE" == *.gz ]]; then
    gunzip -c "$DUMP_FILE" | $PSQL -d "$TARGET_DB" -q
  else
    $PSQL -d "$TARGET_DB" -q < "$DUMP_FILE"
  fi
else
  $PGDUMP "$SOURCE_DB" | $PSQL -d "$TARGET_DB" -q
fi
echo -e "${GREEN}✓ Data loaded${NC}"

# ─── Step 3: Anonymize PII ────────────────────────────────────────────────────
echo -e "${YELLOW}Step 3: Anonymizing PII...${NC}"

$PSQL -d "$TARGET_DB" -v ON_ERROR_STOP=1 << 'SQL'

-- ── users ────────────────────────────────────────────────────────────────────
-- Replace email with a deterministic fake based on user ID (preserves uniqueness)
-- Replace password_hash with a bcrypt hash of the literal string "password"
--   ($2a$12$... = bcrypt cost 12, value "password")
-- Wipe OAuth tokens, private keys, bio, avatar
UPDATE users SET
  email              = CASE WHEN email IS NOT NULL
                         THEN 'user_' || id || '@anon.invalid'
                         ELSE NULL END,
  email_encrypted    = false,
  password_hash      = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj0oiCDMW6Aq',
  access_token       = NULL,
  refresh_token      = NULL,
  token_expires_at   = NULL,
  encrypted_private_key = NULL,
  public_key         = NULL,
  avatar_url         = NULL,
  bio                = NULL,
  reddit_id          = CASE WHEN reddit_id IS NOT NULL
                         THEN 'anon_reddit_' || id
                         ELSE NULL END,
  reddit_username    = CASE WHEN reddit_username IS NOT NULL
                         THEN 'anon_redditor_' || id
                         ELSE NULL END;

-- ── messages ─────────────────────────────────────────────────────────────────
-- Messages are E2E encrypted; encrypted_content is ciphertext.
-- Replace with a fixed placeholder so the column is non-null but unreadable.
UPDATE messages SET
  encrypted_content = '[anonymized]';

-- ── bug_reports ───────────────────────────────────────────────────────────────
UPDATE bug_reports SET
  description = 'Anonymized bug report #' || id,
  page_url    = 'https://anon.invalid/page/' || id,
  admin_notes = CASE WHEN admin_notes IS NOT NULL THEN '[anonymized]' ELSE NULL END;

-- ── invitations ───────────────────────────────────────────────────────────────
UPDATE invitations SET
  invitation_code = 'ANON' || LPAD(id::text, 6, '0'),
  invitation_link = CASE WHEN invitation_link IS NOT NULL
                      THEN 'https://anon.invalid/invite/ANON' || LPAD(id::text, 6, '0')
                      ELSE NULL END;

-- ── media_files ───────────────────────────────────────────────────────────────
-- Wipe original filenames and storage paths; keep structural metadata
-- (file_type, file_size, dimensions) which is useful for testing
UPDATE media_files SET
  original_filename = 'file_' || id || '.' || SPLIT_PART(file_type, '/', 2),
  storage_url       = '/uploads/anon/file_' || id,
  storage_path      = '/var/www/omninudge/uploads/anon/file_' || id,
  thumbnail_url     = CASE WHEN thumbnail_url IS NOT NULL
                        THEN '/uploads/anon/thumb_' || id
                        ELSE NULL END;

-- ── audit_logs ────────────────────────────────────────────────────────────────
-- Preserve action type and timestamps (useful for testing audit flow)
-- but wipe the details JSON which may contain IPs, user agents, payloads
UPDATE audit_logs SET
  details = '{"anonymized": true}'::jsonb
  WHERE details IS NOT NULL;

-- ── notifications ─────────────────────────────────────────────────────────────
-- Wipe any notification body text that may contain user-generated content
UPDATE notifications SET
  content = CASE WHEN content IS NOT NULL THEN '[anonymized]' ELSE NULL END;

-- ── device_tokens (push notification tokens) ──────────────────────────────────
-- FCM/APNS tokens are per-device credentials; must be scrubbed
UPDATE device_tokens SET
  token = 'anon_device_token_' || id
  WHERE token IS NOT NULL;

-- ── password_reset_tokens ─────────────────────────────────────────────────────
DELETE FROM password_reset_tokens;

-- ── failed_login_attempts ─────────────────────────────────────────────────────
-- Contains IP addresses
DELETE FROM failed_login_attempts;

-- ── analytics_events ──────────────────────────────────────────────────────────
-- May contain IP, user agent, session data
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'analytics_events') THEN
    DELETE FROM analytics_events;
  END IF;
END $$;

-- ── session_data / user_sessions ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_sessions') THEN
    DELETE FROM user_sessions;
  END IF;
END $$;

SQL

echo -e "${GREEN}✓ PII anonymized${NC}"

# ─── Step 4: Verify ───────────────────────────────────────────────────────────
echo -e "${YELLOW}Step 4: Verification...${NC}"
$PSQL -d "$TARGET_DB" -t -A << 'SQL'
SELECT
  'users'         AS tbl, COUNT(*) AS rows FROM users
UNION ALL SELECT 'messages',     COUNT(*) FROM messages
UNION ALL SELECT 'bug_reports',  COUNT(*) FROM bug_reports
UNION ALL SELECT 'media_files',  COUNT(*) FROM media_files
UNION ALL SELECT 'audit_logs',   COUNT(*) FROM audit_logs
ORDER BY tbl;
SQL

# Sanity check: no real emails remain
REAL_EMAILS=$($PSQL -d "$TARGET_DB" -t -A -c \
  "SELECT COUNT(*) FROM users WHERE email NOT LIKE '%@anon.invalid' AND email IS NOT NULL;")
if [ "$REAL_EMAILS" -gt 0 ]; then
  echo -e "${RED}✗ WARNING: $REAL_EMAILS user(s) still have non-anonymized emails!${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✓ Anonymization complete. Database '$TARGET_DB' is safe for staging/dev use.${NC}"
echo ""
echo "Connect with:"
echo "  psql -U $DB_USER -h $DB_HOST $TARGET_DB"
echo ""
echo "All anonymized users can log in with password: password"
echo ""
