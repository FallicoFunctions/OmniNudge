from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V99_BasinChannelRelief crown <-> V99_BasinRunwaySpine soffit: layered center reveal, >=0.14m vertical separation
#   V99_BasinRetainingWall_L/R cap <-> V99_BasinParapetRelief_L/R base: >=0.08m Z overlap so the parapets read seated, not floating
#   V99_BasinRetainingWall_L/R outer shoulder <-> V90_BasinStoneCopingArray_L/R span: >=0.20m X overlap to keep the basin edge visually continuous

LEGACY_NAMES = [
    "V4_BasinChannel",
    "V4_BasinRunway",
    "V4_BasinParapet_L",
    "V4_BasinParapet_R",
    "V4_BasinRetain_L",
    "V4_BasinRetain_R",
]
REPLACEMENT_NAMES = [
    "V99_BasinChannelRelief",
    "V99_BasinRunwaySpine",
    "V99_BasinParapetRelief_L",
    "V99_BasinParapetRelief_R",
    "V99_BasinRetainingWall_L",
    "V99_BasinRetainingWall_R",
]

PEARL = "V15_PearlShellBeveled"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V4_BasinChannel")
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


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.02, bevel_segments=2):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


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


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


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


def verify_overlap(bounds_a, bounds_b, axis, minimum, label):
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{label} overlap[{axis.upper()}]={overlap:.3f}")
    if overlap < minimum:
        raise RuntimeError(f"{label} overlap on {axis} below minimum {minimum:.3f}: {overlap:.3f}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def orient_profile(center_x, profile, side_sign):
    oriented = [(center_x + local_x * side_sign, z) for local_x, z in profile]
    if side_sign < 0:
        oriented.reverse()
    return oriented


def add_ring_stack_y(bm, loops):
    rings = []
    for y, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, z in points])

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


def build_loft_object(name, material_name, collection, loops, bevel_width=0.02):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    add_ring_stack_y(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width)
    return obj


def station_series(y_min, y_max, count, pad_start=0.0, pad_end=0.0):
    start = y_min - pad_start
    end = y_max + pad_end
    return [start + (end - start) * index / (count - 1) for index in range(count)]


def channel_profile(half_width, z_bottom, z_top, bulge, crown):
    outer = half_width * (1.0 + 0.04 * bulge)
    shoulder = half_width * (0.82 + 0.05 * bulge)
    neck = half_width * (0.55 + 0.03 * bulge)
    brow = half_width * (0.26 + 0.02 * crown)
    z_low = z_bottom + 0.08
    z_mid = z_bottom + 0.20
    z_shoulder = z_top - 0.08
    z_crown = z_top + 0.06 * crown
    return [
        (-brow, z_crown),
        (-neck, z_top),
        (-shoulder, z_shoulder),
        (-outer, z_mid),
        (-outer * 0.97, z_low),
        (outer * 0.97, z_low),
        (outer, z_mid),
        (shoulder, z_shoulder),
        (neck, z_top),
        (brow, z_crown),
        (brow * 0.42, z_crown + 0.02),
        (-brow * 0.42, z_crown + 0.02),
    ]


def runway_profile(half_width, z_bottom, z_top, flare, crest):
    outer = half_width * (1.0 + 0.08 * flare)
    shoulder = half_width * (0.78 + 0.05 * flare)
    ridge = half_width * (0.34 + 0.04 * crest)
    z_foot = z_bottom + 0.03
    z_mid = z_bottom + 0.18
    z_shoulder = z_top - 0.10
    z_crest = z_top + 0.07 * crest
    return [
        (-ridge * 0.35, z_crest + 0.03),
        (-ridge, z_crest),
        (-shoulder, z_shoulder),
        (-outer, z_mid),
        (-outer * 0.96, z_foot),
        (outer * 0.96, z_foot),
        (outer, z_mid),
        (shoulder, z_shoulder),
        (ridge, z_crest),
        (ridge * 0.35, z_crest + 0.03),
        (ridge * 0.15, z_crest + 0.04),
        (-ridge * 0.15, z_crest + 0.04),
    ]


