from __future__ import annotations

import bmesh
import bpy


GROUPS = [
    (
        "V117_WingCanopyLamellaGoldArray_L_Front",
        [f"V17_WingCanopyLamella_L_0_{index}" for index in range(8)],
        "V17_CrownBrushedGold",
    ),
    (
        "V117_WingCanopyLamellaPearlArray_L_Mid",
        [f"V17_WingCanopyLamella_L_1_{index}" for index in range(8)],
        "V17_PearlShellSatin",
    ),
    (
        "V117_WingCanopyLamellaGoldArray_L_Rear",
        [f"V17_WingCanopyLamella_L_2_{index}" for index in range(8)],
        "V17_CrownBrushedGold",
    ),
    (
        "V117_WingCanopyLamellaGoldArray_R_Front",
        [f"V17_WingCanopyLamella_R_0_{index}" for index in range(8)],
        "V17_CrownBrushedGold",
    ),
    (
        "V117_WingCanopyLamellaPearlArray_R_Mid",
        [f"V17_WingCanopyLamella_R_1_{index}" for index in range(8)],
        "V17_PearlShellSatin",
    ),
    (
        "V117_WingCanopyLamellaGoldArray_R_Rear",
        [f"V17_WingCanopyLamella_R_2_{index}" for index in range(8)],
        "V17_CrownBrushedGold",
    ),
]

REPLACEMENT_NAMES = [group[0] for group in GROUPS]
LEGACY_NAMES = [name for _, names, _ in GROUPS for name in names]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*REPLACEMENT_NAMES, *LEGACY_NAMES, "V17_WingCanopyLamella_L_0"]:
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


def ensure_vertex_stable_uvs(mesh, cube_size=8.0):
    existing = mesh.uv_layers.get("OmniRaveGeneratedUV")
    if existing is not None:
        mesh.uv_layers.remove(existing)
    uv_layer = mesh.uv_layers.new(name="OmniRaveGeneratedUV")
    min_bounds = [min(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3)]
    max_bounds = [max(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3)]
    extents = [max_bounds[axis] - min_bounds[axis] for axis in range(3)]
    uv_axes = sorted(range(3), key=lambda axis: extents[axis], reverse=True)[:2]

    per_vertex_uvs = {}
    for vertex in mesh.vertices:
        u = vertex.co[uv_axes[0]] / cube_size + 0.5
        v = vertex.co[uv_axes[1]] / cube_size + 0.5
        per_vertex_uvs[vertex.index] = (u, v)

    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = per_vertex_uvs[loop.vertex_index]


def finalize(obj):
    triangulate_mesh(obj)
    ensure_vertex_stable_uvs(obj.data)
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
        if points:
            components.append(world_bounds_for_points(points))
    return sorted(components, key=lambda bounds: midpoint(bounds, "x"))


def source_component_bounds(names, replacement_name, expected_count):
    components = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH" or not obj.data.vertices:
            components = []
            break
        bounds = world_bounds_for_object(obj)
        bounds["name"] = name
        components.append(bounds)
    if components:
        return sorted(components, key=lambda bounds: midpoint(bounds, "x"))

    replacement = bpy.data.objects.get(replacement_name)
    if replacement is None or replacement.type != "MESH" or not replacement.data.vertices:
        raise RuntimeError(f"Missing legacy components and replacement fallback: {replacement_name}")
    components = read_connected_component_bounds(replacement)
    if len(components) != expected_count:
        raise RuntimeError(f"{replacement_name} expected {expected_count} components, found {len(components)}")
    return components


def add_extruded_polygon_y(bm, polygon, y_min, y_max):
    front = [bm.verts.new((x_value, y_min, z_value)) for x_value, z_value in polygon]
    back = [bm.verts.new((x_value, y_max, z_value)) for x_value, z_value in polygon]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    count = len(polygon)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([front[index], front[next_index], back[next_index], back[index]])


def lamella_profile(bounds):
    x_center = midpoint(bounds, "x")
    z_center = midpoint(bounds, "z")
    x_half = span(bounds, "x") * 0.5 + 0.16
    z_half = span(bounds, "z") * 0.5 + 0.22
    return [
        (x_center - x_half * 0.96, z_center - z_half * 0.86),
        (x_center - x_half * 0.72, z_center - z_half),
        (x_center - x_half * 0.26, z_center - z_half * 0.96),
        (x_center + x_half * 0.18, z_center - z_half * 0.7),
        (x_center + x_half * 0.56, z_center - z_half * 0.28),
        (x_center + x_half, z_center + z_half * 0.08),
        (x_center + x_half * 0.84, z_center + z_half * 0.46),
        (x_center + x_half * 0.38, z_center + z_half * 0.84),
        (x_center - x_half * 0.12, z_center + z_half),
        (x_center - x_half * 0.54, z_center + z_half * 0.72),
        (x_center - x_half * 0.86, z_center + z_half * 0.22),
        (x_center - x_half, z_center - z_half * 0.3),
    ]


def build_array(name, collection, components, material_name):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in components:
        y_min = bounds["y"][0] - 0.025
        y_max = bounds["y"][1] + 0.025
        if y_max - y_min < 0.18:
            y_center = midpoint(bounds, "y")
            y_min = y_center - 0.09
            y_max = y_center + 0.09
        add_extruded_polygon_y(bm, lamella_profile(bounds), y_min, y_max)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj)
    return obj


def main():
    ensure_object_mode()
    collection = resolve_collection()

    component_map = {
        replacement_name: source_component_bounds(legacy_names, replacement_name, 8)
        for replacement_name, legacy_names, _material_name in GROUPS
    }

    delete_existing(REPLACEMENT_NAMES)

    for replacement_name, _legacy_names, material_name in GROUPS:
        build_array(replacement_name, collection, component_map[replacement_name], material_name)

    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
