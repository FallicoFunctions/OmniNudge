"""Build OmniRave's first shared-topology modular avatar base.

Connection map (defined before geometry is created):

AvatarAsset (export root)
├── AvatarSkeleton (one canonical deform skeleton)
│   ├── AvatarBody (skinned; Basis + male + female shape keys)
│   ├── AvatarEye_[lr] (skinned rigidly to eye_[lr])
│   ├── AvatarIris_[lr] (skinned rigidly to eye_[lr])
│   └── AvatarPupil_[lr] (skinned rigidly to eye_[lr])
└── AvatarSlot_* (stable attachment roots for fitted modular assets)

Every wearable is authored against AvatarSkeleton's rest pose. Body variants are
shape keys on one topology, never separate bodies or separate armatures.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector

try:
    from bl_ext.user_default.mpfb.services import HumanService, LocationService, TargetService
except ModuleNotFoundError:
    try:
        from bl_ext.blender_org.mpfb.services import HumanService, LocationService, TargetService
    except ModuleNotFoundError:
        # Source checkout fallback used by reproducible local builds when the Blender
        # extension registry is not installed in the selected user-resource directory.
        from mpfb.services import HumanService, LocationService, TargetService


CONTRACT_VERSION = "omnirave-avatar/1"
SLOTS = ("hair", "top", "jacket", "bottoms", "shoes", "accessories")
BODY_MORPHS = ("male", "female")
STARTER_OPTIONS = {
    "hair": "textured-crop",
    "top": "graphic-tee",
    "jacket": "bomber",
    "bottoms": "tech-joggers",
    "shoes": "high-tops",
    "accessories": "gold-hoops",
}
HAIR_MHCLO_OPTIONS = {
    "long-waves": "long01",
    "box-braids": "braid01",
    "high-pony": "ponytail01",
    "blunt-bob": "bob01",
    "space-buns": "short04",
    "buzz": "short01",
    "taper-fade": "short03",
    "textured-crop": "short02",
    "man-bun": "short04",
    "shoulder-shag": "bob02",
}
SHOES_MHCLO_OPTIONS = {
    "platform-boots": "shoes01",
    "chunky-sneakers": "shoes05",
    "skate-sneakers": "shoes04",
    "trail-runners": "shoes02",
    "high-tops": "shoes06",
    "work-boots": "shoes03",
}
SURFACE_OPTIONS = {
    "top": ("graphic-tee", "ribbed-tank", "mesh-crop"),
    "jacket": ("bomber", "utility-vest", "cropped-puffer"),
    "bottoms": ("tech-joggers", "cargo-pants", "mesh-shorts"),
}
AUTHORED_OPTIONS = {
    **{slot: (option_id,) for slot, option_id in STARTER_OPTIONS.items()},
    "hair": tuple(HAIR_MHCLO_OPTIONS),
    "shoes": tuple(SHOES_MHCLO_OPTIONS),
    **SURFACE_OPTIONS,
}


def mpfb_asset_path(relative_path: str) -> Path:
    """Resolve an MPFB asset from the active user library or local project cache."""
    candidates = [Path(LocationService.get_user_data(relative_path))]
    project_root = Path(__file__).resolve().parents[3]
    candidates.append(
        project_root
        / ".tooling"
        / "blender-user"
        / "extensions"
        / ".user"
        / "blender_org"
        / "mpfb"
        / "data"
        / relative_path
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--manifest", required=True)
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.armatures, bpy.data.materials):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def macro_details(
    *,
    gender: float,
    muscle: float,
    weight: float,
    proportions: float,
    height: float,
) -> dict:
    details = TargetService.get_default_macro_info_dict()
    details["gender"] = gender
    details["muscle"] = muscle
    details["age"] = 0.44
    details["weight"] = weight
    details["proportions"] = proportions
    details["height"] = height
    details["race"] = {"asian": 0.24, "caucasian": 0.52, "african": 0.24}
    return details


def weighted_group_center(obj: bpy.types.Object, group_name: str) -> Vector:
    group = obj.vertex_groups[group_name]
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    weighted = []
    for vertex in obj.data.vertices:
        for membership in vertex.groups:
            if membership.group == group.index and membership.weight > 0.0:
                weighted.append((evaluated.data.vertices[vertex.index].co.copy(), membership.weight))
                break
    if not weighted:
        raise RuntimeError(f"Vertex group {group_name!r} has no vertices")
    total = sum(weight for _, weight in weighted)
    return sum((co * weight for co, weight in weighted), Vector()) / total


def keep_body_vertices_only(obj: bpy.types.Object) -> None:
    """Delete MPFB helper geometry while preserving stable body vertex order."""
    body_group = obj.vertex_groups.get("body")
    if body_group is None:
        raise RuntimeError("MPFB body group is missing")

    keep_indices = set()
    for vertex in obj.data.vertices:
        for membership in vertex.groups:
            if membership.group == body_group.index and membership.weight > 0.5:
                keep_indices.add(vertex.index)
                break

    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    remove = [vertex for vertex in bm.verts if vertex.index not in keep_indices]
    bmesh.ops.delete(bm, geom=remove, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def bake_shape_mix(obj: bpy.types.Object) -> None:
    """Freeze MPFB's macro targets into one clean basis before our morphs."""
    if obj.data.shape_keys is None:
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    obj.select_set(False)


