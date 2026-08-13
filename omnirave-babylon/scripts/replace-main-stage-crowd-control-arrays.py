from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix, Vector


# Connection Map:
#   each V124 frame component replaces one V84 crowd-control frame segment on the same spawn-lane interval:
#     preserve >=0.020m overlap on X/Y so the new ceremonial stanchions fully occupy the prior barrier envelope.
#   each V124 rail component replaces one V84 gold rail segment centered within the same interval:
#     preserve >=0.020m overlap on Y/Z so the gilded rails still read as continuous lane guidance.
#   each V124 rail component <-> its paired V124 frame component:
#     keep >=0.050m vertical reveal between the lower footings and the first rail so the silhouette reads as a layered barrier, not one fused slab.

LEGACY_NAMES = [
    "V84_CrowdControlFrameArray_L",
    "V84_CrowdControlFrameArray_R",
    "V84_CrowdControlRailArray_L",
    "V84_CrowdControlRailArray_R",
]
REPLACEMENT_NAMES = [
    "V124_CrowdControlFrameArray_L",
    "V124_CrowdControlFrameArray_R",
    "V124_CrowdControlRailArray_L",
    "V124_CrowdControlRailArray_R",
]

FRAME = "V13_BlackStageRigging"
RAIL = "V14_BurnishedCelestialGold"


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


def component_bounds_for_object(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH" or not obj.data.vertices:
        raise RuntimeError(f"Missing mesh object: {name}")

    world_vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    adjacency = [set() for _ in obj.data.vertices]
    for polygon in obj.data.polygons:
        verts = polygon.vertices[:]
        for index, vertex_index in enumerate(verts):
            for neighbor_index in verts[index + 1 :]:
                adjacency[vertex_index].add(neighbor_index)
                adjacency[neighbor_index].add(vertex_index)

    visited = set()
    components = []
    for start_index in range(len(obj.data.vertices)):
        if start_index in visited:
            continue
        stack = [start_index]
        visited.add(start_index)
        verts = []
        while stack:
            current = stack.pop()
            verts.append(world_vertices[current])
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        components.append(
            {
                "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
                "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
                "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
            }
        )
    return components


def sort_bounds(bounds_list, axis):
    return sorted(bounds_list, key=lambda bounds: (bounds[axis][0] + bounds[axis][1]) * 0.5)


def merge_bounds(bounds_group):
    return {
        "x": (min(bounds["x"][0] for bounds in bounds_group), max(bounds["x"][1] for bounds in bounds_group)),
        "y": (min(bounds["y"][0] for bounds in bounds_group), max(bounds["y"][1] for bounds in bounds_group)),
        "z": (min(bounds["z"][0] for bounds in bounds_group), max(bounds["z"][1] for bounds in bounds_group)),
    }


def cluster_bounds(bounds_list, axis, expected_count):
    ordered = sort_bounds(bounds_list, axis)
    if len(ordered) == expected_count:
        return ordered
    if len(ordered) < expected_count:
        raise RuntimeError(f"Expected at least {expected_count} components, found {len(ordered)}")

    gaps = []
    for index in range(len(ordered) - 1):
        gap = ordered[index + 1][axis][0] - ordered[index][axis][1]
        gaps.append((gap, index))
    split_indexes = {index for _, index in sorted(gaps, reverse=True)[: expected_count - 1]}

    clusters = []
    start_index = 0
    for index in range(len(ordered) - 1):
        if index in split_indexes:
            clusters.append(merge_bounds(ordered[start_index : index + 1]))
            start_index = index + 1
    clusters.append(merge_bounds(ordered[start_index:]))

    if len(clusters) != expected_count:
        raise RuntimeError(f"Unable to cluster {len(ordered)} components into {expected_count} groups")
    return clusters


def capture_component_series(legacy_name, replacement_name, expected_count, axis):
    if bpy.data.objects.get(legacy_name) is not None:
        components = component_bounds_for_object(legacy_name)
    else:
        components = component_bounds_for_object(replacement_name)
    return cluster_bounds(components, axis, expected_count)


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def add_box(bm, center, half_extents):
    matrix = Matrix.Translation(Vector(center)) @ Matrix.Diagonal(
        (half_extents[0], half_extents[1], half_extents[2], 1.0)
    )
    bmesh.ops.create_cube(bm, size=2.0, matrix=matrix)


def add_beam(bm, start, end, half_width=0.03, half_height=0.03):
    start_vec = Vector(start)
    end_vec = Vector(end)
    forward = end_vec - start_vec
    if forward.length < 1e-6:
        return
    forward.normalize()

    up = Vector((0.0, 0.0, 1.0)) if abs(forward.z) < 0.99 else Vector((1.0, 0.0, 0.0))
    right = forward.cross(up)
    if right.length < 1e-6:
        right = Vector((1.0, 0.0, 0.0))
    right.normalize()
    up = right.cross(forward)
    up.normalize()

    verts = []
    for base in (start_vec, end_vec):
        for sx, sy in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)]:
            verts.append(bm.verts.new(base + right * half_width * sx + up * half_height * sy))

    for face in [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (0, 3, 2, 1), (4, 5, 6, 7)]:
        bm.faces.new([verts[index] for index in face])


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def assign_planar_uvs(mesh, uv_scale=0.1):
    existing = mesh.uv_layers.get("UVMap")
    if existing is not None:
        mesh.uv_layers.remove(existing)
    uv_layer = mesh.uv_layers.new(name="UVMap")

    for polygon in mesh.polygons:
        normal = polygon.normal
        axis_x = abs(normal.x)
        axis_y = abs(normal.y)
        axis_z = abs(normal.z)
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if axis_z >= axis_x and axis_z >= axis_y:
                uv = (vertex.x * uv_scale + 0.5, vertex.y * uv_scale + 0.5)
            elif axis_x >= axis_y:
                uv = (vertex.y * uv_scale + 0.5, vertex.z * uv_scale + 0.5)
            else:
                uv = (vertex.x * uv_scale + 0.5, vertex.z * uv_scale + 0.5)
            uv_layer.data[loop_index].uv = uv


