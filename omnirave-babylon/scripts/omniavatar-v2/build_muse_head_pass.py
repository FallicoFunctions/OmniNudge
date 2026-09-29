"""OmniAvatar male head-and-material foundation pass.

Reads:  --work      OA_male_luxury_v2_work.blend (NEVER written)
        --seg-glb   segmented Tripo reference (reference-only import)
Writes: --output    OA_male_luxury_v2_muse.blend (new file)
        --report    JSON build report
        --renders   directory for head close-ups + full-body front

Scope: distinct PBR materials, cornea caps, strict T-pose rest on the COPY,
honest unfinished list. No likeness sculpt claims.
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
HEAD_BONE = "head"
SEGREF_COLLECTION = "SEGREF_TripoSeg_DoNotExport"
SEGREF_ROOT = "SEGREF_TripoSeg_Root"
REVIEW_COLLECTION = "MUSE_Review_DoNotExport"
FRONT = Vector((0.0, -1.0, 0.0))  # verified: pupils sit -Y of eyeball centers
DOWN = Vector((0.0, 0.0, -1.0))

SELECTED_OPTIONS = {
    "hair": "textured-crop",
    "top": "graphic-tee",
    "jacket": "bomber",
    "bottoms": "tech-joggers",
    "shoes": "high-tops",
    "accessories": "gold-hoops",
}

CANONICAL_SLOTS = ("hair", "top", "jacket", "bottoms", "shoes", "accessories")


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", required=True)
    parser.add_argument("--seg-glb", required=True)
    parser.add_argument("--rest-pose-json", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--renders", required=True)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def angle_between(a: Vector, b: Vector) -> float:
    cos_value = max(-1.0, min(1.0, a.normalized().dot(b.normalized())))
    return math.acos(cos_value)


# ---------------------------------------------------------------- materials

def principled(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    return material


def bsdf(material: bpy.types.Material):
    return material.node_tree.nodes.get("Principled BSDF")


def add_noise_roughness(material: bpy.types.Material, scale: float, low: float, high: float,
                        bump_strength: float, bump_distance: float) -> None:
    tree = material.node_tree
    tex = tree.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 2.0
    mapping = tree.nodes.new("ShaderNodeMapRange")
    mapping.inputs["From Min"].default_value = 0.0
    mapping.inputs["From Max"].default_value = 1.0
    mapping.inputs["To Min"].default_value = low
    mapping.inputs["To Max"].default_value = high
    tree.links.new(tex.outputs["Fac"], mapping.inputs["Value"])
    tree.links.new(mapping.outputs["Result"], bsdf(material).inputs["Roughness"])
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = bump_distance
    tree.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf(material).inputs["Normal"])


def build_materials() -> dict[str, str]:
    """Create the OA_MUSE_* set. Returns {purpose: material_name}."""
    made = {}

    skin = principled("OA_MUSE_Skin")
    b = bsdf(skin)
    b.inputs["Base Color"].default_value = (0.851, 0.663, 0.522, 1.0)
    b.inputs["Subsurface Weight"].default_value = 0.15
    b.inputs["Subsurface Radius"].default_value = (0.45, 0.18, 0.12)
    b.inputs["Specular IOR Level"].default_value = 0.35
    add_noise_roughness(skin, 60.0, 0.52, 0.70, 0.15, 0.002)
    made["skin"] = skin.name

    eye_white = principled("OA_MUSE_EyeWhite")
    b = bsdf(eye_white)
    b.inputs["Base Color"].default_value = (0.91, 0.894, 0.862, 1.0)
    b.inputs["Roughness"].default_value = 0.25
    b.inputs["Specular IOR Level"].default_value = 0.5
    b.inputs["Coat Weight"].default_value = 0.4
    made["eye_white"] = eye_white.name

    cornea = principled("OA_MUSE_Cornea")
    b = bsdf(cornea)
    b.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    b.inputs["Transmission Weight"].default_value = 0.9
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["IOR"].default_value = 1.376
    b.inputs["Specular IOR Level"].default_value = 0.6
    b.inputs["Coat Weight"].default_value = 1.0
    made["cornea"] = cornea.name

    iris = principled("OA_MUSE_IrisHazel")
    b = bsdf(iris)
    b.inputs["Base Color"].default_value = (0.29, 0.184, 0.114, 1.0)
    b.inputs["Roughness"].default_value = 0.4
    b.inputs["Specular IOR Level"].default_value = 0.4
    made["iris"] = iris.name

    pupil = principled("OA_MUSE_Pupil")
    b = bsdf(pupil)
    b.inputs["Base Color"].default_value = (0.04, 0.04, 0.047, 1.0)
    b.inputs["Roughness"].default_value = 0.15
    made["pupil"] = pupil.name

    brow = principled("OA_MUSE_BrowLash")
    b = bsdf(brow)
    b.inputs["Base Color"].default_value = (0.164, 0.11, 0.07, 1.0)
    b.inputs["Roughness"].default_value = 0.7
    made["brow"] = brow.name

    hair = principled("OA_MUSE_HairQuiff")
    b = bsdf(hair)
    b.inputs["Base Color"].default_value = (0.227, 0.141, 0.09, 1.0)
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Specular IOR Level"].default_value = 0.35
    add_noise_roughness(hair, 25.0, 0.45, 0.68, 0.4, 0.004)
    made["hair"] = hair.name

    satin = principled("OA_MUSE_PearlSatin")
    b = bsdf(satin)
    b.inputs["Base Color"].default_value = (0.95, 0.93, 0.894, 1.0)
    b.inputs["Metallic"].default_value = 0.0
    b.inputs["Specular IOR Level"].default_value = 0.55
    b.inputs["Roughness"].default_value = 0.38
    b.inputs["Coat Weight"].default_value = 0.35
    b.inputs["Coat Roughness"].default_value = 0.25
    b.inputs["Sheen Weight"].default_value = 0.4
    made["satin"] = satin.name

    shirt = principled("OA_MUSE_BlackShirt")
    b = bsdf(shirt)
    b.inputs["Base Color"].default_value = (0.09, 0.094, 0.11, 1.0)
    b.inputs["Roughness"].default_value = 0.82
    b.inputs["Sheen Weight"].default_value = 0.3
    made["shirt"] = shirt.name

    cargo = principled("OA_MUSE_CargoBlack")
    b = bsdf(cargo)
    b.inputs["Base Color"].default_value = (0.106, 0.11, 0.125, 1.0)
    b.inputs["Roughness"].default_value = 0.7
    add_noise_roughness(cargo, 120.0, 0.6, 0.8, 0.3, 0.001)
    made["cargo"] = cargo.name

    leather = principled("OA_MUSE_ShoeLeather")
    b = bsdf(leather)
    b.inputs["Base Color"].default_value = (0.937, 0.914, 0.867, 1.0)
    b.inputs["Roughness"].default_value = 0.45
    b.inputs["Coat Weight"].default_value = 0.25
    made["leather"] = leather.name

    rubber = principled("OA_MUSE_SoleRubber")
    b = bsdf(rubber)
    b.inputs["Base Color"].default_value = (0.164, 0.169, 0.18, 1.0)
    b.inputs["Roughness"].default_value = 0.92
    made["rubber"] = rubber.name

    gold = principled("OA_MUSE_GoldMetal")
    b = bsdf(gold)
    b.inputs["Base Color"].default_value = (0.788, 0.635, 0.153, 1.0)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.32
    b.inputs["Specular IOR Level"].default_value = 0.5
    made["gold"] = gold.name

    return made


def assign_material(obj: bpy.types.Object, material_name: str, report: dict) -> None:
    material = bpy.data.materials[material_name]
    obj.data.materials.clear()
    obj.data.materials.append(material)
    report.setdefault("assignments", []).append(f"{obj.name} -> {material_name}")


# ---------------------------------------------------------------- corneas

def build_cornea_cap(side: str, eye_obj: bpy.types.Object, armature_obj: bpy.types.Object,
                     material_name: str) -> bpy.types.Object:
    """Convex front cap over the iris, rigid to the head bone via weights."""
    assert abs(eye_obj.rotation_euler.x) < 1e-6 and abs(eye_obj.rotation_euler.z) < 1e-6
    center = armature_obj.matrix_world @ eye_obj.location
    radius = eye_obj.dimensions.z / 2.0 * 1.05
    import bmesh
    mesh = bpy.data.meshes.new(f"OA_MUSE_Cornea_{side}")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=radius)
    # Keep the -Y dome (face looks -Y) plus a small rim; delete the back.
    doomed = [v for v in bm.verts if v.co.y > 0.001]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    cap = bpy.data.objects.new(f"OA_MUSE_Cornea_{side}", mesh)
    bpy.context.scene.collection.objects.link(cap)
    cap.location = center
    cap.data.materials.clear()
    cap.data.materials.append(bpy.data.materials[material_name])
    # Rigid head follow, export-safe: armature modifier + full head weight.
    cap.parent = armature_obj
    modifier = cap.modifiers.new("ArmatureFollow", "ARMATURE")
    modifier.object = armature_obj
    group = cap.vertex_groups.new(name=HEAD_BONE)
    group.add(list(range(len(cap.data.vertices))), 1.0, "REPLACE")
    return cap


# ---------------------------------------------------------------- T-pose
#
# Read-free posing: pose-bone matrix reads proved untrustworthy in background
# runs (stale evaluation), while DATA reads and the bake operator are exact.
# This tracker holds the full posed state (orientations + head positions)
# computed from DATA plus our own rotations. Nothing is measured from the
# evaluated pose. The DATA-level post-bake asserts are decisive.

class PoseTracker:
    def __init__(self, armature_obj: bpy.types.Object) -> None:
        self.armature = armature_obj
        self.rest_head: dict[str, Vector] = {}
        self.rest_dir: dict[str, Vector] = {}
        self.rest_rot: dict[str, Quaternion] = {}
        self.rest_offset: dict[str, Quaternion] = {}
        self.parent: dict[str, str | None] = {}
        self.children: dict[str, list[str]] = {}
        for bone in armature_obj.data.bones:
            head = Vector(bone.head_local)
            direction = Vector(bone.tail_local) - head
            direction.normalize()
            self.rest_head[bone.name] = head
            self.rest_dir[bone.name] = direction
            self.rest_rot[bone.name] = bone.matrix_local.to_3x3().to_quaternion()
            parent = bone.parent.name if bone.parent else None
            self.parent[bone.name] = parent
            self.children.setdefault(bone.name, [])
            if parent is not None:
                self.children.setdefault(parent, []).append(bone.name)
                rest_offset = (bone.parent.matrix_local.inverted()
                               @ bone.matrix_local).to_3x3().to_quaternion()
            else:
                rest_offset = Quaternion((1, 0, 0, 0))
            self.rest_offset[bone.name] = rest_offset
        self.O: dict[str, Quaternion] = {name: Quaternion((1, 0, 0, 0))
                                         for name in self.rest_head}
        self.P: dict[str, Vector] = {name: head.copy()
                                     for name, head in self.rest_head.items()}

    def current_dir(self, name: str) -> Vector:
        return (self.O[name] @ self.rest_dir[name]).normalized()

    def tail_pos(self, name: str) -> Vector:
        bone = self.armature.data.bones[name]
        span = Vector(bone.tail_local) - Vector(bone.head_local)
        return self.P[name] + self.O[name] @ span

    def rotate_subtree(self, name: str, rot: Quaternion) -> None:
        pivot = self.P[name].copy()
        stack = [name]
        while stack:
            current = stack.pop()
            self.P[current] = pivot + rot @ (self.P[current] - pivot)
            self.O[current] = rot @ self.O[current]
            stack.extend(self.children[current])

    def parent_orientation(self, name: str) -> Quaternion:
        parent = self.parent[name]
        if parent is None:
            return Quaternion((1, 0, 0, 0))
        return self.O[parent] @ self.rest_rot[parent]

    def write_locals(self) -> None:
        for bone in self.armature.pose.bones:
            bone.rotation_mode = "QUATERNION"
            parent_q = self.parent_orientation(bone.name)
            local = (self.rest_offset[bone.name].inverted() @ parent_q.inverted()
                     @ self.O[bone.name] @ self.rest_rot[bone.name])
            bone.rotation_quaternion = local
            bone.location = Vector((0, 0, 0))
            bone.scale = Vector((1, 1, 1))


def data_dir(armature_obj: bpy.types.Object, bone_name: str) -> Vector:
    bone = armature_obj.data.bones[bone_name]
    direction = bone.tail_local - bone.head_local
    direction.normalize()
    return direction


def clear_pose(armature_obj: bpy.types.Object) -> None:
    """Write-only pose reset (no matrix reads)."""
    for bone in armature_obj.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
        bone.location = Vector((0, 0, 0))
        bone.scale = Vector((1, 1, 1))


def roll_hand_palm_down(tracker: PoseTracker, side: str, sign: float) -> dict[str, float]:
    """Roll the hand about the finger axis until the radial (thumb) side
    faces forward, which lays the palm flat down. Tracked math only."""
    hand = f"hand_{side}"
    finger = tracker.current_dir(hand)
    radial = tracker.P[f"index_01_{side}"] - tracker.P[f"pinky_01_{side}"]
    if (radial - finger * radial.dot(finger)).length < 1e-4:
        raise RuntimeError(f"degenerate metacarpal axis on side {side}")

    def perpendicular(component: Vector) -> Vector:
        projection = component - finger * component.dot(finger)
        projection.normalize()
        return projection

    current = perpendicular(radial)
    goal = perpendicular(FRONT)
    cross = current.cross(goal)
    angle = math.atan2(cross.dot(finger), current.dot(goal))
    tracker.rotate_subtree(hand, Quaternion(finger, angle))
    # The signed angle takes the shorter path, which can land radial-side
    # backward (palm up). Detect and flip 180 deg when that happens.
    trial_radial = (tracker.P[f"index_01_{side}"] - tracker.P[f"pinky_01_{side}"]).normalized()
    trial_palm = (finger.cross(trial_radial) * sign).normalized()
    if angle_between(trial_palm, DOWN) > math.radians(90):
        tracker.rotate_subtree(hand, Quaternion(finger, math.pi))
    finger_after = tracker.current_dir(hand)
    radial_after = (tracker.P[f"index_01_{side}"] - tracker.P[f"pinky_01_{side}"]).normalized()
    palm = (finger_after.cross(radial_after) * sign).normalized()
    # The MPFB thumb rests folded along the fingers. Abduct thumb_01 so the
    # tip swings forward into a relaxed neutral lie (metacarpals untouched,
    # so the palm plane cannot move).
    tip = tracker.tail_pos(f"thumb_03_{side}")
    base = tracker.P[f"thumb_01_{side}"]
    current_tip = (tip - base).normalized()
    goal_tip = (FRONT * 0.866 + finger_after * 0.5).normalized()
    if angle_between(current_tip, goal_tip) > 1e-4:
        tracker.rotate_subtree(f"thumb_01_{side}", current_tip.rotation_difference(goal_tip))
    tip_after = tracker.tail_pos(f"thumb_03_{side}")
    base_after = tracker.P[f"thumb_01_{side}"]
    thumb_tip_dir = (tip_after - base_after).normalized()
    return {"palm_down_error_deg": math.degrees(angle_between(palm, DOWN)),
            "thumb_forward_error_deg": math.degrees(angle_between(thumb_tip_dir, FRONT))}


def apply_t_pose(armature_obj: bpy.types.Object, report: dict) -> None:
    # Assigned actions fight manual posing through evaluation: park the
    # action, pose against a clean rig, restore it after the bake.
    stashed_action = None
    animation_data = armature_obj.animation_data
    if animation_data is not None:
        stashed_action = animation_data.action
        animation_data.action = None
    report["stashed_action"] = stashed_action.name if stashed_action else None
    bpy.context.view_layer.objects.active = armature_obj
    bpy.ops.object.mode_set(mode="POSE")
    tracker = PoseTracker(armature_obj)
    for side, sign in (("l", 1.0), ("r", -1.0)):
        sideways = Vector((sign, 0.0, 0.0))
        before = math.degrees(angle_between(tracker.current_dir(f"upperarm_{side}"), sideways))
        for name in (f"upperarm_{side}", f"lowerarm_{side}", f"hand_{side}"):
            current = tracker.current_dir(name)
            if angle_between(current, sideways) > 1e-4:
                tracker.rotate_subtree(name, current.rotation_difference(sideways))
        roll = roll_hand_palm_down(tracker, side, sign)
        after_dir = tracker.current_dir(f"upperarm_{side}")
        elbow = angle_between(tracker.current_dir(f"upperarm_{side}"),
                              tracker.current_dir(f"lowerarm_{side}"))
        report["tpose_arms"] = report.get("tpose_arms", {})
        horizontal_error = math.degrees(angle_between(after_dir, sideways))
        elbow_deg = math.degrees(elbow)
        assert horizontal_error < 0.5, f"T-pose arm {side} not horizontal: {horizontal_error}"
        assert elbow_deg < 0.5, f"T-pose elbow {side} bent: {elbow_deg}"
        assert roll["palm_down_error_deg"] < 10.0, \
            f"T-pose palm {side} not down: {roll['palm_down_error_deg']}"
        # Relaxed neutral thumb: ~30 deg forward of the finger-perpendicular.
        assert roll["thumb_forward_error_deg"] < 40.0, \
            f"T-pose thumb {side} off: {roll['thumb_forward_error_deg']}"
        report["tpose_arms"][side] = {
            "raise_before_deg": round(before, 2),
            "horizontal_error_deg": round(horizontal_error, 3),
            "elbow_deg": round(elbow_deg, 3),
            "palm_down_error_deg": round(roll["palm_down_error_deg"], 3),
            "thumb_forward_error_deg": round(roll["thumb_forward_error_deg"], 3),
        }
    for side in ("l", "r"):
        thigh_dir = tracker.current_dir(f"thigh_{side}")
        calf = f"calf_{side}"
        if angle_between(tracker.current_dir(calf), thigh_dir) > 1e-4:
            tracker.rotate_subtree(calf, tracker.current_dir(calf).rotation_difference(thigh_dir))
    knee_deg = math.degrees(angle_between(tracker.current_dir("thigh_l"),
                                          tracker.current_dir("calf_l")))
    assert knee_deg < 0.5, f"knee not straight: {knee_deg}"
    report["tpose_legs"] = {"knee_deg": round(knee_deg, 3)}
    tracker.write_locals()
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.pose.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    if animation_data is not None:
        animation_data.action = stashed_action
    # Decisive check at DATA level (no evaluation involved): the bake must
    # show a true T-pose in the saved rest pose.
    baked = {}
    for name, sign in (("upperarm_l", 1.0), ("upperarm_r", -1.0)):
        baked[name] = round(math.degrees(data_dir(armature_obj, name).angle(
            Vector((sign, 0.0, 0.0)))), 3)
    assert baked["upperarm_l"] < 1.0, f"baked left arm off: {baked}"
    assert baked["upperarm_r"] < 1.0, f"baked right arm off: {baked}"
    baked_elbow = math.degrees(data_dir(armature_obj, "upperarm_l").angle(
        data_dir(armature_obj, "lowerarm_l")))
    assert baked_elbow < 2.0, f"baked elbow bent: {baked_elbow}"
    report["tpose_baked"] = {"upperarm_from_horizontal_deg": baked, "elbow_deg": round(baked_elbow, 3)}
    clear_pose(armature_obj)
    bpy.ops.object.mode_set(mode="OBJECT")


def weight_sums(obj: bpy.types.Object, bone_names: set[str]) -> tuple[float, float, int]:
    """Sum only deform groups (matching pose bones). Helper groups such as
    joint-*, helper-*, Left/Mid/Right are authoring metadata, not skinning."""
    minimum, maximum, bad = 1.0, 1.0, 0
    for vertex in obj.data.vertices:
        total = sum(entry.weight for entry in vertex.groups
                    if obj.vertex_groups[entry.group].name in bone_names)
        minimum = min(minimum, total)
        maximum = max(maximum, total)
        if total < 0.999 or total > 1.001:
            bad += 1
    return minimum, maximum, bad


def deform_check(armature_obj: bpy.types.Object, body: bpy.types.Object) -> dict:
    """Raise one arm 60 deg past the new rest pose; check edge stretch.

    Fully computed from DATA plus a tracked rotation: no pose-mode reads,
    no depsgraph sampling. Linear-blend skinning matches the modifier.
    """
    tracker = PoseTracker(armature_obj)
    tracker.rotate_subtree("upperarm_l", Quaternion(Vector((0, 1, 0)), math.radians(60)))
    arm_world = armature_obj.matrix_world.copy()
    arm_world_inv = arm_world.inverted()
    body_world = body.matrix_world.copy()
    skin: dict[str, Matrix] = {}
    for bone in armature_obj.data.bones:
        posed_rot = tracker.O[bone.name] @ tracker.rest_rot[bone.name]
        posed = Matrix.Translation(tracker.P[bone.name]) @ posed_rot.to_matrix().to_4x4()
        skin[bone.name] = posed @ bone.matrix_local.inverted()
    group_names = [group.name for group in body.vertex_groups]
    non_bone_groups = sorted({name for name in group_names if name not in skin})
    rest_positions = [body_world @ vertex.co for vertex in body.data.vertices]
    posed_positions: list[Vector] = []
    for vertex in body.data.vertices:
        rest_arm = arm_world_inv @ rest_positions[vertex.index]
        matched = [(group_names[entry.group], entry.weight) for entry in vertex.groups
                   if group_names[entry.group] in skin]
        total = sum(weight for _, weight in matched)
        blended = Vector((0.0, 0.0, 0.0))
        if total > 1e-9:
            for name, weight in matched:
                blended += skin[name] @ rest_arm * (weight / total)
        else:
            blended = rest_arm.copy()
        posed_positions.append(arm_world @ blended)
    worst_stretch, worst_press = 1.0, 1.0
    for edge in body.data.edges:
        rest = (rest_positions[edge.vertices[0]] - rest_positions[edge.vertices[1]]).length
        posed = (posed_positions[edge.vertices[0]] - posed_positions[edge.vertices[1]]).length
        if rest < 1e-9:
            continue
        ratio = posed / rest
        worst_stretch = max(worst_stretch, ratio)
        worst_press = min(worst_press, ratio)
    return {"worst_stretch": round(worst_stretch, 3), "worst_press": round(worst_press, 3),
            "non_bone_vertex_groups": non_bone_groups}


# ---------------------------------------------------------------- renders

def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def review_furniture(head_focus: Vector) -> bpy.types.Collection:
    _ = head_focus
    collection = bpy.data.collections.new(REVIEW_COLLECTION)
    bpy.context.scene.collection.children.link(collection)
    collection.hide_render = False
    ground = bpy.data.objects.new("MUSE_ReviewGround", bpy.data.meshes.new("MUSE_ReviewGround"))
    collection.objects.link(ground)
    import bmesh
    mesh = ground.data
    bm = bmesh.new()
    size = 8.0
    verts = [bm.verts.new(co) for co in [(-size, -size, 0), (size, -size, 0),
                                        (size, size, 0), (-size, size, 0)]]
    bm.faces.new(verts)
    bm.to_mesh(mesh)
    bm.free()
    material = bpy.data.materials.new("MUSE_ReviewGround")
    material.use_nodes = True
    material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = \
        (0.32, 0.32, 0.34, 1.0)
    mesh.materials.append(material)
    return collection


def render_view(filepath: str, location: tuple[float, float, float], aim: Vector,
                lens: float = 50.0, resolution: int = 1024) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.filepath = filepath
    world = scene.world
    if world is None:
        world = bpy.data.worlds.new("MUSE_ReviewWorld")
        scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        background = world.node_tree.nodes.new("ShaderNodeBackground")
        output = world.node_tree.nodes.get("World Output")
        world.node_tree.links.new(background.outputs["Background"], output.inputs["Surface"])
    background.inputs["Color"].default_value = (0.16, 0.16, 0.17, 1.0)
    review_collection = bpy.data.collections.get(REVIEW_COLLECTION)
    camera_data = bpy.data.cameras.new("MUSE_ReviewCam")
    camera = bpy.data.objects.new("MUSE_ReviewCam", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    move_to_collection(camera, review_collection)
    camera.location = Vector(location)
    camera.rotation_euler = (aim - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.lens = lens
    scene.camera = camera
    if bpy.data.objects.get("MUSE_ReviewKey") is None:
        key = bpy.data.objects.new("MUSE_ReviewKey",
                                   bpy.data.lights.new("MUSE_ReviewKey", type="SUN"))
        key.data.energy = 3.0
        key.rotation_euler = (0.9, 0.3, 0.0)
        bpy.context.scene.collection.objects.link(key)
        move_to_collection(key, review_collection)
        fill = bpy.data.objects.new("MUSE_ReviewFill",
                                    bpy.data.lights.new("MUSE_ReviewFill", type="SUN"))
        fill.data.energy = 1.0
        fill.rotation_euler = (1.1, -0.6, 0.0)
        bpy.context.scene.collection.objects.link(fill)
        move_to_collection(fill, review_collection)
    review_collection.hide_viewport = False
    review_collection.hide_render = False
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- main

def main() -> None:
    args = parse_args()
    work = Path(args.work).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    renders = Path(args.renders).expanduser().resolve()
    renders.mkdir(parents=True, exist_ok=True)
    report: dict = {"unfinished": []}

    work_hash_before = sha256(work)
    bpy.ops.wm.open_mainfile(filepath=str(work))
    report["work_sha256_before"] = work_hash_before

    armature_obj = bpy.data.objects[ARMATURE_NAME]
    assert armature_obj.type == "ARMATURE"
    rest_names = [bone.name for bone in armature_obj.data.bones]
    expected = json.loads(Path(args.rest_pose_json).expanduser().read_text())["bones"]
    expected_names = [bone["name"] for bone in expected]
    assert rest_names == expected_names, "joint names diverged from recorded rest pose"
    report["skeleton"] = {"bones": len(rest_names), "names_match_record": True}
    assert abs(armature_obj.matrix_world.to_translation().length) < 1e-6
    assert abs((armature_obj.matrix_world.to_scale() - Vector((1, 1, 1))).length) < 1e-6

    # Morph defaults for the male character.
    body = bpy.data.objects["AvatarBody"]
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.shape_keys:
            continue
        for shape in obj.data.shape_keys.key_blocks:
            if shape.name == "male":
                shape.value = 1.0
            elif shape.name == "female":
                shape.value = 0.0
    report["morphs"] = {shape.name: round(shape.value, 3)
                        for shape in body.data.shape_keys.key_blocks}

    # Segmented reference import (reference-only, never exported).
    seg_collection = bpy.data.collections.new(SEGREF_COLLECTION)
    bpy.context.scene.collection.children.link(seg_collection)
    seg_collection.hide_viewport = True
    seg_collection.hide_render = True
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=str(Path(args.seg_glb).expanduser().resolve()))
    imported = [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before]
    source_root = bpy.data.objects["SOURCE_TripoV31_Root"]
    seg_root = bpy.data.objects.new(SEGREF_ROOT, None)
    seg_collection.objects.link(seg_root)
    seg_root.matrix_world = source_root.matrix_world.copy()
    for obj in imported:
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        seg_collection.objects.link(obj)
        if obj is not seg_root and obj.parent is None:
            obj.parent = seg_root
    seg_meshes = [obj for obj in imported if obj.type == "MESH"]
    # View-layer-hidden collections are skipped by the depsgraph, so their
    # matrix_world values go stale. Unhide for measurement, re-hide after.
    seg_collection.hide_viewport = False
    bpy.context.view_layer.update()
    source_meshes = [obj for obj in bpy.data.collections["SOURCE_TripoV31_DoNotExport"].objects
                     if obj.type == "MESH"]
    source_top = max((obj.matrix_world @ Vector(corner)).z
                     for obj in source_meshes for corner in obj.bound_box)
    seg_top = max((obj.matrix_world @ Vector(corner)).z
                  for obj in seg_meshes for corner in obj.bound_box)
    landmark_gap = abs(source_top - seg_top)
    seg_collection.hide_viewport = True
    assert landmark_gap < 0.05, f"seg alignment drift: {landmark_gap}"
    report["segref"] = {"parts": len(seg_meshes),
                        "names": sorted(obj.name for obj in seg_meshes),
                        "head_top_gap_m": round(landmark_gap, 4)}

    # Materials.
    made = build_materials()
    assign_material(body, made["skin"], report)
    assign_material(bpy.data.objects["AvatarEye_l"], made["eye_white"], report)
    assign_material(bpy.data.objects["AvatarEye_r"], made["eye_white"], report)
    assign_material(bpy.data.objects["AvatarIris_l"], made["iris"], report)
    assign_material(bpy.data.objects["AvatarIris_r"], made["iris"], report)
    assign_material(bpy.data.objects["AvatarPupil_l"], made["pupil"], report)
    assign_material(bpy.data.objects["AvatarPupil_r"], made["pupil"], report)
    assign_material(bpy.data.objects["AvatarEyebrows"], made["brow"], report)
    assign_material(bpy.data.objects["AvatarEyelashes"], made["brow"], report)
    assign_material(bpy.data.objects["AvatarHair_textured-crop"], made["hair"], report)
    assign_material(bpy.data.objects["AvatarTop_graphic-tee"], made["shirt"], report)
    assign_material(bpy.data.objects["AvatarJacket_bomber"], made["satin"], report)
    assign_material(bpy.data.objects["AvatarBottoms_tech-joggers"], made["cargo"], report)
    assign_material(bpy.data.objects["AvatarShoes_high-tops"], made["leather"], report)
    for suffix in ("_l", "_r"):
        hoops = bpy.data.objects.get(f"AvatarAccessory_gold-hoops{suffix}")
        if hoops is not None:
            assign_material(hoops, made["gold"], report)
    report["materials"] = sorted(bpy.data.materials[name].name for name in made.values())

    # Hide non-selected wardrobe/hair options (documented, reversible).
    hidden = []
    for slot in CANONICAL_SLOTS:
        for obj in bpy.data.objects:
            if obj.name == f"AvatarOption_{slot}__{SELECTED_OPTIONS[slot]}":
                continue
            if obj.name.startswith(f"AvatarOption_{slot}__"):
                obj.hide_viewport = True
                obj.hide_render = True
                hidden.append(obj.name)
    report["hidden_options"] = sorted(hidden)

    # Cornea caps.
    caps = []
    for side, eye_name in (("l", "AvatarEye_l"), ("r", "AvatarEye_r")):
        caps.append(build_cornea_cap(side, bpy.data.objects[eye_name], armature_obj,
                                     made["cornea"]).name)
    report["cornea_caps"] = caps

    # T-pose rest on this COPY only.
    apply_t_pose(armature_obj, report)
    rest_after = [bone.name for bone in armature_obj.data.bones]
    assert rest_after == expected_names
    report["bind"] = {"rest_pose": "strict-T (muse copy only)",
                      "joint_count": len(rest_after),
                      "actions": [action.name for action in bpy.data.actions]}

    bone_names = {bone.name for bone in armature_obj.pose.bones}
    minimum, maximum, bad = weight_sums(body, bone_names)
    assert bad == 0, f"{bad} verts out of weight tolerance after rebind"
    report["skin_weights"] = {"min": round(minimum, 6), "max": round(maximum, 6),
                              "out_of_tolerance": bad,
                              "deform_bones": len(bone_names)}
    report["deform_check"] = deform_check(armature_obj, body)

    # Mesh inventory.
    inventory = []
    total_tris = 0
    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        if obj.type != "MESH":
            continue
        tris = len(obj.data.polygons)
        total_tris += tris
        inventory.append({"name": obj.name, "verts": len(obj.data.vertices), "tris": tris,
                          "materials": [m.name if m else None for m in obj.data.materials]})
    report["meshes"] = inventory
    report["total_tris"] = total_tris

    # Renders (furniture kept in-file but excluded from render/export sets).
    review_furniture(Vector((0, 0, 1.55)))
    head = Vector((0.0, -0.03, 1.575))
    render_view(str(renders / "muse-head-front.png"), (0.0, -0.95, 1.60), head, lens=85.0)
    render_view(str(renders / "muse-head-profile.png"), (0.95, -0.03, 1.60), head, lens=85.0)
    render_view(str(renders / "muse-head-three-quarter.png"), (0.62, -0.68, 1.63), head, lens=85.0)
    render_view(str(renders / "muse-body-front.png"), (0.0, -4.4, 1.15),
                Vector((0.0, 0.0, 0.92)), lens=50.0)

    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report["output"] = str(output)
    report["work_sha256_after"] = sha256(work)
    assert report["work_sha256_after"] == work_hash_before, "source workfile was modified"
    report["unfinished"] = [
        "Likeness sculpt: MPFB base face is generic; no cheek/jaw/nose/lip deltas sculpted.",
        "Hair: generic mass with quiff material; swept side-part silhouette and blonde streak not sculpted/painted.",
        "Ears: base geometry only; no antihelix/concha refinement.",
        "Teeth/tongue/mouth interior: absent (closed mouth; needed for jawOpen visemes).",
        "Eyelid margin thickness and caruncle detail: not modeled.",
        "Jewelry: hoops only; necklaces, pendant, waist chains not modeled (no canonical meshes).",
        "Shoe soles: single-material uppers; sole/trim separation pending.",
        "Clothing drape/folds: starter meshes with new materials; bomber drape and cargo pockets not sculpted.",
        "Textures are procedural (noise bump/roughness); no painted albedo/normal maps yet.",
        "Actions idle/walk/run are A-pose-authored placeholders, now offset from the T-pose rest.",
        " Runtime LOD0 packaging (<=60k tris, WebP) not started; workfile holds the full catalog.",
    ]
    report_path.write_text(json.dumps(report, indent=2))
    print(f"MUSE BUILD DONE: {total_tris} tris, {len(inventory)} meshes")


if __name__ == "__main__":
    main()
