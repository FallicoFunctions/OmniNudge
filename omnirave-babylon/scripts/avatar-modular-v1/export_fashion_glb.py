"""Export the reviewed Fashion V2 derivative without touching Original or Lean V1."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--profile",
        choices=("fashion-v2", "editorial-v3", "editorial-v4", "editorial-v5", "editorial-v6", "editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11", "editorial-v12", "editorial-v13", "editorial-v14", "editorial-v15", "editorial-v16", "editorial-v17", "editorial-v18"),
        default="fashion-v2",
    )
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    output = Path(args.output).expanduser().resolve()
    expected_name = (
        "avatar-base-editorial.glb"
        if args.profile in {"editorial-v3", "editorial-v4", "editorial-v5", "editorial-v6", "editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11", "editorial-v12", "editorial-v13", "editorial-v14", "editorial-v15", "editorial-v16", "editorial-v17", "editorial-v18"}
        else "avatar-base-fashion.glb"
    )
    if output.name != expected_name:
        raise RuntimeError(f"{args.profile} preview export must use {expected_name}")

    root = bpy.data.objects.get("AvatarAsset")
    body = bpy.data.objects.get("AvatarBody")
    armature = bpy.data.objects.get("AvatarSkeleton")
    if root is None or body is None or armature is None:
        raise RuntimeError("Fashion V2 root/body/skeleton is incomplete")
    shape_keys = body.data.shape_keys
    names = [key.name for key in shape_keys.key_blocks] if shape_keys else []
    if names != ["Basis", "male", "female", "lean"]:
        raise RuntimeError(f"Unexpected Fashion V2 morph contract: {names}")
    if len(armature.data.bones) != 56:
        raise RuntimeError("Fashion V2 skeleton must retain exactly 56 bones")
    if bpy.context.scene.get("avatarFashionProfile") != args.profile:
        raise RuntimeError(f"{args.profile} scene marker is missing")

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_morph=True,
        export_skins=True,
        export_animations=True,
        export_animation_mode="BROADCAST",
        export_frame_range=False,
        export_force_sampling=False,
        export_optimize_animation_size=True,
    )
    print(output)


if __name__ == "__main__":
    main()
