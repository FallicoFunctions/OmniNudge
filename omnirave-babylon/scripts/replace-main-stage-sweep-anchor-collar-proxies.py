from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V74_SweepOuterAnchorGoldCrown_L <-> V74_SweepOuterAnchorShadowCore_L overlap: 0.40m on Y within the left outer sweep bay
#   V74_SweepOuterAnchorGoldCrown_R <-> V74_SweepOuterAnchorShadowCore_R overlap: 0.40m on Y within the right outer sweep bay
#   V74_SweepInnerAnchorGoldCrown_L <-> V74_SweepInnerAnchorShadowCore_L overlap: 0.40m on Y within the left inner sweep bay
#   V74_SweepInnerAnchorGoldCrown_R <-> V74_SweepInnerAnchorShadowCore_R overlap: 0.40m on Y within the right inner sweep bay
#   Each gold crown cluster contains three disconnected ceremonial bands around the retired proxy footprint.

LEGACY_NAMES = [
    "V7_SweepOuterAnchorCollar_L",
    "V7_SweepOuterAnchorCollar_R",
    "V7_SweepInnerAnchorCollar_L",
    "V7_SweepInnerAnchorCollar_R",
]

REPLACEMENT_NAMES = [
    "V74_SweepOuterAnchorGoldCrown_L",
    "V74_SweepOuterAnchorGoldCrown_R",
    "V74_SweepOuterAnchorShadowCore_L",
    "V74_SweepOuterAnchorShadowCore_R",
    "V74_SweepInnerAnchorGoldCrown_L",
    "V74_SweepInnerAnchorGoldCrown_R",
    "V74_SweepInnerAnchorShadowCore_L",
    "V74_SweepInnerAnchorShadowCore_R",
]

GOLD = "V20_ChasedGoldFiligree"
SHADOW = "V14_MatteBlackProductionRig"


def bounds_from_location_dimensions(location, dimensions):
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    return {
        "x": (location[0] - half_x, location[0] + half_x),
        "y": (location[1] - half_y, location[1] + half_y),
        "z": (location[2] - half_z, location[2] + half_z),
        "center": location,
    }


