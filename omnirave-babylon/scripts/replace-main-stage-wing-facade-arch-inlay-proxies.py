from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V109_WingFacadeArchInlayArray_L component spans <-> legacy V21_Merged_V18_WingFacadeArchInlay left bays:
#     overlap >= 0.005m on X/Z so each authored arch band fully replaces the merged proxy footprint.
#   V109_WingFacadeArchInlayArray_R component spans <-> legacy V21_Merged_V18_WingFacadeArchInlay right bays:
#     overlap >= 0.005m on X/Z with the original four-bay cadence preserved across the opposite wing.
#   Each authored band sits 0.010m proud of the facade depth envelope on Y so the inlay reads as a deliberate relief instead of a flush decal.

LEGACY_NAME = "V21_Merged_V18_WingFacadeArchInlay"
REPLACEMENT_NAMES = [
    "V109_WingFacadeArchInlayArray_L",
    "V109_WingFacadeArchInlayArray_R",
]
GOLD = "V18_BrushedGoldTrim"
STATION_COUNT = 5
GROUP_GAP = 1.0

FALLBACK_GROUPS = [
    {"side": "L", "x": (-33.3819, -30.6181), "y": (-15.8120, -15.7480), "z": (6.1470, 8.4309)},
    {"side": "L", "x": (-28.8819, -26.1181), "y": (-15.8120, -15.7480), "z": (6.1470, 8.4309)},
    {"side": "L", "x": (-24.3819, -21.6181), "y": (-15.8120, -15.7480), "z": (6.1470, 8.4309)},
    {"side": "L", "x": (-19.8819, -17.1181), "y": (-15.8120, -15.7480), "z": (6.1470, 8.4309)},
    {"side": "R", "x": (17.1181, 19.8819), "y": (-15.4520, -15.3880), "z": (6.1470, 8.4309)},
    {"side": "R", "x": (21.6181, 24.3819), "y": (-15.4520, -15.3880), "z": (6.1470, 8.4309)},
    {"side": "R", "x": (26.1181, 28.8819), "y": (-15.4520, -15.3880), "z": (6.1470, 8.4309)},
    {"side": "R", "x": (30.6181, 33.3819), "y": (-15.4520, -15.3880), "z": (6.1470, 8.4309)},
]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [LEGACY_NAME, *REPLACEMENT_NAMES]:
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


def auto_uv_project(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(68.0), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj):
    triangulate_mesh(obj)
    auto_uv_project(obj)
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


def side_for_bounds(bounds):
    return "L" if midpoint(bounds, "x") < 0.0 else "R"


def grouped_legacy_bounds():
    obj = bpy.data.objects.get(LEGACY_NAME)
    if obj is None:
        return [dict(bounds) for bounds in FALLBACK_GROUPS]

    groups = []
    current_group = []
    last_center_x = None
    for bounds in read_connected_component_bounds(obj):
        center_x = midpoint(bounds, "x")
        if last_center_x is not None and center_x - last_center_x > GROUP_GAP:
            groups.append(merge_bounds(current_group))
            current_group = []
        current_group.append(bounds)
        last_center_x = center_x
    if current_group:
        groups.append(merge_bounds(current_group))

    if len(groups) != len(FALLBACK_GROUPS):
        return [dict(bounds) for bounds in FALLBACK_GROUPS]

    merged_groups = []
    for bounds in groups:
        merged_groups.append({**bounds, "side": side_for_bounds(bounds)})
    return merged_groups


def merge_bounds(bounds_list):
    return {
        axis: (
            min(bounds[axis][0] for bounds in bounds_list),
            max(bounds[axis][1] for bounds in bounds_list),
        )
        for axis in ("x", "y", "z")
    }


def grouped_side_bounds(side):
    groups = [bounds for bounds in grouped_legacy_bounds() if bounds["side"] == side]
    if len(groups) != 4:
        raise RuntimeError(f"Expected 4 {side} arch groups, found {len(groups)}")
    return groups


