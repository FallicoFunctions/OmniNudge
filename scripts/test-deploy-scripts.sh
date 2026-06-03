#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/scripts/deploy-on.sh"
ROLLBACK="$ROOT/scripts/rollback.sh"
SAFE="$ROOT/scripts/safe-deploy.sh"
LIB="$ROOT/scripts/deploy-lib.sh"
HEALTH="$ROOT/scripts/deploy-health-contract.sh"
RUNBOOK="$ROOT/RUNBOOK.md"
OMNIRAVE_README="$ROOT/omnirave-web/README.md"

bash -n "$DEPLOY"
bash -n "$ROLLBACK"
bash -n "$SAFE"
bash -n "$HEALTH"

grep -Fq 'source "$SCRIPT_DIR/deploy-lib.sh"' "$DEPLOY"
grep -Fq 'source "$SCRIPT_DIR/deploy-lib.sh"' "$ROLLBACK"
grep -Fq 'run_local_preflight' "$DEPLOY"
grep -Fq 'run_remote_preflight' "$DEPLOY"
grep -Fq 'run_explicit_migrations' "$DEPLOY"
grep -Fq 'prompt_for_rollback' "$DEPLOY"
grep -Fq 'deploy_omnirave_stack_if_enabled' "$DEPLOY"

grep -Fq 'rollback_from_backup' "$ROLLBACK"
! grep -Fq 'git checkout' "$ROLLBACK"
! grep -Fq 'git stash' "$ROLLBACK"
! grep -Fq 'npm install' "$ROLLBACK"
! grep -Fq 'HEAD~1' "$ROLLBACK"

grep -Fq 'Use bash scripts/deploy-on.sh directly.' "$SAFE"
grep -Fq 'bash scripts/deploy-on.sh' "$RUNBOOK"
grep -Fq 'bash scripts/rollback.sh' "$RUNBOOK"
! grep -Fq 'Pre-warms Redis cache for `r/popular`' "$RUNBOOK"
grep -Fq 'ENABLE_OMNIRAVE_DEPLOY' "$LIB"
grep -Fq 'build_omnirave_locally' "$LIB"
grep -Fq 'restart_omnirave_services' "$LIB"

test -f "$LIB"
bash -n "$LIB"
test -f "$OMNIRAVE_README"
