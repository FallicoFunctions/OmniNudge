from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V85_WetPaverStoneBands <-> ground plane overlap: 0.01m on Z so the stepped slabs sit cleanly into the plaza
#   V85_WetPaverStoneBands <-> V85_WetPaverGoldSeamBands overlap: 4.80m on Y across each shared spawn-lane band
#   every V85 stone band preserves the legacy V13 wet-paver centerline while thickening the audience-facing silhouette
#   every V85 gold seam stays centered inside its matching stone band while lifting above the wet stone crown

LEGACY_NAMES = [
    *(f"V13_WetPaverPanel_{index}" for index in range(5)),
    *(f"V13_WetPaverGoldSeam_{index}" for index in range(5)),
]

REPLACEMENT_NAMES = [
    "V85_WetPaverStoneBands",
    "V85_WetPaverGoldSeamBands",
]

STONE = "V13_WetPlazaStone"
GOLD = "V14_BurnishedCelestialGold"


def bounds_from_location_dimensions(location, dimensions):
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    return {
        "x": (location[0] - half_x, location[0] + half_x),
        "y": (location[1] - half_y, location[1] + half_y),
        "z": (location[2] - half_z, location[2] + half_z),
    }


FALLBACK_BOUNDS = {
    "V13_WetPaverPanel_0": bounds_from_location_dimensions((0.0, -62.0, 0.08), (24.0, 6.4, 0.04)),
    "V13_WetPaverPanel_1": bounds_from_location_dimensions((0.0, -53.0, 0.08), (24.0, 6.4, 0.04)),
    "V13_WetPaverPanel_2": bounds_from_location_dimensions((0.0, -44.0, 0.08), (24.0, 6.4, 0.04)),
    "V13_WetPaverPanel_3": bounds_from_location_dimensions((0.0, -35.0, 0.08), (24.0, 6.4, 0.04)),
    "V13_WetPaverPanel_4": bounds_from_location_dimensions((0.0, -26.0, 0.08), (24.0, 6.4, 0.04)),
    "V13_WetPaverGoldSeam_0": bounds_from_location_dimensions((0.0, -62.0, 0.10), (23.6, 0.07, 0.02)),
    "V13_WetPaverGoldSeam_1": bounds_from_location_dimensions((0.0, -53.0, 0.10), (23.6, 0.07, 0.02)),
    "V13_WetPaverGoldSeam_2": bounds_from_location_dimensions((0.0, -44.0, 0.10), (23.6, 0.07, 0.02)),
    "V13_WetPaverGoldSeam_3": bounds_from_location_dimensions((0.0, -35.0, 0.10), (23.6, 0.07, 0.02)),
    "V13_WetPaverGoldSeam_4": bounds_from_location_dimensions((0.0, -26.0, 0.10), (23.6, 0.07, 0.02)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V13_WetPaverPanel_0")
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


def existing_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        fallback = FALLBACK_BOUNDS.get(name)
        if fallback is None:
            raise RuntimeError(f"Missing object or fallback bounds for {name}")
        return fallback

    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def rounded_rect_points(center_x, center_y, half_x, half_y, radius, segments):
    radius = min(radius, half_x - 0.01, half_y - 0.01)
    corners = [
        (center_x + half_x - radius, center_y + half_y - radius, 0.0, math.pi * 0.5),
        (center_x - half_x + radius, center_y + half_y - radius, math.pi * 0.5, math.pi),
        (center_x - half_x + radius, center_y - half_y + radius, math.pi, math.pi * 1.5),
        (center_x + half_x - radius, center_y - half_y + radius, math.pi * 1.5, math.pi * 2.0),
    ]
    points = []
    for corner_x, corner_y, start_angle, end_angle in corners:
        for step in range(segments):
            angle = start_angle + (end_angle - start_angle) * (step / segments)
            points.append((corner_x + math.cos(angle) * radius, corner_y + math.sin(angle) * radius))
    return points


def add_ring_stack_z(bm, loops):
    rings = []
    for z, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, y in points])

    for lower_ring, upper_ring in zip(rings, rings[1:]):
        count = len(lower_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    lower_ring[index],
                    lower_ring[next_index],
                    upper_ring[next_index],
                    upper_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


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


def finalize(obj, bevel_width=0.018, bevel_segments=2):
    set_active(obj)
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


def build_loft_object_z(name, material_name, collection, components, bevel_width=0.018, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_ring_stack_z(bm, component)

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


def stone_band_components(proxies):
    components = []
    for proxy in proxies:
        center_x = midpoint(proxy, "x")
        center_y = midpoint(proxy, "y")
        half_x = (proxy["x"][1] - proxy["x"][0]) * 0.5 + 0.55
        half_y = (proxy["y"][1] - proxy["y"][0]) * 0.5 + 0.30

        components.append(
            [
                (-0.01, rounded_rect_points(center_x, center_y, half_x, half_y, 0.90, 6)),
                (0.05, rounded_rect_points(center_x, center_y, half_x + 0.12, half_y + 0.08, 0.98, 6)),
                (0.12, rounded_rect_points(center_x, center_y, half_x - 0.08, half_y - 0.16, 0.82, 6)),
                (0.24, rounded_rect_points(center_x, center_y, half_x - 0.52, half_y - 0.46, 0.62, 6)),
                (0.46, rounded_rect_points(center_x, center_y, half_x - 1.18, half_y - 1.12, 0.32, 6)),
            ]
        )
    return components


def gold_seam_components(proxies):
    components = []
    for proxy in proxies:
        center_x = midpoint(proxy, "x")
        center_y = midpoint(proxy, "y")
        half_x = (proxy["x"][1] - proxy["x"][0]) * 0.5 + 0.40
        half_y = 0.39

        components.append(
            [
                (0.18, rounded_rect_points(center_x, center_y, half_x, half_y, 0.20, 4)),
                (0.26, rounded_rect_points(center_x, center_y, half_x + 0.08, half_y + 0.05, 0.22, 4)),
                (0.36, rounded_rect_points(center_x, center_y, half_x - 0.16, half_y + 0.02, 0.14, 4)),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()

stone_proxies = [existing_bounds(f"V13_WetPaverPanel_{index}") for index in range(5)]
gold_proxies = [existing_bounds(f"V13_WetPaverGoldSeam_{index}") for index in range(5)]

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

stone_components = stone_band_components(stone_proxies)
gold_components = gold_seam_components(gold_proxies)

build_loft_object_z("V85_WetPaverStoneBands", STONE, collection, stone_components, bevel_width=0.020, bevel_segments=1)
build_loft_object_z("V85_WetPaverGoldSeamBands", GOLD, collection, gold_components, bevel_width=0.010, bevel_segments=1)

log_bounds("V85_WetPaverStoneBands")
log_bounds("V85_WetPaverGoldSeamBands")
verify_overlap("V85_WetPaverStoneBands", "V85_WetPaverGoldSeamBands", axis="y", min_overlap=4.8)
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
