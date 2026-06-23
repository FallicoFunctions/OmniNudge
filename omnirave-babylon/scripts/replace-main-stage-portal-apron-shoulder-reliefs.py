from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V122_PortalApronRelief outer apron shell <-> legacy V4_PortalApron footprint:
#     preserve >=0.04m X/Z overlap so the stage-front threshold still reaches the original reveal.
#   V122_StageShoulderRelief_L/R outer shell <-> legacy V4_StageShoulderFace_L/R footprint:
#     preserve >=0.04m X/Y/Z overlap so the side shoulders still cover the original stage-face read.
#   V122_PortalApronRelief crown <-> V122_StageShoulderRelief_L/R lower shoulders:
#     keep the same pearl-shell family so the front-stage read stops feeling like three disconnected cuboids.

GROUPS = [
    ("V4_PortalApron", "V122_PortalApronRelief"),
    ("V4_StageShoulderFace_L", "V122_StageShoulderRelief_L"),
    ("V4_StageShoulderFace_R", "V122_StageShoulderRelief_R"),
]
LEGACY_NAMES = [legacy_name for legacy_name, _replacement_name in GROUPS]
REPLACEMENT_NAMES = [replacement_name for _legacy_name, replacement_name in GROUPS]
PEARL = "V15_PearlShellBeveled"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V4_PortalApron")
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


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def capture_bounds(legacy_name, replacement_name):
    if bpy.data.objects.get(legacy_name) is not None:
        return world_bounds(legacy_name)
    if bpy.data.objects.get(replacement_name) is not None:
        return world_bounds(replacement_name)
    raise RuntimeError(f"Missing both legacy and replacement objects for {replacement_name}")


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


def apply_stable_uvs(obj):
    mesh = obj.data
    existing = mesh.uv_layers.get("UVMap")
    if existing is not None:
        mesh.uv_layers.remove(existing)
    uv_layer = mesh.uv_layers.new(name="UVMap")

    extents = {
        "x": span(world_bounds(obj.name), "x"),
        "y": span(world_bounds(obj.name), "y"),
        "z": span(world_bounds(obj.name), "z"),
    }
    uv_axes = [axis for axis, _value in sorted(extents.items(), key=lambda item: item[1], reverse=True)[:2]]
    mins = {axis: min(getattr(vertex.co, axis) for vertex in mesh.vertices) for axis in ("x", "y", "z")}
    spans = {axis: max(max(getattr(vertex.co, axis) for vertex in mesh.vertices) - mins[axis], 0.001) for axis in ("x", "y", "z")}

    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (
                (getattr(vertex.co, uv_axes[0]) - mins[uv_axes[0]]) / spans[uv_axes[0]],
                (getattr(vertex.co, uv_axes[1]) - mins[uv_axes[1]]) / spans[uv_axes[1]],
            )