def create_human(
    name: str,
    *,
    gender: float,
    muscle: float,
    weight: float,
    proportions: float,
    height: float,
) -> bpy.types.Object:
    human = HumanService.create_human(
        mask_helpers=False,
        detailed_helpers=True,
        extra_vertex_groups=True,
        feet_on_ground=True,
        scale=0.1,
        macro_detail_dict=macro_details(
            gender=gender,
            muscle=muscle,
            weight=weight,
            proportions=proportions,
            height=height,
        ),
    )
    human.name = name
    human.data.name = f"{name}Mesh"
    return human


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    texture_path: Path | None = None,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.0
    if "Subsurface Weight" in principled.inputs and name == "AvatarSkin":
        principled.inputs["Subsurface Weight"].default_value = 0.08
    if texture_path is not None:
        image = bpy.data.images.load(str(texture_path), check_existing=True)
        image.pack()
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.name = "AvatarSkinTexture"
        texture.image = image
        texture.interpolation = "Linear"
        material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    return material


def add_shape_from_object(target: bpy.types.Object, source: bpy.types.Object, name: str) -> None:
    if len(target.data.vertices) != len(source.data.vertices):
        raise RuntimeError(
            f"Topology mismatch for {name}: {len(target.data.vertices)} != {len(source.data.vertices)}"
        )
    key = target.shape_key_add(name=name, from_mix=False)
    for destination, source_vertex in zip(key.data, source.data.vertices, strict=True):
        destination.co = source_vertex.co
    key.value = 0.0


def copy_body_weights(
    target: bpy.types.Object,
    source: bpy.types.Object,
    source_vertex_indices: list[int],
) -> None:
    """Copy canonical skeleton weights while retaining the source vertex map."""
    target_groups = {
        source_group.index: target.vertex_groups.new(name=source_group.name)
        for source_group in source.vertex_groups
    }
    for target_index, source_index in enumerate(source_vertex_indices):
        for membership in source.data.vertices[source_index].groups:
            if membership.weight > 0.0:
                target_groups[membership.group].add(
                    [target_index], membership.weight, "REPLACE"
                )


def create_fitted_surface(
    name: str,
    neutral: bpy.types.Object,
    male: bpy.types.Object,
    female: bpy.types.Object,
    armature: bpy.types.Object,
    material: bpy.types.Material,
    *,
    clearance: float,
    face_filter,
) -> bpy.types.Object:
    """Create a reusable garment shell from stable body topology.

    The shell reuses canonical body weights and stores its male/female fits as
    shape keys. It is therefore one garment mesh on one skeleton, not a pair of
    gender-specific meshes.
    """
    source_faces = []
    for polygon in neutral.data.polygons:
        center = sum(
            (neutral.data.vertices[index].co for index in polygon.vertices),
            Vector(),
        ) / len(polygon.vertices)
        if face_filter(center):
            source_faces.append(polygon)
    if not source_faces:
        raise RuntimeError(f"No body faces selected for {name}")

    source_vertex_indices = sorted(
        {index for polygon in source_faces for index in polygon.vertices}
    )
    target_index = {
        source_index: index for index, source_index in enumerate(source_vertex_indices)
    }

    def fitted_coordinate(source: bpy.types.Object, source_index: int) -> Vector:
        vertex = source.data.vertices[source_index]
        return vertex.co + vertex.normal.normalized() * clearance

    vertices = [fitted_coordinate(neutral, index) for index in source_vertex_indices]
    faces = [
        [target_index[index] for index in polygon.vertices]
        for polygon in source_faces
    ]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    garment = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(garment)

    source_uv_layer = neutral.data.uv_layers.active
    if source_uv_layer is not None:
        target_uv_layer = mesh.uv_layers.new(name=source_uv_layer.name)
        for source_polygon, target_polygon in zip(source_faces, mesh.polygons, strict=True):
            for source_loop_index, target_loop_index in zip(
                source_polygon.loop_indices,
                target_polygon.loop_indices,
                strict=True,
            ):
                target_uv_layer.data[target_loop_index].uv = source_uv_layer.data[
                    source_loop_index
                ].uv

    garment.data.materials.append(material)
    garment.shape_key_add(name="Basis", from_mix=False)
    for morph_name, source in (("male", male), ("female", female)):
        key = garment.shape_key_add(name=morph_name, from_mix=False)
        for destination, source_index in zip(
            key.data, source_vertex_indices, strict=True
        ):
            destination.co = fitted_coordinate(source, source_index)
        key.value = 0.0

    copy_body_weights(garment, neutral, source_vertex_indices)
    modifier = garment.modifiers.new(name="AvatarArmature", type="ARMATURE")
    modifier.object = armature
    garment.parent = armature
    return garment


def finish_open_bomber_edges(jacket: bpy.types.Object) -> None:
    """Turn topology-selected cut edges into deliberate garment lines.

    The source body has dense, irregular facial loops around the torso. A raw
    face selection therefore produces a saw-tooth opening. Only open boundary
    vertices are adjusted here; the rest of the fitted surface, weights, and
    male/female morphs remain identical to the canonical body fit.
    """
    edge_face_count: dict[tuple[int, int], int] = {}
    for polygon in jacket.data.polygons:
        indices = list(polygon.vertices)
        for start, end in zip(indices, indices[1:] + indices[:1], strict=True):
            edge = tuple(sorted((start, end)))
            edge_face_count[edge] = edge_face_count.get(edge, 0) + 1
    boundary_indices = {
        index
        for edge, count in edge_face_count.items()
        if count == 1
        for index in edge
    }

    for key in jacket.data.shape_keys.key_blocks:
        for index in boundary_indices:
            point = key.data[index].co
            if point.y < -0.045 and 0.93 < point.z < 1.37 and abs(point.x) < 0.19:
                height = max(0.0, min(1.0, (point.z - 0.94) / 0.40))
                point.x = math.copysign(0.045 + 0.080 * height, point.x)
            elif 0.84 < point.z < 0.94 and abs(point.x) < 0.34:
                point.z = 0.89

    jacket.data.update()


