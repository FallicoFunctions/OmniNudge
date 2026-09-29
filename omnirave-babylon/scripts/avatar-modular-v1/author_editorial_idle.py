"""Author a relaxed editorial idle while preserving the modular-avatar asset.

Connection map (existing hierarchy; no geometry or joints are created):

    clavicle_l -> upperarm_l -> lowerarm_l -> hand_l
    clavicle_r -> upperarm_r -> lowerarm_r -> hand_r
    pelvis -> spine_01 -> spine_02 -> spine_03 -> neck_01 -> head

Only the existing ``idle`` action curves are replaced. The armature rest pose,
bone endpoints, hierarchy, meshes, morph topology, fitted modules, materials,
and walk/run actions stay byte-for-byte equivalent at the data-contract level.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_editorial_body_review import point_bone


ARMATURE_NAME = "AvatarSkeleton"
EXPECTED_ACTIONS = {"idle", "walk", "run"}


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


def reset_pose(armature: bpy.types.Object) -> None:
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.matrix_basis = Matrix.Identity(4)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def author_frame(
    armature: bpy.types.Object,
    frame: int,
    breath_degrees: float,
    arm_sway: float,
) -> None:
    reset_pose(armature)
    # Point only the upper arms. Connected children retain their authored local
    # relationship, so elbows, wrists, and fitted sleeves cannot detach.
    point_bone(
        armature,
        "upperarm_l",
        Vector((0.070 + arm_sway, -0.016, -0.252)),
    )
    point_bone(
        armature,
        "upperarm_r",
        Vector((-0.070 - arm_sway, -0.016, -0.252)),
    )
    armature.pose.bones["spine_02"].rotation_euler.x = math.radians(
        -0.55 * breath_degrees
    )
    armature.pose.bones["spine_03"].rotation_euler.x = math.radians(
        0.75 * breath_degrees
    )
    bpy.context.view_layer.update()
    for bone_name in ("upperarm_l", "upperarm_r", "spine_02", "spine_03"):
        armature.pose.bones[bone_name].keyframe_insert(
            data_path="rotation_euler", frame=frame, group=bone_name
        )


def main() -> None:
    args = parse_args()
    source_blend = Path(bpy.data.filepath).resolve()
    output_blend = Path(args.output_blend).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    if output_blend == source_blend:
        raise RuntimeError("Editorial idle derivative must not overwrite its source")
    if "fashion-v12" not in output_blend.parts:
        raise RuntimeError("Output must be contained by an explicit fashion-v12 directory")

    armature = bpy.data.objects.get(ARMATURE_NAME)
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError(f"Missing {ARMATURE_NAME}")
    armature.animation_data_create()

    topology = {
        obj.name: len(obj.data.vertices)
        for obj in bpy.data.objects
        if obj.type == "MESH"
    }
    material_slots = {
        obj.name: [slot.material.name if slot.material else "" for slot in obj.material_slots]
        for obj in bpy.data.objects
        if obj.type == "MESH"
    }
    object_names = sorted(obj.name for obj in bpy.data.objects)
    bone_contract = {
        bone.name: {
            "parent": bone.parent.name if bone.parent else None,
            "head": tuple(round(value, 8) for value in bone.head_local),
            "tail": tuple(round(value, 8) for value in bone.tail_local),
        }
        for bone in armature.data.bones
    }

    old_idle = bpy.data.actions.get("idle")
    if old_idle is None:
        raise RuntimeError("Existing idle action is missing")
    bpy.data.actions.remove(old_idle)
    idle = bpy.data.actions.new(name="idle")
    idle.use_fake_user = True
    idle["avatarContract"] = "omnirave.avatar.v1"
    idle["avatarClip"] = "idle"
    idle["avatarPoseStyle"] = "editorial-relaxed"
    armature.animation_data.action = idle

    author_frame(armature, 1, -1.0, 0.000)
    author_frame(armature, 20, 1.0, -0.002)
    author_frame(armature, 40, -1.0, 0.000)

    armature.animation_data.action = None
    reset_pose(armature)

    if sorted(obj.name for obj in bpy.data.objects) != object_names:
        raise RuntimeError("Object contract changed")
    for obj in (item for item in bpy.data.objects if item.type == "MESH"):
        if len(obj.data.vertices) != topology[obj.name]:
            raise RuntimeError(f"Topology changed on {obj.name}")
        current_slots = [
            slot.material.name if slot.material else "" for slot in obj.material_slots
        ]
        if current_slots != material_slots[obj.name]:
            raise RuntimeError(f"Material slots changed on {obj.name}")
    current_bones = {
        bone.name: {
            "parent": bone.parent.name if bone.parent else None,
            "head": tuple(round(value, 8) for value in bone.head_local),
            "tail": tuple(round(value, 8) for value in bone.tail_local),
        }
        for bone in armature.data.bones
    }
    if current_bones != bone_contract:
        raise RuntimeError("Rest skeleton contract changed")
    if not EXPECTED_ACTIONS.issubset({action.name for action in bpy.data.actions}):
        raise RuntimeError("Required action contract changed")

    scene = bpy.context.scene
    scene["avatarFashionProfile"] = "editorial-v12"
    scene["avatarFashionProfileVersion"] = 12
    scene["avatarFashionSource"] = str(source_blend)
    scene["avatarIdleStyle"] = "editorial-relaxed"

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

    report = {
        "status": "built",
        "sourceBlend": str(source_blend),
        "sourceSha256": sha256(source_blend),
        "outputBlend": str(output_blend),
        "profileId": "editorial-v12",
        "geometryChanged": False,
        "restSkeletonChanged": False,
        "boneHierarchyChanged": False,
        "topologyChanged": False,
        "materialsChanged": False,
        "objectsChanged": False,
        "actions": sorted(action.name for action in bpy.data.actions),
        "idle": {
            "frames": [1, 20, 40],
            "animatedBones": ["upperarm_l", "upperarm_r", "spine_02", "spine_03"],
            "style": "editorial-relaxed",
        },
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
