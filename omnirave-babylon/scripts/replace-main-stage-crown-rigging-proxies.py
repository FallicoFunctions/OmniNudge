from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V72_CrownRiggingFrontTruss <-> V72_CrownRiggingCenterSpine overlap: 0.10m on Z within each bay
#   V72_CrownRiggingRearTruss <-> V72_CrownRiggingCenterSpine  overlap: 0.10m on Z within each bay
#   V72_CrownRiggingFrontTruss <-> V72_CrownRiggingGoldBosses  overlap: 0.15m on Z at each front node seat
#   V72_CrownRiggingRearTruss <-> V72_CrownRiggingGoldBosses   overlap: 0.15m on Z at each rear node seat
#   V72_CrownRiggingCenterSpine <-> V72_CrownRiggingGoldBosses overlap: 0.35m on Y through each crown bay

LEGACY_NAMES = [
    "V16_CrownRiggingSpan",
    "V16_CrownRiggingFrontChord",
    "V16_CrownRiggingRearChord",
]

REPLACEMENT_NAMES = [
    "V72_CrownRiggingFrontTruss",
    "V72_CrownRiggingRearTruss",
    "V72_CrownRiggingCenterSpine",
    "V72_CrownRiggingGoldBosses",
]

MATTE_BLACK = "V16_MatteBlackStageHardware"
PRODUCTION_GOLD = "V16_BrushedProductionGold"


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
    "V16_CrownRiggingSpan": bounds_from_location_dimensions((0.0, -23.2, 37.0), (43.0, 0.36, 0.36)),
    "V16_CrownRiggingFrontChord": bounds_from_location_dimensions((0.0, -22.25, 36.25), (41.0, 0.18, 0.18)),
    "V16_CrownRiggingRearChord": bounds_from_location_dimensions((0.0, -24.15, 36.25), (41.0, 0.18, 0.18)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*LEGACY_NAMES, "V46_CrownMovingLightHousingCluster", "V47_CrownGoldLatticeBraceA"):
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


def rounded_loop(center_x, center_z, half_x, half_z, segments, power=2.6, z_bias=0.0):
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        cos_angle = math.cos(angle)
        sin_angle = math.sin(angle)
        x = center_x + math.copysign(abs(cos_angle) ** power, cos_angle) * half_x
        z = center_z + math.copysign(abs(sin_angle) ** power, sin_angle) * half_z + sin_angle * z_bias
        points.append((x, z))
    return points


def faceted_loop(center_x, center_z, half_x, half_z, segments, top_bias=0.12):
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        cos_angle = math.cos(angle)
        sin_angle = math.sin(angle)
        facet = 0.90 + 0.10 * math.cos(angle * 4.0)
        x = center_x + cos_angle * half_x * facet
        z = center_z + sin_angle * half_z * facet
        if sin_angle > 0.0:
            z += sin_angle * top_bias
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
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_profile_object(name, material_name, collection, components, bevel_width=0.0, bevel_segments=2):
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


ensure_object_mode()
collection = resolve_collection()

span = proxy_snapshot("V16_CrownRiggingSpan")
front = proxy_snapshot("V16_CrownRiggingFrontChord")
rear = proxy_snapshot("V16_CrownRiggingRearChord")

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

bay_centers = [-18.0, -12.0, -6.0, 0.0, 6.0, 12.0, 18.0]
outer_half_x = max(abs(span["x"][0]), abs(span["x"][1])) / 7.0 + 0.85

front_center_y = (front["y"][0] + front["y"][1]) * 0.5 - 0.24
rear_center_y = (rear["y"][0] + rear["y"][1]) * 0.5 - 0.28
spine_center_y = (front_center_y + rear_center_y) * 0.5
front_center_z = (front["z"][0] + front["z"][1]) * 0.5 + 0.18
rear_center_z = (rear["z"][0] + rear["z"][1]) * 0.5 + 0.18
spine_center_z = span["z"][1] + 0.10
gold_center_z = spine_center_z - 0.10

front_components = []
rear_components = []
spine_components = []
gold_components = []

for center_x in bay_centers:
    front_components.append(
        {
            "points": rounded_loop(center_x, front_center_z, outer_half_x, 0.40, 52, power=2.8, z_bias=0.04),
            "y_min": front_center_y - 0.36,
            "y_max": front_center_y + 0.36,
        }
    )
    rear_components.append(
        {
            "points": rounded_loop(center_x, rear_center_z, outer_half_x, 0.40, 52, power=2.8, z_bias=0.04),
            "y_min": rear_center_y - 0.36,
            "y_max": rear_center_y + 0.36,
        }
    )
    spine_components.append(
        {
            "points": rounded_loop(center_x, spine_center_z, outer_half_x - 0.06, 0.46, 38, power=2.4, z_bias=0.06),
            "y_min": spine_center_y - 0.42,
            "y_max": spine_center_y + 0.42,
        }
    )
    gold_components.append(
        {
            "points": faceted_loop(center_x, gold_center_z, 1.32, 0.62, 20, top_bias=0.08),
            "y_min": spine_center_y - 0.78,
            "y_max": spine_center_y + 0.54,
        }
    )

build_profile_object("V72_CrownRiggingFrontTruss", MATTE_BLACK, collection, front_components)
build_profile_object("V72_CrownRiggingRearTruss", MATTE_BLACK, collection, rear_components)
build_profile_object("V72_CrownRiggingCenterSpine", MATTE_BLACK, collection, spine_components)
build_profile_object("V72_CrownRiggingGoldBosses", PRODUCTION_GOLD, collection, gold_components)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V72_CrownRiggingFrontTruss", "V72_CrownRiggingCenterSpine", axis="z", min_overlap=0.10)
verify_overlap("V72_CrownRiggingRearTruss", "V72_CrownRiggingCenterSpine", axis="z", min_overlap=0.10)
verify_overlap("V72_CrownRiggingFrontTruss", "V72_CrownRiggingGoldBosses", axis="z", min_overlap=0.15)
verify_overlap("V72_CrownRiggingRearTruss", "V72_CrownRiggingGoldBosses", axis="z", min_overlap=0.15)
verify_overlap("V72_CrownRiggingCenterSpine", "V72_CrownRiggingGoldBosses", axis="y", min_overlap=0.35)
audit_transforms(REPLACEMENT_NAMES)
