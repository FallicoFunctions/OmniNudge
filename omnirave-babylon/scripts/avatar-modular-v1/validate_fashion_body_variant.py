"""Validate Fashion V2's protected derivative and rest/deformation contracts."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy


EXPECTED_ORIGINAL_SHA256 = "8ad4e6606be3ba0ec5fb387db7301e7bba5918cf8c7829b01ec320f0714d6f76"
EXPECTED_LEAN_SHA256 = "64c3806b995cbeedd6f62abe300b701c9738ab6d1def4c9bf034fd3bcfc5c9ed"
EXPECTED_BONES = 56
EXPECTED_SHAPE_KEYS = ["Basis", "male", "female", "lean"]
EXPECTED_ACTIONS = {"idle", "walk", "run"}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True)
    parser.add_argument("--original-blend", required=True)
    parser.add_argument("--lean-blend", required=True)
    parser.add_argument(
        "--profile",
        choices=("fashion-v2", "editorial-v3", "editorial-v4", "editorial-v5", "editorial-v6", "editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11", "editorial-v12", "editorial-v13", "editorial-v14", "editorial-v15", "editorial-v16", "editorial-v17", "editorial-v18"),
        default="fashion-v2",
    )
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def finite_vector(vector) -> bool:
    return all(math.isfinite(float(value)) for value in vector)


def main() -> None:
    args = parse_args()
    report_path = Path(args.report).expanduser().resolve()
    original_path = Path(args.original_blend).expanduser().resolve()
    lean_path = Path(args.lean_blend).expanduser().resolve()
    original_hash = sha256(original_path)
    lean_hash = sha256(lean_path)
    if original_hash != EXPECTED_ORIGINAL_SHA256:
        raise RuntimeError("Protected original blend hash changed")
    if lean_hash != EXPECTED_LEAN_SHA256:
        raise RuntimeError("Protected Lean V1 blend hash changed")

    armature = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    if len(armature.data.bones) != EXPECTED_BONES:
        raise RuntimeError("Fashion V2 bone count changed")
    if [key.name for key in body.data.shape_keys.key_blocks] != EXPECTED_SHAPE_KEYS:
        raise RuntimeError("Fashion V2 body shape-key contract changed")
    if not EXPECTED_ACTIONS.issubset({action.name for action in bpy.data.actions}):
        raise RuntimeError("Fashion V2 action contract is incomplete")
    if bpy.context.scene.get("avatarFashionProfile") != args.profile:
        raise RuntimeError(f"{args.profile} scene marker is missing")

    non_finite = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        keys = obj.data.shape_keys
        point_sets = [key.data for key in keys.key_blocks] if keys else [obj.data.vertices]
        for index, points in enumerate(point_sets):
            if any(not finite_vector(point.co) for point in points):
                non_finite.append(f"{obj.name}:{index}")
    if non_finite:
        raise RuntimeError(f"Non-finite mesh coordinates: {non_finite}")
    if any(
        not finite_vector(bone.head_local) or not finite_vector(bone.tail_local)
        for bone in armature.data.bones
    ):
        raise RuntimeError("Non-finite rest-bone coordinates")

    landmarks = {
        "ankle": armature.data.bones["foot_l"].head_local.z,
        "knee": armature.data.bones["calf_l"].head_local.z,
        "hip": armature.data.bones["thigh_l"].head_local.z,
        "neckBase": armature.data.bones["neck_01"].head_local.z,
        "headBase": armature.data.bones["head"].head_local.z,
        "crown": armature.data.bones["head"].tail_local.z,
    }
    expected = (
        {
            "ankle": 0.069,
            "knee": 0.520,
            "hip": 0.980,
            "neckBase": 1.474,
            "headBase": 1.590,
            "crown": 1.742,
        }
        if args.profile in {"editorial-v9", "editorial-v10"}
        else
        {
            "ankle": 0.069,
            "knee": 0.530,
            "hip": 1.010,
            "neckBase": 1.474,
            "headBase": 1.590,
            "crown": 1.742,
        }
        if args.profile in {"editorial-v11", "editorial-v12", "editorial-v13", "editorial-v14", "editorial-v15", "editorial-v16", "editorial-v17", "editorial-v18"}
        else
        {
            "ankle": 0.069,
            "knee": 0.503,
            "hip": 0.952,
            "neckBase": 1.474,
            "headBase": 1.590,
            "crown": 1.742,
        }
        if args.profile in {"editorial-v6", "editorial-v7", "editorial-v8"}
        else
        {
            "ankle": 0.069,
            "knee": 0.515,
            "hip": 0.970,
            "neckBase": 1.470,
            "headBase": 1.630,
            "crown": 1.742,
        }
        if args.profile == "editorial-v5"
        else
        {
            "ankle": 0.069,
            "knee": 0.515,
            "hip": 0.970,
            "neckBase": 1.470,
            "headBase": 1.616,
            "crown": 1.742,
        }
        if args.profile == "editorial-v4"
        else
        {
            "ankle": 0.069,
            "knee": 0.515,
            "hip": 0.970,
            "neckBase": 1.470,
            "headBase": 1.595,
            "crown": 1.742,
        }
        if args.profile == "editorial-v3"
        else {
            "ankle": 0.069,
            "knee": 0.509,
            "hip": 0.958,
            "neckBase": 1.485,
            "headBase": 1.595,
            "crown": 1.742,
        }
    )
    for key, target in expected.items():
        if abs(landmarks[key] - target) > 0.012:
            raise RuntimeError(
                f"{args.profile} landmark {key}={landmarks[key]:.4f} misses {target:.4f}"
            )

    source_height = 1.6812918186
    fashion_height = max(point.co.z for point in body.data.shape_keys.key_blocks["Basis"].data)
    height_gain = fashion_height / source_height - 1.0
    if not 0.03 <= height_gain <= 0.045:
        raise RuntimeError(f"Unexpected {args.profile} height gain {height_gain:.4f}")

    report = {
        "status": "pass",
        "profile": args.profile,
        "blend": bpy.data.filepath,
        "protectedHashes": {
            "original": original_hash,
            "leanV1": lean_hash,
        },
        "boneCount": len(armature.data.bones),
        "shapeKeys": EXPECTED_SHAPE_KEYS,
        "actions": sorted(EXPECTED_ACTIONS),
        "finiteMeshCoordinates": True,
        "finiteBoneCoordinates": True,
        "restLandmarksMeters": landmarks,
        "bodyHeightMeters": fashion_height,
        "heightGainFromLeanBasis": height_gain,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
