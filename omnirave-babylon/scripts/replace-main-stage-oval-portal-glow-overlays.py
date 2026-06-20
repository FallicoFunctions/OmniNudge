from __future__ import annotations

import bmesh
import bpy


GROUPS = [
    ("V82_OvalPortalGlowGoldTrim_L", "V119_OvalPortalGlowGoldArray_L", "V14_BurnishedCelestialGold", "gold"),
    ("V82_OvalPortalGlowGoldTrim_R", "V119_OvalPortalGlowGoldArray_R", "V14_BurnishedCelestialGold", "gold"),
    ("V82_OvalPortalGlowEmissionPanel_L", "V119_OvalPortalGlowEmissionArray_L", "V14_CosmicScreenEmission", "emission"),
    ("V82_OvalPortalGlowEmissionPanel_R", "V119_OvalPortalGlowEmissionArray_R", "V14_CosmicScreenEmission", "emission"),
]

LEGACY_NAMES = [legacy for legacy, _replacement, _material, _kind in GROUPS]
REPLACEMENT_NAMES = [replacement for _legacy, replacement, _material, _kind in GROUPS]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*REPLACEMENT_NAMES, *LEGACY_NAMES, "V82_OvalPortalGlowShell_L"]:
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


def source_bounds(legacy_name, replacement_name):
    legacy = bpy.data.objects.get(legacy_name)
    if legacy is not None and legacy.type == "MESH" and legacy.data.vertices:
        return world_bounds_for_object(legacy)

    replacement = bpy.data.objects.get(replacement_name)
    if replacement is not None and replacement.type == "MESH" and replacement.data.vertices:
        return world_bounds_for_object(replacement)

    raise RuntimeError(f"Missing source bounds for {legacy_name} / {replacement_name}")


def add_extruded_polygon_x(bm, polygon, x_min, x_max):
    left = [bm.verts.new((x_min, y_value, z_value)) for y_value, z_value in polygon]
    right = [bm.verts.new((x_max, y_value, z_value)) for y_value, z_value in polygon]
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    count = len(polygon)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([left[index], left[next_index], right[next_index], right[index]])


def gold_profile(bounds):
    y_center = midpoint(bounds, "y")
    z_center = midpoint(bounds, "z")
    y_half = span(bounds, "y") * 0.5 + 0.14
    z_half = span(bounds, "z") * 0.5 + 0.08
    return [
        (y_center - y_half, z_center - z_half * 0.94),
        (y_center - y_half * 0.9, z_center - z_half * 0.56),
        (y_center - y_half * 0.84, z_center - z_half * 0.2),
        (y_center - y_half * 0.82, z_center + z_half * 0.18),
        (y_center - y_half * 0.72, z_center + z_half * 0.5),
        (y_center - y_half * 0.48, z_center + z_half * 0.8),
        (y_center - y_half * 0.14, z_center + z_half),
        (y_center + y_half * 0.18, z_center + z_half * 0.92),
        (y_center + y_half * 0.5, z_center + z_half * 0.72),
        (y_center + y_half * 0.76, z_center + z_half * 0.42),
        (y_center + y_half * 0.9, z_center + z_half * 0.06),
        (y_center + y_half, z_center - z_half * 0.34),
        (y_center + y_half * 0.86, z_center - z_half * 0.72),
        (y_center + y_half * 0.54, z_center - z_half),
        (y_center + y_half * 0.12, z_center - z_half * 0.86),
        (y_center - y_half * 0.24, z_center - z_half * 0.7),
        (y_center - y_half * 0.56, z_center - z_half * 0.84),
        (y_center - y_half * 0.82, z_center - z_half),
    ]


def emission_profile(bounds):
    y_center = midpoint(bounds, "y")
    z_center = midpoint(bounds, "z")
    y_half = span(bounds, "y") * 0.5 + 0.1
    z_half = span(bounds, "z") * 0.5 + 0.08
    return [
        (y_center - y_half, z_center - z_half * 0.46),
        (y_center - y_half * 0.78, z_center - z_half * 0.9),
        (y_center - y_half * 0.42, z_center - z_half),
        (y_center - y_half * 0.08, z_center - z_half * 0.82),
        (y_center + y_half * 0.22, z_center - z_half * 0.52),
        (y_center + y_half * 0.56, z_center - z_half * 0.12),
        (y_center + y_half * 0.88, z_center + z_half * 0.16),
        (y_center + y_half, z_center + z_half * 0.62),
        (y_center + y_half * 0.7, z_center + z_half),
        (y_center + y_half * 0.28, z_center + z_half * 0.92),
        (y_center - y_half * 0.12, z_center + z_half * 0.68),
        (y_center - y_half * 0.48, z_center + z_half * 0.9),
        (y_center - y_half * 0.82, z_center + z_half * 0.46),
        (y_center - y_half * 0.94, z_center),
    ]


def build_overlay(name, collection, bounds, polygon, material_name, min_width, width_padding):
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
    add_extruded_polygon_x(bm, polygon, x_min, x_max)
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
        replacement_name: source_bounds(legacy_name, replacement_name)
        for legacy_name, replacement_name, _material_name, _kind in GROUPS
    }

    delete_existing(REPLACEMENT_NAMES)

    for legacy_name, replacement_name, material_name, kind in GROUPS:
        bounds = bounds_map[replacement_name]
        polygon = gold_profile(bounds) if kind == "gold" else emission_profile(bounds)
        build_overlay(
            replacement_name,
            collection,
            bounds,
            polygon,
            material_name,
            min_width=max(span(bounds, "x") + 0.04, 0.56),
            width_padding=0.02,
        )

    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
