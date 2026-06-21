from __future__ import annotations

import bmesh
import bpy


LEGACY_MULLION_NAMES = [f"V17_CenterScreenMullionRib_{index}" for index in range(7)]
LEGACY_CYAN_NAMES = [f"V17_CenterScreenCyanEdge_{index}" for index in range(7)]
LEGACY_NAMES = [*LEGACY_MULLION_NAMES, *LEGACY_CYAN_NAMES]
REPLACEMENT_NAMES = ["V115_CenterScreenMullionArray", "V115_CenterScreenCyanEdgeArray"]

GOLD = "V20_ChasedGoldFiligree"
CYAN = "V20_CelestialCyanGlass"

LOCKED_MULLION_COMPONENTS = [
    {"x": (-7.38, -7.02), "y": (-25.42, -25.23), "z": (8.29, 31.53)},
    {"x": (-4.98, -4.62), "y": (-25.42, -25.23), "z": (8.29, 31.53)},
    {"x": (-2.58, -2.22), "y": (-25.42, -25.23), "z": (8.29, 31.53)},
    {"x": (-0.18, 0.18), "y": (-25.42, -25.23), "z": (8.29, 31.53)},
    {"x": (2.22, 2.58), "y": (-25.42, -25.23), "z": (8.29, 31.53)},
    {"x": (4.62, 4.98), "y": (-25.42, -25.23), "z": (8.29, 31.53)},
    {"x": (7.02, 7.38), "y": (-25.42, -25.23), "z": (8.29, 31.53)},
]

LOCKED_CYAN_COMPONENTS = [
    {"x": (-7.135, -6.905), "y": (-25.64, -25.46), "z": (8.64, 31.17)},
    {"x": (-4.735, -4.505), "y": (-25.64, -25.46), "z": (8.64, 31.17)},
    {"x": (-2.335, -2.105), "y": (-25.64, -25.46), "z": (8.64, 31.17)},
    {"x": (0.065, 0.295), "y": (-25.64, -25.46), "z": (8.64, 31.17)},
    {"x": (2.465, 2.695), "y": (-25.64, -25.46), "z": (8.64, 31.17)},
    {"x": (4.865, 5.095), "y": (-25.64, -25.46), "z": (8.64, 31.17)},
    {"x": (7.265, 7.495), "y": (-25.64, -25.46), "z": (8.64, 31.17)},
]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*REPLACEMENT_NAMES, *LEGACY_NAMES, "V22_CenterScreenShadowCoffer_Left"]:
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

    if replacement_name == "V115_CenterScreenMullionArray":
        return [dict(component) for component in LOCKED_MULLION_COMPONENTS]
    if replacement_name == "V115_CenterScreenCyanEdgeArray":
        return [dict(component) for component in LOCKED_CYAN_COMPONENTS]

    replacement = bpy.data.objects.get(replacement_name)
    if replacement is None or replacement.type != "MESH" or not replacement.data.vertices:
        raise RuntimeError(f"Missing legacy components and replacement fallback: {replacement_name}")
    components = read_connected_component_bounds(replacement)
    if len(components) != expected_count:
        raise RuntimeError(f"{replacement_name} expected {expected_count} components, found {len(components)}")
    return components


def add_extruded_polygon_z(bm, polygon, z_min, z_max):
    front = [bm.verts.new((x_value, y_value, z_min)) for x_value, y_value in polygon]
    back = [bm.verts.new((x_value, y_value, z_max)) for x_value, y_value in polygon]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    count = len(polygon)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([front[index], front[next_index], back[next_index], back[index]])


def mullion_profile(bounds):
    center_x = midpoint(bounds, "x")
    y_min, y_max = bounds["y"]
    half_width = span(bounds, "x") * 0.5 + 0.12
    height = y_max - y_min
    shoulder = y_min + height * 0.16
    neck = y_min + height * 0.82
    cap = y_max + 0.22
    base = y_min - 0.18
    return [
        (center_x - half_width * 0.72, base),
        (center_x - half_width, shoulder),
        (center_x - half_width * 0.84, neck),
        (center_x - half_width * 0.48, cap),
        (center_x, cap + 0.08),
        (center_x + half_width * 0.48, cap),
        (center_x + half_width * 0.84, neck),
        (center_x + half_width, shoulder),
        (center_x + half_width * 0.72, base),
        (center_x, base - 0.06),
    ]


def cyan_profile(bounds):
    center_x = midpoint(bounds, "x")
    y_min, y_max = bounds["y"]
    half_width = span(bounds, "x") * 0.5 + 0.09
    height = y_max - y_min
    lower = y_min - 0.08
    upper = y_max + 0.08
    knee = y_min + height * 0.18
    crown = y_min + height * 0.86
    crest = upper + 0.06
    return [
        (center_x - half_width * 0.64, lower),
        (center_x - half_width, knee),
        (center_x - half_width * 0.82, crown),
        (center_x - half_width * 0.34, upper),
        (center_x, crest),
        (center_x + half_width * 0.34, upper),
        (center_x + half_width * 0.82, crown),
        (center_x + half_width, knee),
        (center_x + half_width * 0.64, lower),
    ]


def build_array(name, collection, components, polygon_factory, z_offsets, material_name, min_depth):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in components:
        z_min = bounds["z"][0] + z_offsets[0]
        z_max = bounds["z"][1] + z_offsets[1]
        if z_max - z_min < min_depth:
            z_center = midpoint(bounds, "z") + (z_offsets[0] + z_offsets[1]) * 0.5
            z_min = z_center - min_depth * 0.5
            z_max = z_center + min_depth * 0.5
        add_extruded_polygon_z(bm, polygon_factory(bounds), z_min, z_max)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj)
    return obj


def main():
    ensure_object_mode()
    collection = resolve_collection()
    mullion_components = source_component_bounds(LEGACY_MULLION_NAMES, "V115_CenterScreenMullionArray", 7)
    cyan_components = source_component_bounds(LEGACY_CYAN_NAMES, "V115_CenterScreenCyanEdgeArray", 7)

    delete_existing(REPLACEMENT_NAMES)
    build_array(
        "V115_CenterScreenMullionArray",
        collection,
        mullion_components,
        mullion_profile,
        (-0.02, 0.14),
        GOLD,
        min_depth=0.24,
    )
    build_array(
        "V115_CenterScreenCyanEdgeArray",
        collection,
        cyan_components,
        cyan_profile,
        (-0.01, 0.12),
        CYAN,
        min_depth=0.18,
    )

    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
