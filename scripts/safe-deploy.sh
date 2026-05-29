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
