#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-lib.sh"

main() {
  local backup_name=""

  print_info "Starting OmniNudge deployment..."
  run_local_preflight
  run_remote_preflight

  if ! backup_name="$(create_server_backup)"; then
    exit 1
  fi
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

  if ! deploy_omnirave_stack_if_enabled; then
    print_follow_up_hint "Manual rollback: bash scripts/rollback.sh ${backup_name}"
    if prompt_for_rollback "The OmniRave deployment step failed after production was modified. Roll back now? (yes/no): "; then
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