def arch_polygon(bounds):
    center_x = midpoint(bounds, "x")
    half_width = span(bounds, "x") * 0.5
    z_min, z_max = bounds["z"]
    outer_half = half_width + 0.070
    inner_half = max(half_width - 0.180, half_width * 0.68)
    base_z = z_min + 0.120
    apex_z = z_max + 0.012
    inner_base_z = base_z + 0.180
    inner_apex_z = apex_z - 0.280

    outer = []
    inner = []
    for station_index in range(STATION_COUNT):
        t = station_index / (STATION_COUNT - 1)
        arch = math.sin(t * math.pi)
        shoulder = abs(0.5 - t) * 2.0
        outer_x = center_x - outer_half + outer_half * 2.0 * t
        outer_z = base_z + (apex_z - base_z) * (arch ** 0.92) - shoulder * 0.015
        inner_x = center_x - inner_half + inner_half * 2.0 * t
        inner_z = inner_base_z + (inner_apex_z - inner_base_z) * (arch ** 0.96) - shoulder * 0.010
        inner_z = min(inner_z, outer_z - 0.150)
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


def build_array(name, side, collection):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in grouped_side_bounds(side):
        y_min = bounds["y"][0] - 0.030
        y_max = bounds["y"][1] + 0.014
        add_extruded_polygon_y(bm, arch_polygon(bounds), y_min, y_max)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, GOLD)
    finalize(obj)
    return obj


def log_bounds(name):
    bounds = world_bounds_for_object(bpy.data.objects[name])
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.4f},{bounds['x'][1]:.4f}] "
        f"Y[{bounds['y'][0]:.4f},{bounds['y'][1]:.4f}] "
        f"Z[{bounds['z'][0]:.4f},{bounds['z'][1]:.4f}]"
    )
    return bounds


def verify_group_coverage(name, source_groups, min_overlap=0.005):
    components = sorted(read_connected_component_bounds(bpy.data.objects[name]), key=lambda bounds: midpoint(bounds, "x"))
    if len(components) != len(source_groups):
        raise RuntimeError(f"{name} expected {len(source_groups)} components, found {len(components)}")
    for index, (component, source) in enumerate(zip(components, source_groups)):
        x_overlap = min(component["x"][1], source["x"][1]) - max(component["x"][0], source["x"][0])
        z_overlap = min(component["z"][1], source["z"][1]) - max(component["z"][0], source["z"][0])
        print(f"{name} component {index}: X overlap={x_overlap:.4f} Z overlap={z_overlap:.4f}")
        if x_overlap < span(source, "x") - min_overlap:
            raise RuntimeError(f"{name} component {index} lost X coverage: {x_overlap:.4f}")
        if z_overlap < span(source, "z") - 0.180:
            raise RuntimeError(f"{name} component {index} lost Z coverage: {z_overlap:.4f}")


def verify_proud_depth(name, source_groups, min_proud=0.010):
    components = sorted(read_connected_component_bounds(bpy.data.objects[name]), key=lambda bounds: midpoint(bounds, "x"))
    for index, (component, source) in enumerate(zip(components, source_groups)):
        proud = component["y"][1] - source["y"][1]
        print(f"{name} component {index}: facade relief proud={proud:.4f}")
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
source_groups = grouped_legacy_bounds()
delete_existing([LEGACY_NAME, *REPLACEMENT_NAMES])

left = build_array("V109_WingFacadeArchInlayArray_L", "L", collection)
right = build_array("V109_WingFacadeArchInlayArray_R", "R", collection)

log_bounds(left.name)
log_bounds(right.name)
verify_group_coverage(left.name, [bounds for bounds in source_groups if bounds["side"] == "L"])
verify_group_coverage(right.name, [bounds for bounds in source_groups if bounds["side"] == "R"])
verify_proud_depth(left.name, [bounds for bounds in source_groups if bounds["side"] == "L"])
verify_proud_depth(right.name, [bounds for bounds in source_groups if bounds["side"] == "R"])
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
