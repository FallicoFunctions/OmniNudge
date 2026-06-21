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
SHELL_FALLBACKS = {
    "V119_OvalPortalGlowGoldArray_L": "V82_OvalPortalGlowShell_L",
    "V119_OvalPortalGlowGoldArray_R": "V82_OvalPortalGlowShell_R",
    "V119_OvalPortalGlowEmissionArray_L": "V82_OvalPortalGlowShell_L",
    "V119_OvalPortalGlowEmissionArray_R": "V82_OvalPortalGlowShell_R",
}


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


def add_gold_face_relief(mesh, inset_thickness=0.18, inset_depth=0.01):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    relief_faces = [face for face in bm.faces if abs(face.normal.z) > 0.9]
    relief_faces.sort(key=lambda face: face.calc_area(), reverse=True)
    target_faces = relief_faces[:2]
    if not target_faces:
        bm.free()
        return

    bmesh.ops.inset_region(
        bm,
        faces=target_faces,
        thickness=inset_thickness,
        depth=0.0,
        use_even_offset=True,
        use_boundary=True,
    )

    inset_faces = [face for face in bm.faces if abs(face.normal.z) > 0.9]
    inset_faces.sort(key=lambda face: face.calc_area())
    for face in inset_faces[:2]:
        direction = -1.0 if face.normal.z > 0.0 else 1.0
        for vert in face.verts:
            vert.co.z += inset_depth * direction

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()


def add_emission_face_relief(mesh, inset_thicknesses=(0.12, 0.08, 0.05, 0.03, 0.02, 0.015), inset_depth=0.006):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    relief_faces = [face for face in bm.faces if abs(face.normal.z) > 0.9]
    relief_faces.sort(key=lambda face: face.calc_area(), reverse=True)
    target_faces = relief_faces[:2]
    if not target_faces:
        bm.free()
        return

    for thickness in inset_thicknesses:
        result = bmesh.ops.inset_region(
            bm,
            faces=target_faces,
            thickness=thickness,
            depth=0.0,
            use_even_offset=True,
            use_boundary=True,
        )
        target_faces = [face for face in result.get("faces", []) if face.is_valid and abs(face.normal.z) > 0.9]
        target_faces.sort(key=lambda face: face.calc_area())
        target_faces = target_faces[:2]
        if not target_faces:
            break

    for face in target_faces:
        direction = -1.0 if face.normal.z > 0.0 else 1.0
        for vert in face.verts:
            vert.co.z += inset_depth * direction

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()


def finalize(obj, bevel_width, bevel_segments, kind):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.7
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    if kind == "gold":
        add_gold_face_relief(obj.data)
    elif kind == "emission":
        add_emission_face_relief(obj.data)
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
    shell_name = SHELL_FALLBACKS.get(replacement_name)
    if shell_name is not None:
        shell = bpy.data.objects.get(shell_name)
        if shell is not None and shell.type == "MESH" and shell.data.vertices:
            return world_bounds_for_object(shell)

    legacy = bpy.data.objects.get(legacy_name)
    if legacy is not None and legacy.type == "MESH" and legacy.data.vertices:
        return world_bounds_for_object(legacy)

    replacement = bpy.data.objects.get(replacement_name)
    if replacement is not None and replacement.type == "MESH" and replacement.data.vertices:
        return world_bounds_for_object(replacement)

    raise RuntimeError(f"Missing source bounds for {legacy_name} / {replacement_name}")


def fit_overlay_bounds(bounds, kind):
    if kind == "gold":
        return {
            "x": (bounds["x"][0] + 0.34, bounds["x"][1] - 0.34),
            "y": (bounds["y"][0] - 0.02, bounds["y"][1] - 0.18),
            "z": (bounds["z"][0] + 0.44, bounds["z"][1] - 0.92),
        }

    return {
        "x": (bounds["x"][0] + 0.74, bounds["x"][1] - 0.74),
        "y": (bounds["y"][0] - 0.02, bounds["y"][1] - 0.30),
        "z": (bounds["z"][0] + 2.88, bounds["z"][1] - 2.72),
    }


def build_overlay(name, collection, bounds, material_name, bevel_width, bevel_segments, kind):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.scale(
        bm,
        verts=bm.verts,
        vec=(
            span(bounds, "x") * 0.5,
            span(bounds, "y") * 0.5,
            span(bounds, "z") * 0.5,
        ),
    )
    bmesh.ops.translate(
        bm,
        verts=bm.verts,
        vec=(
            midpoint(bounds, "x"),
            midpoint(bounds, "y"),
            midpoint(bounds, "z"),
        ),
    )
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width, bevel_segments, kind)
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
        bounds = fit_overlay_bounds(bounds_map[replacement_name], kind)
        build_overlay(
            replacement_name,
            collection,
            bounds,
            material_name,
            bevel_width=0.05 if kind == "gold" else 0.04,
            bevel_segments=3 if kind == "gold" else 2,
            kind=kind,
        )

    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
