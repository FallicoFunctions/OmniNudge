# Production Deploy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a one-command production deploy flow that runs fail-closed preflight checks, applies database migrations explicitly, offers interactive rollback after post-backup failures, and keeps the manual rollback path current and beginner-safe.

**Architecture:** Keep `bash scripts/deploy-on.sh` and `bash scripts/rollback.sh` as the only operator-facing commands, but move all shared shell behavior into `scripts/deploy-lib.sh`. Reuse the existing dedicated migration entrypoint at `backend/cmd/migrate/main.go`, preserve the existing frontend boot asset health contract, and back rollback with deploy-time file/database backups rather than git checkout on the server.

**Tech Stack:** Bash, SSH, rsync, Go, PostgreSQL, systemd, curl

---

### Task 1: Add a Deploy Script Regression Harness

**Files:**
- Create: `scripts/test-deploy-scripts.sh`
- Reference: `scripts/deploy-on.sh`
- Reference: `scripts/rollback.sh`
- Reference: `scripts/safe-deploy.sh`
- Reference: `scripts/deploy-health-contract.sh`
- Reference: `RUNBOOK.md`

- [ ] **Step 1: Write the failing shell regression harness**

Create `scripts/test-deploy-scripts.sh` with this exact content:

```bash
#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/scripts/deploy-on.sh"
ROLLBACK="$ROOT/scripts/rollback.sh"
SAFE="$ROOT/scripts/safe-deploy.sh"
LIB="$ROOT/scripts/deploy-lib.sh"
HEALTH="$ROOT/scripts/deploy-health-contract.sh"
RUNBOOK="$ROOT/RUNBOOK.md"

bash -n "$DEPLOY"
bash -n "$ROLLBACK"
bash -n "$SAFE"
bash -n "$HEALTH"
bash -n "$LIB"

grep -Fq 'source "$SCRIPT_DIR/deploy-lib.sh"' "$DEPLOY"
grep -Fq 'source "$SCRIPT_DIR/deploy-lib.sh"' "$ROLLBACK"
grep -Fq 'run_local_preflight' "$DEPLOY"
grep -Fq 'run_remote_preflight' "$DEPLOY"
grep -Fq 'run_explicit_migrations' "$DEPLOY"
grep -Fq 'prompt_for_rollback' "$DEPLOY"

grep -Fq 'restore_backup_bundle' "$ROLLBACK"
grep -Fq 'rebuild_backend_after_restore' "$ROLLBACK"
grep -Fq 'verify_production_contract' "$ROLLBACK"
! grep -Fq 'git checkout' "$ROLLBACK"
! grep -Fq 'npm install' "$ROLLBACK"

grep -Fq 'Use bash scripts/deploy-on.sh directly.' "$SAFE"
! grep -Fq 'Pre-warms Redis cache for `r/popular`' "$RUNBOOK"
```

- [ ] **Step 2: Run the harness and verify it fails**

Run:

```bash
bash scripts/test-deploy-scripts.sh
```

Expected:
- fail because `scripts/deploy-lib.sh` does not exist yet
- fail because `scripts/rollback.sh` still contains `git checkout` and `npm install`

- [ ] **Step 3: Make the harness executable**

Run:

```bash
chmod +x scripts/test-deploy-scripts.sh
```

Expected:
- command exits `0`

- [ ] **Step 4: Commit the failing regression harness**

Run:

```bash
git add scripts/test-deploy-scripts.sh
git commit -m "test: add deploy script regression harness"
```

Expected:
- commit succeeds

### Task 2: Introduce the Shared Deploy Library

**Files:**
- Create: `scripts/deploy-lib.sh`
- Reference: `scripts/deploy-health-contract.sh`
- Reference: `backend/cmd/migrate/main.go`
- Test: `scripts/test-deploy-scripts.sh`

- [ ] **Step 1: Create the library header, shared config, and logging helpers**

Create `scripts/deploy-lib.sh` with this initial content:

