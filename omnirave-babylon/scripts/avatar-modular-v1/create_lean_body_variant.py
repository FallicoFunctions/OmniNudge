"""Create a reversible lean body morph on a copied modular-v1 Blender file.

Run Blender with the preserved source blend already opened, then save only to
the explicit derivative path. The script never scales objects and never moves
bones. It adds one shape key to the body and fitted garment surfaces.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


MORPH_NAME = "lean"
EXPECTED_BONES = 56
BODY_NAME = "AvatarBody"
ARMATURE_NAME = "AvatarSkeleton"

PRESERVED_PREFIXES = (
    "AvatarHair_",
    "AvatarShoes_",
    "AvatarAccessory_",
    "AvatarEye_",
    "AvatarIris_",
    "AvatarPupil_",
    "AvatarEyebrows",
    "AvatarEyelashes",
)

GARMENT_ATTENUATION = {
    "AvatarTop_": 0.92,
    "AvatarBottoms_": 0.85,
    "AvatarJacket_": 0.70,
}

REGION_FACTORS = {
    "clavicle": 0.020,
    "upperarm": 0.045,
    "lowerarm": 0.040,
    "thigh": 0.050,
    "calf": 0.045,
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-blend", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(argv)


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def torso_factors(z: float) -> tuple[float, float]:
    """Return conservative width/depth reductions over the torso."""
    if z < 0.76 or z > 1.48:
        return 0.0, 0.0
    lower = smoothstep(0.76, 0.88, z)
    upper = 1.0 - smoothstep(1.36, 1.48, z)
    envelope = lower * upper
    waist = math.exp(-((z - 1.03) / 0.18) ** 2)
    rib = math.exp(-((z - 1.25) / 0.20) ** 2)
    shoulder_protection = 1.0 - 0.68 * smoothstep(1.32, 1.46, z)
    width = envelope * shoulder_protection * (0.075 * waist + 0.052 * rib)
    depth = envelope * shoulder_protection * (0.065 * waist + 0.043 * rib)
    return min(width, 0.078), min(depth, 0.068)


def closest_on_segment(point: Vector, start: Vector, end: Vector) -> Vector:
    axis = end - start
    denom = axis.length_squared
    if denom <= 1e-12:
        return start.copy()
    t = max(0.0, min(1.0, (point - start).dot(axis) / denom))
    return start + axis * t


def major_region(bone_name: str) -> str | None:
    for prefix in REGION_FACTORS:
        if bone_name.startswith(prefix):
            return prefix
    if bone_name in {"pelvis", "spine_01", "spine_02", "spine_03"}:
        return "torso"
    return None


def weighted_delta(
    obj: bpy.types.Object,
    vertex: bpy.types.MeshVertex,
    coordinate: Vector,
    armature: bpy.types.Object,
) -> Vector:
    influences: list[tuple[float, str]] = []
    for membership in vertex.groups:
        if membership.weight <= 0.0 or membership.group >= len(obj.vertex_groups):
            continue
        group_name = obj.vertex_groups[membership.group].name
        if armature.data.bones.get(group_name) is None:
            continue
        region = major_region(group_name)
        if region is not None:
            influences.append((membership.weight, group_name))
    if not influences:
        return Vector((0.0, 0.0, 0.0))

    total = sum(weight for weight, _ in influences)
    if total <= 1e-8:
        return Vector((0.0, 0.0, 0.0))

    delta = Vector((0.0, 0.0, 0.0))
    for weight, bone_name in influences:
        normalized = weight / total
        bone = armature.data.bones[bone_name]
        region = major_region(bone_name)
        if region == "torso":
            width, depth = torso_factors(coordinate.z)
            target = coordinate.copy()
            target.x *= 1.0 - width
            target.y *= 1.0 - depth
        else:
            factor = REGION_FACTORS[region]
            axis_point = closest_on_segment(coordinate, bone.head_local, bone.tail_local)
            target = axis_point + (coordinate - axis_point) * (1.0 - factor)
        delta += (target - coordinate) * normalized
    return delta


def add_lean_key(
    obj: bpy.types.Object,
    armature: bpy.types.Object,
    attenuation: float,
) -> dict[str, float | int | str]:
    keys = obj.data.shape_keys
    if keys is None:
        raise RuntimeError(f"{obj.name} has no shape-key basis")
    names = [key.name for key in keys.key_blocks]
    if names[:3] != ["Basis", "male", "female"]:
        raise RuntimeError(f"Unexpected shape-key contract on {obj.name}: {names}")
    if MORPH_NAME in keys.key_blocks:
        raise RuntimeError(f"{obj.name} already has {MORPH_NAME!r}")

    basis = keys.key_blocks["Basis"]
    key = obj.shape_key_add(name=MORPH_NAME, from_mix=False)
    key.relative_key = basis
    key.slider_min = 0.0
    key.slider_max = 1.0
    key.value = 0.0

    moved = 0
    max_delta = 0.0
    for vertex, source, destination in zip(
        obj.data.vertices, basis.data, key.data, strict=True
    ):
        delta = weighted_delta(obj, vertex, source.co, armature) * attenuation
        destination.co = source.co + delta
        magnitude = delta.length
        if magnitude > 1e-7:
            moved += 1
            max_delta = max(max_delta, magnitude)

    obj.data.update()
    return {
        "name": obj.name,
        "vertices": len(obj.data.vertices),
        "movedVertices": moved,
        "maxDeltaMeters": round(max_delta, 7),
        "attenuation": attenuation,
    }


def main() -> None:
    args = parse_args()
    output_blend = Path(args.output_blend).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    source_blend = Path(bpy.data.filepath).resolve()

    if output_blend == source_blend:
        raise RuntimeError("Derivative output must not overwrite the opened source blend")
    if "lean-v1" not in output_blend.parts:
        raise RuntimeError("Derivative output must be contained by an explicit lean-v1 directory")

    body = bpy.data.objects.get(BODY_NAME)
    armature = bpy.data.objects.get(ARMATURE_NAME)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing mesh {BODY_NAME}")
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError(f"Missing armature {ARMATURE_NAME}")
    if len(armature.data.bones) != EXPECTED_BONES:
        raise RuntimeError(
            f"Expected {EXPECTED_BONES} bones, found {len(armature.data.bones)}"
        )

    source_vertex_counts = {
        obj.name: len(obj.data.vertices)
        for obj in bpy.data.objects
        if obj.type == "MESH"
    }
    source_materials = {
        obj.name: tuple(slot.material.name if slot.material else "" for slot in obj.material_slots)
        for obj in bpy.data.objects
        if obj.type == "MESH"
    }

    changed = [add_lean_key(body, armature, 1.0)]
    for obj in sorted(
        (candidate for candidate in bpy.data.objects if candidate.type == "MESH"),
        key=lambda candidate: candidate.name,
    ):
        if obj == body or any(obj.name.startswith(prefix) for prefix in PRESERVED_PREFIXES):
            continue
        attenuation = next(
            (value for prefix, value in GARMENT_ATTENUATION.items() if obj.name.startswith(prefix)),
            None,
        )
        if attenuation is not None:
            changed.append(add_lean_key(obj, armature, attenuation))

    bpy.context.scene["avatarLeanMorph"] = MORPH_NAME
    bpy.context.scene["avatarLeanMorphVersion"] = 1
    bpy.context.scene["avatarLeanSource"] = str(source_blend)

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if len(obj.data.vertices) != source_vertex_counts[obj.name]:
            raise RuntimeError(f"Topology changed on {obj.name}")
        materials = tuple(
            slot.material.name if slot.material else "" for slot in obj.material_slots
        )
        if materials != source_materials[obj.name]:
            raise RuntimeError(f"Material slots changed on {obj.name}")

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

    report = {
        "sourceBlend": str(source_blend),
        "outputBlend": str(output_blend),
        "morph": MORPH_NAME,
        "boneCount": len(armature.data.bones),
        "changedMeshes": changed,
        "preservedPrefixes": list(PRESERVED_PREFIXES),
        "vertexCountsUnchanged": True,
        "materialsUnchanged": True,
        "bonesUnchanged": True,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
