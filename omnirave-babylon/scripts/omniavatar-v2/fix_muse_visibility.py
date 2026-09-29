"""Fix muse workfile: hide meshes under non-selected option empties.

Object-level hide does NOT propagate to children in Blender; only collection
hides do. Walk each option empty's subtree and hide the meshes directly.
Re-renders the four review views with identical framing.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


SELECTED = {
    "hair": "textured-crop",
    "top": "graphic-tee",
    "jacket": "bomber",
    "bottoms": "tech-joggers",
    "shoes": "high-tops",
    "accessories": "gold-hoops",
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--renders", required=True)
    return parser.parse_args(argv)


def subtree_meshes(root: bpy.types.Object) -> list[bpy.types.Object]:
    found = []
    stack = list(root.children)
    while stack:
        obj = stack.pop()
        if obj.type == "MESH":
            found.append(obj)
        stack.extend(obj.children)
    return found


def main() -> None:
    args = parse_args()
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).expanduser().resolve()))
    hidden, shown = [], []
    for obj in bpy.data.objects:
        if obj.type != "EMPTY" or not obj.name.startswith("AvatarOption_"):
            continue
        try:
            _, rest = obj.name.split("AvatarOption_", 1)
            slot, option = rest.split("__", 1)
        except ValueError:
            continue
        want_visible = SELECTED.get(slot) == option
        for mesh in subtree_meshes(obj):
            mesh.hide_viewport = not want_visible
            mesh.hide_render = not want_visible
            (shown if want_visible else hidden).append(mesh.name)
    print(f"HID {len(hidden)} meshes, SHOW {len(shown)} meshes")
    for name in sorted(shown):
        print(f"  SHOW {name}")

    renders = Path(args.renders).expanduser().resolve()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    head = Vector((0.0, -0.03, 1.575))
    views = [
        (str(renders / "muse-head-front.png"), (0.0, -0.95, 1.60), head, 85.0),
        (str(renders / "muse-head-profile.png"), (0.95, -0.03, 1.60), head, 85.0),
        (str(renders / "muse-head-three-quarter.png"), (0.62, -0.68, 1.63), head, 85.0),
        (str(renders / "muse-body-front.png"), (0.0, -4.4, 1.15),
         Vector((0.0, 0.0, 0.92)), 50.0),
    ]
    for filepath, location, aim, lens in views:
        camera_data = bpy.data.cameras.new("MUSE_ReviewCam2")
        camera = bpy.data.objects.new("MUSE_ReviewCam2", camera_data)
        scene.collection.objects.link(camera)
        review_collection = bpy.data.collections.get("MUSE_Review_DoNotExport")
        if review_collection is not None:
            for owner in list(camera.users_collection):
                owner.objects.unlink(camera)
            review_collection.objects.link(camera)
        camera.location = Vector(location)
        camera.rotation_euler = (aim - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera_data.lens = lens
        scene.camera = camera
        scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.blend).expanduser().resolve()))
    print("VISIBILITY FIX DONE")


if __name__ == "__main__":
    main()
