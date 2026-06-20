from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V110_WingFacadeInsetGlowArray_L four-bay glow lenses <-> legacy V18_WingFacadeInsetGlow_L_* slab footprints:
#     overlap >= 0.005m on X/Z so each emissive bay keeps the established wing-facade cadence.
#   V110_WingFacadeInsetGlowArray_R four-bay glow lenses <-> legacy V18_WingFacadeInsetGlow_R_* slab footprints:
#     overlap >= 0.005m on X/Z with the mirrored right-side spacing preserved.
#   Each replacement lens projects 0.026m beyond the source depth envelope so the inset reads as a luminous carved pocket instead of a flat card.

LEGACY_NAMES = [
    "V18_WingFacadeInsetGlow_L_0",
    "V18_WingFacadeInsetGlow_L_1",
    "V18_WingFacadeInsetGlow_L_2",
    "V18_WingFacadeInsetGlow_L_3",
    "V18_WingFacadeInsetGlow_R_0",
    "V18_WingFacadeInsetGlow_R_1",
    "V18_WingFacadeInsetGlow_R_2",
    "V18_WingFacadeInsetGlow_R_3",
]
REPLACEMENT_NAMES = [
    "V110_WingFacadeInsetGlowArray_L",
    "V110_WingFacadeInsetGlowArray_R",
]
GLOW = "V18_CyanWaterMistGlow"
STATION_COUNT = 5

FALLBACK_COMPONENTS = [
    {"side": "L", "x": (-32.95, -31.05), "y": (-15.808, -15.752), "z": (4.73, 5.97)},
    {"side": "L", "x": (-28.45, -26.55), "y": (-15.808, -15.752), "z": (4.73, 5.97)},
    {"side": "L", "x": (-23.95, -22.05), "y": (-15.808, -15.752), "z": (4.73, 5.97)},
    {"side": "L", "x": (-19.45, -17.55), "y": (-15.808, -15.752), "z": (4.73, 5.97)},
    {"side": "R", "x": (17.55, 19.45), "y": (-15.448, -15.392), "z": (4.73, 5.97)},
    {"side": "R", "x": (22.05, 23.95), "y": (-15.448, -15.392), "z": (4.73, 5.97)},
    {"side": "R", "x": (26.55, 28.45), "y": (-15.448, -15.392), "z": (4.73, 5.97)},
    {"side": "R", "x": (31.05, 32.95), "y": (-15.448, -15.392), "z": (4.73, 5.97)},
]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*LEGACY_NAMES, *REPLACEMENT_NAMES]:
        obj = bpy.data.objects.get(name)
        if obj is not None and obj.users_collection:
            return obj.users_collection[0]
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


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj):
    triangulate_mesh(obj)
    set_active(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def world_bounds_for_points(points):
    return {
        "x": (min(point.x for point in points), max(point.x for point in points)),
        "y": (min(point.y for point in points), max(point.y for point in points)),
        "z": (min(point.z for point in points), max(point.z for point in points)),
    }


def world_bounds_for_object(obj):
    if obj.type != "MESH" or not obj.data.vertices:
        raise RuntimeError(f"Missing mesh vertices: {obj.name}")
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return world_bounds_for_points(verts)


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def source_component_bounds():
    components = []
    for name in LEGACY_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        bounds = world_bounds_for_object(obj)
        bounds["side"] = "L" if midpoint(bounds, "x") < 0.0 else "R"
        components.append(bounds)
    if components:
        return sorted(components, key=lambda bounds: midpoint(bounds, "x"))
    return [dict(bounds) for bounds in FALLBACK_COMPONENTS]


def grouped_side_bounds(components, side):
    groups = [bounds for bounds in components if bounds["side"] == side]
    if len(groups) != 4:
        raise RuntimeError(f"Expected 4 {side} glow slabs, found {len(groups)}")
    return groups


def glow_polygon(bounds):
    center_x = midpoint(bounds, "x")
    half_width = span(bounds, "x") * 0.5
    z_min, z_max = bounds["z"]
    outer_half = half_width + 0.055
    inner_half = max(half_width - 0.260, half_width * 0.58)
    sill_z = z_min + 0.065
    apex_z = z_max + 0.090
    inner_sill_z = sill_z + 0.160
    inner_apex_z = apex_z - 0.190

    outer = []
    inner = []
    for station_index in range(STATION_COUNT):
        t = station_index / (STATION_COUNT - 1)
        arch = math.sin(t * math.pi)
        shoulder = abs(0.5 - t) * 2.0
        outer_x = center_x - outer_half + outer_half * 2.0 * t
        outer_z = sill_z + (apex_z - sill_z) * (arch ** 0.92) - shoulder * 0.010
        inner_x = center_x - inner_half + inner_half * 2.0 * t
        inner_z = inner_sill_z + (inner_apex_z - inner_sill_z) * (arch ** 0.96) - shoulder * 0.008
        inner_z = min(inner_z, outer_z - 0.120)
        outer.append((outer_x, outer_z))
        inner.append((inner_x, inner_z))

    return outer + list(reversed(inner))


def add_extruded_polygon_y(bm, polygon, y_min, y_max):
    front = [bm.verts.new((x_value, y_min, z_value)) for x_value, z_value in polygon]
    back = [bm.verts.new((x_value, y_max, z_value)) for x_value, z_value in polygon]
    bm.faces.new(list(reversed(front)))
    bm.faces.new(back)
    count = len(polygon)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([front[index], front[next_index], back[next_index], back[index]])


def build_array(name, side, collection, components):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in grouped_side_bounds(components, side):
        y_min = bounds["y"][0] - 0.026
        y_max = bounds["y"][1] + 0.026
        add_extruded_polygon_y(bm, glow_polygon(bounds), y_min, y_max)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, GLOW)
    finalize(obj)
    return obj