def smooth_open_boundaries(garment: bpy.types.Object, *, iterations: int = 4) -> None:
    """Relax cut borders while leaving the fitted interior untouched."""
    edge_face_count: dict[tuple[int, int], int] = {}
    for polygon in garment.data.polygons:
        indices = list(polygon.vertices)
        for start, end in zip(indices, indices[1:] + indices[:1], strict=True):
            edge = tuple(sorted((start, end)))
            edge_face_count[edge] = edge_face_count.get(edge, 0) + 1
    adjacency: dict[int, set[int]] = {}
    for (start, end), count in edge_face_count.items():
        if count != 1:
            continue
        adjacency.setdefault(start, set()).add(end)
        adjacency.setdefault(end, set()).add(start)

    for key in garment.data.shape_keys.key_blocks:
        for _ in range(iterations):
            updates = {}
            for index, neighbors in adjacency.items():
                if len(neighbors) != 2:
                    continue
                average = sum((key.data[neighbor].co for neighbor in neighbors), Vector()) / 2.0
                updates[index] = key.data[index].co.lerp(average, 0.42)
            for index, coordinate in updates.items():
                key.data[index].co = coordinate
    garment.data.update()


def finish_crew_neck(top: bpy.types.Object) -> None:
    """Regularize the open neckline without changing the fitted body surface."""
    edge_face_count: dict[tuple[int, int], int] = {}
    for polygon in top.data.polygons:
        indices = list(polygon.vertices)
        for start, end in zip(indices, indices[1:] + indices[:1], strict=True):
            edge = tuple(sorted((start, end)))
            edge_face_count[edge] = edge_face_count.get(edge, 0) + 1
    boundary_indices = {
        index
        for edge, count in edge_face_count.items()
        if count == 1
        for index in edge
    }

    for key in top.data.shape_keys.key_blocks:
        for index in boundary_indices:
            point = key.data[index].co
            if point.z > 1.29 and abs(point.x) < 0.23:
                if point.y < -0.025:
                    point.z = min(1.355, 1.305 + 0.25 * abs(point.x))
                else:
                    point.z = 1.345
            elif 0.87 < point.z < 0.96 and abs(point.x) < 0.34:
                point.z = 0.91

    top.data.update()


def load_fitted_asset_triplet(
    mhclo_path: Path,
    asset_type: str,
    neutral: bpy.types.Object,
    male: bpy.types.Object,
    female: bpy.types.Object,
) -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Object]:
    if not mhclo_path.exists():
        raise RuntimeError(f"Required CC0 starter asset is missing: {mhclo_path}")
    neutral_asset = HumanService.add_mhclo_asset(
        str(mhclo_path),
        neutral,
        asset_type=asset_type,
        subdiv_levels=0,
        material_type="GAMEENGINE",
        set_up_rigging=True,
        interpolate_weights=True,
        import_subrig=False,
        import_weights=True,
    )
    source_assets = []
    for source in (male, female):
        source_assets.append(
            HumanService.add_mhclo_asset(
                str(mhclo_path),
                source,
                asset_type=asset_type,
                subdiv_levels=0,
                material_type="GAMEENGINE",
                set_up_rigging=False,
                interpolate_weights=False,
                import_subrig=False,
                import_weights=False,
            )
        )
    return neutral_asset, source_assets[0], source_assets[1]


def add_asset_fit_morphs(
    target: bpy.types.Object,
    male_source: bpy.types.Object,
    female_source: bpy.types.Object,
) -> None:
    target.shape_key_add(name="Basis", from_mix=False)
    add_shape_from_object(target, male_source, "male")
    add_shape_from_object(target, female_source, "female")


def parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def mark_slot_option(
    obj: bpy.types.Object,
    option_root: bpy.types.Object,
    slot: str,
    option_id: str,
) -> None:
    parent_keep_world(obj, option_root)
    obj["avatarContract"] = CONTRACT_VERSION
    obj["avatarAssetKind"] = "slot"
    obj["avatarSlot"] = slot
    obj["avatarOptionId"] = option_id
    obj["avatarPartRole"] = slot


def reset_pose(armature: bpy.types.Object) -> None:
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)


def create_pose_action(
    armature: bpy.types.Object,
    name: str,
    frames: list[tuple[int, dict[str, tuple[float, float, float]]]],
) -> bpy.types.Action:
    """Author a small reusable skeletal clip in the canonical rest space."""
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    reset_pose(armature)
    animated_bones = {bone_name for _, values in frames for bone_name in values}
    for frame, rotations in frames:
        reset_pose(armature)
        for bone_name, degrees in rotations.items():
            pose_bone = armature.pose.bones[bone_name]
            pose_bone.rotation_euler = tuple(math.radians(value) for value in degrees)
        for bone_name in animated_bones:
            armature.pose.bones[bone_name].keyframe_insert(
                data_path="rotation_euler", frame=frame, group=bone_name
            )
    action["avatarContract"] = CONTRACT_VERSION
    action["avatarClip"] = name
    armature.animation_data.action = None
    reset_pose(armature)
    return action


