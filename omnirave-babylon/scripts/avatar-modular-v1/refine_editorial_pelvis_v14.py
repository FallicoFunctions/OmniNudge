"""Create the protected V14 pelvis/thigh-root derivative from V13.

Connection map (existing continuous rigged surfaces; no new primitives):

    pelvis -> thigh_l/r -> calf_l/r -> foot_l/r
    AvatarBody hip surface <-> fitted AvatarBottoms_* hip/thigh shells

This pass changes only a smooth outer-hip and upper-thigh-root envelope on the
existing body and fitted bottoms. It does not move bones, split meshes, replace
the base, or touch the accepted head, shoulders, ribcage, waist, knees, calves,
feet, clothing design, materials, or animation. The fitted bottoms follow an
attenuated copy of the body field, retaining their existing overlap/contact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


EXPECTED_V13_SHA256 = "04352fa8df9b58c343cf7ada3a6bfe14509d8dd0fde0d1fdc5a6bc7b4e2b4d37"
HIP_WIDTH_REDUCTION = 0.018
THIGH_ROOT_WIDTH_REDUCTION = 0.008
HIP_DEPTH_REDUCTION = 0.008


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-blend", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def object_attenuation(name: str) -> float:
    if name == "AvatarBody":
        return 1.0
    if name.startswith("AvatarBottoms_"):
        return 0.90
    return 0.0


def reshape_point(name: str, point: Vector) -> Vector:
    attenuation = object_attenuation(name)
    if attenuation <= 0.0 or point.z < 0.62 or point.z > 1.04:
        return point.copy()
    hip = math.exp(-((point.z - 0.925) / 0.105) ** 2)
    thigh_root = math.exp(-((point.z - 0.765) / 0.135) ** 2)
    width_reduction = attenuation * max(
        HIP_WIDTH_REDUCTION * hip,
        THIGH_ROOT_WIDTH_REDUCTION * thigh_root,
    )
    depth_reduction = attenuation * HIP_DEPTH_REDUCTION * hip
    return Vector(
        (
            point.x * (1.0 - width_reduction),
            point.y * (1.0 - depth_reduction),
            point.z,
        )
    )


def reshape_mesh(obj: bpy.types.Object) -> dict[str, object]:
    keys = obj.data.shape_keys
    key_blocks = list(keys.key_blocks) if keys else []
    targets = key_blocks or [None]
    moved = 0
    max_delta = 0.0
    for key in targets:
        points = key.data if key is not None else obj.data.vertices
        source_points = [point.co.copy() for point in points]
        for point, source in zip(points, source_points, strict=True):
            destination = reshape_point(obj.name, source)
            delta = (destination - source).length
            point.co = destination
            if delta > 1e-7:
                moved += 1
                max_delta = max(max_delta, delta)
    obj.data.update()
    return {
        "name": obj.name,
        "vertices": len(obj.data.vertices),
        "shapeKeys": [key.name for key in key_blocks],
        "movedCoordinates": moved,
        "maxDeltaMeters": round(max_delta, 7),
    }


def main() -> None:
    args = parse_args()
    source_blend = Path(bpy.data.filepath).resolve()
    output_blend = Path(args.output_blend).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    if output_blend == source_blend:
        raise RuntimeError("V14 must not overwrite protected V13")
    if "fashion-v14" not in output_blend.parts:
        raise RuntimeError("Output must be contained by an explicit fashion-v14 directory")
    source_hash = sha256(source_blend)
    if source_hash != EXPECTED_V13_SHA256:
        raise RuntimeError(
            f"V14 source must be protected V13 ({EXPECTED_V13_SHA256}), got {source_hash}"
        )

    armature = bpy.data.objects.get("AvatarSkeleton")
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError("Missing AvatarSkeleton")
    meshes = sorted(
        (obj for obj in bpy.data.objects if obj.type == "MESH"),
        key=lambda obj: obj.name,
    )
    topology = {obj.name: len(obj.data.vertices) for obj in meshes}
    materials = {
        obj.name: [slot.material.name if slot.material else "" for slot in obj.material_slots]
        for obj in meshes
    }
    object_names = sorted(obj.name for obj in bpy.data.objects)
    action_names = sorted(action.name for action in bpy.data.actions)
    bone_contract = {
        bone.name: bone.parent.name if bone.parent else None
        for bone in armature.data.bones
    }
    bone_endpoints = {
        bone.name: (tuple(bone.head_local), tuple(bone.tail_local))
        for bone in armature.data.bones
    }

    changed_meshes = [reshape_mesh(obj) for obj in meshes]

    for obj in meshes:
        if len(obj.data.vertices) != topology[obj.name]:
            raise RuntimeError(f"Topology changed on {obj.name}")
        current_materials = [
            slot.material.name if slot.material else "" for slot in obj.material_slots
        ]
        if current_materials != materials[obj.name]:
            raise RuntimeError(f"Material slots changed on {obj.name}")
    if sorted(obj.name for obj in bpy.data.objects) != object_names:
        raise RuntimeError("Object contract changed")
    if sorted(action.name for action in bpy.data.actions) != action_names:
        raise RuntimeError("Action contract changed")
    current_bones = {
        bone.name: bone.parent.name if bone.parent else None
        for bone in armature.data.bones
    }
    if current_bones != bone_contract:
        raise RuntimeError("Bone hierarchy changed")
    current_endpoints = {
        bone.name: (tuple(bone.head_local), tuple(bone.tail_local))
        for bone in armature.data.bones
    }
    if current_endpoints != bone_endpoints:
        raise RuntimeError("Rest skeleton changed")

    scene = bpy.context.scene
    scene["avatarFashionProfile"] = "editorial-v14"
    scene["avatarFashionProfileVersion"] = 14
    scene["avatarFashionSource"] = str(source_blend)
    scene["avatarAnatomyCorrection"] = "restrained-outer-hip-thigh-root"

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    report = {
        "status": "built",
        "sourceBlend": str(source_blend),
        "sourceSha256": source_hash,
        "outputBlend": str(output_blend),
        "profileId": "editorial-v14",
        "geometryChanged": True,
        "topologyUnchanged": True,
        "materialsUnchanged": True,
        "objectsUnchanged": True,
        "actionsUnchanged": True,
        "restSkeletonUnchanged": True,
        "boneHierarchyUnchanged": True,
        "pelvisCorrection": {
            "hipWidthReduction": HIP_WIDTH_REDUCTION,
            "thighRootWidthReduction": THIGH_ROOT_WIDTH_REDUCTION,
            "hipDepthReduction": HIP_DEPTH_REDUCTION,
            "bottomsAttenuation": 0.90,
        },
        "changedMeshes": changed_meshes,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
