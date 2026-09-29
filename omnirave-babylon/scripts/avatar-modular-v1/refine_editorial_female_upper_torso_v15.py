"""Create protected V15 from V14 with a female-only athletic upper torso.

Connection map (existing continuous fitted surfaces; no new primitives):

    spine_02 -> spine_03 -> clavicle_l/r -> upperarm_l/r
    AvatarBody front rib/bust surface <-> AvatarTop_* and AvatarJacket_* shells

Only the existing ``female`` shape-key coordinates in the front rib/bust band
are changed. Basis, male, lean, every bone, topology, action, material, pelvis,
waist, shoulder seam, limb, head, and clothing design remain unchanged.
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


EXPECTED_V14_SHA256 = "0da2653f62f9a4e83733d0f16b9b9883d2c5ec748897e030d272dbbaa1b66bd7"
FRONT_DEPTH_REDUCTION = 0.032
FRONT_WIDTH_REDUCTION = 0.010


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


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def attenuation(name: str) -> float:
    if name == "AvatarBody":
        return 1.0
    if name.startswith("AvatarTop_"):
        return 0.85
    if name.startswith("AvatarJacket_"):
        return 0.45
    return 0.0


def reshape_point(name: str, point: Vector) -> Vector:
    amount = attenuation(name)
    if amount <= 0.0 or point.z < 1.10 or point.z > 1.37:
        return point.copy()
    bust = math.exp(-((point.z - 1.245) / 0.105) ** 2)
    # The review camera faces the negative-Y surface. Fade the correction to
    # zero through the side/rear torso so the rib volume is never flattened.
    front = smoothstep(0.015, 0.120, -point.y)
    influence = amount * bust * front
    return Vector(
        (
            point.x * (1.0 - FRONT_WIDTH_REDUCTION * influence),
            point.y * (1.0 - FRONT_DEPTH_REDUCTION * influence),
            point.z,
        )
    )


def reshape_mesh(obj: bpy.types.Object) -> dict[str, object]:
    keys = obj.data.shape_keys
    if keys is None or keys.key_blocks.get("female") is None:
        return {
            "name": obj.name,
            "movedCoordinates": 0,
            "maxDeltaMeters": 0.0,
        }
    key = keys.key_blocks["female"]
    source_points = [point.co.copy() for point in key.data]
    moved = 0
    max_delta = 0.0
    for point, source in zip(key.data, source_points, strict=True):
        destination = reshape_point(obj.name, source)
        delta = (destination - source).length
        point.co = destination
        if delta > 1e-7:
            moved += 1
            max_delta = max(max_delta, delta)
    obj.data.update()
    return {
        "name": obj.name,
        "movedCoordinates": moved,
        "maxDeltaMeters": round(max_delta, 7),
    }


def main() -> None:
    args = parse_args()
    source_blend = Path(bpy.data.filepath).resolve()
    output_blend = Path(args.output_blend).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    if output_blend == source_blend:
        raise RuntimeError("V15 must not overwrite protected V14")
    if "fashion-v15" not in output_blend.parts:
        raise RuntimeError("Output must be contained by an explicit fashion-v15 directory")
    source_hash = sha256(source_blend)
    if source_hash != EXPECTED_V14_SHA256:
        raise RuntimeError(
            f"V15 source must be protected V14 ({EXPECTED_V14_SHA256}), got {source_hash}"
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
        bone.name: (
            bone.parent.name if bone.parent else None,
            tuple(bone.head_local),
            tuple(bone.tail_local),
        )
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
        bone.name: (
            bone.parent.name if bone.parent else None,
            tuple(bone.head_local),
            tuple(bone.tail_local),
        )
        for bone in armature.data.bones
    }
    if current_bones != bone_contract:
        raise RuntimeError("Rest skeleton or hierarchy changed")

    scene = bpy.context.scene
    scene["avatarFashionProfile"] = "editorial-v15"
    scene["avatarFashionProfileVersion"] = 15
    scene["avatarFashionSource"] = str(source_blend)
    scene["avatarAnatomyCorrection"] = "female-athletic-front-rib-bust"

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    report = {
        "status": "built",
        "sourceBlend": str(source_blend),
        "sourceSha256": source_hash,
        "outputBlend": str(output_blend),
        "profileId": "editorial-v15",
        "femaleShapeOnly": True,
        "basisMaleLeanUnchanged": True,
        "topologyUnchanged": True,
        "materialsUnchanged": True,
        "objectsUnchanged": True,
        "actionsUnchanged": True,
        "restSkeletonUnchanged": True,
        "upperTorsoCorrection": {
            "frontDepthReduction": FRONT_DEPTH_REDUCTION,
            "frontWidthReduction": FRONT_WIDTH_REDUCTION,
            "bodyAttenuation": 1.0,
            "topAttenuation": 0.85,
            "jacketAttenuation": 0.45,
        },
        "changedMeshes": changed_meshes,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
