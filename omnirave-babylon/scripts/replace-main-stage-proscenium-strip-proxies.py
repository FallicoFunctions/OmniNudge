from __future__ import annotations

import bmesh
import bpy


LEGACY_TO_REPLACEMENT = {
    "V17_ProsceniumPearlReveal_L": "V116_ProsceniumPearlRevealArray_L",
    "V17_ProsceniumPearlReveal_R": "V116_ProsceniumPearlRevealArray_R",
    "V17_ProsceniumShadowPocket_L": "V116_ProsceniumShadowPocketArray_L",
    "V17_ProsceniumShadowPocket_R": "V116_ProsceniumShadowPocketArray_R",
}

PEARL_MATERIAL = "V17_PearlShellSatin"
SHADOW_MATERIAL = "V17_RecessedShadowLine"
LOCKED_BOUNDS = {
    "V17_ProsceniumPearlReveal_L": {"x": (-11.42, -10.48), "y": (-25.62, -24.78), "z": (6.8, 35.0)},
    "V17_ProsceniumPearlReveal_R": {"x": (10.48, 11.42), "y": (-25.62, -24.78), "z": (6.8, 35.0)},
    "V17_ProsceniumShadowPocket_L": {"x": (-10.45, -10.25), "y": (-25.72, -25.38), "z": (7.895, 33.905)},
    "V17_ProsceniumShadowPocket_R": {"x": (10.25, 10.45), "y": (-25.72, -25.38), "z": (7.895, 33.905)},
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*LEGACY_TO_REPLACEMENT.values(), *LEGACY_TO_REPLACEMENT.keys()]:
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


def read_replacement_bounds(obj):
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return world_bounds_for_points(verts)


def source_bounds(legacy_name, replacement_name):
    legacy = bpy.data.objects.get(legacy_name)
    if legacy is not None and legacy.type == "MESH" and legacy.data.vertices:
        return world_bounds_for_object(legacy)

    replacement = bpy.data.objects.get(replacement_name)
    if replacement is not None and replacement.type == "MESH" and replacement.data.vertices:
        return read_replacement_bounds(replacement)

    raise RuntimeError(f"Missing source bounds for {legacy_name} / {replacement_name}")


def locked_bounds(legacy_name, bounds):
    override = LOCKED_BOUNDS.get(legacy_name)
    if override is None:
        return bounds
    return override


def add_extruded_polygon_x(bm, polygon, x_min, x_max):
    left = [bm.verts.new((x_min, y_value, z_value)) for y_value, z_value in polygon]
    right = [bm.verts.new((x_max, y_value, z_value)) for y_value, z_value in polygon]
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    count = len(polygon)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([left[index], left[next_index], right[next_index], right[index]])
    return left, right


def add_cap_detail_triangle(bm, cap_verts, inward_x_offset):
    start_index = len(cap_verts) // 2 - 1
    edge_start = cap_verts[start_index]
    edge_end = cap_verts[start_index + 1]
    detail_vert = bm.verts.new(
        (
            edge_start.co.x + inward_x_offset,
            (edge_start.co.y + edge_end.co.y) * 0.5,
            (edge_start.co.z + edge_end.co.z) * 0.5 + 0.02,
        )
    )
    bm.faces.new([edge_start, edge_end, detail_vert])


def pearl_profile(bounds):
    y_center = midpoint(bounds, "y")
    z_center = midpoint(bounds, "z")
    y_half = span(bounds, "y") * 0.5 + 0.06
    z_half = span(bounds, "z") * 0.5 + 0.18
    left_side = []
    for z_ratio, y_ratio in [
        (-1.0, -0.08),
        (-0.92, -0.42),
        (-0.87, -0.58),
        (-0.82, -0.74),
        (-0.76, -0.88),
        (-0.7, -0.96),
        (-0.56, -1.0),
        (-0.49, -0.97),
        (-0.42, -0.92),
        (-0.28, -0.84),
        (-0.21, -0.79),
        (-0.14, -0.74),
        (0.0, -0.64),
        (0.07, -0.59),
        (0.14, -0.54),
        (0.3, -0.42),
        (0.46, -0.28),
        (0.54, -0.22),
        (0.62, -0.18),
        (0.67, -0.155),
        (0.72, -0.13),
        (0.77, -0.105),
        (0.82, -0.08),
        (0.92, -0.03),
        (1.0, 0.0),
    ]:
        left_side.append((y_center + y_half * y_ratio, z_center + z_half * z_ratio))

    right_side = [(2 * y_center - y_value, z_value) for y_value, z_value in reversed(left_side[:-1])]
    return [*left_side, *right_side]


