"""Export the evaluated modular body surface for deterministic geometry gates.

Connection map (read-only evaluation):

    AvatarSkeleton -> AvatarBody shape keys -> evaluated mesh -> JSON gate payload

The source blend is never saved. Only the selected sex key and the existing lean key
are enabled, matching the review renderer. Coordinates and normals are emitted in world
space so the self-intersection gate evaluates the exact posed surface it would render.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--sex", choices=("female", "male"), required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def set_morph(body: bpy.types.Object, sex: str) -> None:
    keys = body.data.shape_keys
    if keys is None:
        raise RuntimeError("AvatarBody is missing shape keys")
    for key in keys.key_blocks:
        key.value = 0.0
    keys.key_blocks[sex].value = 1.0
    keys.key_blocks["lean"].value = 1.0


def main() -> None:
    args = parse_args()
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    body = bpy.data.objects["AvatarBody"]
    set_morph(body, args.sex)
    bpy.context.view_layer.update()

    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    # Blender 5.1 can return None from Object.to_mesh() for linked/evaluated
    # skinned data in background mode. The dependency-graph object's data is
    # already the evaluated mesh and retains the exact morph result we need.
    mesh = evaluated.data
    mesh.calc_loop_triangles()
    world = evaluated.matrix_world
    normal_matrix = world.to_3x3().inverted().transposed()
    vertices = [list(world @ vertex.co) for vertex in mesh.vertices]
    normals = [list((normal_matrix @ vertex.normal).normalized()) for vertex in mesh.vertices]
    indices = [
        index
        for triangle in mesh.loop_triangles
        for index in triangle.vertices
    ]
    payload = {
        "name": f"AvatarBody-{args.sex}",
        "vertices": vertices,
        "indices": indices,
        "normals": normals,
    }
    output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
