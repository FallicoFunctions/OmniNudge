from __future__ import annotations

import math

import bmesh
import bpy


REPLACEMENT_NAMES = [
    "V133_VipTerraceGoldArray_L",
    "V133_VipTerraceGoldArray_R",
    "V133_WingTerraceGoldArray_L",
    "V133_WingTerraceGoldArray_R",
]
GOLD = "V20_ChasedGoldFiligree"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V30_VipShellFascia_L")
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


def apply_planar_uv(obj, axes):
    mesh = obj.data
    uv_layer = mesh.uv_layers.new(name="UVMap")
    mins = {
        axis: min(getattr(vertex.co, axis) for vertex in mesh.vertices)
        for axis in ("x", "y", "z")
    }
    spans = {
        axis: max(max(getattr(vertex.co, axis) for vertex in mesh.vertices) - mins[axis], 0.001)
        for axis in ("x", "y", "z")
    }

    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (
                (getattr(vertex.co, axes[0]) - mins[axes[0]]) / spans[axes[0]],
                (getattr(vertex.co, axes[1]) - mins[axes[1]]) / spans[axes[1]],
            )


def finalize(obj, uv_axes):
    set_active(obj)
    triangulate = obj.modifiers.new("OmniRaveTriangulate", "TRIANGULATE")
    triangulate.quad_method = "BEAUTY"
    triangulate.ngon_method = "BEAUTY"
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    apply_planar_uv(obj, uv_axes)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def add_ring_stack_y(bm, loops, cap_start=True, cap_end=True):
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

    if cap_start:
        bm.faces.new(list(reversed(rings[0])))
    if cap_end:
        bm.faces.new(rings[-1])


def add_ring_stack_x(bm, loops, cap_start=True, cap_end=True):
    rings = []
    for x_value, points in loops:
        rings.append([bm.verts.new((x_value, y_value, z_value)) for y_value, z_value in points])

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

    if cap_start:
        bm.faces.new(list(reversed(rings[0])))
    if cap_end:
        bm.faces.new(rings[-1])

def build_loft_object(name, material_name, collection, components, axis, uv_axes):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        loops = component["loops"] if isinstance(component, dict) else component
        cap_start = component.get("cap_start", True) if isinstance(component, dict) else True
        cap_end = component.get("cap_end", True) if isinstance(component, dict) else True
        if axis == "x":
            add_ring_stack_x(bm, loops, cap_start=cap_start, cap_end=cap_end)
        else:
            add_ring_stack_y(bm, loops, cap_start=cap_start, cap_end=cap_end)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, uv_axes)
    return obj


def duplicate_linked_object(name, collection, source_obj, x_offset):
    obj = bpy.data.objects.new(name, source_obj.data)
    obj.location = (x_offset, 0.0, 0.0)
    collection.objects.link(obj)
    return obj


def segmented_ranges(minimum, maximum, count, margin, gap):
    usable = (maximum - minimum) - margin * 2.0 - gap * (count - 1)
    section = usable / count
    cursor = minimum + margin
    ranges = []
    for _ in range(count):
        ranges.append((cursor, cursor + section))
        cursor += section + gap
    return ranges


def vip_profile(bounds, inset, lift, thickness):
    x_min = bounds["x"][0] + inset
    x_max = bounds["x"][1] - inset
    z_base = bounds["z"][0] + 1.18 + lift
    z_peak = bounds["z"][1] - 0.42 + lift
    count = 7
    top = []
    for index in range(count):
        t = index / (count - 1)
        x_value = x_min + (x_max - x_min) * t
        arch = math.sin(t * math.pi)
        z_value = z_base + (z_peak - z_base) * (0.32 + 0.68 * arch)
        top.append((x_value, z_value))

    bottom = [(x_value, z_value - thickness) for x_value, z_value in reversed(top)]
    return top + bottom


def vip_components(source_name):
    bounds = world_bounds(source_name)
    ranges = segmented_ranges(bounds["y"][0], bounds["y"][1], count=5, margin=2.1, gap=1.35)
    components = []
    for index, (start, end) in enumerate(ranges):
        inset = 1.0 + 0.08 * index
        lift = 0.02 * (index % 2)
        profile = vip_profile(bounds, inset=inset, lift=lift, thickness=0.13)
        components.append(
            {
                "loops": [
                    (start, profile),
                    (end, profile),
                ],
            }
        )
    return components


def wing_profile(bounds, inset, lift, thickness):
    y_min = bounds["y"][0] + inset
    y_max = bounds["y"][1] - inset
    z_base = bounds["z"][0] + 0.72 + lift
    z_peak = bounds["z"][1] - 0.32 + lift
    count = 7
    top = []
    for index in range(count):
        t = index / (count - 1)
        y_value = y_min + (y_max - y_min) * t
        arch = math.sin(t * math.pi)
        z_value = z_base + (z_peak - z_base) * (0.24 + 0.76 * arch)
        top.append((y_value, z_value))

    bottom = [(y_value, z_value - thickness) for y_value, z_value in reversed(top)]
    return top + bottom


def wing_components(source_name):
    bounds = world_bounds(source_name)
    ranges = segmented_ranges(bounds["x"][0], bounds["x"][1], count=6, margin=1.3, gap=1.1)
    components = []
    for index, (start, end) in enumerate(ranges):
        inset = 0.52 + 0.04 * (index % 3)
        lift = 0.015 * (index % 2)
        profile = wing_profile(bounds, inset=inset, lift=lift, thickness=0.12)
        components.append(
            {
                "loops": [
                    (start, profile),
                    (end, profile),
                ],
            }
        )
    return components


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )


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
    delete_existing(REPLACEMENT_NAMES)

    vip_left_source_bounds = world_bounds("V30_VipShellFascia_L")
    vip_right_source_bounds = world_bounds("V30_VipShellFascia_R")
    wing_left_source_bounds = world_bounds("V30_WingTerraceFascia_L")
    wing_right_source_bounds = world_bounds("V30_WingTerraceFascia_R")

    vip_left = build_loft_object(
        "V133_VipTerraceGoldArray_L",
        GOLD,
        collection,
        vip_components("V30_VipShellFascia_L"),
        axis="y",
        uv_axes=("x", "y"),
    )
    duplicate_linked_object(
        "V133_VipTerraceGoldArray_R",
        collection,
        vip_left,
        midpoint(vip_right_source_bounds, "x") - midpoint(vip_left_source_bounds, "x"),
    )
    wing_left = build_loft_object(
        "V133_WingTerraceGoldArray_L",
        GOLD,
        collection,
        wing_components("V30_WingTerraceFascia_L"),
        axis="x",
        uv_axes=("x", "y"),
    )
    duplicate_linked_object(
        "V133_WingTerraceGoldArray_R",
        collection,
        wing_left,
        midpoint(wing_right_source_bounds, "x") - midpoint(wing_left_source_bounds, "x"),
    )

    for name in REPLACEMENT_NAMES:
        log_bounds(name)
    audit_transforms(REPLACEMENT_NAMES)
    bpy.ops.wm.save_mainfile()
    print("V133_TERRACE_RELIEF_ARRAYS_COMPLETE replacements=4")


main()