def read_connected_component_bounds(obj):
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    adjacency = [set() for _ in obj.data.vertices]
    for polygon in obj.data.polygons:
        indices = polygon.vertices[:]
        for index, start in enumerate(indices):
            end = indices[(index + 1) % len(indices)]
            adjacency[start].add(end)
            adjacency[end].add(start)

    seen = set()
    components = []
    for start_index in range(len(obj.data.vertices)):
        if start_index in seen:
            continue
        stack = [start_index]
        seen.add(start_index)
        points = []
        while stack:
            vertex_index = stack.pop()
            points.append(verts[vertex_index])
            for neighbour in adjacency[vertex_index]:
                if neighbour not in seen:
                    seen.add(neighbour)
                    stack.append(neighbour)
        components.append(world_bounds_for_points(points))
    return sorted(components, key=lambda bounds: midpoint(bounds, "x"))


def log_bounds(name):
    bounds = world_bounds_for_object(bpy.data.objects[name])
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.4f},{bounds['x'][1]:.4f}] "
        f"Y[{bounds['y'][0]:.4f},{bounds['y'][1]:.4f}] "
        f"Z[{bounds['z'][0]:.4f},{bounds['z'][1]:.4f}]"
    )


def verify_group_coverage(name, source_groups, min_overlap=0.005):
    components = read_connected_component_bounds(bpy.data.objects[name])
    if len(components) != len(source_groups):
        raise RuntimeError(f"{name} expected {len(source_groups)} components, found {len(components)}")
    for index, (component, source) in enumerate(zip(components, source_groups)):
        x_overlap = min(component["x"][1], source["x"][1]) - max(component["x"][0], source["x"][0])
        z_overlap = min(component["z"][1], source["z"][1]) - max(component["z"][0], source["z"][0])
        print(f"{name} component {index}: X overlap={x_overlap:.4f} Z overlap={z_overlap:.4f}")
        if x_overlap < span(source, "x") - min_overlap:
            raise RuntimeError(f"{name} component {index} lost X coverage: {x_overlap:.4f}")
        if z_overlap < span(source, "z") - 0.200:
            raise RuntimeError(f"{name} component {index} lost Z coverage: {z_overlap:.4f}")


def verify_proud_depth(name, source_groups, min_proud=0.025):
    components = read_connected_component_bounds(bpy.data.objects[name])
    for index, (component, source) in enumerate(zip(components, source_groups)):
        proud = component["y"][1] - source["y"][1]
        print(f"{name} component {index}: glow proud={proud:.4f}")
        if proud < min_proud:
            raise RuntimeError(f"{name} component {index} is too flush with the facade: {proud:.4f}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")


ensure_object_mode()
collection = resolve_collection()
source_groups = source_component_bounds()
delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

left = build_array("V110_WingFacadeInsetGlowArray_L", "L", collection, source_groups)
right = build_array("V110_WingFacadeInsetGlowArray_R", "R", collection, source_groups)

log_bounds(left.name)
log_bounds(right.name)
verify_group_coverage(left.name, [bounds for bounds in source_groups if bounds["side"] == "L"])
verify_group_coverage(right.name, [bounds for bounds in source_groups if bounds["side"] == "R"])
verify_proud_depth(left.name, [bounds for bounds in source_groups if bounds["side"] == "L"])
verify_proud_depth(right.name, [bounds for bounds in source_groups if bounds["side"] == "R"])
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
