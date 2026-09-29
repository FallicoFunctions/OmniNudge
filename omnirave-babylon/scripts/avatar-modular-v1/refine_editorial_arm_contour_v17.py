"""Create protected V17 from V16 with restrained athletic arm contours.

Connection map (existing connected rig; no primitives or detached geometry):

    clavicle_l/r -> upperarm_l/r -> lowerarm_l/r -> hand_l/r
    AvatarBody arm surface <-> AvatarTop_* and AvatarJacket_* fitted sleeves

The pass scales only the radial distance from the existing upper-arm and
forearm bone axes.  A smooth zero-at-joints envelope preserves shoulder,
elbow, and wrist connections while adding the modest mid-limb volume visible
in the physiology references.  The rest skeleton, topology, materials,
actions, object inventory, hands, torso, pelvis, legs, head, and wardrobe
design remain unchanged.
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


EXPECTED_V16_SHA256 = "37f047500ff20f1478eb1c0f2ba423fadf82b31c470177f93013cee9cf1710f1"
UPPER_ARM_RADIAL_GAIN = 0.032
FOREARM_RADIAL_GAIN = 0.024
TARGET_BONES = {"upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"}


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


def closest_parameter(point: Vector, start: Vector, end: Vector) -> float:
    axis = end - start
    length_squared = axis.length_squared
    if length_squared <= 1e-12:
        return 0.0
    return max(0.0, min(1.0, (point - start).dot(axis) / length_squared))


def object_attenuation(name: str) -> float:
    if name == "AvatarBody":
        return 1.0
    if name.startswith("AvatarTop_"):
        return 1.0
    if name.startswith("AvatarJacket_"):
        return 0.82
    return 0.0


def radial_gain(bone_name: str, t: float) -> float:
    # sin^2 reaches exactly zero at both joints, so the fitted surfaces keep
    # their existing assembly contact and the elbow/wrist seams cannot split.
    joint_envelope = math.sin(math.pi * t) ** 2
    if bone_name.startswith("upperarm_"):
        return UPPER_ARM_RADIAL_GAIN * joint_envelope
    # Shift the forearm volume subtly toward its proximal third instead of
    # creating a uniform tube.
    proximal_bias = 1.15 - 0.30 * t
    return FOREARM_RADIAL_GAIN * joint_envelope * proximal_bias


def reshape_point(
    obj: bpy.types.Object,
    vertex: bpy.types.MeshVertex,
    local_point: Vector,
    armature: bpy.types.Object,
    bones: dict[str, tuple[Vector, Vector]],
) -> Vector:
    attenuation = object_attenuation(obj.name)
    if attenuation <= 0.0:
        return local_point.copy()

    object_to_armature = armature.matrix_world.inverted() @ obj.matrix_world
    armature_to_object = object_to_armature.inverted()
    point = object_to_armature @ local_point

    influences: list[tuple[float, str]] = []
    for membership in vertex.groups:
        if membership.group >= len(obj.vertex_groups) or membership.weight <= 0.0:
            continue
        bone_name = obj.vertex_groups[membership.group].name
        if bone_name in TARGET_BONES:
            influences.append((membership.weight, bone_name))
    total = sum(weight for weight, _ in influences)
    if total <= 1e-6:
        return local_point.copy()

    destination = Vector((0.0, 0.0, 0.0))
    for weight, bone_name in influences:
        head, tail = bones[bone_name]
        t = closest_parameter(point, head, tail)
        anchor = head.lerp(tail, t)
        radial = point - anchor
        target = anchor + radial * (1.0 + radial_gain(bone_name, t))
        destination += target * (weight / total)

    # Respect partial arm weights at shoulder and elbow blends, while fully
    # applying the contour to vertices owned by the limb chain.
    blend = attenuation * min(1.0, total)
    return armature_to_object @ point.lerp(destination, blend)


def reshape_mesh(
    obj: bpy.types.Object,
    armature: bpy.types.Object,
    bones: dict[str, tuple[Vector, Vector]],
) -> dict[str, object]:
    keys = obj.data.shape_keys
    key_blocks = list(keys.key_blocks) if keys else []
    targets = key_blocks or [None]
    moved = 0
    max_delta = 0.0
    for key in targets:
        points = key.data if key is not None else obj.data.vertices
        sources = [point.co.copy() for point in points]
        for vertex, point, source in zip(
            obj.data.vertices, points, sources, strict=True
        ):
            destination = reshape_point(obj, vertex, source, armature, bones)
            delta = (destination - source).length
            point.co = destination
            if delta > 1e-7:
                moved += 1
                max_delta = max(max_delta, delta)
    obj.data.update()
    return {
        "name": obj.name,
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
        raise RuntimeError("V17 must not overwrite protected V16")
    if "fashion-v17" not in output_blend.parts:
        raise RuntimeError("Output must be contained by an explicit fashion-v17 directory")
    source_hash = sha256(source_blend)
    if source_hash != EXPECTED_V16_SHA256:
        raise RuntimeError(
            f"V17 source must be protected V16 ({EXPECTED_V16_SHA256}), got {source_hash}"
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
    arm_bones = {
        name: (
            armature.data.bones[name].head_local.copy(),
            armature.data.bones[name].tail_local.copy(),
        )
        for name in TARGET_BONES
    }

    changed_meshes = [
        reshape_mesh(obj, armature, arm_bones) for obj in meshes
    ]

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
    scene["avatarFashionProfile"] = "editorial-v17"
    scene["avatarFashionProfileVersion"] = 17
    scene["avatarFashionSource"] = str(source_blend)
    scene["avatarAnatomyCorrection"] = "restrained-athletic-arm-contour"

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    report = {
        "status": "built",
        "sourceBlend": str(source_blend),
        "sourceSha256": source_hash,
        "outputBlend": str(output_blend),
        "profileId": "editorial-v17",
        "topologyUnchanged": True,
        "materialsUnchanged": True,
        "objectsUnchanged": True,
        "actionsUnchanged": True,
        "restSkeletonUnchanged": True,
        "armContour": {
            "upperArmRadialGain": UPPER_ARM_RADIAL_GAIN,
            "forearmRadialGain": FOREARM_RADIAL_GAIN,
            "jointEnvelope": "sin(pi*t)^2; zero at shoulder, elbow, and wrist",
            "bodyAttenuation": 1.0,
            "topAttenuation": 1.0,
            "jacketAttenuation": 0.82,
        },
        "changedMeshes": changed_meshes,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
