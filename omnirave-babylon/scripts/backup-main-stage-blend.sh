#!/usr/bin/env bash
set -euo pipefail

# Every generator/replace/apply script under scripts/*.py opens
# assets-src/main-stage/main-stage.blend, edits it, and calls
# bpy.ops.wm.save_mainfile() - overwriting the sole .blend in place with no
# built-in undo path beyond Blender's own single .blend1 auto-backup. Run
# this once before a batch of those scripts (or before trying an experimental
# one) to keep a dated snapshot you can restore from if a run goes wrong.
#
# Usage: scripts/backup-main-stage-blend.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BLEND_FILE="$ROOT_DIR/assets-src/main-stage/main-stage.blend"
BACKUP_DIR="$ROOT_DIR/assets-src/main-stage/backups"

if [ ! -f "$BLEND_FILE" ]; then
  echo "backup-main-stage-blend: no file at $BLEND_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_path="$BACKUP_DIR/main-stage.$timestamp.blend"
cp "$BLEND_FILE" "$backup_path"
echo "backup-main-stage-blend: saved $backup_path"