def parapet_profile(thickness, z_bottom, z_top, flare, crest):
    outer = thickness * (0.74 + 0.04 * flare)
    inner = thickness * (0.46 + 0.02 * flare)
    cap = thickness * (0.18 + 0.02 * crest)
    z_plinth = z_bottom + 0.08
    z_mid = z_bottom + 0.34
    z_cap = z_top - 0.08
    z_crown = z_top + 0.04 * crest
    return [
        (-cap * 0.35, z_crown + 0.04),
        (-cap, z_crown),
        (-inner, z_cap),
        (-outer, z_mid),
        (-outer * 0.95, z_plinth),
        (outer * 0.95, z_plinth),
        (outer, z_mid),
        (inner, z_cap),
        (cap, z_crown),
        (cap * 0.35, z_crown + 0.04),
        (cap * 0.12, z_crown + 0.05),
        (-cap * 0.12, z_crown + 0.05),
    ]


def retaining_profile(thickness, z_bottom, z_top, flare, shoulder):
    outer = thickness * (0.78 + 0.05 * flare)
    waist = thickness * (0.54 + 0.03 * flare)
    neck = thickness * (0.30 + 0.03 * shoulder)
    lip = thickness * (0.12 + 0.02 * shoulder)
    z_base = z_bottom - 0.06
    z_low = z_bottom + 0.26
    z_mid = z_bottom + 0.98
    z_cap = z_top + 0.08
    z_crest = z_top + 0.18 * shoulder
    return [
        (-lip * 0.5, z_crest + 0.04),
        (-lip, z_crest),
        (-neck, z_cap),
        (-waist, z_mid),
        (-outer, z_low),
        (-outer * 0.96, z_base),
        (outer * 0.96, z_base),
        (outer, z_low),
        (waist, z_mid),
        (neck, z_cap),
        (lip, z_crest),
        (lip * 0.5, z_crest + 0.04),
        (lip * 0.16, z_crest + 0.06),
        (-lip * 0.16, z_crest + 0.06),
    ]


def build_channel(bounds):
    half_width = span(bounds, "x") * 0.5
    z_bottom = bounds["z"][0] - 0.08
    z_top = bounds["z"][1] + 0.12
    loops = []
    for index, y in enumerate(station_series(bounds["y"][0], bounds["y"][1], 15, pad_start=0.6, pad_end=1.2)):
        t = index / 14
        bulge = math.cos(t * math.pi * 6.0) * (0.25 + 0.75 * math.sin(t * math.pi) ** 2)
        crown = 0.6 + 0.4 * math.sin(t * math.pi)
        loops.append((y, channel_profile(half_width, z_bottom, z_top, bulge, crown)))
    return loops


def build_runway(bounds):
    half_width = span(bounds, "x") * 0.5 + 0.08
    z_bottom = bounds["z"][0] - 0.06
    z_top = bounds["z"][1] + 0.22
    loops = []
    for index, y in enumerate(station_series(bounds["y"][0], bounds["y"][1], 15, pad_start=0.4, pad_end=0.8)):
        t = index / 14
        flare = math.cos(t * math.pi * 5.0) * (0.18 + 0.62 * math.sin(t * math.pi) ** 2)
        crest = 0.55 + 0.45 * math.sin(t * math.pi)
        loops.append((y, runway_profile(half_width, z_bottom, z_top, flare, crest)))
    return loops


def build_parapet(bounds, side):
    center_x = midpoint(bounds, "x")
    thickness = span(bounds, "x") * 0.5 + 0.18
    z_bottom = bounds["z"][0] - 0.02
    z_top = bounds["z"][1] + 0.10
    side_sign = -1 if side == "L" else 1
    loops = []
    for index, y in enumerate(station_series(bounds["y"][0], bounds["y"][1], 15, pad_start=0.4, pad_end=0.8)):
        t = index / 14
        flare = math.cos(t * math.pi * 7.0) * (0.16 + 0.40 * math.sin(t * math.pi) ** 2)
        crest = 0.4 + 0.6 * math.sin(t * math.pi)
        profile = parapet_profile(thickness, z_bottom, z_top, flare, crest)
        loops.append((y, orient_profile(center_x, profile, side_sign)))
    return loops


def build_retaining_wall(bounds, side):
    center_x = midpoint(bounds, "x")
    thickness = span(bounds, "x") * 0.5 + 0.22
    z_bottom = bounds["z"][0]
    z_top = bounds["z"][1] + 0.06
    side_sign = -1 if side == "L" else 1
    loops = []
    for index, y in enumerate(station_series(bounds["y"][0], bounds["y"][1], 15, pad_start=0.4, pad_end=0.9)):
        t = index / 14
        flare = math.cos(t * math.pi * 5.0) * (0.18 + 0.45 * math.sin(t * math.pi) ** 2)
        shoulder = 0.35 + 0.65 * math.sin(t * math.pi)
        profile = retaining_profile(thickness, z_bottom, z_top, flare, shoulder)
        loops.append((y, orient_profile(center_x, profile, side_sign)))
    return loops


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

