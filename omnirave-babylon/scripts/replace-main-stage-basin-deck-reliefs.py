from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V120_BasinDeckRelief_L outer shoulders <-> legacy BasinDeck_-1 footprint: >=0.18m X overlap to preserve the existing basin terrace reach
#   V120_BasinDeckRelief_R outer shoulders <-> legacy BasinDeck_1 footprint: >=0.18m X overlap to preserve the existing basin terrace reach
#   V120_BasinDeckRelief_L/R upper crown <-> basin promenade read: >=0.08m Z relief above the legacy slab cap so the decks stop reading as flat cuboids

GROUPS = [
    ("BasinDeck_-1", "V120_BasinDeckRelief_L"),
    ("BasinDeck_1", "V120_BasinDeckRelief_R"),
]
LEGACY_NAMES = [legacy_name for legacy_name, _replacement_name in GROUPS]
REPLACEMENT_NAMES = [replacement_name for _legacy_name, replacement_name in GROUPS]
PEARL = "V14_PolishedMoonstoneShell"
ORIGINAL_BOUNDS = {
    "V120_BasinDeckRelief_L": {
        "x": (-30.639, -5.361),
        "y": (-13.320, 21.320),
        "z": (-0.040, 0.820),
    },
    "V120_BasinDeckRelief_R": {
        "x": (5.361, 30.639),
        "y": (-13.320, 21.320),
        "z": (-0.040, 0.820),
    },
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("BasinDeck_-1")
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
    if replacement_name in ORIGINAL_BOUNDS:
        return ORIGINAL_BOUNDS[replacement_name]
    if bpy.data.objects.get(replacement_name) is not None:
        return world_bounds(replacement_name)
    raise RuntimeError(f"Missing both legacy and replacement deck objects for {replacement_name}")


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


def finalize(obj, bevel_width=0.02, bevel_segments=1):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.7
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate = obj.modifiers.new("OmniRaveTriangulate", "TRIANGULATE")
    triangulate.quad_method = "BEAUTY"
    triangulate.ngon_method = "BEAUTY"
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


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


def apply_planar_uv(obj):
    mesh = obj.data
    uv_layer = mesh.uv_layers.new(name="UVMap")
    xs = [vertex.co.x for vertex in mesh.vertices]
    ys = [vertex.co.y for vertex in mesh.vertices]
    x_min = min(xs)
    y_min = min(ys)
    x_span = max(max(xs) - x_min, 0.001)
    y_span = max(max(ys) - y_min, 0.001)

    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (
                (vertex.co.x - x_min) / x_span,
                (vertex.co.y - y_min) / y_span,
            )


def build_loft_object(name, material_name, collection, loops):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    add_ring_stack_y(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    apply_planar_uv(obj)
    assign_material(obj, material_name)
    finalize(obj)
    return obj


def deck_profile(bounds, flare, crown):
    x_center = midpoint(bounds, "x")
    x_half = span(bounds, "x") * 0.5 + 0.18
    z_floor = bounds["z"][0] - 0.08
    z_base = bounds["z"][0] + 0.03
    z_cap = bounds["z"][1] + 0.06
    z_crown = bounds["z"][1] + 0.23 + crown * 0.08

    outer = x_half * (1.0 + 0.02 * flare)
    shoulder = x_half * (0.88 + 0.03 * flare)
    terrace = x_half * (0.54 + 0.04 * crown)
    crest = x_half * (0.12 + 0.02 * crown)

    return [
        (x_center - crest, z_crown),
        (x_center - terrace, z_cap),
        (x_center - shoulder, z_cap - 0.02),
        (x_center - outer, z_base + 0.05),
        (x_center - outer * 0.98, z_floor),
        (x_center + outer * 0.98, z_floor),
        (x_center + outer, z_base + 0.05),
        (x_center + shoulder, z_cap - 0.02),
        (x_center + terrace, z_cap),
        (x_center + crest, z_crown),
        (x_center + crest * 0.32, z_crown + 0.02),
        (x_center - crest * 0.32, z_crown + 0.02),
    ]


def deck_loops(bounds):
    y_min = bounds["y"][0] - 0.08
    y_max = bounds["y"][1] + 0.08
    y_span = y_max - y_min
    stations = [
        (y_min, 0.64, 0.24),
        (y_min + y_span * 0.18, 0.96, 0.64),
        (midpoint(bounds, "y"), 1.04, 1.18),
        (y_max - y_span * 0.18, 0.94, 0.62),
        (y_max, 0.66, 0.24),
    ]
    return [(y_value, deck_profile(bounds, flare, crown)) for y_value, flare, crown in stations]


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_span(name, axis, minimum):
    bounds = world_bounds(name)
    actual = span(bounds, axis)
    print(f"{name} span[{axis.upper()}]={actual:.3f}")
    if actual < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {actual:.3f}")


def verify_extent(name, axis, minimum=None, maximum=None):
    bounds = world_bounds(name)
    actual_min, actual_max = bounds[axis]
    if minimum is not None:
        print(f"{name} min[{axis.upper()}]={actual_min:.3f}")
        if actual_min > minimum:
            raise RuntimeError(f"{name} minimum on {axis} above {minimum:.3f}: {actual_min:.3f}")
    if maximum is not None:
        print(f"{name} max[{axis.upper()}]={actual_max:.3f}")
        if actual_max < maximum:
            raise RuntimeError(f"{name} maximum on {axis} below {maximum:.3f}: {actual_max:.3f}")


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

    for _legacy_name, replacement_name in GROUPS:
        build_loft_object(replacement_name, PEARL, collection, deck_loops(bounds_map[replacement_name]))

    delete_existing(LEGACY_NAMES)

    left_bounds = log_bounds("V120_BasinDeckRelief_L")
    right_bounds = log_bounds("V120_BasinDeckRelief_R")

    verify_span("V120_BasinDeckRelief_L", "x", 21.2)
    verify_span("V120_BasinDeckRelief_L", "y", 33.0)
    verify_span("V120_BasinDeckRelief_L", "z", 0.56)
    verify_extent("V120_BasinDeckRelief_L", "x", minimum=-28.8, maximum=-7.0)
    verify_extent("V120_BasinDeckRelief_L", "y", minimum=-12.8, maximum=20.8)
    verify_extent("V120_BasinDeckRelief_L", "z", minimum=0.08, maximum=0.61)

    verify_span("V120_BasinDeckRelief_R", "x", 21.2)
    verify_span("V120_BasinDeckRelief_R", "y", 33.0)
    verify_span("V120_BasinDeckRelief_R", "z", 0.56)
    verify_extent("V120_BasinDeckRelief_R", "x", minimum=7.0, maximum=28.8)
    verify_extent("V120_BasinDeckRelief_R", "y", minimum=-12.8, maximum=20.8)
    verify_extent("V120_BasinDeckRelief_R", "z", minimum=0.08, maximum=0.61)

    print(f"deck crown delta={left_bounds['z'][1] - bounds_map['V120_BasinDeckRelief_L']['z'][1]:.3f}")
    print(f"deck crown delta={right_bounds['z'][1] - bounds_map['V120_BasinDeckRelief_R']['z'][1]:.3f}")
    audit_transforms(REPLACEMENT_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
