"""OmniAvatar male face01 pass: bind correction + likeness shape key.

Reads:  --muse        OA_male_luxury_v2_muse.blend (NEVER written)
Writes: --face01      OA_male_luxury_v2_muse_face01.blend (new file)
        --report      JSON report
        --renders     review-captures/muse-face01/

Stages: cleanup-verify, weight repair/audit, skeleton/export-tree audit,
Tripo width profiles, vertex-level T-pose rebind, likeness shape key,
debug bones, renders, triangle totals. No Tripo calls. No export.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector


ARMATURE_NAME = "AvatarSkeleton"
BODY_NAME = "AvatarBody"
SOURCE_COLLECTION = "SOURCE_TripoV31_DoNotExport"
SEGREF_COLLECTION = "SEGREF_TripoSeg_DoNotExport"
DEBUG_COLLECTION = "DEBUG_TPose_DoNotExport"
REVIEW_COLLECTION = "MUSE_Review_DoNotExport"
FACE_KEY = "OA_Male_Likeness_v1"
FRONT = Vector((0.0, -1.0, 0.0))
DOWN = Vector((0.0, 0.0, -1.0))

# Meshes hidden for the facial comparison (hair, jewelry, wardrobe).
FACE_HIDE = [
    "AvatarHair_textured-crop",
    "AvatarAccessory_gold-hoops_l", "AvatarAccessory_gold-hoops_r",
    "AvatarTop_graphic-tee", "AvatarJacket_bomber",
    "AvatarBottoms_tech-joggers", "AvatarShoes_high-tops",
]

# Meshes carrying the likeness key (head-anchored deform).
LIKE_MESHES = [
    "AvatarBody",
    "AvatarEye_l", "AvatarEye_r",
    "AvatarIris_l", "AvatarIris_r",
    "AvatarPupil_l", "AvatarPupil_r",
    "OA_MUSE_Cornea_l", "OA_MUSE_Cornea_r",
    "AvatarEyebrows", "AvatarEyelashes",
]


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--muse", required=True)
    parser.add_argument("--face01", required=True)
    parser.add_argument("--rest-pose-json", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--renders", required=True)
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
    fraction = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return fraction * fraction * (3.0 - 2.0 * fraction)


def data_dir(armature_obj: bpy.types.Object, bone_name: str) -> Vector:
    bone = armature_obj.data.bones[bone_name]
    direction = bone.tail_local - bone.head_local
    direction.normalize()
    return direction


# ------------------------------------------------------------ weight repair

def audit_weights(obj: bpy.types.Object, deform: set[str]) -> tuple[int, list[int]]:
    bad = []
    for vertex in obj.data.vertices:
        total = sum(entry.weight for entry in vertex.groups
                    if obj.vertex_groups[entry.group].name in deform)
        if total < 0.999 or total > 1.001:
            bad.append(vertex.index)
    return len(bad), bad


def repair_weights(obj: bpy.types.Object, deform: set[str], bad: list[int]) -> int:
    group_names = [group.name for group in obj.vertex_groups]
    valid_profile: dict[int, list[tuple[int, float]]] = {}
    for vertex in obj.data.vertices:
        matched = [(entry.group, entry.weight) for entry in vertex.groups
                   if group_names[entry.group] in deform]
        total = sum(weight for _, weight in matched)
        if total >= 0.999 - 1e-6:
            valid_profile[vertex.index] = [(group, weight / total) for group, weight in matched]
    fixed = 0
    positions = basis_coords(obj)
    for index in bad:
        matched = [(entry.group, entry.weight) for entry in obj.data.vertices[index].groups
                   if group_names[entry.group] in deform]
        total = sum(weight for _, weight in matched)
        if total > 1e-9:
            for group, weight in matched:
                obj.vertex_groups[group].add([index], weight / total, "REPLACE")
            fixed += 1
            continue
        best, best_dist = -1, float("inf")
        current = positions[index]
        for candidate, _ in valid_profile.items():
            dist = (positions[candidate] - current).length_squared
            if dist < best_dist:
                best, best_dist = candidate, dist
        assert best >= 0, f"no valid donor vertex for {obj.name}[{index}]"
        for group in [group for group in obj.data.vertices[index].groups]:
            obj.vertex_groups[group.group].remove([index])
        for group, weight in valid_profile[best]:
            obj.vertex_groups[group].add([index], weight, "REPLACE")
        fixed += 1
    return fixed


# ------------------------------------------------------------ width profiles

def slab_half_width(verts_world: list[tuple[float, float, float]], z: float, band: float,
                    slab_depth: float) -> tuple[float, float, int]:
    """Half-width and mid-x of verts near level z within a frontal slab."""
    candidates = [(x, y) for x, y, zz in verts_world if abs(zz - z) <= band]
    if len(candidates) < 8:
        return 0.0, 0.0, len(candidates)
    nose_y = min(y for _, y in candidates)
    front = [(x, y) for x, y in candidates if y <= nose_y + slab_depth]
    if len(front) < 8:
        return 0.0, 0.0, len(front)
    xs = [x for x, _ in front]
    half = (max(xs) - min(xs)) / 2.0
    return half, (max(xs) + min(xs)) / 2.0, len(front)


def basis_coords(obj: bpy.types.Object) -> list[Vector]:
    """Authoritative bind positions. With shape keys present, vertex.co is
    ambiguous (active-key dependent); the Basis key block is always exact."""
    if obj.data.shape_keys is not None and "Basis" in obj.data.shape_keys.key_blocks:
        return [point.co.copy() for point in obj.data.shape_keys.key_blocks["Basis"].data]
    return [vertex.co.copy() for vertex in obj.data.vertices]


def mesh_world_array(obj: bpy.types.Object):
    import numpy as np
    coords = np.empty(len(obj.data.vertices) * 3, dtype=np.float64)
    for index, co in enumerate(basis_coords(obj)):
        coords[index * 3:(index + 1) * 3] = (co.x, co.y, co.z)
    coords = coords.reshape(-1, 3)
    matrix = np.array(obj.matrix_world, dtype=np.float64)
    homo = np.ones((len(coords), 4), dtype=np.float64)
    homo[:, :3] = coords
    return (homo @ matrix.T)[:, :3]


def mesh_world_positions(obj: bpy.types.Object) -> list[tuple[float, float, float]]:
    return [tuple(float(v) for v in row) for row in mesh_world_array(obj)]


def width_table(obj: bpy.types.Object, levels: list[float]) -> list[dict]:
    import numpy as np
    world = mesh_world_array(obj)
    rows = []
    for z in levels:
        slab = world[np.abs(world[:, 2] - z) <= 0.005]
        if len(slab) < 8:
            rows.append({"z": round(z, 3), "half_width": 0.0, "mid_x": 0.0, "verts": 0})
            continue
        nose_y = slab[:, 1].min()
        front = slab[slab[:, 1] <= nose_y + 0.03]
        if len(front) < 8:
            rows.append({"z": round(z, 3), "half_width": 0.0, "mid_x": 0.0,
                         "verts": len(front)})
            continue
        half = (front[:, 0].max() - front[:, 0].min()) / 2.0
        rows.append({"z": round(z, 3), "half_width": round(float(half), 4),
                     "mid_x": round(float((front[:, 0].max() + front[:, 0].min()) / 2.0), 4),
                     "verts": len(front)})
    return rows


# ------------------------------------------------------------ vertex rebind

def bone_matrix(head: Vector, quat: Quaternion) -> Matrix:
    return Matrix.Translation(head) @ quat.to_matrix().to_4x4()


def rebind_mesh(obj: bpy.types.Object, armature_obj: bpy.types.Object,
                old: dict[str, tuple[Vector, Quaternion]],
                deform: set[str]) -> int:
    """Move Basis + every shape key so the mesh matches the new rest pose."""
    group_names = [group.name for group in obj.vertex_groups]
    new = {}
    for bone in armature_obj.data.bones:
        new[bone.name] = (Vector(bone.head_local), bone.matrix_local.to_3x3().to_quaternion())
    obj_world = obj.matrix_world.copy()
    arm_world = armature_obj.matrix_world.copy()
    to_arm = arm_world.inverted() @ obj_world
    to_obj = obj_world.inverted() @ arm_world
    moved = 0
    if obj.data.shape_keys is not None:
        targets = list(obj.data.shape_keys.key_blocks)
    else:
        targets = [None]
    for key in targets:
        for vertex in obj.data.vertices:
            matched = [(group_names[entry.group], entry.weight) for entry in vertex.groups
                       if group_names[entry.group] in deform]
            total = sum(weight for _, weight in matched)
            if total < 1e-9:
                continue
            if key is None:
                source = vertex.co.copy()
            else:
                source = key.data[vertex.index].co.copy()
            point = to_arm @ source
            blended = Vector((0.0, 0.0, 0.0))
            for name, weight in matched:
                old_head, old_quat = old[name]
                new_head, new_quat = new[name]
                old_matrix = bone_matrix(old_head, old_quat)
                new_matrix = bone_matrix(new_head, new_quat)
                blended += (new_matrix @ old_matrix.inverted() @ point) * (weight / total)
            if key is None:
                vertex.co = to_obj @ blended
            else:
                key.data[vertex.index].co = to_obj @ blended
            moved += 1
    return moved


# ------------------------------------------------------------ likeness deform

def build_likeness_fn(eye_l: Vector, eye_r: Vector, tripo_tip: Vector, canon_tip: Vector,
                      width_curve: list[tuple[float, float]], ear_l: Vector, ear_r: Vector):
    eye_z = (eye_l.z + eye_r.z) / 2.0
    mouth_z = eye_z - 0.065
    tip_delta = (tripo_tip - canon_tip) * 0.5

    def width_ratio(z: float) -> float:
        for (z0, r0), (z1, r1) in zip(width_curve[:-1], width_curve[1:]):
            if z0 <= z <= z1:
                fraction = (z - z0) / (z1 - z0) if z1 > z0 else 0.0
                return r0 + (r1 - r0) * fraction
        return width_curve[0][1] if z < width_curve[0][0] else width_curve[-1][1]

    def deform(world: Vector) -> Vector:
        x, y, z = world.x, world.y, world.z
        delta = Vector((0.0, 0.0, 0.0))
        # Face slab mask: frontal band, z window, excludes far sides/ears.
        z_mask = smoothstep(1.435, 1.465, z) * (1.0 - smoothstep(1.66, 1.70, z))
        front_mask = 1.0 - smoothstep(-0.045, 0.03, y)
        face = z_mask * front_mask
        if face > 0.0:
            ratio = width_ratio(z)
            delta.x += (x - 0.0) * (ratio - 1.0) * face
            # Nose bridge + base narrowing (frontal nose band).
            if abs(x) < 0.028 and 1.50 <= z <= 1.62 and y < -0.075:
                bridge = 0.93 if z > 1.55 else 0.94
                delta.x += x * (bridge - 1.0)
            # Nose tip toward Tripo (conservative half-step).
            tip_mask = (1.0 - smoothstep(0.02, 0.045,
                        math.sqrt(x * x + (z - 1.535) ** 2 + max(0.0, y + 0.10) ** 2)))
            delta += tip_delta * tip_mask
            # Eye opening: subtle vertical almond + outer-corner tuck.
            for center in (eye_l, eye_r):
                dx, dz = x - center.x, z - center.z
                ellipse = (dx / 0.026) ** 2 + (dz / 0.013) ** 2
                if ellipse < 1.0:
                    influence = 1.0 - ellipse
                    delta.z += (center.z - z) * 0.05 * influence
                    if abs(dx) > 0.015:
                        delta.x += -math.copysign(1.0, dx) * 0.0015 * influence
            # Mouth: narrow + lower-lip volume.
            mouth_band = 1.0 - smoothstep(0.008, 0.02, abs(z - mouth_z))
            if abs(x) < 0.038 and mouth_band > 0.0 and y < -0.06:
                delta.x += x * (0.94 - 1.0) * mouth_band
                if mouth_z - 0.02 <= z <= mouth_z - 0.004 and abs(x) < 0.02:
                    delta.y += -0.0015 * mouth_band
            # Chin taper.
            if z < 1.49:
                chin_mask = (1.0 - smoothstep(1.44, 1.49, z)) * front_mask
                delta.x += x * (0.95 - 1.0) * chin_mask
        # Brow lift outer + spacing (brow band, frontal).
        if 1.585 <= z <= 1.63 and y < -0.05 and 0.012 <= abs(x) <= 0.055:
            outer = smoothstep(0.02, 0.05, abs(x))
            delta.z += 0.0015 * outer
            delta.x += -math.copysign(1.0, x) * 0.001 * outer
        # Ears: up/back nudge + slight reduction about each ear center.
        for center in (ear_l, ear_r):
            dist = math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2 + (z - center.z) ** 2)
            ear_mask = 1.0 - smoothstep(0.02, 0.055, dist)
            if ear_mask > 0.0:
                delta += Vector((0.0, 0.002, 0.002)) * ear_mask
                delta += (world - center) * (0.96 - 1.0) * ear_mask
        return delta

    return deform, {"eye_z": round(eye_z, 4), "mouth_z": round(mouth_z, 4),
                    "tip_delta_mm": [round(v * 1000.0, 2) for v in tip_delta]}


# ------------------------------------------------------------ main

def main() -> None:
    args = parse_args()
    muse = Path(args.muse).expanduser().resolve()
    face01 = Path(args.face01).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    renders = Path(args.renders).expanduser().resolve()
    renders.mkdir(parents=True, exist_ok=True)
    report: dict = {"unfinished": []}

    muse_hash_before = sha256(muse)
    v1_record = json.loads(Path(args.rest_pose_json).expanduser().read_text())
    old_rest = {bone["name"]: (Vector(bone["head"]),
                               Quaternion((bone["rest_quat_wxyz"][0], bone["rest_quat_wxyz"][1],
                                           bone["rest_quat_wxyz"][2], bone["rest_quat_wxyz"][3])))
                for bone in v1_record["bones"]}

    bpy.ops.wm.open_mainfile(filepath=str(muse))
    armature_obj = bpy.data.objects[ARMATURE_NAME]
    body = bpy.data.objects[BODY_NAME]
    deform = {bone.name for bone in armature_obj.data.bones}
    assert len(deform) == 56
    assert sorted(deform) == sorted(old_rest.keys()), "joint names diverged"

    # --- cleanup verification (no destructive edits beyond mute/unassign).
    animation_data = armature_obj.animation_data
    report["cleanup"] = {
        "nla_tracks": len(animation_data.nla_tracks) if animation_data else 0,
        "action_assigned": animation_data.action.name if animation_data and animation_data.action else None,
        "constraints": [(b.name, [(c.type, c.name) for c in b.constraints])
                        for b in armature_obj.pose.bones if b.constraints],
    }
    if animation_data is not None:
        for track in animation_data.nla_tracks:
            track.mute = True
        animation_data.action = None
    for bone in armature_obj.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
        bone.location = Vector((0, 0, 0))
        bone.scale = Vector((1, 1, 1))

    # --- weight repair + audit across every skinned mesh.
    skinned = [obj for obj in bpy.data.objects
               if obj.type == "MESH" and any(mod.type == "ARMATURE" for mod in obj.modifiers)]
    repair_log, audit = {}, {}
    for obj in sorted(skinned, key=lambda o: o.name):
        bad_count, bad = audit_weights(obj, deform)
        fixed = repair_weights(obj, deform, bad) if bad else 0
        _, still_bad = audit_weights(obj, deform)
        audit[obj.name] = {"bad_before": bad_count, "repaired": fixed, "bad_after": len(still_bad)}
        if fixed:
            repair_log[obj.name] = fixed
    assert all(info["bad_after"] == 0 for info in audit.values()), f"weights remain: {audit}"
    report["weights"] = {"meshes": len(skinned), "repair_log": repair_log, "audit": audit}

    # --- material + export-tree audit.
    muse_materials = sorted(m.name for m in bpy.data.materials if m.name.startswith("OA_MUSE"))
    assert "OA_MUSE_SoleRubber" not in muse_materials, "SoleRubber must stay removed"
    assert len(muse_materials) == 12, f"expected 12 OA_MUSE materials, got {muse_materials}"
    report["materials"] = muse_materials
    asset_root = bpy.data.objects.get("AvatarAsset")
    assert asset_root is not None
    export_meshes = []
    forbidden = []

    def walk(node: bpy.types.Object) -> None:
        for child in node.children:
            if child.type == "MESH":
                export_meshes.append(child.name)
                if any(tag in child.name for tag in ("ripo", "SEGREF", "DEBUG", "Review", "SOURCE")):
                    forbidden.append(child.name)
            walk(child)

    walk(asset_root)
    assert not forbidden, f"reference meshes under AvatarAsset: {forbidden}"
    report["export_tree"] = {"meshes_under_avatar_asset": len(export_meshes)}

    # --- Tripo width profiles (SOURCE merged mesh vs canonical body).
    source_mesh = max(
        (obj for obj in bpy.data.collections[SOURCE_COLLECTION].objects if obj.type == "MESH"),
        key=lambda o: len(o.data.vertices))
    levels = [round(1.44 + index * 0.01, 3) for index in range(27)]
    tripo_rows = width_table(source_mesh, levels)
    canon_rows = width_table(body, levels)
    curve = []
    for tro, cro in zip(tripo_rows, canon_rows):
        if tro["verts"] < 8 or cro["verts"] < 8 or cro["half_width"] < 1e-6:
            continue
        ratio = max(0.90, min(1.05, tro["half_width"] / cro["half_width"]))
        curve.append((tro["z"], round(ratio, 4)))
    assert len(curve) >= 10, "too few comparable levels"
    report["width_profiles"] = {"tripo": tripo_rows, "canonical": canon_rows,
                                "curve": curve,
                                "tripo_mid_x": tripo_rows[len(tripo_rows) // 2]["mid_x"]}
    # Eye anchors from canonical eye objects; Tripo nose tip from SOURCE mesh.
    eye_l = bpy.data.objects["AvatarEye_l"].matrix_world.translation.copy()
    eye_r = bpy.data.objects["AvatarEye_r"].matrix_world.translation.copy()
    source_positions = mesh_world_positions(source_mesh)
    band = [(x, y, z) for x, y, z in source_positions if 1.52 <= z <= 1.55]
    assert band, "empty Tripo nose-tip band"
    tripo_tip = Vector((sum(x for x, _, _ in band) / len(band),
                        min(y for _, y, _ in band),
                        sum(z for _, _, z in band) / len(band)))
    canon_band = [(x, y, z) for x, y, z in mesh_world_positions(body) if 1.52 <= z <= 1.55]
    assert canon_band, "empty canonical nose-tip band"
    canon_tip = Vector((0.0,
                        min(y for _, y, _ in canon_band),
                        sum(z for _, _, z in canon_band) / len(canon_band)))
    ear_group = body.vertex_groups.get("ears")
    ear_positions = []
    if ear_group is not None:
        matrix = body.matrix_world.copy()
        base_positions = basis_coords(body)
        for index, vertex in enumerate(body.data.vertices):
            for entry in vertex.groups:
                if entry.group == ear_group.index and entry.weight > 0.5:
                    ear_positions.append(matrix @ base_positions[index])
    ear_l = Vector((sum(p.x for p in ear_positions if p.x > 0) / max(1, len([p for p in ear_positions if p.x > 0])),
                    sum(p.y for p in ear_positions if p.x > 0) / max(1, len([p for p in ear_positions if p.x > 0])),
                    sum(p.z for p in ear_positions if p.x > 0) / max(1, len([p for p in ear_positions if p.x > 0])))) \
        if ear_positions else Vector((0.07, -0.03, 1.58))
    ear_r = Vector((-ear_l.x, ear_l.y, ear_l.z))
    deform_fn, deform_meta = build_likeness_fn(eye_l, eye_r, tripo_tip, canon_tip, curve,
                                              ear_l, ear_r)
    report["likeness_targets"] = deform_meta

    # --- vertex-level T-pose rebind (every skinned mesh, every key).
    # Likeness frame guard: head/neck/spine rest must be byte-identical
    # between the v1 record and the muse workfile, or the pre-rebind
    # measurement frame is invalid.
    for bone_name in ("head", "neck_01", "jaw", "eye_l", "eye_r",
                      "spine_01", "spine_02", "spine_03", "pelvis", "Root"):
        old_head, old_quat = old_rest[bone_name]
        bone = armature_obj.data.bones[bone_name]
        assert (Vector(bone.head_local) - old_head).length < 1e-6, f"head-frame bone moved: {bone_name}"
        current_quat = bone.matrix_local.to_3x3().to_quaternion()
        assert abs(current_quat.dot(old_quat)) > 1.0 - 1e-6, f"head-frame bone rotated: {bone_name}"
    report["head_frame_stable"] = True
    rebound = {}
    for obj in sorted(skinned, key=lambda o: o.name):
        rebound[obj.name] = rebind_mesh(obj, armature_obj, old_rest, deform)
    report["rebind"] = {"meshes": len(rebound)}

    # --- mesh landmarks: arm verts vs shoulder height (<=0.02 m required).
    shoulder_z = Vector(armature_obj.data.bones["upperarm_l"].head_local).z
    landmarks = {}
    for side in ("l", "r"):
        arm_bones = {f"upperarm_{side}", f"lowerarm_{side}", f"hand_{side}"}
        fore_bones = {f"lowerarm_{side}"}
        hand_bones = {f"hand_{side}"}
        kit = [BODY_NAME, "AvatarTop_graphic-tee", "AvatarJacket_bomber"]
        arm_z, fore_z, hand_z = [], [], []
        for name in kit:
            obj = bpy.data.objects.get(name)
            if obj is None:
                continue
            matrix = obj.matrix_world.copy()
            groups = [group.name for group in obj.vertex_groups]
            base_positions = basis_coords(obj)
            for index, vertex in enumerate(obj.data.vertices):
                weights = [(groups[entry.group], entry.weight) for entry in vertex.groups
                           if groups[entry.group] in deform]
                if not weights:
                    continue
                owner = max(weights, key=lambda item: item[1])[0]
                z = (matrix @ base_positions[index]).z
                if owner in arm_bones:
                    arm_z.append(z)
                if owner in fore_bones:
                    fore_z.append(z)
                if owner in hand_bones:
                    hand_z.append(z)
        stats = {}
        for label, values in (("arm", arm_z), ("elbow", fore_z), ("wrist", hand_z)):
            mean = sum(values) / len(values)
            stats[label] = {"mean_dz": round(mean - shoulder_z, 4),
                            "max_dz": round(max(abs(v - shoulder_z) for v in values), 4),
                            "verts": len(values)}
        assert abs(stats["wrist"]["mean_dz"]) <= 0.02, f"wrist off: {stats['wrist']}"
        assert abs(stats["elbow"]["mean_dz"]) <= 0.02, f"elbow off: {stats['elbow']}"
        landmarks[side] = stats
    report["landmarks"] = {"shoulder_z": round(shoulder_z, 4), **landmarks}

    # --- likeness shape key on head-anchored meshes.
    for name in LIKE_MESHES:
        obj = bpy.data.objects.get(name)
        if obj is None:
            report["unfinished"].append(f"likeness target missing: {name}")
            continue
        if obj.data.shape_keys is None or FACE_KEY not in obj.data.shape_keys.key_blocks:
            obj.shape_key_add(name=FACE_KEY, from_mix=False)
        key = obj.data.shape_keys.key_blocks[FACE_KEY]
        matrix = obj.matrix_world.copy()
        inv = matrix.inverted()
        base_positions = basis_coords(obj)
        # The deform frame stays valid only if the T-pose left head/neck
        # bones untouched; verified below against the v1 record.
        for index, base in enumerate(base_positions):
            world = matrix @ base
            key.data[index].co = inv @ (world + deform_fn(world))
        key.value = 1.0
    body_keys = list(body.data.shape_keys.key_blocks.keys()) if body.data.shape_keys else []
    assert FACE_KEY in body_keys
    report["shape_key"] = {"name": FACE_KEY, "value": 1.0, "meshes": LIKE_MESHES}

    # --- debug bone overlay (diagnostic renders only, never exported).
    debug_collection = bpy.data.collections.new(DEBUG_COLLECTION)
    bpy.context.scene.collection.children.link(debug_collection)
    debug_collection.hide_viewport = True
    debug_collection.hide_render = True
    for bone in armature_obj.data.bones:
        head = Vector(bone.head_local)
        tail = Vector(bone.tail_local)
        direction = tail - head
        length = direction.length
        if length < 1e-6:
            continue
        axis = direction.normalized()
        side_a = axis.cross(Vector((0, 0, 1)))
        if side_a.length < 1e-4:
            side_a = axis.cross(Vector((0, 1, 0)))
        side_a.normalize()
        side_b = axis.cross(side_a).normalized()
        radius = 0.006
        octa = [head, tail,
                head + direction * 0.5 + side_a * radius,
                head + direction * 0.5 - side_a * radius,
                head + direction * 0.5 + side_b * radius,
                head + direction * 0.5 - side_b * radius]
        faces = [(0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2),
                 (1, 4, 2), (1, 3, 4), (1, 5, 3), (1, 2, 5)]
        mesh = bpy.data.meshes.new(f"DEBUG_{bone.name}")
        mesh.from_pydata(octa, [], faces)
        mesh.update()
        debug_obj = bpy.data.objects.new(f"DEBUG_{bone.name}", mesh)
        debug_collection.objects.link(debug_obj)
    debug_material = bpy.data.materials.new("DEBUG_BoneMat")
    debug_material.use_nodes = True
    debug_material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = \
        (1.0, 0.45, 0.1, 1.0)
    for obj in debug_collection.objects:
        obj.data.materials.append(debug_material)

    # --- renders.
    review_collection = bpy.data.collections.get(REVIEW_COLLECTION)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    world = scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        background = world.node_tree.nodes.new("ShaderNodeBackground")
        output = world.node_tree.nodes.get("World Output")
        world.node_tree.links.new(background.outputs["Background"], output.inputs["Surface"])
    background.inputs["Color"].default_value = (0.16, 0.16, 0.17, 1.0)
    if bpy.data.objects.get("MUSE_ReviewKey") is None:
        key = bpy.data.objects.new("MUSE_ReviewKey",
                                   bpy.data.lights.new("MUSE_ReviewKey", type="SUN"))
        key.data.energy = 3.0
        key.rotation_euler = (0.9, 0.3, 0.0)
        scene.collection.objects.link(key)
        fill = bpy.data.objects.new("MUSE_ReviewFill",
                                    bpy.data.lights.new("MUSE_ReviewFill", type="SUN"))
        fill.data.energy = 1.0
        fill.rotation_euler = (1.1, -0.6, 0.0)
        scene.collection.objects.link(fill)

    def shoot(filepath: str, location: tuple[float, float, float], aim: Vector,
              lens: float = 50.0, wire: bool = False) -> None:
        camera_data = bpy.data.cameras.new("FACE01_Cam")
        camera = bpy.data.objects.new("FACE01_Cam", camera_data)
        scene.collection.objects.link(camera)
        if review_collection is not None:
            for owner in list(camera.users_collection):
                owner.objects.unlink(camera)
            review_collection.objects.link(camera)
        camera.location = Vector(location)
        camera.rotation_euler = (aim - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera_data.lens = lens
        scene.camera = camera
        scene.render.filepath = filepath
        if wire:
            wire_material = bpy.data.materials.get("FACE01_Wire")
            if wire_material is None:
                wire_material = bpy.data.materials.new("FACE01_Wire")
                wire_material.use_nodes = True
                tree = wire_material.node_tree
                tree.nodes.clear()
                wire_node = tree.nodes.new("ShaderNodeWireframe")
                emission = tree.nodes.new("ShaderNodeEmission")
                output = tree.nodes.new("ShaderNodeOutputMaterial")
                tree.links.new(wire_node.outputs["Fac"], emission.inputs["Color"])
                tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
            for view_layer in bpy.context.scene.view_layers:
                view_layer.material_override = wire_material
        bpy.ops.render.render(write_still=True)
        if wire:
            for view_layer in bpy.context.scene.view_layers:
                view_layer.material_override = None

    head = Vector((0.0, -0.03, 1.575))
    shoot(str(renders / "bind-front.png"), (0.0, -4.4, 1.15), Vector((0.0, 0.0, 0.92)))
    debug_collection.hide_viewport = False
    debug_collection.hide_render = False
    shoot(str(renders / "bind-front-armature.png"), (0.0, -4.4, 1.15), Vector((0.0, 0.0, 0.92)))
    debug_collection.hide_viewport = True
    debug_collection.hide_render = True
    shoot(str(renders / "bind-three-quarter.png"), (2.9, -3.3, 1.3), Vector((0.0, 0.0, 0.9)))
    shoot(str(renders / "bind-back.png"), (0.0, 4.4, 1.15), Vector((0.0, 0.0, 0.92)))
    for name in FACE_HIDE:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_viewport = True
            obj.hide_render = True
    shoot(str(renders / "face-front.png"), (0.0, -0.95, 1.60), head, lens=85.0)
    shoot(str(renders / "face-profile.png"), (0.95, -0.03, 1.60), head, lens=85.0)
    shoot(str(renders / "face-three-quarter.png"), (0.62, -0.68, 1.63), head, lens=85.0)
    shoot(str(renders / "face-front-wireframe.png"), (0.0, -0.95, 1.60), head,
          lens=85.0, wire=True)
    # Likeness key off (previous head) + Tripo head, same camera.
    for name in LIKE_MESHES:
        obj = bpy.data.objects.get(name)
        if obj is not None and obj.data.shape_keys is not None \
                and FACE_KEY in obj.data.shape_keys.key_blocks:
            obj.data.shape_keys.key_blocks[FACE_KEY].value = 0.0
    shoot(str(renders / "face-key0.png"), (0.0, -0.95, 1.60), head, lens=85.0)
    for name in LIKE_MESHES:
        obj = bpy.data.objects.get(name)
        if obj is not None and obj.data.shape_keys is not None \
                and FACE_KEY in obj.data.shape_keys.key_blocks:
            obj.data.shape_keys.key_blocks[FACE_KEY].value = 1.0
    for collection in bpy.data.collections:
        if collection.name in (SOURCE_COLLECTION,):
            collection.hide_viewport = False
            collection.hide_render = False
    if asset_root is not None:
        asset_root.hide_viewport = True
        asset_root.hide_render = True
    shoot(str(renders / "tripo-head-front.png"), (0.0, -0.95, 1.60), head, lens=85.0)
    if asset_root is not None:
        asset_root.hide_viewport = False
        asset_root.hide_render = False

    # --- triangle totals (evaluated loop triangles).
    def loop_tris(names: list[str]) -> int:
        total = 0
        for mesh_name in names:
            obj = bpy.data.objects.get(mesh_name)
            if obj is None or obj.type != "MESH":
                continue
            mesh = obj.data
            mesh.calc_loop_triangles()
            total += len(mesh.loop_triangles)
        return total

    production = ["AvatarBody", "AvatarEye_l", "AvatarEye_r", "AvatarEyebrows",
                  "AvatarEyelashes", "AvatarIris_l", "AvatarIris_r", "AvatarPupil_l",
                  "AvatarPupil_r", "OA_MUSE_Cornea_l", "OA_MUSE_Cornea_r",
                  "AvatarHair_textured-crop", "AvatarTop_graphic-tee", "AvatarJacket_bomber",
                  "AvatarBottoms_tech-joggers", "AvatarShoes_high-tops",
                  "AvatarAccessory_gold-hoops_l", "AvatarAccessory_gold-hoops_r"]
    catalog = [obj.name for obj in bpy.data.objects
               if obj.type == "MESH" and obj.name.startswith("Avatar")]
    reference = [obj.name for collection in (SOURCE_COLLECTION, SEGREF_COLLECTION)
                 if bpy.data.collections.get(collection) is not None
                 for obj in bpy.data.collections[collection].objects if obj.type == "MESH"]
    report["triangles"] = {"production_visible": loop_tris(production),
                           "full_catalog": loop_tris(catalog),
                           "hidden_reference": loop_tris(reference)}

    bpy.ops.wm.save_as_mainfile(filepath=str(face01))
    report["output"] = str(face01)
    report["muse_sha256_after"] = sha256(muse)
    assert report["muse_sha256_after"] == muse_hash_before, "source muse file was modified"
    report_path.write_text(json.dumps(report, indent=2))
    print(f"FACE01 DONE: prod {report['triangles']['production_visible']} tris")


if __name__ == "__main__":
    main()
