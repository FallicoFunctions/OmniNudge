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
BACKUP_KEEP_TAR="${BACKUP_KEEP_TAR:-5}"
BACKUP_KEEP_SQL="${BACKUP_KEEP_SQL:-10}"
SERVICE_NAME="${SERVICE_NAME:-omninudge-backend}"
ENABLE_OMNIRAVE_DEPLOY="${ENABLE_OMNIRAVE_DEPLOY:-0}"
OMNIGAME_API_SERVICE_NAME="${OMNIGAME_API_SERVICE_NAME:-omnigame-api}"
OMNIRAVE_WORLD_SERVICE_NAME="${OMNIRAVE_WORLD_SERVICE_NAME:-omnirave-world}"
OMNIGAME_API_HEALTH_URL="${OMNIGAME_API_HEALTH_URL:-http://127.0.0.1:8091/health}"
OMNIRAVE_WORLD_HEALTH_URL="${OMNIRAVE_WORLD_HEALTH_URL:-http://127.0.0.1:8092/health}"
LOCAL_FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOCAL_BACKEND_DIR="$PROJECT_ROOT/backend"
LOCAL_FRONTEND_DIST="$PROJECT_ROOT/frontend/dist"
LOCAL_OMNIRAVE_DIR="$PROJECT_ROOT/omnirave-web"
LOCAL_OMNIRAVE_DIST="$PROJECT_ROOT/omnirave-web/dist"
OMNIRAVE_RUNTIME_REMOTE_PATH="${OMNIRAVE_RUNTIME_REMOTE_PATH:-$SERVER_PATH/omnirave-web}"
OMNIRAVE_RUNTIME_REMOTE_DIST="${OMNIRAVE_RUNTIME_REMOTE_DIST:-$OMNIRAVE_RUNTIME_REMOTE_PATH/dist}"

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
run_capture() {
  local label="$1"
  shift
  local had_errexit=0

  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/omninudge-deploy.XXXXXX")"

  case $- in
    *e*) had_errexit=1 ;;
  esac

  set +e
  "$@" >"$tmp" 2>&1
  LAST_STATUS=$?
  if [ "$had_errexit" -eq 1 ]; then
    set -e
  else
    set +e
  fi

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
  local encoded
  encoded="$(printf '%s' "$remote_cmd" | base64 | tr -d '\n')"
  run_capture "$label" ssh "$SERVER" "printf %s \"$encoded\" | base64 -d | bash -se"
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

build_omnirave_locally() {
  run_capture "omnirave-web build" /bin/zsh -lc "cd '$LOCAL_OMNIRAVE_DIR' && npm run build"
}

build_omnirave_backend_binaries_locally() {
  run_capture "omnigame binaries build" /bin/zsh -lc "cd '$LOCAL_BACKEND_DIR' && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go build ./cmd/omnigame-api ./cmd/omnirave-world"
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
  if [ "$ENABLE_OMNIRAVE_DEPLOY" = "1" ]; then
    build_omnirave_locally
    build_omnirave_backend_binaries_locally
  fi
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
  run_remote_capture "database backup prerequisites" "grep -E '^DB_USER=.+' '$SERVER_PATH/backend/.env' && grep -E '^DB_PASSWORD=.+' '$SERVER_PATH/backend/.env' && grep -E '^DB_NAME=.+' '$SERVER_PATH/backend/.env'"
  if [ "$ENABLE_OMNIRAVE_DEPLOY" = "1" ]; then
    run_remote_capture "omnirave deployment paths" "mkdir -p '$OMNIRAVE_RUNTIME_REMOTE_DIST' && test -d '$SERVER_PATH/backend' && test -f '$SERVER_PATH/backend/.env'"
    run_remote_capture "omnigame-api service presence" "systemctl cat '$OMNIGAME_API_SERVICE_NAME' >/dev/null"
    run_remote_capture "omnirave-world service presence" "systemctl cat '$OMNIRAVE_WORLD_SERVICE_NAME' >/dev/null"
  fi
  print_success "Remote preflight passed."
}
create_server_backup() {
  local backup_name
  local file_prune_start
  local db_prune_start
  backup_name="backup-$(date +%Y%m%d-%H%M%S)"
  file_prune_start=$((BACKUP_KEEP_TAR + 1))
  db_prune_start=$((BACKUP_KEEP_SQL + 1))

  if ! run_remote_capture "server backup" "set -eo pipefail
mkdir -p '$BACKUP_DIR'
cd '$SERVER_PATH'
paths=(backend frontend)
if [ -d 'omnirave-web' ]; then
  paths+=(omnirave-web)
fi
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
  \"\${paths[@]}\"
DB_USER=\$(grep '^DB_USER=' '$SERVER_PATH/backend/.env' | cut -d= -f2)
DB_PASSWORD=\$(grep '^DB_PASSWORD=' '$SERVER_PATH/backend/.env' | cut -d= -f2-)
DB_NAME=\$(grep '^DB_NAME=' '$SERVER_PATH/backend/.env' | cut -d= -f2-)
PGPASSWORD=\"\$DB_PASSWORD\" pg_dump --clean --if-exists -U \"\$DB_USER\" -h localhost \"\$DB_NAME\" | gzip > '$BACKUP_DIR/${backup_name}.sql.gz'
find '$BACKUP_DIR' -maxdepth 1 -type f -name 'backup-*.tar.gz' -printf '%T@ %p\n' | sort -nr | awk '{print \$2}' | tail -n +$file_prune_start | xargs -r rm -f
find '$BACKUP_DIR' -maxdepth 1 -type f -name 'backup-*.sql.gz' -printf '%T@ %p\n' | sort -nr | awk '{print \$2}' | tail -n +$db_prune_start | xargs -r rm -f"; then
    return 1
  fi

  printf '%s' "$backup_name"
}