def finalize(obj, bevel_width=0.01):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = 1
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.7
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    assign_planar_uvs(obj.data)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_mesh_object(name, material_name, collection, build_fn, *, bevel_width=0.01):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    build_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width)
    return obj


def build_frame_component(bm, bounds):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    z_min, z_max = bounds["z"]
    y_min = bounds["y"][0] + 0.12
    y_max = bounds["y"][1] - 0.12
    y_span = y_max - y_min
    if y_span <= 0.12:
        y_min = bounds["y"][0] + 0.06
        y_max = bounds["y"][1] - 0.06
        y_span = y_max - y_min

    footing_z = z_min + 0.09
    top_z = z_max - 0.18
    mid_z = z_min + (z_max - z_min) * 0.5
    side_depth = max(span(bounds, "x") * 0.14, 0.022)

    for post_y in (y_min, y_max):
        add_box(bm, (center_x, post_y, footing_z + 0.50), (0.05, 0.045, 0.52))
        add_box(bm, (center_x, post_y, z_max - 0.08), (0.065, 0.05, 0.04))
        add_box(bm, (center_x, post_y, footing_z - 0.01), (0.095, 0.06, 0.05))

    add_beam(bm, (center_x, y_min, top_z), (center_x, y_max, top_z), half_width=0.048, half_height=0.034)
    add_beam(bm, (center_x, y_min, mid_z), (center_x, y_max, mid_z), half_width=0.034, half_height=0.024)
    add_beam(
        bm,
        (center_x, y_min + y_span * 0.1, footing_z + 0.18),
        (center_x, y_max - y_span * 0.1, top_z - 0.08),
        half_width=0.018,
        half_height=0.018,
    )
    add_beam(
        bm,
        (center_x, y_max - y_span * 0.1, footing_z + 0.18),
        (center_x, y_min + y_span * 0.1, top_z - 0.08),
        half_width=0.018,
        half_height=0.018,
    )
    add_box(bm, (center_x, center_y, z_max - 0.07), (0.07, 0.095, 0.04))
    add_box(bm, (center_x, center_y, footing_z + 0.02), (0.045, y_span * 0.28, 0.026))
    add_box(bm, (center_x + side_depth, center_y, mid_z + 0.05), (0.014, y_span * 0.30, 0.016))
    add_box(bm, (center_x - side_depth, center_y, mid_z - 0.03), (0.014, y_span * 0.30, 0.016))


