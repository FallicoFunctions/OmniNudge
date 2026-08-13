from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V69_PlazaPaverPearlBands <-> V69_PlazaPaverGoldFiligree overlap: 0.10m on Y across the shared plaza rows
#   every authored pearl band preserves the legacy V16 paver inlay row centerline while widening the ceremonial read
#   every authored gold filigree band preserves the legacy V16 trim row centerline while thickening the visible silhouette

LEGACY_NAMES = [
    *(f"V16_PlazaPaverInlay_{index}" for index in range(10)),
    *(f"V16_PlazaPaverGoldEdge_{index}" for index in range(10)),
]

REPLACEMENT_NAMES = [
    "V69_PlazaPaverPearlBands",
    "V69_PlazaPaverGoldFiligree",
]

PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"


def bounds_from_location_dimensions(location, dimensions):
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    return {
        "x": (location[0] - half_x, location[0] + half_x),
        "y": (location[1] - half_y, location[1] + half_y),
        "z": (location[2] - half_z, location[2] + half_z),
    }


LEGACY_FALLBACK_BOUNDS = {
    "V16_PlazaPaverInlay_0": bounds_from_location_dimensions((0.0, 0.0, 0.0), (17.6, 0.09, 0.07)),
    "V16_PlazaPaverInlay_1": bounds_from_location_dimensions((0.0, 29.0, 0.38), (20.4, 0.09, 0.07)),
    "V16_PlazaPaverInlay_2": bounds_from_location_dimensions((0.0, 21.0, 0.38), (23.2, 0.09, 0.07)),
    "V16_PlazaPaverInlay_3": bounds_from_location_dimensions((0.0, 13.0, 0.38), (17.6, 0.09, 0.07)),
    "V16_PlazaPaverInlay_4": bounds_from_location_dimensions((0.0, 5.0, 0.38), (20.4, 0.09, 0.07)),
    "V16_PlazaPaverInlay_5": bounds_from_location_dimensions((0.0, -3.0, 0.38), (23.2, 0.09, 0.07)),
    "V16_PlazaPaverInlay_6": bounds_from_location_dimensions((0.0, -11.0, 0.38), (17.6, 0.09, 0.07)),
    "V16_PlazaPaverInlay_7": bounds_from_location_dimensions((0.0, -19.0, 0.38), (20.4, 0.09, 0.07)),
    "V16_PlazaPaverInlay_8": bounds_from_location_dimensions((0.0, -27.0, 0.38), (23.2, 0.09, 0.07)),
    "V16_PlazaPaverInlay_9": bounds_from_location_dimensions((0.0, -35.0, 0.38), (17.6, 0.09, 0.07)),
    "V16_PlazaPaverGoldEdge_0": bounds_from_location_dimensions((0.0, 37.25, 0.43), (17.6, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_1": bounds_from_location_dimensions((0.0, 29.25, 0.43), (20.4, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_2": bounds_from_location_dimensions((0.0, 21.25, 0.43), (23.2, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_3": bounds_from_location_dimensions((0.0, 13.25, 0.43), (17.6, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_4": bounds_from_location_dimensions((0.0, 5.25, 0.43), (20.4, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_5": bounds_from_location_dimensions((0.0, -2.75, 0.43), (23.2, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_6": bounds_from_location_dimensions((0.0, -10.75, 0.43), (17.6, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_7": bounds_from_location_dimensions((0.0, -18.75, 0.43), (20.4, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_8": bounds_from_location_dimensions((0.0, -26.75, 0.43), (23.2, 0.05, 0.05)),
    "V16_PlazaPaverGoldEdge_9": bounds_from_location_dimensions((0.0, -34.75, 0.43), (17.6, 0.05, 0.05)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V16_PlazaPaverInlay_0")
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
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.02, bevel_segments=2):
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


def rounded_loop(center_x, center_z, half_x, half_z, power, segments):
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        cos_angle = math.cos(angle)
        sin_angle = math.sin(angle)
        x = center_x + math.copysign(abs(cos_angle) ** power, cos_angle) * half_x
        z = center_z + math.copysign(abs(sin_angle) ** power, sin_angle) * half_z
        points.append((x, z))
    return points


def add_ring_stack_y(bm, loops):
    rings = []
    for y, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, z in points])

    for near_ring, far_ring in zip(rings, rings[1:]):
        count = len(near_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    near_ring[index],
                    far_ring[index],
                    far_ring[next_index],
                    near_ring[next_index],
                ]
            )

    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))


def build_loft_object_y(name, material_name, collection, components, bevel_width=0.02, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_ring_stack_y(bm, component)

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


def pearl_band_components(proxies):
    components = []
    for proxy in proxies:
        center_x = midpoint(proxy, "x")
        center_y = midpoint(proxy, "y")
        center_z = max(midpoint(proxy, "z"), 0.38) + 0.12
        half_x = (proxy["x"][1] - proxy["x"][0]) * 0.5 + 0.95
        half_z = (proxy["z"][1] - proxy["z"][0]) * 0.5 + 0.16
        components.append(
            [
                (center_y - 0.24, rounded_loop(center_x, center_z - 0.03, half_x * 0.94, half_z * 0.84, 2.8, 40)),
                (center_y - 0.08, rounded_loop(center_x, center_z, half_x, half_z, 3.2, 40)),
                (center_y + 0.08, rounded_loop(center_x, center_z + 0.05, half_x * 1.06, half_z * 1.18, 3.8, 40)),
                (center_y + 0.24, rounded_loop(center_x, center_z + 0.02, half_x * 0.98, half_z * 0.92, 3.0, 40)),
            ]
        )
    return components


def gold_filigree_components(proxies):
    components = []
    for proxy in proxies:
        center_x = midpoint(proxy, "x")
        center_y = midpoint(proxy, "y")
        center_z = midpoint(proxy, "z") + 0.15
        half_x = (proxy["x"][1] - proxy["x"][0]) * 0.5 + 0.55
        half_z = (proxy["z"][1] - proxy["z"][0]) * 0.5 + 0.10
        components.append(
            [
                (center_y - 0.16, rounded_loop(center_x, center_z - 0.02, half_x * 0.96, half_z * 0.82, 2.4, 36)),
                (center_y - 0.04, rounded_loop(center_x, center_z + 0.02, half_x, half_z, 2.8, 36)),
                (center_y + 0.04, rounded_loop(center_x, center_z + 0.06, half_x * 1.04, half_z * 1.24, 3.2, 36)),
                (center_y + 0.16, rounded_loop(center_x, center_z + 0.01, half_x * 0.98, half_z * 0.90, 2.6, 36)),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()

pearl_proxies = [proxy_snapshot(f"V16_PlazaPaverInlay_{index}") for index in range(10)]
gold_proxies = [proxy_snapshot(f"V16_PlazaPaverGoldEdge_{index}") for index in range(10)]

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

build_loft_object_y(
    "V69_PlazaPaverPearlBands",
    PEARL,
    collection,
    pearl_band_components(pearl_proxies),
    bevel_width=0.02,
    bevel_segments=2,
)
build_loft_object_y(
    "V69_PlazaPaverGoldFiligree",
    GOLD,
    collection,
    gold_filigree_components(gold_proxies),
    bevel_width=0.018,
    bevel_segments=2,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V69_PlazaPaverPearlBands", "V69_PlazaPaverGoldFiligree", axis="y", min_overlap=63.0)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V69_PLAZA_PAVER_INLAY_REPLACEMENT_COMPLETE replacements=2")