upload_frontend_build() {
  run_capture "frontend upload" rsync -avz --delete "$LOCAL_FRONTEND_DIST/" "$SERVER:$SERVER_PATH/frontend/dist/"
}

upload_omnirave_build() {
  run_capture "omnirave-web upload" rsync -avz --delete "$LOCAL_OMNIRAVE_DIST/" "$SERVER:$OMNIRAVE_RUNTIME_REMOTE_DIST/"
}

upload_backend_code() {
  run_capture "backend upload" rsync -avz \
    --delete \
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

build_omnirave_backend_release() {
  local build_version
  build_version="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  run_remote_capture "omnigame backend release build" "set -eo pipefail
cd '$SERVER_PATH/backend'
export PATH=\$PATH:/usr/local/go/bin
go build -ldflags='-X main.appVersion=${build_version}' -o omnigame-api-server ./cmd/omnigame-api
go build -ldflags='-X main.appVersion=${build_version}' -o omnirave-world-server ./cmd/omnirave-world"
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

restart_omnirave_services() {
  run_remote_capture "omnirave service restart" "set -eo pipefail
systemctl restart '$OMNIGAME_API_SERVICE_NAME'
systemctl restart '$OMNIRAVE_WORLD_SERVICE_NAME'
sleep 2
systemctl is-active --quiet '$OMNIGAME_API_SERVICE_NAME'
systemctl is-active --quiet '$OMNIRAVE_WORLD_SERVICE_NAME'
curl -fsS '$OMNIGAME_API_HEALTH_URL' >/tmp/omnigame-api-health.json
curl -fsS '$OMNIRAVE_WORLD_HEALTH_URL' >/tmp/omnirave-world-health.txt
test -f '$OMNIRAVE_RUNTIME_REMOTE_DIST/index.html'"
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

verify_omnirave_contract_if_enabled() {
  if [ "$ENABLE_OMNIRAVE_DEPLOY" != "1" ]; then
    return 0
  fi

  run_remote_capture "omnirave deploy verification" "set -eo pipefail
test -f '$OMNIRAVE_RUNTIME_REMOTE_DIST/index.html'
curl -fsS '$OMNIGAME_API_HEALTH_URL' >/tmp/omnigame-api-health.json
curl -fsS '$OMNIRAVE_WORLD_HEALTH_URL' >/tmp/omnirave-world-health.txt"
}

deploy_omnirave_stack_if_enabled() {
  if [ "$ENABLE_OMNIRAVE_DEPLOY" != "1" ]; then
    return 0
  fi

  upload_omnirave_build &&
    build_omnirave_backend_release &&
    restart_omnirave_services &&
    verify_omnirave_contract_if_enabled
}

stop_backend_service() {
  run_remote_capture "backend stop" "systemctl stop '$SERVICE_NAME'"
}

stop_omnirave_services_if_enabled() {
  if [ "$ENABLE_OMNIRAVE_DEPLOY" != "1" ]; then
    return 0
  fi

  run_remote_capture "omnirave services stop" "systemctl stop '$OMNIGAME_API_SERVICE_NAME' '$OMNIRAVE_WORLD_SERVICE_NAME' || true"
}

restore_backup_bundle() {
  local backup_name="$1"
  run_remote_capture "file restore" "set -eo pipefail
cd '$SERVER_PATH'
rm -rf '$SERVER_PATH/backend' '$SERVER_PATH/frontend' '$OMNIRAVE_RUNTIME_REMOTE_PATH'
tar -xzf '$BACKUP_DIR/${backup_name}.tar.gz'"
  run_remote_capture "database restore" "set -eo pipefail
DB_USER=\$(grep '^DB_USER=' '$SERVER_PATH/backend/.env' | cut -d= -f2-)
DB_PASSWORD=\$(grep '^DB_PASSWORD=' '$SERVER_PATH/backend/.env' | cut -d= -f2-)
DB_NAME=\$(grep '^DB_NAME=' '$SERVER_PATH/backend/.env' | cut -d= -f2-)
PGPASSWORD=\"\$DB_PASSWORD\" gunzip -c '$BACKUP_DIR/${backup_name}.sql.gz' | psql -v ON_ERROR_STOP=1 -U \"\$DB_USER\" -h localhost \"\$DB_NAME\""
}

rebuild_backend_after_restore() {
  build_backend_release
  if [ "$ENABLE_OMNIRAVE_DEPLOY" = "1" ]; then
    build_omnirave_backend_release
  fi
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
  stop_backend_service
  stop_omnirave_services_if_enabled
  restore_backup_bundle "$backup_name"
  rebuild_backend_after_restore
  restart_backend_service
  if [ "$ENABLE_OMNIRAVE_DEPLOY" = "1" ]; then
    restart_omnirave_services
  fi
  fetch_remote_reference_html "$restored_html"
  verify_production_contract "$restored_html"
  verify_omnirave_contract_if_enabled
  rm -f "$restored_html"
}
