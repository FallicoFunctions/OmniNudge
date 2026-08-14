from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V71_CrownBladePearlSocket_L <-> V71_CrownJewelGoldCradle overlap: 0.55m on Z at the left shoulder tie-in
#   V71_CrownBladePearlSocket_R <-> V71_CrownJewelGoldCradle overlap: 0.55m on Z at the right shoulder tie-in
#   V71_CrownJewelGoldCradle <-> V71_CrownJewelShadowCore overlap: 2.20m on Z through the central jewel bed
#   V71_CrownJewelGoldCradle <-> V71_CrownTopCyanJewel overlap: 0.75m on Z under the apex prism
#   V71_CrownTopCyanJewel <-> V52_CrownApexPedestal overlap: 0.45m on Z so the prism seats into the V52 crown stack

LEGACY_NAMES = [
    "V7_CrownBladeGemBase_L",
    "V7_CrownBladeGemBase_R",
    "V7_CrownTopJewel",
]

REPLACEMENT_NAMES = [
    "V71_CrownBladePearlSocket_L",
    "V71_CrownBladePearlSocket_R",
    "V71_CrownJewelGoldCradle",
    "V71_CrownJewelShadowCore",
    "V71_CrownTopCyanJewel",
]

PEARL = "V16_PearlArchitecturalShell"
GOLD = "V20_ChasedGoldFiligree"
SHADOW = "V20_RecessedWarmShadow"
CYAN = "V20_CelestialCyanGlass"


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
    "V7_CrownBladeGemBase_L": bounds_from_location_dimensions((-3.0, -45.0, 66.6), (1.735058, 0.84, 4.884109)),
    "V7_CrownBladeGemBase_R": bounds_from_location_dimensions((3.0, -45.0, 66.6), (1.735058, 0.84, 4.884109)),
    "V7_CrownTopJewel": bounds_from_location_dimensions((0.0, -45.8, 73.0), (1.645448, 1.873915, 2.8)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in ("V7_CrownTopJewel", "V7_CrownBladeGemBase_L", "V52_CrownApexPedestal"):
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


def verify_overlap(name_a, name_b, axis="z", min_overlap=0.005):
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


def faceted_loop(center_x, center_z, half_x, half_z, segments, pinch=0.22, top_bias=0.35):
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        cos_angle = math.cos(angle)
        sin_angle = math.sin(angle)
        facet = 0.88 + 0.12 * math.cos(angle * 4.0)
        x = center_x + cos_angle * half_x * facet * (1.0 - pinch * abs(sin_angle))
        z = center_z + sin_angle * half_z * facet
        if sin_angle > 0.0:
            z += sin_angle * top_bias
        else:
            z += sin_angle * top_bias * 0.45
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


def finalize(obj, bevel_width=0.08, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, components, bevel_width=0.08, bevel_segments=2):
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


ensure_object_mode()
collection = resolve_collection()

left_base = proxy_snapshot("V7_CrownBladeGemBase_L")
right_base = proxy_snapshot("V7_CrownBladeGemBase_R")
top_jewel = proxy_snapshot("V7_CrownTopJewel")

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

left_center_x = left_base["center"][0]
right_center_x = right_base["center"][0]
socket_center_z = (left_base["z"][0] + left_base["z"][1]) * 0.5 + 0.35
gold_center_z = top_jewel["z"][0] - 0.85
shadow_center_z = gold_center_z + 0.25
cyan_center_z = (top_jewel["z"][0] + top_jewel["z"][1]) * 0.5 + 0.55

left_socket_components = [
    {
        "points": rounded_loop(left_center_x, socket_center_z, 1.02, 2.55, 2.7, 52, z_bias=0.22),
        "y_min": -45.96,
        "y_max": -44.02,
    },
    {
        "points": rounded_loop(left_center_x + 0.18, socket_center_z + 0.92, 0.58, 1.48, 2.4, 44, z_bias=0.18),
        "y_min": -46.05,
        "y_max": -44.08,
    },
]
right_socket_components = [
    {
        "points": rounded_loop(right_center_x, socket_center_z, 1.02, 2.55, 2.7, 52, z_bias=0.22),
        "y_min": -45.96,
        "y_max": -44.02,
    },
    {
        "points": rounded_loop(right_center_x - 0.18, socket_center_z + 0.92, 0.58, 1.48, 2.4, 44, z_bias=0.18),
        "y_min": -46.05,
        "y_max": -44.08,
    },
]
gold_cradle_components = [
    {
        "points": rounded_loop(0.0, gold_center_z, 2.82, 1.72, 3.0, 64, z_bias=0.16),
        "y_min": -46.92,
        "y_max": -44.06,
    },
    {
        "points": rounded_loop(0.0, gold_center_z + 1.04, 1.84, 1.20, 2.4, 52, z_bias=0.14),
        "y_min": -46.72,
        "y_max": -44.24,
    },
]
shadow_core_components = [
    {
        "points": rounded_loop(0.0, shadow_center_z, 1.36, 2.26, 2.2, 48, z_bias=0.08),
        "y_min": -47.36,
        "y_max": -45.48,
    },
    {
        "points": rounded_loop(0.0, shadow_center_z + 1.56, 0.74, 0.96, 2.0, 36, z_bias=0.05),
        "y_min": -47.08,
        "y_max": -45.78,
    },
]
cyan_jewel_components = [
    {
        "points": faceted_loop(0.0, cyan_center_z, 1.52, 2.18, 56, pinch=0.18, top_bias=0.42),
        "y_min": -47.52,
        "y_max": -44.02,
    },
    {
        "points": faceted_loop(0.0, cyan_center_z + 1.68, 1.02, 1.40, 44, pinch=0.12, top_bias=0.36),
        "y_min": -47.12,
        "y_max": -44.28,
    },
]

build_profile_object("V71_CrownBladePearlSocket_L", PEARL, collection, left_socket_components, bevel_width=0.09)
build_profile_object("V71_CrownBladePearlSocket_R", PEARL, collection, right_socket_components, bevel_width=0.09)
build_profile_object("V71_CrownJewelGoldCradle", GOLD, collection, gold_cradle_components, bevel_width=0.08)
build_profile_object("V71_CrownJewelShadowCore", SHADOW, collection, shadow_core_components, bevel_width=0.06)
build_profile_object("V71_CrownTopCyanJewel", CYAN, collection, cyan_jewel_components, bevel_width=0.07)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V71_CrownBladePearlSocket_L", "V71_CrownJewelGoldCradle", axis="z", min_overlap=0.55)
verify_overlap("V71_CrownBladePearlSocket_R", "V71_CrownJewelGoldCradle", axis="z", min_overlap=0.55)
verify_overlap("V71_CrownJewelGoldCradle", "V71_CrownJewelShadowCore", axis="z", min_overlap=2.2)
verify_overlap("V71_CrownJewelGoldCradle", "V71_CrownTopCyanJewel", axis="z", min_overlap=0.75)
verify_overlap("V71_CrownTopCyanJewel", "V52_CrownApexPedestal", axis="z", min_overlap=0.45)
verify_overlap("V71_CrownTopCyanJewel", "V52_CrownApexCrystal", axis="z", min_overlap=0.8)

cyan_bounds = world_bounds("V71_CrownTopCyanJewel")
apex_pedestal_bounds = world_bounds("V52_CrownApexPedestal")
apex_crystal_bounds = world_bounds("V52_CrownApexCrystal")
if cyan_bounds["z"][1] <= apex_pedestal_bounds["z"][1]:
    raise RuntimeError("Crown top cyan jewel must crest above the V52 apex pedestal")
if cyan_bounds["z"][1] >= apex_crystal_bounds["z"][1]:
    raise RuntimeError("Crown top cyan jewel should remain beneath the V52 apex crystal crest")

audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
