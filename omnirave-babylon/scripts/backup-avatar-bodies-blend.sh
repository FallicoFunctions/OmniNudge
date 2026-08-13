#!/usr/bin/env bash
set -euo pipefail

# generate-avatar-bodies.py opens assets-src/avatars/body-bases/avatar.blend,
# edits it, and calls bpy.ops.wm.save_as_mainfile() - overwriting the sole
# .blend in place with no built-in undo path beyond Blender's own single
# .blend1 auto-backup. Run this once before a batch of regenerations (or
# before trying an experimental change to avatar_params.py) to keep a dated
# snapshot you can restore from if a run goes wrong. Mirrors
# backup-main-stage-blend.sh's pattern for the avatar body-bases blend.
#
# Usage: scripts/backup-avatar-bodies-blend.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BLEND_FILE="$ROOT_DIR/assets-src/avatars/body-bases/avatar.blend"
BACKUP_DIR="$ROOT_DIR/assets-src/avatars/body-bases/backups"

if [ ! -f "$BLEND_FILE" ]; then
  echo "backup-avatar-bodies-blend: no file at $BLEND_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_path="$BACKUP_DIR/avatar.$timestamp.blend"
cp "$BLEND_FILE" "$backup_path"
echo "backup-avatar-bodies-blend: saved $backup_path"