```bash
#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-health-contract.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVER="${SERVER:-root@77.42.47.79}"
SERVER_PATH="${SERVER_PATH:-/var/www/omninudge}"
PROJECT_ROOT="${PROJECT_ROOT:-/Users/Nick_1/Documents/Personal_Projects/OmniNudge}"
BACKUP_DIR="${BACKUP_DIR:-$SERVER_PATH/backups}"
SERVICE_NAME="${SERVICE_NAME:-omninudge-backend}"
LOCAL_FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOCAL_BACKEND_DIR="$PROJECT_ROOT/backend"
LOCAL_FRONTEND_DIST="$PROJECT_ROOT/frontend/dist"

LAST_OUTPUT=""
LAST_STATUS=0

print_info() {
  echo -e "${BLUE}$1${NC}"
}

print_warn() {
  echo -e "${YELLOW}$1${NC}"
}

print_error() {
  echo -e "${RED}$1${NC}" >&2
}

print_success() {
  echo -e "${GREEN}$1${NC}"
}
```

- [ ] **Step 2: Add reusable command capture and raw failure printing**

Append these functions to `scripts/deploy-lib.sh`:

```bash
run_capture() {
  local label="$1"
  shift

  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/omninudge-deploy.XXXXXX")"

  set +e
  "$@" >"$tmp" 2>&1
  LAST_STATUS=$?
  set -e

  LAST_OUTPUT="$(cat "$tmp")"
  rm -f "$tmp"

  if [ "$LAST_STATUS" -ne 0 ]; then
    print_error "${label} failed."
    printf 'Failed command:\n%s\n\nExit code:\n%s\n\nRaw output:\n%s\n' "$*" "$LAST_STATUS" "$LAST_OUTPUT" >&2
    return "$LAST_STATUS"
  fi

  return 0
}

run_remote_capture() {
  local label="$1"
  local remote_cmd="$2"
  run_capture "$label" ssh "$SERVER" "$remote_cmd"
}

print_follow_up_hint() {
  local hint="$1"
  if [ -n "$hint" ]; then
    printf '\nSuggested follow-up:\n%s\n' "$hint"
  fi
}

prompt_for_rollback() {
  local prompt="$1"
  local answer=""
  read -r -p "$prompt" answer
  [ "$answer" = "yes" ]
}
```

- [ ] **Step 3: Add local and remote preflight helpers**

Append these functions to `scripts/deploy-lib.sh`:

```bash
require_tool() {
  local tool="$1"
  command -v "$tool" >/dev/null 2>&1 || {
    print_error "Preflight failed: required local tool '$tool' is missing."
    return 1
  }
}

assert_on_main() {
  local branch
  branch="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "main" ] || {
    print_error "Preflight failed: deployments must run from main (current branch: $branch)."
    return 1
  }
}

assert_clean_tree() {
  [ -z "$(git -C "$PROJECT_ROOT" status --short)" ] || {
    print_error "Preflight failed: working tree is not clean."
    git -C "$PROJECT_ROOT" status --short
    return 1
  }
}

build_frontend_locally() {
  run_capture "frontend build" /bin/zsh -lc "cd '$LOCAL_FRONTEND_DIR' && npm run build"
}

build_backend_locally() {
  run_capture "backend build" /bin/zsh -lc "cd '$LOCAL_BACKEND_DIR' && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go build ./cmd/server ./cmd/migrate"
}

run_local_preflight() {
  print_info "Running local preflight..."
  require_tool ssh
  require_tool rsync
  require_tool git
  require_tool npm
  require_tool go
  require_tool curl
  assert_on_main
  assert_clean_tree
  build_frontend_locally
  build_backend_locally
  print_success "Local preflight passed."
}

run_remote_preflight() {
  print_info "Running remote preflight..."
  run_remote_capture "SSH connectivity" "echo connected"
  run_remote_capture "core service status" "systemctl is-active nginx postgresql@16-main"
  run_remote_capture "backend status probe" "systemctl is-active $SERVICE_NAME || true"
  if [ "$LAST_OUTPUT" != "active" ]; then
    print_warn "Warning: omninudge-backend is not currently active. Deploy will continue so this release can recover production."
  fi
  run_remote_capture "deployment paths" "test -d '$SERVER_PATH/backend' && test -d '$SERVER_PATH/frontend/dist' && test -f '$SERVER_PATH/backend/.env'"
  run_remote_capture "production environment mode" "grep -E '^APP_ENV=production$' '$SERVER_PATH/backend/.env'"
  run_remote_capture "backup directory check" "mkdir -p '$BACKUP_DIR' && test -w '$BACKUP_DIR'"
  run_remote_capture "database backup prerequisites" "grep -E '^DB_USER=' '$SERVER_PATH/backend/.env' && grep -E '^DB_NAME=' '$SERVER_PATH/backend/.env'"
  print_success "Remote preflight passed."
}
```

