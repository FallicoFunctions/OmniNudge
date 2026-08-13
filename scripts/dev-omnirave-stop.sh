#!/usr/bin/env bash
# Stops everything dev-omnirave-start.sh started. Belt and suspenders: kills
# the recorded PIDs (go run's own process - which usually forwards the
# signal to its compiled child), THEN also kills whatever is still listening
# on the five known ports, since `go run` occasionally leaves an orphaned
# child behind if the parent dies uncleanly.
set -uo pipefail

STATE_DIR="/tmp/omnirave-dev"
PID_FILE="$STATE_DIR/pids"
PORTS=(8080 8091 8092 4173 5176)

if [ -f "$PID_FILE" ]; then
  echo "Stopping recorded PIDs..."
  while read -r pid; do
    [ -n "$pid" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
    fi
  done <"$PID_FILE"
  sleep 1
  while read -r pid; do
    [ -n "$pid" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      echo "  force-killing stubborn pid $pid"
      kill -9 "$pid" 2>/dev/null
    fi
  done <"$PID_FILE"
  rm -f "$PID_FILE"
else
  echo "No pid file at $PID_FILE (already stopped, or never started via the script)."
fi

echo "Sweeping known ports for stragglers: ${PORTS[*]}"
for port in "${PORTS[@]}"; do
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "  port $port -> killing: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done

echo "Done."