channel_bounds = world_bounds("V4_BasinChannel")
runway_bounds = world_bounds("V4_BasinRunway")
parapet_left_bounds = world_bounds("V4_BasinParapet_L")
parapet_right_bounds = world_bounds("V4_BasinParapet_R")
retain_left_bounds = world_bounds("V4_BasinRetain_L")
retain_right_bounds = world_bounds("V4_BasinRetain_R")
coping_left_bounds = world_bounds("V90_BasinStoneCopingArray_L")
coping_right_bounds = world_bounds("V90_BasinStoneCopingArray_R")

build_loft_object("V99_BasinChannelRelief", PEARL, collection, build_channel(channel_bounds), bevel_width=0.018)
build_loft_object("V99_BasinRunwaySpine", PEARL, collection, build_runway(runway_bounds), bevel_width=0.016)
build_loft_object("V99_BasinParapetRelief_L", PEARL, collection, build_parapet(parapet_left_bounds, "L"), bevel_width=0.018)
build_loft_object("V99_BasinParapetRelief_R", PEARL, collection, build_parapet(parapet_right_bounds, "R"), bevel_width=0.018)
build_loft_object("V99_BasinRetainingWall_L", PEARL, collection, build_retaining_wall(retain_left_bounds, "L"), bevel_width=0.02)
build_loft_object("V99_BasinRetainingWall_R", PEARL, collection, build_retaining_wall(retain_right_bounds, "R"), bevel_width=0.02)

channel_replacement = log_bounds("V99_BasinChannelRelief")
runway_replacement = log_bounds("V99_BasinRunwaySpine")
parapet_left_replacement = log_bounds("V99_BasinParapetRelief_L")
parapet_right_replacement = log_bounds("V99_BasinParapetRelief_R")
retain_left_replacement = log_bounds("V99_BasinRetainingWall_L")
retain_right_replacement = log_bounds("V99_BasinRetainingWall_R")

verify_span("V99_BasinChannelRelief", "x", 8.2)
verify_span("V99_BasinChannelRelief", "y", 61.0)
verify_span("V99_BasinChannelRelief", "z", 0.42)
verify_span("V99_BasinRunwaySpine", "x", 2.7)
verify_span("V99_BasinRunwaySpine", "y", 58.0)
verify_span("V99_BasinRunwaySpine", "z", 0.42)
verify_span("V99_BasinParapetRelief_L", "y", 56.0)
verify_span("V99_BasinParapetRelief_R", "y", 56.0)
verify_span("V99_BasinParapetRelief_L", "z", 0.55)
verify_span("V99_BasinParapetRelief_R", "z", 0.55)
verify_span("V99_BasinRetainingWall_L", "y", 56.0)
verify_span("V99_BasinRetainingWall_R", "y", 56.0)
verify_span("V99_BasinRetainingWall_L", "z", 2.0)
verify_span("V99_BasinRetainingWall_R", "z", 2.0)

verify_extent("V99_BasinChannelRelief", "y", minimum=-21.8, maximum=39.8)
verify_extent("V99_BasinRunwaySpine", "y", minimum=-18.8, maximum=38.8)
verify_extent("V99_BasinParapetRelief_L", "y", minimum=-18.8, maximum=36.8)
verify_extent("V99_BasinParapetRelief_R", "y", minimum=-18.8, maximum=36.8)
verify_extent("V99_BasinRetainingWall_L", "y", minimum=-18.8, maximum=36.8)
verify_extent("V99_BasinRetainingWall_R", "y", minimum=-18.8, maximum=36.8)

verify_overlap(retain_left_replacement, coping_left_bounds, "x", 0.20, "left retaining wall <-> left coping")
verify_overlap(retain_right_replacement, coping_right_bounds, "x", 0.20, "right retaining wall <-> right coping")
verify_overlap(parapet_left_replacement, retain_left_replacement, "z", 0.08, "left parapet <-> retaining wall")
verify_overlap(parapet_right_replacement, retain_right_replacement, "z", 0.08, "right parapet <-> retaining wall")

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V99_BASIN_SLAB_REPLACEMENT_COMPLETE replacements=6")
