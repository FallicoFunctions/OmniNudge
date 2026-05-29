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