def create_starter_actions(armature: bpy.types.Object) -> list[bpy.types.Action]:
    idle = create_pose_action(
        armature,
        "idle",
        [
            (1, {"spine_02": (-1.0, 0.0, 0.0), "spine_03": (0.8, 0.0, 0.0)}),
            (20, {"spine_02": (1.0, 0.0, 0.0), "spine_03": (-0.8, 0.0, 0.0)}),
            (40, {"spine_02": (-1.0, 0.0, 0.0), "spine_03": (0.8, 0.0, 0.0)}),
        ],
    )
    walk = create_pose_action(
        armature,
        "walk",
        [
            (1, {"upperarm_l": (28.0, 0.0, 0.0), "upperarm_r": (-28.0, 0.0, 0.0), "thigh_l": (-30.0, 0.0, 0.0), "thigh_r": (30.0, 0.0, 0.0), "calf_l": (18.0, 0.0, 0.0)}),
            (13, {"upperarm_l": (-28.0, 0.0, 0.0), "upperarm_r": (28.0, 0.0, 0.0), "thigh_l": (30.0, 0.0, 0.0), "thigh_r": (-30.0, 0.0, 0.0), "calf_r": (18.0, 0.0, 0.0)}),
            (25, {"upperarm_l": (28.0, 0.0, 0.0), "upperarm_r": (-28.0, 0.0, 0.0), "thigh_l": (-30.0, 0.0, 0.0), "thigh_r": (30.0, 0.0, 0.0), "calf_l": (18.0, 0.0, 0.0)}),
        ],
    )
    run = create_pose_action(
        armature,
        "run",
        [
            (1, {"spine_01": (8.0, 0.0, 0.0), "upperarm_l": (46.0, 0.0, 0.0), "upperarm_r": (-46.0, 0.0, 0.0), "thigh_l": (-48.0, 0.0, 0.0), "thigh_r": (42.0, 0.0, 0.0), "calf_l": (42.0, 0.0, 0.0)}),
            (9, {"spine_01": (8.0, 0.0, 0.0), "upperarm_l": (-46.0, 0.0, 0.0), "upperarm_r": (46.0, 0.0, 0.0), "thigh_l": (42.0, 0.0, 0.0), "thigh_r": (-48.0, 0.0, 0.0), "calf_r": (42.0, 0.0, 0.0)}),
            (17, {"spine_01": (8.0, 0.0, 0.0), "upperarm_l": (46.0, 0.0, 0.0), "upperarm_r": (-46.0, 0.0, 0.0), "thigh_l": (-48.0, 0.0, 0.0), "thigh_r": (42.0, 0.0, 0.0), "calf_l": (42.0, 0.0, 0.0)}),
        ],
    )
    return [idle, walk, run]


def add_deform_bone(
    armature: bpy.types.Object,
    name: str,
    head: Vector,
    tail: Vector,
    parent_name: str,
) -> None:
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bone = armature.data.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.parent = armature.data.edit_bones.get(parent_name)
    bone.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)


def rigid_skin(mesh_obj: bpy.types.Object, armature: bpy.types.Object, bone_name: str) -> None:
    group = mesh_obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(mesh_obj.data.vertices))), 1.0, "REPLACE")
    modifier = mesh_obj.modifiers.new(name="AvatarArmature", type="ARMATURE")
    modifier.object = armature
    mesh_obj.parent = armature


def apply_rotation(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def create_eye_set(
    side: str,
    center: Vector,
    variant_centers: dict[str, Vector],
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    bone_name = f"eye_{side}"
    objects: list[bpy.types.Object] = []

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=0.0122, location=center)
    eye = bpy.context.object
    eye.name = f"AvatarEye_{side}"
    eye.data.name = f"AvatarEye_{side}Mesh"
    eye.data.materials.append(materials["eye_white"])
    eye["avatarContract"] = CONTRACT_VERSION
    eye["avatarPart"] = "eyes"
    add_translation_shape_keys(eye, center, variant_centers)
    rigid_skin(eye, armature, bone_name)
    objects.append(eye)

    front_y = center.y - 0.0117
    for part, radius, depth, material_key, offset in (
        ("Iris", 0.0054, 0.0007, "iris", 0.0),
        ("Pupil", 0.00225, 0.00085, "pupil", -0.00045),
    ):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32,
            radius=radius,
            depth=depth,
            location=(center.x, front_y + offset, center.z),
            rotation=(1.5707963267948966, 0.0, 0.0),
        )
        disc = bpy.context.object
        disc.name = f"Avatar{part}_{side}"
        disc.data.name = f"Avatar{part}_{side}Mesh"
        disc.data.materials.append(materials[material_key])
        disc["avatarContract"] = CONTRACT_VERSION
        disc["avatarPart"] = "eyes"
        apply_rotation(disc)
        add_translation_shape_keys(disc, center, variant_centers)
        rigid_skin(disc, armature, bone_name)
        objects.append(disc)

    return objects


def create_earring_set(
    eye_centers: dict[str, dict[str, Vector]],
    armature: bpy.types.Object,
    material: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects = []
    for side in ("l", "r"):
        direction = 1.0 if side == "l" else -1.0

        def earring_center(variant: str) -> Vector:
            eye = eye_centers[variant][side]
            return Vector((eye.x + direction * 0.052, eye.y + 0.004, eye.z - 0.045))

        center = earring_center("neutral")
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.0125,
            minor_radius=0.0016,
            major_segments=28,
            minor_segments=8,
            location=center,
            rotation=(1.5707963267948966, 0.0, 0.0),
        )
        hoop = bpy.context.object
        hoop.name = f"AvatarAccessory_gold-hoops_{side}"
        hoop.data.name = f"AvatarAccessory_gold-hoops_{side}Mesh"
        hoop.data.materials.append(material)
        apply_rotation(hoop)
        add_translation_shape_keys(
            hoop,
            center,
            {name: earring_center(name) for name in BODY_MORPHS},
        )
        rigid_skin(hoop, armature, "head")
        objects.append(hoop)
    return objects


