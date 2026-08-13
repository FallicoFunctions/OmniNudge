from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V98 relief shell fully covers its matching V9 carved-face footprint with >=0.05m Y overshoot
#   each V98 gold inlay stays nested inside the relief shell with >=0.02m Y inset
#   each side preserves the original crown buttress X/Z silhouette zone while adding layered depth

LEGACY_NAMES = [
    "V9_CrownButtressCarvedFace_L",
    "V9_CrownButtressCarvedFace_R",
    "V9_CrownButtressGoldLine_L",
    "V9_CrownButtressGoldLine_R",
]

REPLACEMENT_NAMES = [
    "V98_CrownButtressRelief_L",
    "V98_CrownButtressRelief_R",
    "V98_CrownButtressGoldInlay_L",
    "V98_CrownButtressGoldInlay_R",
]

PEARL = "V15_PearlShellBeveled"
GOLD = "V14_BurnishedCelestialGold"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V9_CrownButtressCarvedFace_L")
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


def hide_legacy(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        obj.hide_render = True
        obj.hide_viewport = True


def proxy_bounds(name):
    obj = bpy.data.objects[name]
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
        "x": (obj.location.x - half_x, obj.location.x + half_x),
        "y": (obj.location.y - half_y, obj.location.y + half_y),
        "z": (obj.location.z - half_z, obj.location.z + half_z),
    }


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def add_loft_stack_y(bm, loops):
    rings = []
    for y_value, points in loops:
        rings.append([bm.verts.new((x, y_value, z)) for x, z in points])

    for left_ring, right_ring in zip(rings, rings[1:]):
        count = len(left_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    left_ring[index],
                    left_ring[next_index],
                    right_ring[next_index],
                    right_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def auto_uv_project(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, bevel_width=0.028, bevel_segments=1):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_mesh_object(name, material_name, collection, build_fn, *, bevel_width=0.028, bevel_segments=1):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    build_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def crown_spec(side):
    relief = proxy_bounds(f"V9_CrownButtressCarvedFace_{side}")
    gold = proxy_bounds(f"V9_CrownButtressGoldLine_{side}")
    center_x = midpoint(relief, "x")
    center_z = midpoint(relief, "z")
    half_width = (relief["x"][1] - relief["x"][0]) * 0.5
    half_height = (relief["z"][1] - relief["z"][0]) * 0.5
    return {
        "side": side,
        "sign": -1.0 if side == "L" else 1.0,
        "center_x": center_x,
        "center_z": center_z,
        "relief": relief,
        "gold": gold,
        "half_width": half_width,
        "half_height": half_height,
        "outer_width": half_width + 0.18,
        "inner_width": half_width + 0.34,
        "gold_outer_width": (gold["x"][1] - gold["x"][0]) * 0.5 + 0.08,
        "gold_inner_width": (gold["x"][1] - gold["x"][0]) * 0.5 + 0.20,
        "relief_y0": relief["y"][0] - 0.10,
        "relief_y1": relief["y"][1] + 0.14,
        "gold_y0": gold["y"][0] - 0.12,
        "gold_y1": gold["y"][1] - 0.10,
        "z0": relief["z"][0] - 0.10,
        "z1": relief["z"][1] + 0.10,
        "gold_z0": gold["z"][0] - 0.08,
        "gold_z1": gold["z"][1] + 0.08,
    }


def crown_profile(spec, *, outer_scale=1.0, inner_scale=1.0, z_expand=0.0):
    sign = spec["sign"]
    cx = spec["center_x"]
    cz = spec["center_z"]
    z0 = spec["z0"] - z_expand
    z1 = spec["z1"] + z_expand
    height = z1 - z0
    outer = spec["outer_width"] * outer_scale
    inner = spec["inner_width"] * inner_scale

    outer_points = [
        (outer * 0.64, z0),
        (outer * 0.78, z0 + height * 0.08),
        (outer * 0.94, z0 + height * 0.20),
        (outer * 1.02, z0 + height * 0.34),
        (outer * 0.86, z0 + height * 0.60),
        (outer * 0.92, z0 + height * 0.74),
        (outer * 0.74, z0 + height * 0.88),
        (outer * 0.50, z1),
    ]
    inner_points = [
        (-inner * 0.40, z1),
        (-inner * 0.18, z0 + height * 0.88),
        (-inner * 0.08, z0 + height * 0.74),
        (-inner * 0.20, z0 + height * 0.60),
        (-inner * 0.26, z0 + height * 0.34),
        (-inner * 0.10, z0 + height * 0.20),
        (-inner * 0.20, z0 + height * 0.08),
        (-inner * 0.32, z0),
    ]

    points = []
    for local_x, z_value in outer_points:
        points.append((cx + sign * local_x, z_value))
    for local_x, z_value in inner_points:
        points.append((cx + sign * local_x, z_value))
    return points


def gold_profile(spec, *, outer_scale=1.0, inner_scale=1.0, z_shift=0.0):
    sign = spec["sign"]
    cx = midpoint(spec["gold"], "x")
    z0 = spec["gold_z0"] + z_shift
    z1 = spec["gold_z1"] + z_shift
    height = z1 - z0
    outer = spec["gold_outer_width"] * outer_scale
    inner = spec["gold_inner_width"] * inner_scale

    outer_points = [
        (outer * 0.28, z0),
        (outer * 0.56, z0 + height * 0.12),
        (outer * 0.82, z0 + height * 0.26),
        (outer * 0.96, z0 + height * 0.40),
        (outer * 0.92, z0 + height * 0.72),
        (outer * 0.58, z0 + height * 0.86),
        (outer * 0.24, z1),
    ]
    inner_points = [
        (-inner * 0.18, z1),
        (-inner * 0.05, z0 + height * 0.86),
        (-inner * 0.12, z0 + height * 0.72),
        (-inner * 0.16, z0 + height * 0.40),
        (-inner * 0.06, z0 + height * 0.26),
        (-inner * 0.14, z0 + height * 0.12),
        (-inner * 0.24, z0),
    ]

    points = []
    for local_x, z_value in outer_points:
        points.append((cx + sign * local_x, z_value))
    for local_x, z_value in inner_points:
        points.append((cx + sign * local_x, z_value))
    return points


def build_relief(side):
    spec = crown_spec(side)
    loops = [
        (spec["relief_y0"], crown_profile(spec, outer_scale=0.92, inner_scale=0.90)),
        (spec["relief_y0"] + 0.08, crown_profile(spec, outer_scale=0.98, inner_scale=0.94, z_expand=0.05)),
        (midpoint(spec["relief"], "y"), crown_profile(spec, outer_scale=1.06, inner_scale=1.02, z_expand=0.10)),
        (spec["relief_y1"], crown_profile(spec, outer_scale=0.92, inner_scale=0.90)),
    ]

    def _build(bm):
        add_loft_stack_y(bm, loops)

    return _build


def build_gold(side):
    spec = crown_spec(side)
    loops = [
        (spec["gold_y0"], gold_profile(spec, outer_scale=0.96, inner_scale=0.92)),
        (spec["gold_y0"] + 0.05, gold_profile(spec, outer_scale=1.00, inner_scale=0.96, z_shift=0.03)),
        (midpoint(spec["gold"], "y"), gold_profile(spec, outer_scale=1.08, inner_scale=1.02, z_shift=0.06)),
        (spec["gold_y1"], gold_profile(spec, outer_scale=0.96, inner_scale=0.92)),
    ]

    def _build(bm):
        add_loft_stack_y(bm, loops)

    return _build


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )


