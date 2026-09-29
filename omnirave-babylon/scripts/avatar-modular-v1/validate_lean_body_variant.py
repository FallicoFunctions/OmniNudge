"""Validate lean morph, modular invariants, and idle/walk/run deformation."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import bpy


EXPECTED_BONES = 56
MORPHED_MESHES = (
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
)
PROTECTED_PREFIXES = (
    "AvatarHair_",
    "AvatarShoes_",
    "AvatarAccessory_",
    "AvatarEye_",
    "AvatarIris_",
    "AvatarPupil_",
    "AvatarEyebrows",
    "AvatarEyelashes",
)


def parse_report_path() -> Path:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(argv) != 2 or argv[0] != "--report":
        raise RuntimeError("Expected --report <path>")
    return Path(argv[1]).expanduser().resolve()


def set_morph(sex: str) -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data.shape_keys is None:
            continue
        keys = obj.data.shape_keys.key_blocks
        for key in keys:
            if key.name != "Basis":
                key.value = 0.0
        if keys.get(sex) is not None:
            keys[sex].value = 1.0
        if keys.get("lean") is not None:
            keys["lean"].value = 1.0


def evaluated_positions(obj: bpy.types.Object) -> list:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    return [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices]


def max_displacement(before: list, after: list) -> float:
    if len(before) != len(after):
        raise RuntimeError("Evaluated topology changed during deformation")
    return max((a - b).length for a, b in zip(after, before, strict=True))


def main() -> None:
    report_path = parse_report_path()
    armature = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    if len(armature.data.bones) != EXPECTED_BONES:
        raise RuntimeError("Bone count changed")
    if [key.name for key in body.data.shape_keys.key_blocks] != [
        "Basis",
        "male",
        "female",
        "lean",
    ]:
        raise RuntimeError("Body shape-key contract is incorrect")

    for name in MORPHED_MESHES:
        obj = bpy.data.objects[name]
        if obj.data.shape_keys is None or obj.data.shape_keys.key_blocks.get("lean") is None:
            raise RuntimeError(f"Missing lean morph on {name}")
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not any(obj.name.startswith(prefix) for prefix in PROTECTED_PREFIXES):
            continue
        if obj.data.shape_keys and obj.data.shape_keys.key_blocks.get("lean") is not None:
            raise RuntimeError(f"Protected module received lean morph: {obj.name}")

    basis = body.data.shape_keys.key_blocks["Basis"]
    lean = body.data.shape_keys.key_blocks["lean"]
    basis_z = [point.co.z for point in basis.data]
    lean_z = [point.co.z for point in lean.data]
    if abs(min(basis_z) - min(lean_z)) > 1e-9 or abs(max(basis_z) - max(lean_z)) > 1e-9:
        raise RuntimeError("Lean morph changed character height bounds")

    deformation = {}
    for sex in ("male", "female"):
        set_morph(sex)
        deformation[sex] = {}
        for action_name in ("idle", "walk", "run"):
            action = bpy.data.actions[action_name]
            armature.animation_data.action = action
            start = int(action.frame_range[0])
            sample = start + max(1, int((action.frame_range[1] - start) * 0.42))
            bpy.context.scene.frame_set(start)
            before = {
                name: evaluated_positions(bpy.data.objects[name])
                for name in MORPHED_MESHES
            }
            bpy.context.scene.frame_set(sample)
            after = {
                name: evaluated_positions(bpy.data.objects[name])
                for name in MORPHED_MESHES
            }
            distances = {
                name: max_displacement(before[name], after[name])
                for name in MORPHED_MESHES
            }
            threshold = 0.00005 if action_name == "idle" else 0.001
            if any(distance < threshold for distance in distances.values()):
                failures = {
                    name: distance
                    for name, distance in distances.items()
                    if distance < threshold
                }
                raise RuntimeError(
                    f"{sex} {action_name} failed deformation threshold: {failures}"
                )
            deformation[sex][action_name] = {
                "startFrame": start,
                "sampleFrame": sample,
                "minimumMeshDisplacement": min(distances.values()),
                "maximumMeshDisplacement": max(distances.values()),
            }

    report = {
        "status": "pass",
        "blend": bpy.data.filepath,
        "boneCount": len(armature.data.bones),
        "shapeKeys": [key.name for key in body.data.shape_keys.key_blocks],
        "morphedMeshes": list(MORPHED_MESHES),
        "protectedModulesHaveNoLeanKey": True,
        "heightBoundsUnchanged": True,
        "deformation": deformation,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
