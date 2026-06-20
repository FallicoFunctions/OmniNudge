from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V76_SideScreenAnchorGoldSpine_L <-> V76_SideScreenAnchorShadowBrace_L overlap: 0.10m on Y through the left side-screen anchor stack
#   V76_SideScreenAnchorGoldSpine_R <-> V76_SideScreenAnchorShadowBrace_R overlap: 0.10m on Y through the right side-screen anchor stack
#   Each side anchor stack is one continuous visible assembly spanning the retired lower and upper V14 anchor cubes.

LEGACY_NAMES = [
    "V14_ScreenFrameAnchor_L",
    "V14_ScreenUpperAnchor_L",
    "V14_ScreenFrameAnchor_R",
    "V14_ScreenUpperAnchor_R",
]

REPLACEMENT_NAMES = [
    "V76_SideScreenAnchorGoldSpine_L",
    "V76_SideScreenAnchorGoldSpine_R",
    "V76_SideScreenAnchorShadowBrace_L",
    "V76_SideScreenAnchorShadowBrace_R",
]

GOLD = "V14_BurnishedCelestialGold"
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
    "V14_ScreenFrameAnchor_L": bounds_from_location_dimensions((-14.9, -22.72, 14.15), (1.5, 0.32, 1.5)),
    "V14_ScreenUpperAnchor_L": bounds_from_location_dimensions((-14.9, -22.72, 27.0), (1.3, 0.32, 1.3)),
    "V14_ScreenFrameAnchor_R": bounds_from_location_dimensions((14.9, -22.72, 14.15), (1.5, 0.32, 1.5)),
    "V14_ScreenUpperAnchor_R": bounds_from_location_dimensions((14.9, -22.72, 27.0), (1.3, 0.32, 1.3)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*LEGACY_NAMES, "V68_HeroPortalShadowDais", "V75_ArcAnchorGoldCluster_L"):
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
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
        "center": (
            sum(vertex.x for vertex in verts) / len(verts),
            sum(vertex.y for vertex in verts) / len(verts),
            sum(vertex.z for vertex in verts) / len(verts),
        ),
    }


def add_prism_component(bm, points, y_min, y_max):
    base = [bm.verts.new((x, y_min, z)) for x, z in points]
    top = [bm.verts.new((x, y_max, z)) for x, z in points]
    bm.faces.new(base)
    bm.faces.new(list(reversed(top)))
    count = len(points)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([base[index], base[next_index], top[next_index], top[index]])


def pointed_spine_profile(center_x, lower_z, upper_z, half_width):
    height = upper_z - lower_z
    lower_shoulder = lower_z + height * 0.18
    mid_shoulder = lower_z + height * 0.52
    upper_shoulder = lower_z + height * 0.72
    return [
        (center_x - half_width * 0.88, lower_z),
        (center_x - half_width, lower_shoulder),
        (center_x - half_width * 0.38, lower_z + height * 0.36),
        (center_x - half_width * 0.54, mid_shoulder),
        (center_x - half_width * 0.66, upper_shoulder),
        (center_x, upper_z),
        (center_x + half_width * 0.66, upper_shoulder),
        (center_x + half_width * 0.54, mid_shoulder),
        (center_x + half_width * 0.38, lower_z + height * 0.36),
        (center_x + half_width, lower_shoulder),
        (center_x + half_width * 0.88, lower_z),
        (center_x + half_width * 0.24, lower_z - height * 0.08),
        (center_x - half_width * 0.24, lower_z - height * 0.08),
    ]


def brace_profile(center_x, lower_z, upper_z, half_width):
    height = upper_z - lower_z
    return [
        (center_x - half_width, lower_z),
        (center_x - half_width * 0.54, lower_z + height * 0.26),
        (center_x - half_width * 0.34, lower_z + height * 0.54),
        (center_x - half_width * 0.22, upper_z - height * 0.08),
        (center_x, upper_z),
        (center_x + half_width * 0.22, upper_z - height * 0.08),
        (center_x + half_width * 0.34, lower_z + height * 0.54),
        (center_x + half_width * 0.54, lower_z + height * 0.26),
        (center_x + half_width, lower_z),
        (center_x + half_width * 0.22, lower_z - height * 0.05),
        (center_x - half_width * 0.22, lower_z - height * 0.05),
    ]


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


def finalize(obj, bevel_width=0.022, bevel_segments=1):
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


def build_profile_object(name, material_name, collection, components, bevel_width, bevel_segments=1):
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


def gold_component(lower, upper):
    center_x = (lower["center"][0] + upper["center"][0]) * 0.5
    center_y = (lower["center"][1] + upper["center"][1]) * 0.5
    lower_z = lower["z"][0] - 0.12
    upper_z = upper["z"][1] + 0.28
    half_width = max(upper["x"][1] - upper["x"][0], lower["x"][1] - lower["x"][0]) * 0.84
    return [
        {
            "points": pointed_spine_profile(center_x, lower_z, upper_z, half_width),
            "y_min": center_y - 0.28,
            "y_max": center_y + 0.22,
        }
    ]


def shadow_component(lower, upper):
    center_x = (lower["center"][0] + upper["center"][0]) * 0.5
    center_y = (lower["center"][1] + upper["center"][1]) * 0.5
    lower_z = lower["z"][0] - 0.04
    upper_z = upper["z"][1] + 0.14
    half_width = max(upper["x"][1] - upper["x"][0], lower["x"][1] - lower["x"][0]) * 0.56
    return [
        {
            "points": brace_profile(center_x, lower_z, upper_z, half_width),
            "y_min": center_y - 0.18,
            "y_max": center_y + 0.12,
        }
    ]


ensure_object_mode()
collection = resolve_collection()

frame_left = proxy_snapshot("V14_ScreenFrameAnchor_L")
upper_left = proxy_snapshot("V14_ScreenUpperAnchor_L")
frame_right = proxy_snapshot("V14_ScreenFrameAnchor_R")
upper_right = proxy_snapshot("V14_ScreenUpperAnchor_R")

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

build_profile_object(
    "V76_SideScreenAnchorGoldSpine_L",
    GOLD,
    collection,
    gold_component(frame_left, upper_left),
    bevel_width=0.024,
    bevel_segments=2,
)
build_profile_object(
    "V76_SideScreenAnchorGoldSpine_R",
    GOLD,
    collection,
    gold_component(frame_right, upper_right),
    bevel_width=0.024,
    bevel_segments=2,
)
build_profile_object(
    "V76_SideScreenAnchorShadowBrace_L",
    SHADOW,
    collection,
    shadow_component(frame_left, upper_left),
    bevel_width=0.016,
    bevel_segments=2,
)
build_profile_object(
    "V76_SideScreenAnchorShadowBrace_R",
    SHADOW,
    collection,
    shadow_component(frame_right, upper_right),
    bevel_width=0.016,
    bevel_segments=2,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V76_SideScreenAnchorGoldSpine_L", "V76_SideScreenAnchorShadowBrace_L", axis="y", min_overlap=0.10)
verify_overlap("V76_SideScreenAnchorGoldSpine_R", "V76_SideScreenAnchorShadowBrace_R", axis="y", min_overlap=0.10)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