def create_hair_buns(
    option_id: str,
    eye_centers: dict[str, dict[str, Vector]],
    armature: bpy.types.Object,
    material: bpy.types.Material,
    *,
    paired: bool,
) -> list[bpy.types.Object]:
    """Create low-profile, head-overlapping coiled buns on the canonical head."""
    sides = (-1.0, 1.0) if paired else (0.0,)
    objects = []

    def center_for(variant: str, side: float) -> Vector:
        eyes = eye_centers[variant]
        eye_mid = (eyes["l"] + eyes["r"]) * 0.5
        return Vector(
            (
                side * 0.061,
                0.006 if paired else 0.025,
                eye_mid.z + (0.087 if paired else 0.096),
            )
        )

    for index, side in enumerate(sides):
        center = center_for("neutral", side)
        radius = 0.029 if paired else 0.035
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=32,
            ring_count=20,
            radius=radius,
            location=center,
        )
        bun = bpy.context.object
        suffix = ("l" if side < 0 else "r") if paired else "center"
        bun.name = f"AvatarHair_{option_id}_bun_{suffix}"
        bun.data.name = f"AvatarHair_{option_id}_bun_{suffix}Mesh"
        bun.data.materials.append(material)
        # Flatten toward the scalp and introduce a restrained five-lobe coil.
        # The lower/back portion intentionally overlaps the hair cap so there is
        # no floating-ball seam during head turns.
        for vertex in bun.data.vertices:
            local = vertex.co
            angle = math.atan2(local.z, local.x)
            normalized_depth = local.y / max(radius, 1e-6)
            coil = 1.0 + 0.075 * math.sin(5.0 * angle + 0.65 * normalized_depth)
            local.x *= 0.96 * coil
            local.y *= 0.58
            local.z *= 0.76 * coil
            if local.z < 0.0:
                local.z *= 1.12
                local.y += 0.0035 * (1.0 - abs(local.z) / radius)

        # A smaller overlapping volume bridges the bun into the fitted cap.
        # Keeping it in the same skinned mesh avoids an extra runtime option
        # node while softening the attachment from front and three-quarter views.
        bridge_center = center + Vector(
            (
                -side * radius * 0.30,
                0.002,
                -radius * (0.48 if paired else 0.40),
            )
        )
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=24,
            ring_count=14,
            radius=radius * 0.70,
            location=bridge_center,
        )
        bridge = bpy.context.object
        for vertex in bridge.data.vertices:
            vertex.co.x *= 0.90
            vertex.co.y *= 0.66
            vertex.co.z *= 0.55

        bpy.ops.object.select_all(action="DESELECT")
        bun.select_set(True)
        bridge.select_set(True)
        bpy.context.view_layer.objects.active = bun
        bpy.ops.object.join()
        for polygon in bun.data.polygons:
            polygon.use_smooth = True
        add_translation_shape_keys(
            bun,
            center,
            {name: center_for(name, side) for name in BODY_MORPHS},
        )
        rigid_skin(bun, armature, "head")
        objects.append(bun)
    return objects


def add_translation_shape_keys(
    obj: bpy.types.Object,
    neutral_center: Vector,
    variant_centers: dict[str, Vector],
) -> None:
    obj.shape_key_add(name="Basis", from_mix=False)
    for name in BODY_MORPHS:
        delta = variant_centers[name] - neutral_center
        key = obj.shape_key_add(name=name, from_mix=False)
        for vertex in key.data:
            vertex.co += delta
        key.value = 0.0


def assert_clean_transforms(objects: list[bpy.types.Object]) -> None:
    failures = []
    for obj in objects:
        if any(abs(value - 1.0) > 1e-5 for value in obj.scale):
            failures.append(f"{obj.name}: scale={tuple(obj.scale)}")
    if failures:
        raise RuntimeError("Dirty transforms:\n" + "\n".join(failures))


def export_glb(path: Path, root: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_morph=True,
        export_skins=True,
        export_animations=True,
        export_animation_mode="BROADCAST",
        export_frame_range=False,
        export_force_sampling=False,
        export_optimize_animation_size=True,
    )


