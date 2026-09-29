"""Fail the build if the shared rig does not deform every fitted region."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bpy


DEFORMING_WALK_MESHES = (
    "AvatarBody",
    "AvatarTop_graphic-tee",
    "AvatarTop_ribbed-tank",
    "AvatarTop_mesh-crop",
    "AvatarJacket_bomber",
    "AvatarJacket_utility-vest",
    "AvatarJacket_cropped-puffer",
    "AvatarBottoms_tech-joggers",
    "AvatarBottoms_cargo-pants",
    "AvatarBottoms_mesh-shorts",
    "AvatarShoes_platform-boots",
    "AvatarShoes_chunky-sneakers",
    "AvatarShoes_skate-sneakers",
    "AvatarShoes_trail-runners",
    "AvatarShoes_high-tops",
    "AvatarShoes_work-boots",
)

HEAD_BOUND_MESHES = (
    "AvatarHair_long-waves",
    "AvatarHair_box-braids",
    "AvatarHair_high-pony",
    "AvatarHair_blunt-bob",
    "AvatarHair_space-buns",
    "AvatarHair_buzz",
    "AvatarHair_taper-fade",
    "AvatarHair_textured-crop",
    "AvatarHair_man-bun",
    "AvatarHair_shoulder-shag",
    "AvatarHair_space-buns_bun_l",
    "AvatarHair_space-buns_bun_r",
    "AvatarHair_man-bun_bun_center",
    "AvatarEyebrows",
    "AvatarEyelashes",
    "AvatarAccessory_gold-hoops_l",
    "AvatarAccessory_gold-hoops_r",
)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--report")
    return parser.parse_args(argv)


def set_body_morph(name: str) -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data.shape_keys is None:
            continue
        for key in obj.data.shape_keys.key_blocks:
            if key.name in {"male", "female"}:
                key.value = 1.0 if key.name == name else 0.0


def evaluated_positions(obj: bpy.types.Object) -> list:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    return [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices]


def max_displacement(before: list, after: list) -> float:
    if len(before) != len(after):
        raise RuntimeError("Evaluated topology changed during deformation")
    return max((a - b).length for a, b in zip(after, before, strict=True))


def main() -> None:
    args = parse_args()
    armature = bpy.data.objects["AvatarSkeleton"]
    if armature.animation_data is None:
        raise RuntimeError("AvatarSkeleton has no animation data")
    results = {}

    for morph in ("male", "female"):
        set_body_morph(morph)
        armature.animation_data.action = bpy.data.actions["walk"]
        bpy.context.scene.frame_set(1)
        before = {
            name: evaluated_positions(bpy.data.objects[name])
            for name in DEFORMING_WALK_MESHES
        }
        bpy.context.scene.frame_set(13)
        after = {
            name: evaluated_positions(bpy.data.objects[name])
            for name in DEFORMING_WALK_MESHES
        }
        displacement = {
            name: max_displacement(before[name], after[name])
            for name in DEFORMING_WALK_MESHES
        }
        for name, distance in displacement.items():
            if distance < 0.001:
                raise RuntimeError(
                    f"{morph} {name} did not deform through the walk clip: {distance}"
                )
        results[morph] = displacement

    armature.animation_data.action = None
    bpy.context.scene.frame_set(0)
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    head_before = {
        name: evaluated_positions(bpy.data.objects[name])
        for name in HEAD_BOUND_MESHES
    }
    armature.pose.bones["head"].rotation_euler.y = math.radians(12.0)
    bpy.context.view_layer.update()
    head_after = {
        name: evaluated_positions(bpy.data.objects[name])
        for name in HEAD_BOUND_MESHES
    }
    head_displacement = {
        name: max_displacement(head_before[name], head_after[name])
        for name in HEAD_BOUND_MESHES
    }
    for name, distance in head_displacement.items():
        if distance < 0.001:
            raise RuntimeError(f"{name} did not follow the head bone: {distance}")
    results["headTurn"] = head_displacement

    report = json.dumps(results, indent=2)
    if args.report:
        report_path = Path(args.report).expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report + "\n", encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