- [ ] **Step 4: Add deploy and rollback primitives that reuse the existing migrate command**

Append these functions to `scripts/deploy-lib.sh`:

```bash
create_server_backup() {
  local backup_name
  backup_name="backup-$(date +%Y%m%d-%H%M%S)"

  run_remote_capture "server backup" "set -eo pipefail
mkdir -p '$BACKUP_DIR'
cd '$SERVER_PATH'
tar -czf '$BACKUP_DIR/${backup_name}.tar.gz' \
  --exclude='backups' \
  --exclude='*.log' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.gocache' \
  --exclude='.cache' \
  --exclude='bin' \
  --exclude='omninudge-server' \
  --exclude='*.test' \
  --exclude='dump.rdb' \
  --exclude='uploads' \
  backend frontend
DB_USER=\$(grep '^DB_USER=' '$SERVER_PATH/backend/.env' | cut -d= -f2)
DB_PASSWORD=\$(grep '^DB_PASSWORD=' '$SERVER_PATH/backend/.env' | cut -d= -f2)
DB_NAME=\$(grep '^DB_NAME=' '$SERVER_PATH/backend/.env' | cut -d= -f2)
PGPASSWORD=\"\$DB_PASSWORD\" pg_dump -U \"\$DB_USER\" -h localhost \"\$DB_NAME\" | gzip > '$BACKUP_DIR/${backup_name}.sql.gz'"

  printf '%s' "$backup_name"
}

upload_frontend_build() {
  run_capture "frontend upload" rsync -avz --delete "$LOCAL_FRONTEND_DIST/" "$SERVER:$SERVER_PATH/frontend/dist/"
}

upload_backend_code() {
  run_capture "backend upload" rsync -avz \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.gocache' \
    --exclude 'dist' \
    --exclude 'build' \
    --exclude 'omninudge-server' \
    --exclude '.env' \
    "$LOCAL_BACKEND_DIR/" "$SERVER:$SERVER_PATH/backend/"
}

build_backend_release() {
  local build_version
  build_version="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  run_remote_capture "backend release build" "set -eo pipefail
cd '$SERVER_PATH/backend'
export PATH=\$PATH:/usr/local/go/bin
go build -ldflags='-X main.appVersion=${build_version}' -o omninudge-server ./cmd/server"
}

run_explicit_migrations() {
  run_remote_capture "database migrations" "set -eo pipefail
cd '$SERVER_PATH/backend'
export PATH=\$PATH:/usr/local/go/bin
go run ./cmd/migrate -action=up"
}

restart_backend_service() {
  run_remote_capture "backend restart" "set -eo pipefail
systemctl restart '$SERVICE_NAME'
sleep 2
systemctl is-active --quiet '$SERVICE_NAME'
curl -fsS http://127.0.0.1:8080/health >/tmp/omninudge-health.json"
}

verify_production_contract() {
  local local_html="$1"
  local api_status

  api_status="$(curl -s -m 15 -o /dev/null -w '%{http_code}' 'https://api.omninudge.com/api/v1/ping' 2>/dev/null || true)"
  if [ "${api_status:-0}" != "200" ]; then
    print_error "Public API ping check failed."
    printf 'Failed command:\n%s\n\nExit code:\n%s\n\nRaw output:\n%s\n' "curl https://api.omninudge.com/api/v1/ping" "1" "HTTP ${api_status:-000}" >&2
    return 1
  fi

  verify_public_boot_asset_contract "$local_html" "https://omninudge.com" "https://omninudge.com"
}

restore_backup_bundle() {
  local backup_name="$1"
  run_remote_capture "file restore" "set -eo pipefail
cd '$SERVER_PATH'
tar -xzf '$BACKUP_DIR/${backup_name}.tar.gz'"
  run_remote_capture "database restore" "set -eo pipefail
DB_USER=\$(grep '^DB_USER=' '$SERVER_PATH/backend/.env' | cut -d= -f2)
DB_PASSWORD=\$(grep '^DB_PASSWORD=' '$SERVER_PATH/backend/.env' | cut -d= -f2)
DB_NAME=\$(grep '^DB_NAME=' '$SERVER_PATH/backend/.env' | cut -d= -f2)
PGPASSWORD=\"\$DB_PASSWORD\" gunzip -c '$BACKUP_DIR/${backup_name}.sql.gz' | psql -U \"\$DB_USER\" -h localhost \"\$DB_NAME\""
}

rebuild_backend_after_restore() {
  build_backend_release
}

fetch_remote_reference_html() {
  local destination="$1"
  run_remote_capture "fetch restored frontend index.html" "cat '$SERVER_PATH/frontend/dist/index.html'"
  printf '%s\n' "$LAST_OUTPUT" > "$destination"
}

rollback_from_backup() {
  local backup_name="$1"
  local restored_html
  restored_html="$(mktemp "${TMPDIR:-/tmp}/omninudge-restored-index.XXXXXX")"
  restore_backup_bundle "$backup_name"
  rebuild_backend_after_restore
  restart_backend_service
  fetch_remote_reference_html "$restored_html"
  verify_production_contract "$restored_html"
  rm -f "$restored_html"
}
```

