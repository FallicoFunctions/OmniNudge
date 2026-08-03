#!/usr/bin/env bash
set -euo pipefail

# Regenerates both avatar body bases and exports the runtime GLB. Backs the
# blend up first (see backup-avatar-bodies-blend.sh) since the generator
# saves over the sole .blend in place.
#
# Usage: scripts/export-avatar-bodies.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BLEND_FILE="$ROOT_DIR/assets-src/avatars/body-bases/avatar.blend"
OUTPUT_FILE="$ROOT_DIR/public/assets/avatars/avatar-bodies.glb"

"$ROOT_DIR/scripts/backup-avatar-bodies-blend.sh"

blender -b "$BLEND_FILE" --python "$ROOT_DIR/scripts/generate-avatar-bodies.py" -- --write

mkdir -p "$(dirname "$OUTPUT_FILE")"
blender -b "$BLEND_FILE" --python-expr "
import bpy
bpy.ops.export_scene.gltf(
    filepath=r'$OUTPUT_FILE',
    export_format='GLB',
    export_yup=True,
    export_apply=False,
    export_skins=True,
    export_def_bones=True,
    export_tangents=True,
    export_materials='EXPORT',
)
"

echo "export-avatar-bodies: wrote $OUTPUT_FILE"
