#!/usr/bin/env bash
# Starts the full local OmniNudge + OmniRave stack for browser play:
#   main backend (:8080) + omnigame-api (REST, :8091)
#   + omnirave-world (WebSocket, :8092) + omnirave-babylon (:4173)
#   + frontend (main site, :5176)
#
# All five run in the background; PIDs and logs go under /tmp/omnirave-dev
# (not the repo - this is ephemeral, machine-local state). Use
# dev-omnirave-stop.sh to tear everything down again.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="/tmp/omnirave-dev"
PID_FILE="$STATE_DIR/pids"
JWT_SECRET_FILE="$STATE_DIR/jwt-secret"
ENCRYPTION_KEY_FILE="$STATE_DIR/encryption-key"

umask 077
mkdir -p "$STATE_DIR"
: > "$PID_FILE"

cleanup_failed_start() {
  local exit_code="$?"
  trap - ERR
  echo "Local OmniRave startup failed; stopping processes from this run." >&2
  bash "$REPO_ROOT/scripts/dev-omnirave-stop.sh" >&2 || true
  exit "$exit_code"
}
trap cleanup_failed_start ERR

# Clear the five ports first. A stale process from an earlier run (e.g. one
# whose sibling failed to bind and left this one orphaned) would otherwise
# keep serving with an OLD JWT_SECRET while the fresh processes below mint
# tokens with a NEW one - every world-socket handshake then fails silently.
PORTS=(8080 8091 8092 4173 5176)
for port in "${PORTS[@]}"; do
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Port $port already in use (pid(s): $pids) - killing before starting fresh."
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done

# Keep generated development secrets stable across stop/start cycles without
# exposing them in terminal output or committing them. Explicit caller values
# still win, which lets an existing backend/.env remain authoritative.
if [ -z "${JWT_SECRET:-}" ]; then
  if [ ! -s "$JWT_SECRET_FILE" ]; then
    openssl rand -base64 32 > "$JWT_SECRET_FILE"
  fi
  JWT_SECRET="$(<"$JWT_SECRET_FILE")"
fi
export JWT_SECRET

if [ -z "${ENCRYPTION_KEY:-}" ]; then
  if [ ! -s "$ENCRYPTION_KEY_FILE" ]; then
    openssl rand -base64 32 > "$ENCRYPTION_KEY_FILE"
  fi
  ENCRYPTION_KEY="$(<"$ENCRYPTION_KEY_FILE")"
fi
export ENCRYPTION_KEY

# The main OmniNudge API and both OmniRave services share the same local
# database and JWT trust boundary. Keep safe development defaults here so the
# normal site, account auth, and game handoff all work from this one command.
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5432}"
export DB_USER="${DB_USER:-$(whoami)}"
export DB_PASSWORD="${DB_PASSWORD:-}"
export DB_NAME="${DB_NAME:-omninudge_dev}"
export DB_SSLMODE="${DB_SSLMODE:-disable}"
export DB_AUTO_MIGRATE="${DB_AUTO_MIGRATE:-true}"

# Without DATABASE_URL, omnigame-api falls back to an in-memory profile store
# with NO user repository wired in at all - guest play still works, but
# runtime login/signup/logout (backend/internal/omnigame/api/handlers/
# runtime_auth_handler.go) 500s with "unable to build omnirave runtime
# session" since there is no account system to check against. Defaulting to
# the same local `omninudge_dev` Postgres database backend/.env.example
# already assumes for the rest of the monorepo fixes that - schema migrations
# run automatically on boot (db.Migrate), so an empty-but-existing database is
# enough. Only applies when the caller hasn't already exported DATABASE_URL.
export DATABASE_URL="${DATABASE_URL:-postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=$DB_SSLMODE}"

start_bg() {
  local name="$1"
  shift
  local logfile="$STATE_DIR/$name.log"
  echo "Starting $name (log: $logfile)"
  nohup "$@" >"$logfile" 2>&1 < /dev/null &
  echo "$!" >>"$PID_FILE"
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local logfile="$STATE_DIR/$name.log"
  local attempt
  for attempt in $(seq 1 120); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "Ready: $name ($url)"
      return 0
    fi
    sleep 0.5
  done
  echo "Failed to start $name. Recent log output:" >&2
  tail -n 40 "$logfile" >&2 || true
  return 1
}

# --- Backend: main site API + OmniRave services -----------------------------
cd "$REPO_ROOT/backend"
start_bg omninudge-backend go run ./cmd/server
start_bg omnigame-api go run ./cmd/omnigame-api
start_bg omnirave-world go run ./cmd/omnirave-world

# --- Game runtime (port pinned to 4173 to match every backend default) -----
cd "$REPO_ROOT/omnirave-babylon"
if [ ! -d node_modules ]; then
  echo "Installing omnirave-babylon dependencies..."
  npm install
fi
start_bg omnirave-babylon npx vite --host 127.0.0.1 --port 4173

# --- Main OmniNudge site (:5176 per its vite.config.ts) ---------------------
cd "$REPO_ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies..."
  npm install
fi
start_bg frontend npm run dev -- --host 127.0.0.1 --port 5176

wait_for_url omninudge-backend http://localhost:8080/health
wait_for_url omnigame-api http://localhost:8091/health
wait_for_url omnirave-world http://localhost:8092/health
wait_for_url omnirave-babylon http://localhost:4173/omnirave
wait_for_url frontend http://localhost:5176/games/omnirave

# Startup is complete; leave the recorded services running for the player.
trap - ERR

echo
echo "All five processes started. PIDs: $PID_FILE"
echo "Logs: $STATE_DIR/*.log  (tail -f $STATE_DIR/omnigame-api.log etc.)"
echo "Database: $DB_NAME on $DB_HOST:$DB_PORT"
echo "(account login/signup needs that database reachable - check omnigame-api.log if it 500s)"
echo
echo "Open http://localhost:5176, choose Games -> OmniRave, and click 'Play'."
echo "Stop everything with: scripts/dev-omnirave-stop.sh"