- [ ] **Step 5: Run the regression harness and verify it still fails only on entrypoint drift**

Run:

```bash
bash scripts/test-deploy-scripts.sh
```

Expected:
- `bash -n` passes for `deploy-lib.sh`
- harness still fails because `deploy-on.sh` and `rollback.sh` do not yet source the library or use the new flow

- [ ] **Step 6: Commit the shared library**

Run:

```bash
git add scripts/deploy-lib.sh
git commit -m "ops: add shared deployment library"
```

Expected:
- commit succeeds

### Task 3: Refactor `deploy-on.sh` into the Single Fail-Closed Deploy Entrypoint

**Files:**
- Modify: `scripts/deploy-on.sh`
- Modify: `scripts/safe-deploy.sh`
- Test: `scripts/test-deploy-scripts.sh`

- [ ] **Step 1: Replace `scripts/deploy-on.sh` with a thin orchestration wrapper**

Replace the body of `scripts/deploy-on.sh` with:

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-lib.sh"

main() {
  local backup_name=""

  print_info "Starting OmniNudge deployment..."
  run_local_preflight
  run_remote_preflight

  backup_name="$(create_server_backup)"
  print_success "Backup created: ${backup_name}"

  if ! upload_frontend_build; then
    print_follow_up_hint "Manual rollback: bash scripts/rollback.sh ${backup_name}"
    if prompt_for_rollback "A deployment step failed after production was modified. Roll back now? (yes/no): "; then
      rollback_from_backup "$backup_name"
    fi
    exit 1
  fi

  if ! upload_backend_code || ! build_backend_release || ! run_explicit_migrations || ! restart_backend_service; then
    print_follow_up_hint "Manual rollback: bash scripts/rollback.sh ${backup_name}"
    if prompt_for_rollback "A deployment step failed after production was modified. Roll back now? (yes/no): "; then
      rollback_from_backup "$backup_name"
    fi
    exit 1
  fi

  if ! verify_production_contract "$LOCAL_FRONTEND_DIST/index.html"; then
    print_follow_up_hint "Manual rollback: bash scripts/rollback.sh ${backup_name}"
    if prompt_for_rollback "Deployment verification failed. Roll back now? (yes/no): "; then
      rollback_from_backup "$backup_name"
    fi
    exit 1
  fi

  print_success "Deployment complete."
  echo "Backup created: ${backup_name}"
  echo "Manual rollback: bash scripts/rollback.sh ${backup_name}"
  echo "Logs: ssh ${SERVER} 'journalctl -u ${SERVICE_NAME} -n 100 --no-pager'"
}

main "$@"
```

- [ ] **Step 2: Keep `scripts/safe-deploy.sh` as a retired compatibility stub**

Update `scripts/safe-deploy.sh` to this exact content:

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$#" -gt 0 ]; then
  echo "scripts/safe-deploy.sh is retired and does not accept legacy arguments: $*"
  echo "Use bash scripts/deploy-on.sh directly."
  exit 1
fi

echo "scripts/safe-deploy.sh is retired. Forwarding to bash scripts/deploy-on.sh"
exec bash "$SCRIPT_DIR/deploy-on.sh" "$@"
```

- [ ] **Step 3: Run the regression harness and verify only rollback-related assertions fail**

Run:

```bash
bash scripts/test-deploy-scripts.sh
```