LEGACY_FALLBACK_BOUNDS = {
    "V7_SweepOuterAnchorCollar_L": bounds_from_location_dimensions((-58.5, -19.0, 22.0), (3.6, 4.0, 4.4)),
    "V7_SweepOuterAnchorCollar_R": bounds_from_location_dimensions((58.5, -19.0, 22.0), (3.6, 4.0, 4.4)),
    "V7_SweepInnerAnchorCollar_L": bounds_from_location_dimensions((-31.2, -27.5, 28.7), (2.9, 3.3, 3.5)),
    "V7_SweepInnerAnchorCollar_R": bounds_from_location_dimensions((31.2, -27.5, 28.7), (2.9, 3.3, 3.5)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (
        *LEGACY_NAMES,
        "V50_OuterSweepSpire_L",
        "V50_OuterSweepSpire_R",
        "V51_ShoulderCrownMass_L",
        "V51_ShoulderCrownMass_R",
    ):
        anchor = bpy.data.objects.get(anchor_name)
        if anchor is not None and anchor.users_collection:
            return anchor.users_collection[0]
    return bpy.context.scene.collection


def delete_existing(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)


def proxy_snapshot(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        fallback = LEGACY_FALLBACK_BOUNDS.get(name)
        if fallback is None:
            raise RuntimeError(f"Missing proxy object: {name}")
        return fallback

    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    x_min = min(vertex.x for vertex in verts)
    x_max = max(vertex.x for vertex in verts)
    y_min = min(vertex.y for vertex in verts)
    y_max = max(vertex.y for vertex in verts)
    z_min = min(vertex.z for vertex in verts)
    z_max = max(vertex.z for vertex in verts)
    return {
        "x": (x_min, x_max),
        "y": (y_min, y_max),
        "z": (z_min, z_max),
        "center": ((x_min + x_max) * 0.5, (y_min + y_max) * 0.5, (z_min + z_max) * 0.5),
    }


def faceted_profile(center_x, center_z, half_width, half_height):
    return [
        (center_x - half_width, center_z),
        (center_x, center_z - half_height),
        (center_x + half_width, center_z),
        (center_x, center_z + half_height),
    ]


def crown_profile(center_x, lower_z, upper_z, half_width, shoulder_ratio=0.42, inset_ratio=0.52):
    height = upper_z - lower_z
    shoulder_z = lower_z + height * shoulder_ratio
    inset_width = half_width * inset_ratio
    return [
        (center_x - half_width, lower_z),
        (center_x - half_width * 0.76, shoulder_z),
        (center_x - inset_width, upper_z - height * 0.09),
        (center_x, upper_z),
        (center_x + inset_width, upper_z - height * 0.09),
        (center_x + half_width * 0.76, shoulder_z),
        (center_x + half_width, lower_z),
    ]


def spire_profile(center_x, lower_z, upper_z, half_width, shoulder_ratio=0.46):
    height = upper_z - lower_z
    shoulder_z = lower_z + height * shoulder_ratio
    return [
        (center_x - half_width, lower_z),
        (center_x - half_width * 0.56, shoulder_z),
        (center_x, upper_z),
        (center_x + half_width * 0.56, shoulder_z),
        (center_x + half_width, lower_z),
    ]


def pinnacle_profile(center_x, lower_z, upper_z, half_width):
    return [
        (center_x - half_width, lower_z),
        (center_x, upper_z),
        (center_x + half_width, lower_z),
    ]


def shadow_profile(center_x, lower_z, upper_z, half_width):
    height = upper_z - lower_z
    shoulder_z = lower_z + height * 0.44
    inset_width = half_width * 0.42
    return [
        (center_x - half_width, lower_z),
        (center_x - half_width * 0.78, shoulder_z),
        (center_x - inset_width, upper_z - height * 0.14),
        (center_x - half_width * 0.28, upper_z - height * 0.07),
        (center_x - half_width * 0.18, upper_z - height * 0.03),
        (center_x, upper_z),
        (center_x + half_width * 0.18, upper_z - height * 0.03),
        (center_x + half_width * 0.28, upper_z - height * 0.07),
        (center_x + inset_width, upper_z - height * 0.14),
        (center_x + half_width * 0.78, shoulder_z),
        (center_x + half_width, lower_z),
        (center_x + half_width * 0.26, lower_z - height * 0.08),
        (center_x - half_width * 0.26, lower_z - height * 0.08),
    ]


def add_prism_component(bm, points, y_min, y_max):
    base = [bm.verts.new((x, y_min, z)) for x, z in points]
    top = [bm.verts.new((x, y_max, z)) for x, z in points]
    bm.faces.new(base)
    bm.faces.new(list(reversed(top)))
    count = len(points)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([base[index], base[next_index], top[next_index], top[index]])


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def auto_uv_project(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, bevel_width=0.03, bevel_segments=2):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.7
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_profile_object(name, material_name, collection, components, bevel_width, bevel_segments):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_prism_component(bm, component["points"], component["y_min"], component["y_max"])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_overlap(name_a, name_b, axis="y", min_overlap=0.005):
    bounds_a = world_bounds(name_a)
    bounds_b = world_bounds(name_b)
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{name_a} <-> {name_b} [{axis.upper()}] overlap={overlap:.3f}")
    if overlap < min_overlap:
        raise RuntimeError(f"Gap between {name_a} and {name_b} on axis {axis}: {overlap:.3f}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def gold_components(snapshot, variant):
    center_x, center_y, center_z = snapshot["center"]
    half_x = (snapshot["x"][1] - snapshot["x"][0]) * 0.5
    half_y = (snapshot["y"][1] - snapshot["y"][0]) * 0.5
    z_min, z_max = snapshot["z"]
    height = z_max - z_min

    depth_push = 0.28 if variant == "outer" else 0.22
    width_scale = 1.34 if variant == "outer" else 1.28
    height_scale = 1.24 if variant == "outer" else 1.18

    base_half_width = half_x * width_scale
    mid_half_width = half_x * (width_scale + 0.08)
    top_half_width = half_x * (width_scale - 0.10)
    depth_half = half_y + depth_push

    return [
        {
            "points": faceted_profile(center_x, z_min + height * 0.22, base_half_width, height * 0.26),
            "y_min": center_y - depth_half - 0.06,
            "y_max": center_y + depth_half - 0.02,
        },
        {
            "points": spire_profile(
                center_x,
                z_min + height * 0.42,
                z_min + height * 0.86,
                mid_half_width,
                shoulder_ratio=0.38,
            ),
            "y_min": center_y - depth_half + 0.10,
            "y_max": center_y + depth_half + 0.12,
        },
        {
            "points": pinnacle_profile(
                center_x,
                z_min + height * 0.94,
                z_min + height * height_scale,
                top_half_width,
            ),
            "y_min": center_y - depth_half + 0.02,
            "y_max": center_y + depth_half + 0.20,
        },
    ]


def shadow_components(snapshot, variant):
    center_x, center_y, center_z = snapshot["center"]
    half_x = (snapshot["x"][1] - snapshot["x"][0]) * 0.5
    half_y = (snapshot["y"][1] - snapshot["y"][0]) * 0.5
    z_min, z_max = snapshot["z"]
    height = z_max - z_min

    depth_push = 0.14 if variant == "outer" else 0.12
    width_scale = 0.78 if variant == "outer" else 0.76

    return [
        {
            "points": shadow_profile(
                center_x,
                z_min + height * 0.12,
                z_max + height * 0.14,
                half_x * width_scale,
            ),
            "y_min": center_y - half_y - depth_push,
            "y_max": center_y + half_y + depth_push,
        }
    ]


ensure_object_mode()
collection = resolve_collection()

snapshots = {
    "outer_left": proxy_snapshot("V7_SweepOuterAnchorCollar_L"),
    "outer_right": proxy_snapshot("V7_SweepOuterAnchorCollar_R"),
    "inner_left": proxy_snapshot("V7_SweepInnerAnchorCollar_L"),
    "inner_right": proxy_snapshot("V7_SweepInnerAnchorCollar_R"),
}

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

build_profile_object(
    "V74_SweepOuterAnchorGoldCrown_L",
    GOLD,
    collection,
    gold_components(snapshots["outer_left"], "outer"),
    bevel_width=0.05,
    bevel_segments=1,
)
build_profile_object(
    "V74_SweepOuterAnchorGoldCrown_R",
    GOLD,
    collection,
    gold_components(snapshots["outer_right"], "outer"),
    bevel_width=0.05,
    bevel_segments=1,
)
build_profile_object(
    "V74_SweepOuterAnchorShadowCore_L",
    SHADOW,
    collection,
    shadow_components(snapshots["outer_left"], "outer"),
    bevel_width=0.035,
    bevel_segments=1,
)
build_profile_object(
    "V74_SweepOuterAnchorShadowCore_R",
    SHADOW,
    collection,
    shadow_components(snapshots["outer_right"], "outer"),
    bevel_width=0.035,
    bevel_segments=1,
)
build_profile_object(
    "V74_SweepInnerAnchorGoldCrown_L",
    GOLD,
    collection,
    gold_components(snapshots["inner_left"], "inner"),
    bevel_width=0.045,
    bevel_segments=1,
)
build_profile_object(
    "V74_SweepInnerAnchorGoldCrown_R",
    GOLD,
    collection,
    gold_components(snapshots["inner_right"], "inner"),
    bevel_width=0.045,
    bevel_segments=1,
)
build_profile_object(
    "V74_SweepInnerAnchorShadowCore_L",
    SHADOW,
    collection,
    shadow_components(snapshots["inner_left"], "inner"),
    bevel_width=0.03,
    bevel_segments=1,
)
build_profile_object(
    "V74_SweepInnerAnchorShadowCore_R",
    SHADOW,
    collection,
    shadow_components(snapshots["inner_right"], "inner"),
    bevel_width=0.03,
    bevel_segments=1,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

for gold_name, shadow_name in [
    ("V74_SweepOuterAnchorGoldCrown_L", "V74_SweepOuterAnchorShadowCore_L"),
    ("V74_SweepOuterAnchorGoldCrown_R", "V74_SweepOuterAnchorShadowCore_R"),
    ("V74_SweepInnerAnchorGoldCrown_L", "V74_SweepInnerAnchorShadowCore_L"),
    ("V74_SweepInnerAnchorGoldCrown_R", "V74_SweepInnerAnchorShadowCore_R"),
]:
    verify_overlap(gold_name, shadow_name, axis="y", min_overlap=0.40)

audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
