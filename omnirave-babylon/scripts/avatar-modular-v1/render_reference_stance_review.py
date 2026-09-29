"""Render modular-avatar physiology in a relaxed reference-review stance.

Connection map (review-only pose; no geometry is created or saved):

    pelvis -> thigh_l/r -> calf_l/r -> foot_l/r
    clavicle_l/r -> upperarm_l/r -> lowerarm_l/r -> hand_l/r

Every chain remains connected through the existing parent hierarchy. Bone
matrices are changed only in Blender's temporary pose state for screenshots;
the source blend, rest skeleton, actions, shape keys, and fitted modules are
never written back.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_lean_body_review as review
from render_editorial_body_review import hide_slot, point_bone


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument(
        "--body-only",
        action="store_true",
        help="Hide torso/bottom/accessory modules but retain fitted shoes for a grounded silhouette.",
    )
    return parser.parse_args(argv)


def reset_pose(armature: bpy.types.Object) -> None:
    if armature.animation_data is not None:
        armature.animation_data.action = None
    for bone in armature.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def apply_reference_stance(armature: bpy.types.Object, sex: str) -> None:
    """Apply a restrained contrapposto without changing any joint location."""
    reset_pose(armature)

    if sex == "female":
        # Character-left leg is the free leg: slight lateral placement and
        # knee relaxation. Character-right remains the weight-bearing column.
        point_bone(armature, "thigh_r", Vector((-0.012, -0.006, -0.385)))
        point_bone(armature, "calf_r", Vector((0.004, -0.005, -0.390)))
        point_bone(armature, "thigh_l", Vector((0.068, -0.025, -0.365)))
        point_bone(armature, "calf_l", Vector((-0.012, -0.018, -0.382)))

        # Rotate only the upper arms. The lower-arm and hand chain keeps its
        # authored local relationship, preventing an absolute child-bone
        # matrix from folding loose fingers across the abdomen.
        point_bone(armature, "upperarm_r", Vector((-0.082, -0.012, -0.250)))
        point_bone(armature, "upperarm_l", Vector((0.072, -0.018, -0.252)))
    else:
        # Narrow, relaxed stance with the left knee released, echoing the
        # luxury reference while preserving the authored rest proportions.
        point_bone(armature, "thigh_r", Vector((-0.018, -0.008, -0.388)))
        point_bone(armature, "calf_r", Vector((0.003, -0.006, -0.392)))
        point_bone(armature, "thigh_l", Vector((0.038, -0.018, -0.378)))
        point_bone(armature, "calf_l", Vector((-0.008, -0.010, -0.388)))

        # Keep the authored forearm/hand chain intact and bring only the upper
        # arms closer to the flank for a readable shoulder-to-waist line.
        point_bone(armature, "upperarm_r", Vector((-0.078, -0.018, -0.252)))
        point_bone(armature, "upperarm_l", Vector((0.078, -0.018, -0.252)))

    bpy.context.view_layer.update()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    camera = review.configure_scene()
    scene = bpy.context.scene
    scene.render.resolution_x = 768
    scene.render.resolution_y = 1152
    armature = bpy.data.objects["AvatarSkeleton"]

    views = {
        "front": ((0.0, -3.72, 1.48), (0.0, -0.010, 0.875)),
        "three-quarter": ((1.42, -3.52, 1.50), (0.0, -0.010, 0.875)),
    }
    for sex, options in review.PRESETS.items():
        review.set_morph(sex, 1.0)
        for slot, option_id in options.items():
            review.set_option(slot, option_id)
        hide_slot("jacket")
        if args.body_only:
            for slot in ("top", "jacket", "bottoms", "accessories"):
                hide_slot(slot)
        apply_reference_stance(armature, sex)
        for view_name, (location, target) in views.items():
            camera.location = location
            review.look_at(camera, Vector(target))
            scene.render.filepath = str(output_dir / f"{sex}-{view_name}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
