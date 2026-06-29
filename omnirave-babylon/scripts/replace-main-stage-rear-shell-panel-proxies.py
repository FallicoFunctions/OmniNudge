from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V111_RearShellPanelArray_L pearl crowns <-> V105_RearShellGoldSeamArray_L:
#     overlap >= 0.005m on Y so the existing gold seams stay stitched into the new shell face.
#   V111_RearShellPanelArray_L recessed shoulders <-> V106_RearShellShadowRevealArray_L:
#     overlap >= 0.005m on Y so the shadow reveal still reads carved into the pearl panel body.
#   V111_RearShellPanelArray_R pearl crowns <-> V105_RearShellGoldSeamArray_R:
#     overlap >= 0.005m on Y with mirrored shell depth and the same stepped rear-shell cadence.
#   V111_RearShellPanelArray_R recessed shoulders <-> V106_RearShellShadowRevealArray_R:
#     overlap >= 0.005m on Y so the mirrored panel set remains tucked behind the reveal bars.
#   Each four-piece side array preserves the rear-shell station spacing while replacing the flat slab silhouettes.

LEGACY_NAMES = [
    "V20_RearShellPanel_L_0",
    "V20_RearShellPanel_L_1",
    "V20_RearShellPanel_L_2",
    "V20_RearShellPanel_L_3",
    "V20_RearShellPanel_R_0",
    "V20_RearShellPanel_R_1",
    "V20_RearShellPanel_R_2",
    "V20_RearShellPanel_R_3",
]
REPLACEMENT_NAMES = [
    "V111_RearShellPanelArray_L",
    "V111_RearShellPanelArray_R",
]

ORIGINAL_COMPONENTS = {
    "L": [
        {"x": (-19.05, -14.95), "y": (-12.12, -11.96), "z": (5.8, 16.2)},
        {"x": (-24.55, -20.45), "y": (-12.12, -11.96), "z": (5.7, 14.7)},
        {"x": (-30.05, -25.95), "y": (-12.12, -11.96), "z": (5.5, 13.1)},
        {"x": (-35.25, -31.15), "y": (-12.12, -11.96), "z": (5.6, 11.6)},
    ],
    "R": [
        {"x": (14.95, 19.05), "y": (-12.12, -11.96), "z": (5.8, 16.2)},
        {"x": (20.45, 24.55), "y": (-12.12, -11.96), "z": (5.7, 14.7)},
        {"x": (25.95, 30.05), "y": (-12.12, -11.96), "z": (5.5, 13.1)},
        {"x": (31.15, 35.25), "y": (-12.12, -11.96), "z": (5.6, 11.6)},
    ],
}

PEARL = "V20_LayeredPearlShell"
STATION_COUNT = 6


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*LEGACY_NAMES, *REPLACEMENT_NAMES]:
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


def auto_uv_project(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(70.0), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj):
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def world_bounds_for_object(obj):
    if obj.type != "MESH" or not obj.data.vertices:
        raise RuntimeError(f"Missing mesh vertices: {obj.name}")
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


def valid_component(bounds):
    return midpoint(bounds, "y") < -11.7 and span(bounds, "y") < 0.5 and span(bounds, "z") > 4.0


def source_component_groups():
    groups = {"L": [], "R": []}
    for name in LEGACY_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        bounds = world_bounds_for_object(obj)
        if not valid_component(bounds):
            continue
        side = "L" if midpoint(bounds, "x") < 0.0 else "R"
        groups[side].append(bounds)

    for side in ["L", "R"]:
        groups[side].sort(key=lambda bounds: midpoint(bounds, "x"), reverse=(side == "L"))
        if len(groups[side]) != 4:
            groups[side] = [dict(component) for component in ORIGINAL_COMPONENTS[side]]
    return groups


def station_series(x_min, x_max, count):
    return [x_min + (x_max - x_min) * index / (count - 1) for index in range(count)]


