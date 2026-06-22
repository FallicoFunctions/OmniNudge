from __future__ import annotations

import bmesh
import bpy
from mathutils import Matrix, Vector


# Connection Map:
#   each V125 base component replaces one V94 crowd-barrier base span on the same wing-side interval:
#     preserve >=0.020m overlap on X/Z and >=0.080m overlap on Y so the new plinth fully covers the prior foot block.
#   each V125 rail component replaces one V94 crowd-barrier rail span on the same interval:
#     preserve >=0.020m overlap on X/Z and >=0.120m overlap on Y so the ceremonial rail still reads as a continuous lane guide.
#   each V125 base pedestal <-> V125 rail post:
#     keep >=0.010m Z overlap so each barrier reads as a connected object rather than exploded stacked parts.

LEGACY_NAMES = [
    "V94_CrowdBarrierBaseArray_L",
    "V94_CrowdBarrierBaseArray_R",
    "V94_CrowdBarrierRailArray_L",
    "V94_CrowdBarrierRailArray_R",
]
REPLACEMENT_NAMES = [
    "V125_CrowdBarrierBaseArray_L",
    "V125_CrowdBarrierBaseArray_R",
    "V125_CrowdBarrierRailArray_L",
    "V125_CrowdBarrierRailArray_R",
]

BLACK = "V9_BlackRigging"
GOLD = "V9_CrownFiligreeGold"


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


def capture_bounds_series(legacy_name, replacement_name, expected_count, axis):
    source_name = legacy_name if bpy.data.objects.get(legacy_name) is not None else replacement_name
    return cluster_bounds(component_bounds_for_object(source_name), axis, expected_count)


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


def assign_planar_uvs(mesh, uv_scale=0.12):
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


def finalize(obj):
    triangulate_mesh(obj)
    assign_planar_uvs(obj.data)
    set_active(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_mesh_object(name, material_name, collection, build_fn):
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
    finalize(obj)
    return obj


def build_base_component(bm, bounds):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    half_x = span(bounds, "x") * 0.5 + 0.03
    half_y = span(bounds, "y") * 0.5 + 0.035
    z_min, z_max = bounds["z"]
    plinth_top = z_min + 0.10
    pedestal_top = z_max + 0.16
    wing_y = half_y * 0.62

    add_box(bm, (center_x, center_y, z_min + 0.055), (half_x, half_y, 0.055))
    add_box(bm, (center_x, center_y, z_min + 0.145), (half_x * 0.72, half_y * 0.72, 0.04))
    add_box(bm, (center_x, center_y, z_min + 0.235), (half_x * 0.42, half_y * 0.46, 0.05))

    for offset_y in (-wing_y, wing_y):
        add_box(bm, (center_x, center_y + offset_y, z_min + 0.185), (half_x * 0.22, half_y * 0.16, 0.07))


def build_rail_component(bm, bounds):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    half_x = span(bounds, "x") * 0.5 + 0.026
    half_y = span(bounds, "y") * 0.5 + 0.08
    z_min, z_max = bounds["z"]
    y_start = bounds["y"][0] - 0.02
    y_end = bounds["y"][1] + 0.02
    lower_z = z_min + 0.10
    upper_z = z_max - 0.06

    add_box(bm, (center_x, center_y, lower_z), (half_x * 0.88, half_y, 0.03))
    add_box(bm, (center_x, center_y, upper_z), (half_x, half_y, 0.034))
    add_box(bm, (center_x, center_y, z_max + 0.005), (half_x * 0.56, half_y * 0.18, 0.026))

    for post_y in (y_start, y_end):
        add_box(bm, (center_x, post_y, midpoint(bounds, "z")), (half_x * 0.34, 0.05, span(bounds, "z") * 0.5))
        add_box(bm, (center_x, post_y, z_max + 0.04), (half_x * 0.46, 0.06, 0.04))


def build_component_array(bm, bounds_series, builder):
    for bounds in bounds_series:
        builder(bm, bounds)


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

    base_left_bounds = capture_bounds_series("V94_CrowdBarrierBaseArray_L", "V125_CrowdBarrierBaseArray_L", 6, "y")
    base_right_bounds = capture_bounds_series("V94_CrowdBarrierBaseArray_R", "V125_CrowdBarrierBaseArray_R", 6, "y")
    rail_left_bounds = capture_bounds_series("V94_CrowdBarrierRailArray_L", "V125_CrowdBarrierRailArray_L", 6, "y")
    rail_right_bounds = capture_bounds_series("V94_CrowdBarrierRailArray_R", "V125_CrowdBarrierRailArray_R", 6, "y")

    delete_existing([*LEGACY_NAMES, *REPLACEMENT_NAMES])

    build_mesh_object(
        "V125_CrowdBarrierBaseArray_L",
        BLACK,
        collection,
        lambda bm: build_component_array(bm, base_left_bounds, build_base_component),
    )
    build_mesh_object(
        "V125_CrowdBarrierBaseArray_R",
        BLACK,
        collection,
        lambda bm: build_component_array(bm, base_right_bounds, build_base_component),
    )
    build_mesh_object(
        "V125_CrowdBarrierRailArray_L",
        GOLD,
        collection,
        lambda bm: build_component_array(bm, rail_left_bounds, build_rail_component),
    )
    build_mesh_object(
        "V125_CrowdBarrierRailArray_R",
        GOLD,
        collection,
        lambda bm: build_component_array(bm, rail_right_bounds, build_rail_component),
    )

    for name in REPLACEMENT_NAMES:
        log_bounds(name)
    audit_transforms(REPLACEMENT_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