def shadow_profile(bounds):
    y_center = midpoint(bounds, "y")
    z_center = midpoint(bounds, "z")
    y_half = span(bounds, "y") * 0.5 + 0.11
    z_half = span(bounds, "z") * 0.5 - 0.08
    left_side = []
    for z_ratio, y_ratio in [
        (-1.0, -0.2),
        (-0.84, -0.52),
        (-0.76, -0.69),
        (-0.68, -0.86),
        (-0.5, -1.0),
        (-0.4, -0.96),
        (-0.3, -0.92),
        (-0.19, -0.87),
        (-0.08, -0.82),
        (0.04, -0.75),
        (0.16, -0.68),
        (0.29, -0.59),
        (0.42, -0.5),
        (0.56, -0.39),
        (0.7, -0.28),
        (1.0, -0.08),
    ]:
        left_side.append((y_center + y_half * y_ratio, z_center + z_half * z_ratio))

    right_side = [(2 * y_center - y_value, z_value) for y_value, z_value in reversed(left_side[:-1])]
    return [*left_side, *right_side]


def build_replacement(name, collection, bounds, polygon_factory, material_name, min_width, width_padding):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    x_min = bounds["x"][0] - width_padding
    x_max = bounds["x"][1] + width_padding
    if x_max - x_min < min_width:
        x_center = midpoint(bounds, "x")
        x_min = x_center - min_width * 0.5
        x_max = x_center + min_width * 0.5

    bm = bmesh.new()
    left_cap, _right_cap = add_extruded_polygon_x(bm, polygon_factory(bounds), x_min, x_max)
    if name.startswith("V116_ProsceniumPearlRevealArray_"):
        add_cap_detail_triangle(bm, left_cap, inward_x_offset=0.01)
    if name.startswith("V116_ProsceniumShadowPocketArray_"):
        add_cap_detail_triangle(bm, left_cap, inward_x_offset=0.006)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj)
    return obj


def main():
    ensure_object_mode()
    collection = resolve_collection()

    bounds_map = {
        legacy_name: locked_bounds(legacy_name, source_bounds(legacy_name, replacement_name))
        for legacy_name, replacement_name in LEGACY_TO_REPLACEMENT.items()
    }

    delete_existing(LEGACY_TO_REPLACEMENT.values())

    build_replacement(
        "V116_ProsceniumPearlRevealArray_L",
        collection,
        bounds_map["V17_ProsceniumPearlReveal_L"],
        pearl_profile,
        PEARL_MATERIAL,
        min_width=0.92,
        width_padding=0.05,
    )
    build_replacement(
        "V116_ProsceniumPearlRevealArray_R",
        collection,
        bounds_map["V17_ProsceniumPearlReveal_R"],
        pearl_profile,
        PEARL_MATERIAL,
        min_width=0.92,
        width_padding=0.05,
    )
    build_replacement(
        "V116_ProsceniumShadowPocketArray_L",
        collection,
        bounds_map["V17_ProsceniumShadowPocket_L"],
        shadow_profile,
        SHADOW_MATERIAL,
        min_width=0.2,
        width_padding=0.02,
    )
    build_replacement(
        "V116_ProsceniumShadowPocketArray_R",
        collection,
        bounds_map["V17_ProsceniumShadowPocket_R"],
        shadow_profile,
        SHADOW_MATERIAL,
        min_width=0.2,
        width_padding=0.02,
    )

    delete_existing(LEGACY_TO_REPLACEMENT.keys())
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
