from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V90 coping component wraps its matching V13 basin stone lip footprint with >=0.02m Z overlap
#   each V90 coping component covers the matching V89 fountain pedestal span with >=0.20m X overlap
#   each V90 coping component extends 0.10m beyond the legacy lip on Y to avoid visible seams at the basin edge

LEGACY_NAMES = [*(f"V13_BasinStoneLip_{side}_{index}" for side in ("L", "R") for index in range(3))]
REPLACEMENT_NAMES = ["V90_BasinStoneCopingArray_L", "V90_BasinStoneCopingArray_R"]

PEARL = "V15_PearlShellBeveled"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V13_BasinStoneLip_L_0")
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


def finalize(obj, bevel_width=0.014, bevel_segments=2):
    set_active(obj)
    if bevel_width > 0.0:
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
    verts = [
        (
            vertex.co.x + obj.location.x,
            vertex.co.y + obj.location.y,
            vertex.co.z + obj.location.z,
        )
        for vertex in obj.data.vertices
    ]
    return {
        "x": (min(vertex[0] for vertex in verts), max(vertex[0] for vertex in verts)),
        "y": (min(vertex[1] for vertex in verts), max(vertex[1] for vertex in verts)),
        "z": (min(vertex[2] for vertex in verts), max(vertex[2] for vertex in verts)),
    }


def proxy_bounds(name):
    return world_bounds(name)


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def coping_profile(center_x, center_y, radius_x, radius_y, points=30, phase=0.0):
    profile = []
    for index in range(points):
        angle = 2.0 * math.pi * index / points
        lobe = 1.0 + 0.08 * math.cos(6.0 * angle + phase)
        waist = 1.0 - 0.09 * math.cos(2.0 * angle)
        x = center_x + math.cos(angle) * radius_x * lobe
        y = center_y + math.sin(angle) * radius_y * waist
        profile.append((x, y))
    return profile


def scale_points(points, center_x, center_y, scale_x, scale_y, x_shift=0.0, y_shift=0.0):
    return [
        (
            center_x + (x - center_x) * scale_x + x_shift,
            center_y + (y - center_y) * scale_y + y_shift,
        )
        for x, y in points
    ]


def add_ring_stack_z(bm, loops):
    rings = []
    for z, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, y in points])

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


def build_loft_object(name, material_name, collection, components, bevel_width=0.014, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_ring_stack_z(bm, component)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


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
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{name} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


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


def coping_components(side):
    components = []
    side_shift = -0.9 if side == "L" else 0.9
    for index in range(3):
        bounds = proxy_bounds(f"V13_BasinStoneLip_{side}_{index}")
        center_x = midpoint(bounds, "x") + side_shift
        center_y = midpoint(bounds, "y")
        radius_x = (bounds["x"][1] - bounds["x"][0]) * 0.53
        radius_y = (bounds["y"][1] - bounds["y"][0]) * 0.53
        z_min = bounds["z"][0] - 0.02
        z_max = bounds["z"][1] + 0.04
        z_lower = z_min + 0.05
        z_upper = z_max - 0.04
        z_crown = z_max + 0.06
        phase = 0.16 * index if side == "L" else -0.16 * index
        base = coping_profile(center_x, center_y, radius_x, radius_y, phase=phase)
        components.append(
            [
                (z_min, scale_points(base, center_x, center_y, 1.05, 1.02)),
                (z_lower, scale_points(base, center_x, center_y, 1.02, 1.00)),
                (midpoint({"z": (z_min, z_max)}, "z"), scale_points(base, center_x, center_y, 0.95, 0.96)),
                (z_upper, scale_points(base, center_x, center_y, 0.88, 0.92, y_shift=0.06 if index == 0 else 0.0)),
                (z_crown, scale_points(base, center_x, center_y, 0.74, 0.78, y_shift=0.10 if index == 0 else 0.04)),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_loft_object("V90_BasinStoneCopingArray_L", PEARL, collection, coping_components("L"))
build_loft_object("V90_BasinStoneCopingArray_R", PEARL, collection, coping_components("R"))

left_legacy = proxy_bounds("V13_BasinStoneLip_L_0")
right_legacy = proxy_bounds("V13_BasinStoneLip_R_0")
left_replacement = log_bounds("V90_BasinStoneCopingArray_L")
right_replacement = log_bounds("V90_BasinStoneCopingArray_R")

verify_span("V90_BasinStoneCopingArray_L", "y", 56.0)
verify_span("V90_BasinStoneCopingArray_R", "y", 56.0)
verify_span("V90_BasinStoneCopingArray_L", "x", 16.5)
verify_span("V90_BasinStoneCopingArray_R", "x", 16.5)
verify_overlap(left_replacement, left_legacy, "z", 0.20, "left coping <-> legacy lip")
verify_overlap(right_replacement, right_legacy, "z", 0.20, "right coping <-> legacy lip")
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V90_BASIN_STONE_LIP_REPLACEMENT_COMPLETE replacements=2")
