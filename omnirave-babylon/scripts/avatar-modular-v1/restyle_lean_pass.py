"""Apply a reversible lean fashion silhouette pass to the modular avatar blend.

The shared armature and shape-key topology stay untouched. Object-level scales narrow
the anatomy and fitted shells together, leaving footwear intentionally oversized.
"""

from __future__ import annotations

import bpy
from mathutils import Vector


def main() -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        name = obj.name
        # Keep the rig and object origins intact; only visual cross-section changes.
        if name == "AvatarBody":
            obj.scale = (0.86, 0.88, 1.04)
        elif name.startswith("AvatarShoes_"):
            obj.scale = (0.98, 0.98, 1.02)
        elif name.startswith("AvatarHair_"):
            obj.scale = (0.91, 0.91, 1.04)
        elif name.startswith("AvatarAccessory_") or name.startswith("AvatarEye") or name.startswith("AvatarIris") or name.startswith("AvatarPupil") or name in {"AvatarEyebrows", "AvatarEyelashes"}:
            obj.scale = (0.90, 0.90, 1.04)
        else:
            # Garment volume remains visible, but its width is owned by the outfit,
            # not by a stocky underlying body.
            obj.scale = (0.91, 0.91, 1.04)
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)


if __name__ == "__main__":
    main()
