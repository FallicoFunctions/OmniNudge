#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BLEND_FILE="$ROOT_DIR/assets-src/avatars/review-rig/review-rig.blend"
OUTPUT_FILE="$ROOT_DIR/public/assets/avatars/review-rig/review-rig.glb"

blender -b "$BLEND_FILE" --python-expr "import bpy; bpy.ops.export_scene.gltf(filepath=r'$OUTPUT_FILE', export_format='GLB', export_yup=True, export_apply=True)"
