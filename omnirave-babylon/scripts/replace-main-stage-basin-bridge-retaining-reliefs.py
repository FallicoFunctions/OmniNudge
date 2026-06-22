from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V121_BasinBridgeRelief_North/South/Center outer shoulders <-> legacy V4 bridge spans:
#     preserve at least 0.02m X/Z overlap so the basin promenade keeps the original crossing reach.
#   V121_BasinRetainingRelief_L/R outer face <-> legacy V4 retaining walls:
#     preserve at least 0.04m Z overlap so the basin edge still reads as a continuous enclosure.

GROUPS = [
    ("V4_BridgeNorth", "V121_BasinBridgeRelief_North"),
    ("V4_BridgeSouth", "V121_BasinBridgeRelief_South"),
    ("V4_CenterBridge", "V121_BasinBridgeRelief_Center"),
    ("V4_RetainingWall_L", "V121_BasinRetainingRelief_L"),
    ("V4_RetainingWall_R", "V121_BasinRetainingRelief_R"),
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
    anchor = bpy.data.objects.get("V4_BridgeNorth")
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


def apply_planar_uv(obj):
    mesh = obj.data
    uv_layer = mesh.uv_layers.new(name="UVMap")
    xs = [vertex.co.x for vertex in mesh.vertices]
    zs = [vertex.co.z for vertex in mesh.vertices]
    x_min = min(xs)
    z_min = min(zs)
    x_span = max(max(xs) - x_min, 0.001)
    z_span = max(max(zs) - z_min, 0.001)

    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (
                (vertex.co.x - x_min) / x_span,
                (vertex.co.z - z_min) / z_span,
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


def build_loft_object(name, material_name, collection, loops, bevel_width=0.02, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    add_ring_stack_z(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    apply_planar_uv(obj)
    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def bridge_profile(bounds, flare, crown):
    x_center = midpoint(bounds, "x")
    x_half = span(bounds, "x") * 0.5
    y_floor = bounds["y"][0] - 0.02
    y_base = bounds["y"][0] + 0.04
    y_shoulder = bounds["y"][0] + 0.12 + 0.03 * flare
    y_cap = bounds["y"][1] + 0.02 + 0.03 * crown
    y_crown = y_cap + 0.05 + 0.04 * crown

    outer = x_half + 0.06 + 0.06 * flare
    shoulder = x_half * (0.86 + 0.04 * crown)
    waist = x_half * 0.52
    crest = x_half * (0.16 + 0.02 * crown)

    return [
        (x_center - crest * 0.5, y_crown + 0.02),
        (x_center - crest, y_crown),
        (x_center - waist, y_cap),
        (x_center - shoulder, y_shoulder),
        (x_center - outer, y_base),
        (x_center - outer * 0.96, y_floor),
        (x_center + outer * 0.96, y_floor),
        (x_center + outer, y_base),
        (x_center + shoulder, y_shoulder),
        (x_center + waist, y_cap),
        (x_center + crest, y_crown),
        (x_center + crest * 0.5, y_crown + 0.02),
    ]


def bridge_loops(bounds):
    z_min = bounds["z"][0] - 0.04
    z_max = bounds["z"][1] + 0.04
    z_span = z_max - z_min
    stations = [
        (z_min, 0.58, 0.12),
        (z_min + z_span * 0.18, 0.86, 0.38),
        (z_min + z_span * 0.38, 1.0, 0.9),
        (midpoint(bounds, "z"), 1.06, 1.0),
        (z_max - z_span * 0.38, 1.0, 0.9),
        (z_max - z_span * 0.18, 0.86, 0.38),
        (z_max, 0.58, 0.12),
    ]
    return [(z_value, bridge_profile(bounds, flare, crown)) for z_value, flare, crown in stations]


def retaining_profile(bounds, side_sign, flare, crown):
    x_face = bounds["x"][1] if side_sign < 0 else bounds["x"][0]
    x_back = bounds["x"][0] if side_sign < 0 else bounds["x"][1]
    x_outer = x_face + side_sign * (0.1 + 0.05 * flare)
    x_shoulder = x_face - side_sign * 0.18
    x_core = midpoint(bounds, "x")
    x_inner = x_back - side_sign * 0.05
    y_floor = bounds["y"][0] - 0.04
    y_base = bounds["y"][0] + 0.18
    y_waist = midpoint(bounds, "y") + 0.08 * flare
    y_cap = bounds["y"][1] + 0.04 + 0.06 * crown
    y_crest = y_cap + 0.08

    return [
        (x_outer, y_floor),
        (x_outer, y_base),
        (x_shoulder, y_waist),
        (x_core, y_cap),
        (x_inner, y_crest),
        (x_back, y_floor),
    ]


def retaining_loops(bounds, side_sign):
    z_min = bounds["z"][0] - 0.05
    z_max = bounds["z"][1] + 0.05
    z_span = z_max - z_min
    stations = [
        (z_min, 0.6, 0.1),
        (z_min + z_span * 0.15, 0.9, 0.35),
        (z_min + z_span * 0.35, 1.0, 0.9),
        (midpoint(bounds, "z"), 1.05, 1.0),
        (z_max - z_span * 0.35, 1.0, 0.9),
        (z_max - z_span * 0.15, 0.9, 0.35),
        (z_max, 0.6, 0.1),
    ]
    return [(z_value, retaining_profile(bounds, side_sign, flare, crown)) for z_value, flare, crown in stations]


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

    bridge_names = {
        "V121_BasinBridgeRelief_North",
        "V121_BasinBridgeRelief_South",
        "V121_BasinBridgeRelief_Center",
    }

    for legacy_name, replacement_name in GROUPS:
        bounds = bounds_map[replacement_name]
        if replacement_name in bridge_names:
            build_loft_object(replacement_name, PEARL, collection, bridge_loops(bounds))
        else:
            side_sign = -1 if replacement_name.endswith("_L") else 1
            build_loft_object(
                replacement_name,
                PEARL,
                collection,
                retaining_loops(bounds, side_sign),
                bevel_width=0.018,
                bevel_segments=2,
            )

    delete_existing(LEGACY_NAMES)

    for name in REPLACEMENT_NAMES:
        log_bounds(name)
    audit_transforms(REPLACEMENT_NAMES)

    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
