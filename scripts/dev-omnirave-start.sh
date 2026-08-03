#!/usr/bin/env bash
# Starts the full local OmniRave stack for manual browser testing:
#   omnigame-api (REST, :8091) + omnirave-world (WebSocket, :8092)
#   + omnirave-babylon (game runtime, :4173) + frontend (main site, :5176)
#
# All four run in the background; PIDs and logs go under /tmp/omnirave-dev
# (not the repo - this is ephemeral, machine-local state). Use
# dev-omnirave-stop.sh to tear everything down again.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="/tmp/omnirave-dev"
PID_FILE="$STATE_DIR/pids"

mkdir -p "$STATE_DIR"
: > "$PID_FILE"

# Clear the four ports first. A stale process from an earlier run (e.g. one
# whose sibling failed to bind and left this one orphaned) would otherwise
# keep serving with an OLD JWT_SECRET while the fresh processes below mint
# tokens with a NEW one - every world-socket handshake then fails silently.
PORTS=(8091 8092 4173 5176)
for port in "${PORTS[@]}"; do
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Port $port already in use (pid(s): $pids) - killing before starting fresh."
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done

# Shared secret for omnigame-api (mints world-session JWTs) and
# omnirave-world (verifies them) - any non-empty string works locally, it
# just has to match across both, which exporting it once here guarantees.
export JWT_SECRET="${JWT_SECRET:-dev-$(date +%s)}"
echo "JWT_SECRET=$JWT_SECRET"

# Without DATABASE_URL, omnigame-api falls back to an in-memory profile store
# with NO user repository wired in at all - guest play still works, but
# runtime login/signup/logout (backend/internal/omnigame/api/handlers/
# runtime_auth_handler.go) 500s with "unable to build omnirave runtime
# session" since there is no account system to check against. Defaulting to
# the same local `omninudge_dev` Postgres database backend/.env.example
# already assumes for the rest of the monorepo fixes that - schema migrations
# run automatically on boot (db.Migrate), so an empty-but-existing database is
# enough. Only applies when the caller hasn't already exported DATABASE_URL.
export DATABASE_URL="${DATABASE_URL:-postgres://$(whoami)@localhost:5432/omninudge_dev?sslmode=disable}"

start_bg() {
  local name="$1"
  shift
  local logfile="$STATE_DIR/$name.log"
  echo "Starting $name (log: $logfile)"
  "$@" >"$logfile" 2>&1 &
  echo "$!" >>"$PID_FILE"
}

# --- Backend: omnigame-api + omnirave-world ---------------------------------
cd "$REPO_ROOT/backend"
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
start_bg frontend npm run dev

echo
echo "All four processes started. PIDs: $PID_FILE"
echo "Logs: $STATE_DIR/*.log  (tail -f $STATE_DIR/omnigame-api.log etc.)"
echo "DATABASE_URL=$DATABASE_URL"
echo "(account login/signup needs that database reachable - check omnigame-api.log if it 500s)"
echo
echo "Open http://localhost:5176/games/omnirave and click 'Play as Guest'."
echo "Stop everything with: scripts/dev-omnirave-stop.sh"
