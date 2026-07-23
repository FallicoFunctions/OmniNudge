#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BLEND_FILE="$ROOT_DIR/assets-src/main-stage/main-stage.blend"
PYTHON_SCRIPT="$ROOT_DIR/scripts/export-main-stage.py"

# Dated snapshot before touching the sole .blend - see backup-main-stage-blend.sh.
"$ROOT_DIR/scripts/backup-main-stage-blend.sh"

node "$ROOT_DIR/scripts/optimize-main-stage.mjs"
blender -b "$BLEND_FILE" --python "$PYTHON_SCRIPT"
node "$ROOT_DIR/scripts/optimize-main-stage.mjs" --finalize-exports
