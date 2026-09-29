"""Create protected V18 from V17 with natural calf-to-ankle taper.

Connection map (existing connected rig; no primitives or detached geometry):

    pelvis -> thigh_l/r -> calf_l/r -> foot_l/r
    AvatarBody lower-leg surface <-> AvatarBottoms_* fitted shells

Only radial distance from each existing calf-bone axis is adjusted.  The
envelope is zero at knee and ankle, peaks in the proximal calf, and is applied
to the body plus fitted bottoms.  The rest skeleton, topology, materials,
actions, feet, shoes, thighs, pelvis, torso, arms, head, and wardrobe design
remain unchanged.
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


EXPECTED_V17_SHA256 = "a98859dab231e19858e07e6532d7727780070db63bb4565b76f42edb851a3d36"
CALF_RADIAL_GAIN = 0.036
TARGET_BONES = {"calf_l", "calf_r"}


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


def attenuation(name: str) -> float:
    if name == "AvatarBody":
        return 1.0
    if name.startswith("AvatarBottoms_"):
        return 0.78
    return 0.0


def contour_gain(t: float) -> float:
    # The base envelope fixes both joint loops. A smooth proximal bias moves
    # the visual high point above mid-calf, avoiding a generic tube silhouette.
    joint_envelope = math.sin(math.pi * t) ** 2
    proximal_bias = 1.28 - 0.56 * t
    return CALF_RADIAL_GAIN * joint_envelope * proximal_bias


def reshape_point(
    obj: bpy.types.Object,
    vertex: bpy.types.MeshVertex,
    local_point: Vector,
    armature: bpy.types.Object,
    bones: dict[str, tuple[Vector, Vector]],
) -> Vector:
    object_amount = attenuation(obj.name)
    if object_amount <= 0.0:
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
        target = anchor + radial * (1.0 + contour_gain(t))
        destination += target * (weight / total)
    blend = object_amount * min(1.0, total)
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
        for vertex, point, source in zip(obj.data.vertices, points, sources, strict=True):
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
        raise RuntimeError("V18 must not overwrite protected V17")
    if "fashion-v18" not in output_blend.parts:
        raise RuntimeError("Output must be contained by an explicit fashion-v18 directory")
    source_hash = sha256(source_blend)
    if source_hash != EXPECTED_V17_SHA256:
        raise RuntimeError(
            f"V18 source must be protected V17 ({EXPECTED_V17_SHA256}), got {source_hash}"
        )

    armature = bpy.data.objects.get("AvatarSkeleton")
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError("Missing AvatarSkeleton")
    meshes = sorted((obj for obj in bpy.data.objects if obj.type == "MESH"), key=lambda obj: obj.name)
    topology = {obj.name: len(obj.data.vertices) for obj in meshes}
    materials = {obj.name: [slot.material.name if slot.material else "" for slot in obj.material_slots] for obj in meshes}
    object_names = sorted(obj.name for obj in bpy.data.objects)
    action_names = sorted(action.name for action in bpy.data.actions)
    bone_contract = {bone.name: (bone.parent.name if bone.parent else None, tuple(bone.head_local), tuple(bone.tail_local)) for bone in armature.data.bones}
    calf_bones = {name: (armature.data.bones[name].head_local.copy(), armature.data.bones[name].tail_local.copy()) for name in TARGET_BONES}

    changed_meshes = [reshape_mesh(obj, armature, calf_bones) for obj in meshes]

    for obj in meshes:
        if len(obj.data.vertices) != topology[obj.name]:
            raise RuntimeError(f"Topology changed on {obj.name}")
        if [slot.material.name if slot.material else "" for slot in obj.material_slots] != materials[obj.name]:
            raise RuntimeError(f"Material slots changed on {obj.name}")
    if sorted(obj.name for obj in bpy.data.objects) != object_names:
        raise RuntimeError("Object contract changed")
    if sorted(action.name for action in bpy.data.actions) != action_names:
        raise RuntimeError("Action contract changed")
    current_bones = {bone.name: (bone.parent.name if bone.parent else None, tuple(bone.head_local), tuple(bone.tail_local)) for bone in armature.data.bones}
    if current_bones != bone_contract:
        raise RuntimeError("Rest skeleton or hierarchy changed")

    scene = bpy.context.scene
    scene["avatarFashionProfile"] = "editorial-v18"
    scene["avatarFashionProfileVersion"] = 18
    scene["avatarFashionSource"] = str(source_blend)
    scene["avatarAnatomyCorrection"] = "proximal-calf-and-ankle-taper"

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    report = {
        "status": "built",
        "sourceBlend": str(source_blend),
        "sourceSha256": source_hash,
        "outputBlend": str(output_blend),
        "profileId": "editorial-v18",
        "topologyUnchanged": True,
        "materialsUnchanged": True,
        "objectsUnchanged": True,
        "actionsUnchanged": True,
        "restSkeletonUnchanged": True,
        "calfContour": {
            "radialGain": CALF_RADIAL_GAIN,
            "jointEnvelope": "sin(pi*t)^2; zero at knee and ankle",
            "bodyAttenuation": 1.0,
            "bottomsAttenuation": 0.78
        },
        "changedMeshes": changed_meshes
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
