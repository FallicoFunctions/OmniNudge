from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V70_PromenadeShadowKeel <-> V70_PromenadePearlRunway overlap: 0.10m on Y across the full promenade length
#   V70_PromenadePearlRunway <-> V70_PromenadeGoldShoulders overlap: 0.42m on Y across the shoulder lanes
#   V70_PromenadePearlRunway <-> V70_PromenadeCyanSpine overlap: 0.40m on Y down the ceremonial centerline
#   each authored runway layer preserves the legacy V5 promenade centerline while widening the visible silhouette

LEGACY_NAMES = [
    "V5_Promenade",
    "V5_PromenadeTrim",
]

REPLACEMENT_NAMES = [
    "V70_PromenadePearlRunway",
    "V70_PromenadeGoldShoulders",
    "V70_PromenadeCyanSpine",
    "V70_PromenadeShadowKeel",
]

PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"
CYAN = "V7_AccentGlow"
SHADOW = "V20_RecessedWarmShadow"


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
    "V5_Promenade": bounds_from_location_dimensions((0.0, 15.0, 0.22), (4.2, 48.0, 0.28)),
    "V5_PromenadeTrim": bounds_from_location_dimensions((0.0, 15.0, 0.42), (1.8, 46.0, 0.10)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V5_Promenade")
    if anchor is None or not anchor.users_collection:
        return bpy.context.scene.collection
    return anchor.users_collection[0]


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
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
        "name": name,
        "x": (obj.location.x - half_x, obj.location.x + half_x),
        "y": (obj.location.y - half_y, obj.location.y + half_y),
        "z": (obj.location.z - half_z, obj.location.z + half_z),
        "center": (obj.location.x, obj.location.y, obj.location.z),
    }


def rounded_loop(center_x, center_z, half_x, half_z, power, segments, z_bias=0.0):
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        cos_angle = math.cos(angle)
        sin_angle = math.sin(angle)
        x = center_x + math.copysign(abs(cos_angle) ** power, cos_angle) * half_x
        z = center_z + math.copysign(abs(sin_angle) ** power, sin_angle) * half_z + sin_angle * z_bias
        points.append((x, z))
    return points


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


def finalize(obj, bevel_width=0.03, bevel_segments=2):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_profile_object(name, material_name, collection, components, bevel_width=0.03, bevel_segments=2):
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


def verify_overlap(name_a, name_b, axis="y", min_overlap=0.01):
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


ensure_object_mode()
collection = resolve_collection()

promenade_bounds = proxy_snapshot("V5_Promenade")
trim_bounds = proxy_snapshot("V5_PromenadeTrim")

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

center_x = promenade_bounds["center"][0]
center_z = promenade_bounds["center"][1]
half_z = (promenade_bounds["y"][1] - promenade_bounds["y"][0]) * 0.5 + 0.9
pearl_half_x = (promenade_bounds["x"][1] - promenade_bounds["x"][0]) * 0.5 + 3.35
shadow_half_x = pearl_half_x - 0.22
cyan_half_x = (trim_bounds["x"][1] - trim_bounds["x"][0]) * 0.5 + 0.42
shoulder_center_offset = pearl_half_x - 1.15
shoulder_half_x = 1.14

pearl_components = [
    {
        "points": rounded_loop(center_x, center_z, pearl_half_x, half_z + 0.55, 3.2, 144, z_bias=0.55),
        "y_min": 0.10,
        "y_max": 0.66,
    }
]
gold_components = [
    {
        "points": rounded_loop(
            center_x - shoulder_center_offset,
            center_z,
            shoulder_half_x,
            half_z - 0.15,
            3.6,
            120,
            z_bias=0.48,
        ),
        "y_min": 0.24,
        "y_max": 0.78,
    },
    {
        "points": rounded_loop(
            center_x + shoulder_center_offset,
            center_z,
            shoulder_half_x,
            half_z - 0.15,
            3.6,
            120,
            z_bias=0.48,
        ),
        "y_min": 0.24,
        "y_max": 0.78,
    },
]
cyan_components = [
    {
        "points": rounded_loop(center_x, center_z, cyan_half_x, half_z - 0.55, 3.0, 96, z_bias=0.32),
        "y_min": 0.20,
        "y_max": 0.60,
    }
]
shadow_components = [
    {
        "points": rounded_loop(center_x, center_z, shadow_half_x, half_z + 0.10, 2.8, 120, z_bias=0.38),
        "y_min": -0.02,
        "y_max": 0.20,
    }
]

build_profile_object(
    "V70_PromenadePearlRunway",
    PEARL,
    collection,
    pearl_components,
    bevel_width=0.04,
    bevel_segments=2,
)
build_profile_object(
    "V70_PromenadeGoldShoulders",
    GOLD,
    collection,
    gold_components,
    bevel_width=0.024,
    bevel_segments=2,
)
build_profile_object(
    "V70_PromenadeCyanSpine",
    CYAN,
    collection,
    cyan_components,
    bevel_width=0.018,
    bevel_segments=2,
)
build_profile_object(
    "V70_PromenadeShadowKeel",
    SHADOW,
    collection,
    shadow_components,
    bevel_width=0.018,
    bevel_segments=2,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V70_PromenadeShadowKeel", "V70_PromenadePearlRunway", axis="y", min_overlap=0.10)
verify_overlap("V70_PromenadePearlRunway", "V70_PromenadeGoldShoulders", axis="y", min_overlap=0.30)
verify_overlap("V70_PromenadePearlRunway", "V70_PromenadeCyanSpine", axis="y", min_overlap=0.28)
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V70_PROMENADE_REPLACEMENT_COMPLETE replacements=4")