def main() -> None:
    args = parse_args()
    blend_path = Path(args.blend).resolve()
    glb_path = Path(args.glb).resolve()
    manifest_path = Path(args.manifest).resolve()
    for path in (blend_path, glb_path, manifest_path):
        path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()

    # The concept family uses tall, lean fashion proportions. Apparent bulk belongs
    # to swappable jackets, cargo trousers, and shoes rather than the shared body.
    neutral = create_human(
        "AvatarBody",
        gender=0.50,
        muscle=0.40,
        weight=0.30,
        proportions=0.62,
        height=0.60,
    )
    male = create_human(
        "AvatarBodyMaleSource",
        gender=0.76,
        muscle=0.46,
        weight=0.31,
        proportions=0.62,
        height=0.60,
    )
    female = create_human(
        "AvatarBodyFemaleSource",
        gender=0.24,
        muscle=0.33,
        weight=0.29,
        proportions=0.62,
        height=0.60,
    )
    eye_centers = {
        "neutral": {
            "l": weighted_group_center(neutral, "joint-l-eye"),
            "r": weighted_group_center(neutral, "joint-r-eye"),
        },
        "male": {
            "l": weighted_group_center(male, "joint-l-eye"),
            "r": weighted_group_center(male, "joint-r-eye"),
        },
        "female": {
            "l": weighted_group_center(female, "joint-l-eye"),
            "r": weighted_group_center(female, "joint-r-eye"),
        },
    }

    # MPFB resolves joint positions from helper groups. Build the rig while
    # those guides still exist, then prune them from every shipping topology.
    armature = HumanService.add_builtin_rig(neutral, "game_engine", import_weights=True)
    if armature is None:
        raise RuntimeError("MPFB game_engine rig could not be created")

    eyebrows_path = mpfb_asset_path("eyebrows/eyebrow004/eyebrow004.mhclo")
    eyelashes_path = mpfb_asset_path("eyelashes/eyelashes02/eyelashes02.mhclo")
    hair_asset_triplets = {
        option_id: load_fitted_asset_triplet(
            mpfb_asset_path(f"hair/{asset_name}/{asset_name}.mhclo"),
            "hair",
            neutral,
            male,
            female,
        )
        for option_id, asset_name in HAIR_MHCLO_OPTIONS.items()
    }
    shoe_asset_triplets = {
        option_id: load_fitted_asset_triplet(
            mpfb_asset_path(f"clothes/{asset_name}/{asset_name}.mhclo"),
            "Clothes",
            neutral,
            male,
            female,
        )
        for option_id, asset_name in SHOES_MHCLO_OPTIONS.items()
    }
    eyebrow_assets = load_fitted_asset_triplet(
        eyebrows_path, "eyebrows", neutral, male, female
    )
    eyelash_assets = load_fitted_asset_triplet(
        eyelashes_path, "eyelashes", neutral, male, female
    )

    for human in (neutral, male, female):
        bake_shape_mix(human)
        keep_body_vertices_only(human)

    neutral.shape_key_add(name="Basis", from_mix=False)
    add_shape_from_object(neutral, male, "male")
    add_shape_from_object(neutral, female, "female")

    cloth_materials = {
        "top": make_material("AvatarTopGraphicTee", (0.055, 0.065, 0.085, 1.0), 0.68),
        "jacket": make_material("AvatarJacketBomber", (0.82, 0.78, 0.66, 1.0), 0.30),
        "bottoms": make_material("AvatarBottomsTechJoggers", (0.035, 0.04, 0.055, 1.0), 0.58),
    }
    top = create_fitted_surface(
        "AvatarTop_graphic-tee",
        neutral,
        male,
        female,
        armature,
        cloth_materials["top"],
        clearance=0.0045,
        face_filter=lambda center: 0.91 <= center.z <= 1.355 and abs(center.x) <= 0.315,
    )
    smooth_open_boundaries(top)
    finish_crew_neck(top)
    ribbed_tank = create_fitted_surface(
        "AvatarTop_ribbed-tank",
        neutral,
        male,
        female,
        armature,
        cloth_materials["top"],
        clearance=0.0055,
        face_filter=lambda center: 0.91 <= center.z <= 1.335 and abs(center.x) <= 0.225,
    )
    smooth_open_boundaries(ribbed_tank)
    finish_crew_neck(ribbed_tank)
    mesh_crop = create_fitted_surface(
        "AvatarTop_mesh-crop",
        neutral,
        male,
        female,
        armature,
        cloth_materials["top"],
        clearance=0.0065,
        face_filter=lambda center: 1.055 <= center.z <= 1.335 and abs(center.x) <= 0.235,
    )
    smooth_open_boundaries(mesh_crop)
    finish_crew_neck(mesh_crop)
    jacket = create_fitted_surface(
        "AvatarJacket_bomber",
        neutral,
        male,
        female,
        armature,
        cloth_materials["jacket"],
        clearance=0.011,
        # Keep the sleeves and back intact while opening the front panels in a
        # shallow V. The shirt therefore remains an independently visible
        # layer instead of being buried under a body-tight closed shell.
        face_filter=lambda center: (
            0.875 <= center.z <= 1.365
            and abs(center.x) <= 0.505
            and not (
                center.y < -0.045
                and abs(center.x)
                < 0.045
                + 0.080 * max(0.0, min(1.0, (center.z - 0.94) / 0.40))
            )
        ),
    )
    smooth_open_boundaries(jacket)
    finish_open_bomber_edges(jacket)
    utility_vest = create_fitted_surface(
        "AvatarJacket_utility-vest",
        neutral,
        male,
        female,
        armature,
        cloth_materials["jacket"],
        clearance=0.0125,
        face_filter=lambda center: (
            0.89 <= center.z <= 1.36
            and abs(center.x) <= 0.255
            and not (
                center.y < -0.045
                and abs(center.x)
                < 0.045 + 0.080 * max(0.0, min(1.0, (center.z - 0.94) / 0.40))
            )
        ),
    )
    smooth_open_boundaries(utility_vest)
    finish_open_bomber_edges(utility_vest)
    cropped_puffer = create_fitted_surface(
        "AvatarJacket_cropped-puffer",
        neutral,
        male,
        female,
        armature,
        cloth_materials["jacket"],
        clearance=0.018,
        face_filter=lambda center: 1.04 <= center.z <= 1.365 and abs(center.x) <= 0.505,
    )
    smooth_open_boundaries(cropped_puffer)
    bottoms = create_fitted_surface(
        "AvatarBottoms_tech-joggers",
        neutral,
        male,
        female,
        armature,
        cloth_materials["bottoms"],
        clearance=0.0065,
        face_filter=lambda center: 0.050 <= center.z <= 0.925 and abs(center.x) <= 0.400,
    )
    smooth_open_boundaries(bottoms)
    cargo_pants = create_fitted_surface(
        "AvatarBottoms_cargo-pants",
        neutral,
        male,
        female,
        armature,
        cloth_materials["bottoms"],
        clearance=0.012,
        face_filter=lambda center: 0.050 <= center.z <= 0.925 and abs(center.x) <= 0.400,
    )
    smooth_open_boundaries(cargo_pants)
    mesh_shorts = create_fitted_surface(
        "AvatarBottoms_mesh-shorts",
        neutral,
        male,
        female,
        armature,
        cloth_materials["bottoms"],
        clearance=0.009,
        face_filter=lambda center: 0.61 <= center.z <= 0.925 and abs(center.x) <= 0.400,
    )
    smooth_open_boundaries(mesh_shorts)
    top_options = {
        "graphic-tee": top,
        "ribbed-tank": ribbed_tank,
        "mesh-crop": mesh_crop,
    }
    jacket_options = {
        "bomber": jacket,
        "utility-vest": utility_vest,
        "cropped-puffer": cropped_puffer,
    }
    bottoms_options = {
        "tech-joggers": bottoms,
        "cargo-pants": cargo_pants,
        "mesh-shorts": mesh_shorts,
    }

    eyebrows, eyebrows_male, eyebrows_female = eyebrow_assets
    eyelashes, eyelashes_male, eyelashes_female = eyelash_assets
    add_asset_fit_morphs(eyebrows, eyebrows_male, eyebrows_female)
    add_asset_fit_morphs(eyelashes, eyelashes_male, eyelashes_female)
    hair_options = {}
    hair_source_assets = []
    for option_id, (hair, hair_male, hair_female) in hair_asset_triplets.items():
        add_asset_fit_morphs(hair, hair_male, hair_female)
        hair.name = f"AvatarHair_{option_id}"
        hair.data.name = f"AvatarHair_{option_id}Mesh"
        hair_options[option_id] = hair
        hair_source_assets.extend((hair_male, hair_female))
    shoe_options = {}
    shoe_source_assets = []
    for option_id, (shoes, shoes_male, shoes_female) in shoe_asset_triplets.items():
        add_asset_fit_morphs(shoes, shoes_male, shoes_female)
        shoes.name = f"AvatarShoes_{option_id}"
        shoes.data.name = f"AvatarShoes_{option_id}Mesh"
        shoe_options[option_id] = shoes
        shoe_source_assets.extend((shoes_male, shoes_female))
    eyebrows.name = "AvatarEyebrows"
    eyebrows.data.name = "AvatarEyebrowsMesh"
    eyebrows["avatarContract"] = CONTRACT_VERSION
    eyebrows["avatarPart"] = "eyebrows"
    eyelashes.name = "AvatarEyelashes"
    eyelashes.data.name = "AvatarEyelashesMesh"
    eyelashes["avatarContract"] = CONTRACT_VERSION
    eyelashes["avatarPart"] = "eyelashes"

    for source_asset in (
        *hair_source_assets,
        *shoe_source_assets,
        eyebrows_male,
        eyebrows_female,
        eyelashes_male,
        eyelashes_female,
    ):
        bpy.data.objects.remove(source_asset, do_unlink=True)
    bpy.data.objects.remove(male, do_unlink=True)
    bpy.data.objects.remove(female, do_unlink=True)

    neutral["avatarAssetKind"] = "body"
    neutral["avatarContract"] = CONTRACT_VERSION
    neutral["avatarBodyMorphs"] = json.dumps(BODY_MORPHS)
    neutral["avatarReferenceHeightMeters"] = round(neutral.dimensions.z, 6)

    skin_texture = mpfb_asset_path(
        "skins/young_caucasian_male/young_lightskinned_male_diffuse.png"
    )
    if not skin_texture.exists():
        raise RuntimeError(
            "The CC0 MakeHuman system assets pack is required; missing " + str(skin_texture)
        )
    skin = make_material("AvatarSkin", (1.0, 1.0, 1.0, 1.0), 0.48, skin_texture)
    neutral.data.materials.clear()
    neutral.data.materials.append(skin)

    armature.name = "AvatarSkeleton"
    armature.data.name = "AvatarSkeletonData"
    armature["avatarContract"] = CONTRACT_VERSION
    armature["avatarSkeletonKind"] = "canonical"

    eye_tail_offset = Vector((0.0, -0.03, 0.0))
    add_deform_bone(armature, "eye_l", eye_centers["neutral"]["l"], eye_centers["neutral"]["l"] + eye_tail_offset, "head")
    add_deform_bone(armature, "eye_r", eye_centers["neutral"]["r"], eye_centers["neutral"]["r"] + eye_tail_offset, "head")
    add_deform_bone(
        armature,
        "jaw",
        Vector((0.0, -0.080, eye_centers["neutral"]["l"].z - 0.030)),
        Vector((0.0, -0.105, eye_centers["neutral"]["l"].z - 0.085)),
        "head",
    )

    materials = {
        "eye_white": make_material("AvatarEyeWhite", (0.80, 0.78, 0.70, 1.0), 0.22),
        "iris": make_material("AvatarIrisHazel", (0.16, 0.075, 0.025, 1.0), 0.30),
        "pupil": make_material("AvatarPupil", (0.004, 0.003, 0.002, 1.0), 0.18),
        "gold": make_material("AvatarAccessoryGold", (0.83, 0.56, 0.13, 1.0), 0.20),
        "hair_bun": make_material("AvatarHairBun", (0.12, 0.105, 0.09, 1.0), 0.48),
    }
    eye_objects = []
    for side in ("l", "r"):
        eye_objects.extend(
            create_eye_set(
                side,
                eye_centers["neutral"][side],
                {name: eye_centers[name][side] for name in BODY_MORPHS},
                armature,
                materials,
            )
        )
    earring_objects = create_earring_set(eye_centers, armature, materials["gold"])
    hair_bun_objects = {
        "space-buns": create_hair_buns(
            "space-buns",
            eye_centers,
            armature,
            materials["hair_bun"],
            paired=True,
        ),
        "man-bun": create_hair_buns(
            "man-bun",
            eye_centers,
            armature,
            materials["hair_bun"],
            paired=False,
        ),
    }

    root = bpy.data.objects.new("AvatarAsset", None)
    bpy.context.scene.collection.objects.link(root)
    root["avatarContract"] = CONTRACT_VERSION
    root["avatarAssetKind"] = "avatar-base"
    root["avatarSlots"] = json.dumps(SLOTS)
    armature.parent = root

    slot_roots = {}
    option_roots = {}
    for slot in SLOTS:
        slot_root = bpy.data.objects.new(f"AvatarSlot_{slot}", None)
        bpy.context.scene.collection.objects.link(slot_root)
        slot_root.parent = root
        slot_root["avatarContract"] = CONTRACT_VERSION
        slot_root["avatarAssetKind"] = "slot"
        slot_root["avatarSlot"] = slot
        slot_roots[slot] = slot_root

        none_root = bpy.data.objects.new(f"AvatarOption_{slot}__none", None)
        bpy.context.scene.collection.objects.link(none_root)
        none_root.parent = slot_root
        none_root["avatarContract"] = CONTRACT_VERSION
        none_root["avatarAssetKind"] = "option"
        none_root["avatarSlot"] = slot
        none_root["avatarOptionId"] = "none"
        option_roots[(slot, "none")] = none_root

        for option_id in AUTHORED_OPTIONS.get(slot, ()):
            option_root = bpy.data.objects.new(
                f"AvatarOption_{slot}__{option_id}", None
            )
            bpy.context.scene.collection.objects.link(option_root)
            option_root.parent = slot_root
            option_root["avatarContract"] = CONTRACT_VERSION
            option_root["avatarAssetKind"] = "option"
            option_root["avatarSlot"] = slot
            option_root["avatarOptionId"] = option_id
            option_roots[(slot, option_id)] = option_root

    surface_options = {
        "top": top_options,
        "jacket": jacket_options,
        "bottoms": bottoms_options,
    }
    for slot, options in surface_options.items():
        for option_id, obj in options.items():
            mark_slot_option(obj, option_roots[(slot, option_id)], slot, option_id)
    for option_id, hair in hair_options.items():
        mark_slot_option(
            hair,
            option_roots[("hair", option_id)],
            "hair",
            option_id,
        )
    for option_id, shoes in shoe_options.items():
        mark_slot_option(
            shoes,
            option_roots[("shoes", option_id)],
            "shoes",
            option_id,
        )
    for option_id, buns in hair_bun_objects.items():
        for bun in buns:
            mark_slot_option(
                bun,
                option_roots[("hair", option_id)],
                "hair",
                option_id,
            )
    for earring in earring_objects:
        mark_slot_option(
            earring,
            option_roots[("accessories", STARTER_OPTIONS["accessories"])],
            "accessories",
            STARTER_OPTIONS["accessories"],
        )

    for image in bpy.data.images:
        if image.source == "FILE" and not image.packed_file:
            image.pack()

    actions = create_starter_actions(armature)

    bpy.context.scene["avatarContract"] = CONTRACT_VERSION
    bpy.context.scene["avatarGenerator"] = "MPFB 2.0.17"
    bpy.context.scene["avatarLicense"] = "CC0 exported character data"

    fitted_meshes = [
        *(obj for options in surface_options.values() for obj in options.values()),
        *hair_options.values(),
        *shoe_options.values(),
        eyebrows,
        eyelashes,
        *(bun for buns in hair_bun_objects.values() for bun in buns),
        *earring_objects,
    ]
    owned_objects = [root, *root.children_recursive]
    assert_clean_transforms(owned_objects)

    # Verification: same topology is guaranteed by shape keys, one armature owns every skinned mesh.
    if tuple(key.name for key in neutral.data.shape_keys.key_blocks) != ("Basis", *BODY_MORPHS):
        raise RuntimeError("Body morph contract was not created exactly")
    if len([obj for obj in bpy.data.objects if obj.type == "ARMATURE"]) != 1:
        raise RuntimeError("Avatar must contain exactly one armature")
    if not all(
        obj.find_armature() == armature
        for obj in [neutral, *eye_objects, *fitted_meshes]
    ):
        raise RuntimeError("A skinned avatar mesh is not bound to the canonical armature")
    for fitted_mesh in fitted_meshes:
        shape_names = tuple(
            key.name for key in fitted_mesh.data.shape_keys.key_blocks
        )
        if shape_names != ("Basis", *BODY_MORPHS):
            raise RuntimeError(
                f"{fitted_mesh.name} does not share the body morph contract: {shape_names}"
            )

    bpy.context.view_layer.objects.active = root
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    export_glb(glb_path, root)

    bounds = {
        "x": [round(min(vertex.co.x for vertex in neutral.data.vertices), 6), round(max(vertex.co.x for vertex in neutral.data.vertices), 6)],
        "y": [round(min(vertex.co.y for vertex in neutral.data.vertices), 6), round(max(vertex.co.y for vertex in neutral.data.vertices), 6)],
        "z": [round(min(vertex.co.z for vertex in neutral.data.vertices), 6), round(max(vertex.co.z for vertex in neutral.data.vertices), 6)],
    }
    manifest = {
        "contract": CONTRACT_VERSION,
        "generator": "MPFB 2.0.17",
        "license": "CC0 exported character data",
        "sourceBlend": str(blend_path),
        "runtimeGlb": str(glb_path),
        "body": {
            "name": neutral.name,
            "vertices": len(neutral.data.vertices),
            "polygons": len(neutral.data.polygons),
            "morphTargets": list(BODY_MORPHS),
            "boundsMeters": bounds,
        },
        "skeleton": {
            "name": armature.name,
            "bones": len(armature.data.bones),
            "requiredAdditions": ["eye_l", "eye_r", "jaw"],
        },
        "slots": list(SLOTS),
        "starterOptions": STARTER_OPTIONS,
        "authoredOptions": {slot: list(options) for slot, options in AUTHORED_OPTIONS.items()},
        "fittedMeshes": [obj.name for obj in fitted_meshes],
        "animations": [action.name for action in actions],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
