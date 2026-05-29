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
