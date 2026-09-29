"""Render a physiology-first review in a relaxed fashion stance.

Connection map (review-only pose; no geometry is created or saved):

    clavicle_l/r -> upperarm_l/r -> lowerarm_l/r -> hand_l/r
    pelvis -> thigh_l/r -> calf_l/r -> foot_l/r

All connected bones retain their authored parent hierarchy. The pose changes
only the temporary Blender evaluation state used for screenshots; the shared
rest skeleton, actions, fitted modules, and source blend remain untouched.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_lean_body_review as review


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument(
        "--body-only",
        action="store_true",
        help="Hide swappable wardrobe modules so the shared body surface can be reviewed directly.",
    )
    return parser.parse_args(argv)


def hide_slot(slot: str) -> None:
    prefix = f"AvatarOption_{slot}__"
    for root in (obj for obj in bpy.data.objects if obj.name.startswith(prefix)):
        root.hide_render = True
        for child in root.children_recursive:
            child.hide_render = True


def point_bone(armature: bpy.types.Object, name: str, target: Vector) -> None:
    """Point a pose bone's local +Y axis at an armature-space direction."""
    pose_bone = armature.pose.bones[name]
    rest = pose_bone.bone.matrix_local.copy()
    rest_direction = (pose_bone.bone.tail_local - pose_bone.bone.head_local).normalized()
    delta = rest_direction.rotation_difference(target.normalized())
    rotation = (delta @ rest.to_quaternion()).to_matrix().to_4x4()
    rotation.translation = pose_bone.bone.head_local
    pose_bone.matrix = rotation


def apply_relaxed_pose(armature: bpy.types.Object) -> None:
    if armature.animation_data is not None:
        armature.animation_data.action = None
    for bone in armature.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

    # Arms hang close to the torso instead of forming the wide diagnostic
    # A-pose that made the previous body comparison look top-heavy. Rotate
    # only each upper arm so its connected lower-arm/hand chain follows the
    # authored rest relationship without relocating child pivots.
    point_bone(armature, "upperarm_l", Vector((0.085, -0.015, -0.245)))
    point_bone(armature, "upperarm_r", Vector((-0.085, -0.015, -0.245)))

    bpy.context.view_layer.update()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    camera = review.configure_scene()
    scene = bpy.context.scene
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    armature = bpy.data.objects["AvatarSkeleton"]

    views = {
        "front": ((0.0, -4.05, 1.50), (0.0, -0.015, 0.88)),
        "three-quarter": ((1.55, -3.82, 1.52), (0.0, -0.015, 0.88)),
    }
    for sex, options in review.PRESETS.items():
        review.set_morph(sex, 1.0)
        for slot, option_id in options.items():
            review.set_option(slot, option_id)
        if args.body_only:
            for slot in ("top", "jacket", "bottoms", "shoes", "accessories"):
                hide_slot(slot)
        else:
            hide_slot("jacket")
        apply_relaxed_pose(armature)
        for view_name, (location, target) in views.items():
            camera.location = location
            review.look_at(camera, Vector(target))
            scene.render.filepath = str(output_dir / f"{sex}-{view_name}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
