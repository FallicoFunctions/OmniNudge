#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BENCH_SQL="$ROOT_DIR/scripts/search_messages_1m_benchmark.sql"
ASSERT_SQL="$ROOT_DIR/scripts/search_messages_perf_assert.sql"
CLEAN_SQL="$ROOT_DIR/scripts/search_messages_1m_cleanup.sql"

echo "==> Running 1M benchmark seed/query script"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BENCH_SQL"

echo "==> Running latency assertion script (<=500ms)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ASSERT_SQL"

if [[ "${1:-}" == "--cleanup" ]]; then
  echo "==> Cleaning benchmark dataset"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$CLEAN_SQL"
fi

echo "Done."