Expected:
- deploy entrypoint assertions now pass
- harness still fails on rollback-specific expectations until `scripts/rollback.sh` is rewritten

- [ ] **Step 4: Commit the deploy entrypoint refactor**

Run:

```bash
git add scripts/deploy-on.sh scripts/safe-deploy.sh
git commit -m "ops: refactor production deploy entrypoint"
```

Expected:
- commit succeeds

### Task 4: Rewrite `rollback.sh` Around Backup Restore Instead of Git Checkout

**Files:**
- Modify: `scripts/rollback.sh`
- Test: `scripts/test-deploy-scripts.sh`

- [ ] **Step 1: Replace commit-hash rollback with backup-based rollback selection**

Replace the body of `scripts/rollback.sh` with:

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-lib.sh"

select_backup_name() {
  local selected="${1:-}"
  if [ -n "$selected" ]; then
    printf '%s' "$selected"
    return 0
  fi

  ssh "$SERVER" "ls -1t '$BACKUP_DIR'/*.tar.gz 2>/dev/null | sed 's#^.*/##' | sed 's/\\.tar\\.gz$//'" | head -n 10
  echo ""
  read -r -p "Enter backup name to restore: " selected
  printf '%s' "$selected"
}

main() {
  local backup_name
  backup_name="$(select_backup_name "${1:-}")"

  [ -n "$backup_name" ] || {
    print_error "Rollback cancelled: no backup name provided."
    exit 1
  }

  print_warn "About to restore production from backup: ${backup_name}"
  if ! prompt_for_rollback "Are you sure you want to continue? (yes/no): "; then
    print_warn "Rollback cancelled."
    exit 0
  fi

  rollback_from_backup "$backup_name"
  print_success "Rollback completed for ${backup_name}"
  echo "Logs: ssh ${SERVER} 'journalctl -u ${SERVICE_NAME} -n 100 --no-pager'"
}

main "$@"
```

- [ ] **Step 2: Verify the rewritten rollback script no longer mutates local git state**

Run:

```bash
rg -n "git checkout|git stash|npm install" scripts/rollback.sh
```

Expected:
- no matches

- [ ] **Step 3: Run the regression harness and verify it passes**

Run:

```bash
bash scripts/test-deploy-scripts.sh
```

Expected:
- exits `0`

- [ ] **Step 3.5: Verify rollback asset checks no longer depend on the current local build**

Run:

```bash
rg -n 'LOCAL_FRONTEND_DIST/index.html' scripts/deploy-lib.sh scripts/rollback.sh
```

Expected:
- no matches from rollback code paths
- rollback verification uses a temporary copy of the restored server `index.html`

- [ ] **Step 4: Commit the backup-based rollback path**

Run:

```bash
git add scripts/rollback.sh
git commit -m "ops: rebuild backup-based rollback flow"
```

Expected:
- commit succeeds

### Task 5: Align the Runbook and Bootstrap Docs to the New Flow

**Files:**
- Modify: `RUNBOOK.md`
- Modify: `docs/guides/DEPLOYMENT_GUIDE.md`
- Modify: `docs/BEGINNER_DEPLOYMENT_GUIDE.md`
- Modify: `scripts/deploy-database.sh`
- Modify: `scripts/deploy-app.sh`
- Test: `scripts/test-deploy-scripts.sh`

- [ ] **Step 1: Replace the deployment section in `RUNBOOK.md` with the single-command flow**

Update `RUNBOOK.md` so the deployment section states:

```md
## Deployment

Canonical production deploy:

```bash
bash scripts/deploy-on.sh
```

What the script does:
1. runs fail-closed local and remote preflight checks
2. creates file and database backups on the server
3. uploads frontend and backend code
4. builds the backend on the server
5. applies pending database migrations explicitly with `go run ./cmd/migrate -action=up`
6. restarts `omninudge-backend`
7. verifies server-local `/health`, public site, public API ping, and public boot assets

If a production-changing step fails after backup creation, the script prints the raw error and asks whether to roll back immediately.
```
```

Also delete the stale note claiming backend startup pre-warms Reddit cache.

- [ ] **Step 2: Keep the archived deploy docs as pointers only**

Replace the bodies of `docs/guides/DEPLOYMENT_GUIDE.md` and `docs/BEGINNER_DEPLOYMENT_GUIDE.md` with short archival notices that point to `RUNBOOK.md` and the two live commands:

```md
# Deployment Guide

This document is archived.

For current production deployment and rollback instructions, use [RUNBOOK.md](../../RUNBOOK.md).

Canonical commands:

```bash
bash scripts/deploy-on.sh
bash scripts/rollback.sh
```
```

- [ ] **Step 3: Update bootstrap scripts so they no longer imply they are the normal deploy path**

Change the closing output in `scripts/deploy-database.sh` to:

```bash
echo "Next step: finish initial server bootstrap only if this machine is being provisioned for the first time."
echo "Bootstrap-only path: bash scripts/deploy-app.sh"
echo "Routine production deploys should use: bash scripts/deploy-on.sh"
```

Change the closing output in `scripts/deploy-app.sh` to:

```bash
echo ""
echo "Bootstrap complete."
echo "This script is for first-time server provisioning only."
echo "Routine production deploys should now use: bash scripts/deploy-on.sh"
echo "Manual rollback should use: bash scripts/rollback.sh"
```

- [ ] **Step 4: Extend the regression harness to enforce doc drift checks**

Add these lines to `scripts/test-deploy-scripts.sh`:

```bash
grep -Fq 'bash scripts/deploy-on.sh' "$RUNBOOK"
grep -Fq 'bash scripts/rollback.sh' "$RUNBOOK"
! grep -Fq 'Pre-warms Redis cache for `r/popular`' "$RUNBOOK"
```

- [ ] **Step 5: Run docs and script verification**

Run:

```bash
bash scripts/test-deploy-scripts.sh
rg -n "git checkout|HEAD~1|Pre-warms Redis cache for `r/popular`|safe-deploy\\.sh" RUNBOOK.md docs scripts
```

Expected:
- harness exits `0`
- remaining `safe-deploy.sh` references are only the retirement stub or archival notes
- no rollback docs still mention commit-hash restore as the primary path
- no runbook text still mentions Reddit prewarm

- [ ] **Step 6: Commit the documentation alignment**

Run:

```bash
git add RUNBOOK.md docs/guides/DEPLOYMENT_GUIDE.md docs/BEGINNER_DEPLOYMENT_GUIDE.md scripts/deploy-database.sh scripts/deploy-app.sh scripts/test-deploy-scripts.sh
git commit -m "docs: align deploy and rollback guidance"
```

Expected:
- commit succeeds

### Task 6: Final Local Verification and Production Deployment

**Files:**
- Test: `scripts/test-deploy-scripts.sh`
- Reference: `scripts/deploy-on.sh`
- Reference: `scripts/rollback.sh`
- Reference: `backend/cmd/migrate/main.go`

- [ ] **Step 1: Run the final local verification suite**

Run:

```bash
bash scripts/test-deploy-scripts.sh
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go build ./cmd/server ./cmd/migrate
```

Expected:
- all shell regression checks pass
- both Go commands build successfully

- [ ] **Step 2: Commit any last verification-driven adjustments**

Run:

```bash
git status --short
```

Expected:
- no unexpected modified files remain

If files changed during verification, stage and commit them before proceeding:

```bash
git add <files>
git commit -m "chore: finalize production deploy redesign"
```

- [ ] **Step 3: Run the real production deploy**

Run:

```bash
bash scripts/deploy-on.sh
```

Expected:
- preflight either fails before touching production, or passes and proceeds automatically
- a backup name is printed before mutating steps continue
- migrations are applied via `go run ./cmd/migrate -action=up`
- success prints the backup name and manual rollback command

- [ ] **Step 4: If deploy verification fails, follow the script’s rollback prompt**

If the script prints:

```text
Deployment verification failed. Roll back now? (yes/no):
```

answer based on the script’s findings:

- answer `yes` if the server state should be restored immediately
- answer `no` only if you deliberately want to keep the partially deployed state for manual debugging

Expected:
- if `yes`, the script restores files and database, rebuilds the backend, restarts the service, and re-runs health verification
- if `no`, the script exits after printing the backup name and manual rollback command

- [ ] **Step 5: Capture post-deploy evidence**

Run:

```bash
ssh root@77.42.47.79 'systemctl is-active omninudge-backend nginx postgresql@16-main'
ssh root@77.42.47.79 'journalctl -u omninudge-backend -n 50 --no-pager'
```

Expected:
- `active` for all required services
- backend logs show a clean startup with no fatal migration or health errors