def panel_profile(bounds, station_t, edge_pull):
    y_min, y_max = bounds["y"]
    z_min, z_max = bounds["z"]
    center_y = midpoint(bounds, "y")
    depth = span(bounds, "y")
    height = span(bounds, "z")
    arch = math.sin(station_t * math.pi)

    back_y = y_min - 0.13 - arch * 0.02
    inner_y = center_y - depth * 0.24 - arch * 0.014
    seam_y = y_min + depth * 0.12
    shoulder_y = y_max + 0.09 + arch * 0.028
    face_y = y_max + 0.145 + arch * 0.038
    lip_y = y_max + 0.09

    base_z = z_min - 0.09 + edge_pull * 0.05
    knee_z = z_min + height * (0.20 - edge_pull * 0.02)
    waist_z = z_min + height * (0.46 + arch * 0.03)
    shoulder_z = z_min + height * (0.72 + arch * 0.02)
    crown_z = z_max + 0.10 + arch * 0.05 - edge_pull * 0.03
    lip_z = z_max + 0.04

    return [
        (back_y, base_z),
        (back_y - 0.02, knee_z),
        (inner_y, waist_z),
        (seam_y, shoulder_z),
        (shoulder_y, crown_z),
        (face_y, lip_z),
        (lip_y, z_min + height * 0.26),
        (center_y, base_z + 0.05),
    ]


def panel_component_loops(bounds):
    x_center = midpoint(bounds, "x")
    half_width = span(bounds, "x") * 0.5 + 0.14
    x_min = x_center - half_width
    x_max = x_center + half_width
    stations = station_series(x_min, x_max, STATION_COUNT)

    loops = []
    for station_index, station_x in enumerate(stations):
        t = station_index / (len(stations) - 1)
        edge_pull = abs(0.5 - t) * 2.0
        profile = []
        for y_value, z_value in panel_profile(bounds, t, edge_pull):
            profile.append(
                (
                    y_value - edge_pull * 0.025,
                    z_value - edge_pull * 0.06,
                )
            )
        loops.append((station_x, profile))
    return loops


def add_ring_stack_x(bm, loops):
    rings = []
    for x_value, points in loops:
        rings.append([bm.verts.new((x_value, y_value, z_value)) for y_value, z_value in points])

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
    return rings[0], rings[-1]


def add_cap_detail_triangle(bm, cap_verts, inward_x_offset):
    start_index = len(cap_verts) // 2 - 1
    edge_start = cap_verts[start_index]
    edge_end = cap_verts[start_index + 1]
    detail_vert = bm.verts.new(
        (
            edge_start.co.x + inward_x_offset,
            (edge_start.co.y + edge_end.co.y) * 0.5,
            (edge_start.co.z + edge_end.co.z) * 0.5 + 0.03,
        )
    )
    bm.faces.new([edge_start, edge_end, detail_vert])


def build_array(name, side, collection):
    components = source_component_groups()[side]
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in components:
        left_cap, right_cap = add_ring_stack_x(bm, panel_component_loops(bounds))
        add_cap_detail_triangle(bm, left_cap, inward_x_offset=0.02)
        add_cap_detail_triangle(bm, right_cap, inward_x_offset=-0.02)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, PEARL)
    finalize(obj)
    return obj


def log_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    bounds = (
        tuple(round(min(vertex[i] for vertex in verts), 4) for i in range(3)),
        tuple(round(max(vertex[i] for vertex in verts), 4) for i in range(3)),
    )
    print(f"{name} bounds: {bounds}")


def main():
    ensure_object_mode()
    collection = resolve_collection()
    delete_existing(REPLACEMENT_NAMES)
    build_array("V111_RearShellPanelArray_L", "L", collection)
    build_array("V111_RearShellPanelArray_R", "R", collection)
    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()
    log_bounds("V111_RearShellPanelArray_L")
    log_bounds("V111_RearShellPanelArray_R")


if __name__ == "__main__":
    main()