def verify_span(name, axis, minimum):
    bounds = world_bounds(name)
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{name} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


def verify_nested(inner_name, outer_name, axis, minimum_gap):
    inner = world_bounds(inner_name)
    outer = world_bounds(outer_name)
    lower_gap = inner[axis][0] - outer[axis][0]
    upper_gap = outer[axis][1] - inner[axis][1]
    print(f"{inner_name} nested in {outer_name} on {axis.upper()}: lower={lower_gap:.3f} upper={upper_gap:.3f}")
    if lower_gap < minimum_gap or upper_gap < minimum_gap:
        raise RuntimeError(f"{inner_name} is not nested inside {outer_name} on {axis}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_mesh_object("V98_CrownButtressRelief_L", PEARL, collection, build_relief("L"), bevel_width=0.026)
build_mesh_object("V98_CrownButtressRelief_R", PEARL, collection, build_relief("R"), bevel_width=0.026)
build_mesh_object("V98_CrownButtressGoldInlay_L", GOLD, collection, build_gold("L"), bevel_width=0.014)
build_mesh_object("V98_CrownButtressGoldInlay_R", GOLD, collection, build_gold("R"), bevel_width=0.014)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_span("V98_CrownButtressRelief_L", "z", 24.5)
verify_span("V98_CrownButtressRelief_R", "z", 24.5)
verify_span("V98_CrownButtressGoldInlay_L", "z", 23.0)
verify_span("V98_CrownButtressGoldInlay_R", "z", 23.0)

verify_nested("V98_CrownButtressGoldInlay_L", "V98_CrownButtressRelief_L", "y", 0.02)
verify_nested("V98_CrownButtressGoldInlay_R", "V98_CrownButtressRelief_R", "y", 0.02)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