def build_rail_component(bm, bounds):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    z_min, z_max = bounds["z"]
    y_min = bounds["y"][0] + 0.16
    y_max = bounds["y"][1] - 0.16
    y_span = y_max - y_min
    if y_span <= 0.12:
        y_min = bounds["y"][0] + 0.08
        y_max = bounds["y"][1] - 0.08
        y_span = y_max - y_min

    lower_z = z_min + 0.10
    mid_z = midpoint(bounds, "z") + 0.03
    upper_z = z_max - 0.03
    side_depth = max(span(bounds, "x") * 0.14, 0.018)

    add_beam(bm, (center_x, y_min, lower_z), (center_x, y_max, lower_z), half_width=0.026, half_height=0.018)
    add_beam(bm, (center_x, y_min, mid_z), (center_x, y_max, mid_z), half_width=0.024, half_height=0.016)
    add_beam(bm, (center_x, y_min, upper_z), (center_x, y_max, upper_z), half_width=0.028, half_height=0.02)
    add_box(bm, (center_x, center_y, mid_z + 0.02), (0.052, 0.07, 0.03))
    add_box(bm, (center_x + side_depth, center_y, mid_z + 0.11), (0.012, y_span * 0.18, 0.014))
    add_box(bm, (center_x - side_depth, center_y, mid_z - 0.09), (0.012, y_span * 0.18, 0.014))


def build_frame_array(bm, bounds_series):
    for bounds in bounds_series:
        build_frame_component(bm, bounds)


def build_rail_array(bm, bounds_series):
    for bounds in bounds_series:
        build_rail_component(bm, bounds)


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
        f"{name}: X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )


def audit_transforms(names):
    all_ok = True
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        ok = rotation == (0.0, 0.0, 0.0) and scale == (1.0, 1.0, 1.0)
        print(f"  [{'OK' if ok else '!!'}] {name}: rot={rotation} scale={scale}")
        all_ok &= ok
    print(f"All transforms clean: {all_ok}")
    return all_ok


def main():
    ensure_object_mode()
    collection = resolve_collection()

    frame_left_bounds = capture_component_series("V84_CrowdControlFrameArray_L", "V124_CrowdControlFrameArray_L", 4, "y")
    frame_right_bounds = capture_component_series("V84_CrowdControlFrameArray_R", "V124_CrowdControlFrameArray_R", 4, "y")
    rail_left_bounds = capture_component_series("V84_CrowdControlRailArray_L", "V124_CrowdControlRailArray_L", 4, "y")
    rail_right_bounds = capture_component_series("V84_CrowdControlRailArray_R", "V124_CrowdControlRailArray_R", 4, "y")

    delete_existing([*LEGACY_NAMES, *REPLACEMENT_NAMES])

    build_mesh_object(
        "V124_CrowdControlFrameArray_L",
        FRAME,
        collection,
        lambda bm: build_frame_array(bm, frame_left_bounds),
        bevel_width=0.0,
    )
    build_mesh_object(
        "V124_CrowdControlFrameArray_R",
        FRAME,
        collection,
        lambda bm: build_frame_array(bm, frame_right_bounds),
        bevel_width=0.0,
    )
    build_mesh_object(
        "V124_CrowdControlRailArray_L",
        RAIL,
        collection,
        lambda bm: build_rail_array(bm, rail_left_bounds),
        bevel_width=0.0,
    )
    build_mesh_object(
        "V124_CrowdControlRailArray_R",
        RAIL,
        collection,
        lambda bm: build_rail_array(bm, rail_right_bounds),
        bevel_width=0.0,
    )

    for name in REPLACEMENT_NAMES:
        log_bounds(name)
    audit_transforms(REPLACEMENT_NAMES)

    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