def finalize(obj, bevel_width=0.02, bevel_segments=2):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate = obj.modifiers.new("OmniRaveTriangulate", "TRIANGULATE")
    triangulate.quad_method = "BEAUTY"
    triangulate.ngon_method = "BEAUTY"
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    apply_stable_uvs(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def add_ring_stack_z(bm, loops):
    rings = []
    for z_value, points in loops:
        rings.append([bm.verts.new((x_value, y_value, z_value)) for x_value, y_value in points])

    for near_ring, far_ring in zip(rings, rings[1:]):
        count = len(near_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    near_ring[index],
                    near_ring[next_index],
                    far_ring[next_index],
                    far_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def add_ring_stack_y(bm, loops):
    rings = []
    for y_value, points in loops:
        rings.append([bm.verts.new((x_value, y_value, z_value)) for x_value, z_value in points])

    for lower_ring, upper_ring in zip(rings, rings[1:]):
        count = len(lower_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    lower_ring[index],
                    lower_ring[next_index],
                    upper_ring[next_index],
                    upper_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def build_loft_object(name, material_name, collection, loops, axis, bevel_width=0.02, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    if axis == "z":
        add_ring_stack_z(bm, loops)
    else:
        add_ring_stack_y(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def portal_apron_profile(bounds, flare, crown):
    x_center = midpoint(bounds, "x")
    x_half = span(bounds, "x") * 0.5
    y_floor = bounds["y"][0] - 0.05
    y_base = bounds["y"][0] + 0.03
    y_mid = midpoint(bounds, "y") + 0.06 + crown * 0.04
    y_cap = bounds["y"][1] + 0.08 + crown * 0.06

    outer = x_half + 0.1 + 0.04 * flare
    shoulder = x_half * (0.82 + 0.05 * crown)
    waist = x_half * 0.5
    crest = x_half * (0.16 + 0.02 * crown)

    return [
        (x_center - crest * 0.42, y_cap + 0.03),
        (x_center - crest, y_cap),
        (x_center - waist, y_mid),
        (x_center - shoulder, y_base + 0.05),
        (x_center - outer, y_base),
        (x_center - outer * 0.96, y_floor),
        (x_center + outer * 0.96, y_floor),
        (x_center + outer, y_base),
        (x_center + shoulder, y_base + 0.05),
        (x_center + waist, y_mid),
        (x_center + crest, y_cap),
        (x_center + crest * 0.42, y_cap + 0.03),
    ]


def portal_apron_loops(bounds):
    z_min = bounds["z"][0] - 0.05
    z_max = bounds["z"][1] + 0.05
    z_span = z_max - z_min
    stations = [
        (z_min, 0.55, 0.12),
        (z_min + z_span * 0.18, 0.86, 0.42),
        (z_min + z_span * 0.38, 1.0, 0.9),
        (midpoint(bounds, "z"), 1.06, 1.0),
        (z_max - z_span * 0.38, 1.0, 0.9),
        (z_max - z_span * 0.18, 0.86, 0.42),
        (z_max, 0.55, 0.12),
    ]
    return [(z_value, portal_apron_profile(bounds, flare, crown)) for z_value, flare, crown in stations]


def shoulder_profile(bounds, flare, crown):
    x_center = midpoint(bounds, "x")
    x_half = span(bounds, "x") * 0.5
    z_floor = bounds["z"][0] - 0.08
    z_base = bounds["z"][0] + 0.11
    z_mid = midpoint(bounds, "z") + 0.18 * flare
    z_cap = bounds["z"][1] + 0.10 + 0.07 * crown
    z_crest = z_cap + 0.1

    outer = x_half + 0.08 + 0.04 * flare
    shoulder = x_half * (0.84 + 0.04 * crown)
    waist = x_half * 0.46
    crest = x_half * (0.18 + 0.02 * crown)

    return [
        (x_center - crest * 0.55, z_crest + 0.02),
        (x_center - crest, z_crest),
        (x_center - waist, z_cap),
        (x_center - shoulder, z_mid),
        (x_center - outer, z_base),
        (x_center - outer * 0.96, z_floor),
        (x_center + outer * 0.96, z_floor),
        (x_center + outer, z_base),
        (x_center + shoulder, z_mid),
        (x_center + waist, z_cap),
        (x_center + crest, z_crest),
        (x_center + crest * 0.55, z_crest + 0.02),
    ]


def shoulder_loops(bounds):
    y_min = bounds["y"][0] - 0.06
    y_max = bounds["y"][1] + 0.06
    y_span = y_max - y_min
    stations = [
        (y_min, 0.58, 0.14),
        (y_min + y_span * 0.18, 0.88, 0.42),
        (y_min + y_span * 0.36, 1.0, 0.86),
        (midpoint(bounds, "y"), 1.06, 1.0),
        (y_max - y_span * 0.36, 1.0, 0.86),
        (y_max - y_span * 0.18, 0.88, 0.42),
        (y_max, 0.58, 0.14),
    ]
    return [(y_value, shoulder_profile(bounds, flare, crown)) for y_value, flare, crown in stations]


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def main():
    ensure_object_mode()
    collection = resolve_collection()
    bounds_map = {
        replacement_name: capture_bounds(legacy_name, replacement_name)
        for legacy_name, replacement_name in GROUPS
    }

    delete_existing(REPLACEMENT_NAMES)

    build_loft_object(
        "V122_PortalApronRelief",
        PEARL,
        collection,
        portal_apron_loops(bounds_map["V122_PortalApronRelief"]),
        axis="z",
        bevel_width=0.018,
        bevel_segments=2,
    )
    build_loft_object(
        "V122_StageShoulderRelief_L",
        PEARL,
        collection,
        shoulder_loops(bounds_map["V122_StageShoulderRelief_L"]),
        axis="y",
        bevel_width=0.02,
        bevel_segments=2,
    )
    build_loft_object(
        "V122_StageShoulderRelief_R",
        PEARL,
        collection,
        shoulder_loops(bounds_map["V122_StageShoulderRelief_R"]),
        axis="y",
        bevel_width=0.02,
        bevel_segments=2,
    )

    delete_existing(LEGACY_NAMES)

    for name in REPLACEMENT_NAMES:
        log_bounds(name)
    audit_transforms(REPLACEMENT_NAMES)

    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
