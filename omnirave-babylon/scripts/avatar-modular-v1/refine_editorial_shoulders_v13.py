"""Create the protected V13 shoulder-girdle derivative from V12.

Connection map (existing connected rig; no primitives or detached geometry):

    spine/neck junction -> clavicle_l -> upperarm_l -> lowerarm_l -> hand_l
    spine/neck junction -> clavicle_r -> upperarm_r -> lowerarm_r -> hand_r

The clavicle roots remain fixed. Each clavicle tail and complete child arm chain
moves 8 mm medially and 4 mm downward. Body, top, and jacket vertices receive a
small continuous shoulder-envelope blend, so every shoulder seam retains well
over the 5 mm assembly-contact minimum. No topology, object, material, action,
shape-key, bone-name, or bone-parent contract is changed.
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


ARMATURE_NAME = "AvatarSkeleton"
EXPECTED_V12_SHA256 = "1edf325ae4aa26cdc1d845ceab9c2ead5edca6cdce855477edc03b6b54cd888d"
SHOULDER_INSET_METERS = 0.008
SHOULDER_DROP_METERS = 0.004
SHOULDER_FIELD_WIDTH = 0.014
SHOULDER_FIELD_DROP = 0.004


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


def closest_parameter(point: Vector, start: Vector, end: Vector) -> float:
    axis = end - start
    length_squared = axis.length_squared
    if length_squared <= 1e-12:
        return 0.0
    return max(0.0, min(1.0, (point - start).dot(axis) / length_squared))


def arm_side(name: str) -> int:
    if name.endswith("_l"):
        return 1
    if name.endswith("_r"):
        return -1
    return 0


def is_arm_chain(name: str) -> bool:
    return name.startswith(
        (
            "upperarm_",
            "lowerarm_",
            "hand_",
            "thumb_",
            "index_",
            "middle_",
            "ring_",
            "pinky_",
        )
    )


def mapped_bone_endpoints(
    name: str, head: Vector, tail: Vector
) -> tuple[Vector, Vector]:
    new_head = head.copy()
    new_tail = tail.copy()
    side = arm_side(name)
    if name.startswith("clavicle_") and side:
        new_tail.x -= side * SHOULDER_INSET_METERS
        new_tail.z -= SHOULDER_DROP_METERS
    elif is_arm_chain(name) and side:
        for endpoint in (new_head, new_tail):
            endpoint.x -= side * SHOULDER_INSET_METERS
            endpoint.z -= SHOULDER_DROP_METERS
    return new_head, new_tail


def transform_from_bone(
    point: Vector,
    old_head: Vector,
    old_tail: Vector,
    new_head: Vector,
    new_tail: Vector,
) -> Vector:
    t = closest_parameter(point, old_head, old_tail)
    old_axis = old_tail - old_head
    new_axis = new_tail - new_head
    old_anchor = old_head.lerp(old_tail, t)
    new_anchor = new_head.lerp(new_tail, t)
    offset = point - old_anchor
    if old_axis.length > 1e-8 and new_axis.length > 1e-8:
        rotation = old_axis.normalized().rotation_difference(new_axis.normalized())
        offset = rotation @ offset
    return new_anchor + offset


def shoulder_attenuation(name: str) -> float:
    if name == "AvatarBody":
        return 1.0
    if name.startswith("AvatarTop_"):
        return 0.92
    if name.startswith("AvatarJacket_"):
        return 0.62
    return 0.0


def apply_shoulder_field(name: str, point: Vector) -> Vector:
    attenuation = shoulder_attenuation(name)
    if attenuation <= 0.0 or point.z < 1.28 or point.z > 1.48:
        return point
    band = math.exp(-((point.z - 1.380) / 0.082) ** 2)
    lateral = smoothstep(0.055, 0.245, abs(point.x))
    influence = attenuation * band * lateral
    return Vector(
        (
            point.x * (1.0 - SHOULDER_FIELD_WIDTH * influence),
            point.y,
            point.z - SHOULDER_FIELD_DROP * influence,
        )
    )


def deform_point(
    obj: bpy.types.Object,
    vertex: bpy.types.MeshVertex,
    local_point: Vector,
    armature: bpy.types.Object,
    old_bones: dict[str, tuple[Vector, Vector]],
    new_bones: dict[str, tuple[Vector, Vector]],
) -> Vector:
    # The shoulder correction owns only the continuous body and the fitted
    # upper-body shells. Hair, face, accessories, bottoms, and shoes remain
    # byte-identical even if an imported source happened to carry stray arm
    # weights.
    if shoulder_attenuation(obj.name) <= 0.0:
        return local_point.copy()
    object_to_armature = armature.matrix_world.inverted() @ obj.matrix_world
    armature_to_object = object_to_armature.inverted()
    point = object_to_armature @ local_point
    influences: list[tuple[float, str]] = []
    for membership in vertex.groups:
        if membership.group >= len(obj.vertex_groups) or membership.weight <= 0.0:
            continue
        bone_name = obj.vertex_groups[membership.group].name
        if bone_name in old_bones:
            influences.append((membership.weight, bone_name))
    total = sum(weight for weight, _ in influences)
    if total > 1e-8:
        destination = Vector((0.0, 0.0, 0.0))
        for weight, bone_name in influences:
            old_head, old_tail = old_bones[bone_name]
            new_head, new_tail = new_bones[bone_name]
            target = transform_from_bone(
                point, old_head, old_tail, new_head, new_tail
            )
            destination += target * (weight / total)
    else:
        destination = point.copy()
    destination = apply_shoulder_field(obj.name, destination)
    return armature_to_object @ destination


def deform_mesh(
    obj: bpy.types.Object,
    armature: bpy.types.Object,
    old_bones: dict[str, tuple[Vector, Vector]],
    new_bones: dict[str, tuple[Vector, Vector]],
) -> dict[str, object]:
    keys = obj.data.shape_keys
    key_blocks = list(keys.key_blocks) if keys else []
    targets = key_blocks or [None]
    max_delta = 0.0
    moved = 0
    for key in targets:
        points = key.data if key is not None else obj.data.vertices
        source_points = [point.co.copy() for point in points]
        for vertex, point, source in zip(
            obj.data.vertices, points, source_points, strict=True
        ):
            destination = deform_point(
                obj, vertex, source, armature, old_bones, new_bones
            )
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
        raise RuntimeError("V13 must not overwrite protected V12")
    if "fashion-v13" not in output_blend.parts:
        raise RuntimeError("Output must be contained by an explicit fashion-v13 directory")
    source_hash = sha256(source_blend)
    if source_hash != EXPECTED_V12_SHA256:
        raise RuntimeError(
            f"V13 source must be protected V12 ({EXPECTED_V12_SHA256}), got {source_hash}"
        )

    armature = bpy.data.objects.get(ARMATURE_NAME)
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError(f"Missing {ARMATURE_NAME}")
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
    old_bones = {
        bone.name: (bone.head_local.copy(), bone.tail_local.copy())
        for bone in armature.data.bones
    }
    new_bones = {
        name: mapped_bone_endpoints(name, head, tail)
        for name, (head, tail) in old_bones.items()
    }

    changed_meshes = [
        deform_mesh(obj, armature, old_bones, new_bones) for obj in meshes
    ]

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail) in new_bones.items():
        edit_bone = armature.data.edit_bones[name]
        edit_bone.head = head
        edit_bone.tail = tail
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)

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

    scene = bpy.context.scene
    scene["avatarFashionProfile"] = "editorial-v13"
    scene["avatarFashionProfileVersion"] = 13
    scene["avatarFashionSource"] = str(source_blend)
    scene["avatarAnatomyCorrection"] = "shoulder-girdle-medial-drop"

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    report = {
        "status": "built",
        "sourceBlend": str(source_blend),
        "sourceSha256": source_hash,
        "outputBlend": str(output_blend),
        "profileId": "editorial-v13",
        "geometryChanged": True,
        "topologyUnchanged": True,
        "materialsUnchanged": True,
        "objectsUnchanged": True,
        "actionsUnchanged": True,
        "boneHierarchyUnchanged": True,
        "shoulderCorrection": {
            "insetMetersPerSide": SHOULDER_INSET_METERS,
            "dropMetersPerSide": SHOULDER_DROP_METERS,
            "continuousFieldWidth": SHOULDER_FIELD_WIDTH,
            "continuousFieldDropMeters": SHOULDER_FIELD_DROP,
        },
        "changedMeshes": changed_meshes,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
