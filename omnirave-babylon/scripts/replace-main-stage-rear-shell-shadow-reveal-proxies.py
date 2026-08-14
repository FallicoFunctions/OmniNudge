from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V106_RearShellShadowRevealArray_L profile crown <-> V20_RearShellPanel_L_* pearl faces:
#     overlap >= 0.005m on Z so the shadow seams read tucked into the rear-shell facade.
#   V106_RearShellShadowRevealArray_R profile crown <-> V20_RearShellPanel_R_* pearl faces:
#     overlap >= 0.005m on Z so the mirrored shell shoulder keeps the same recessed cadence.
#   Each four-piece side array preserves the existing stepped rear-shell spacing established by V105.

LEGACY_NAMES = [
    "V20_RearShellShadowReveal_L_0",
    "V20_RearShellShadowReveal_L_1",
    "V20_RearShellShadowReveal_L_2",
    "V20_RearShellShadowReveal_L_3",
    "V20_RearShellShadowReveal_R_0",
    "V20_RearShellShadowReveal_R_1",
    "V20_RearShellShadowReveal_R_2",
    "V20_RearShellShadowReveal_R_3",
]
REPLACEMENT_NAMES = [
    "V106_RearShellShadowRevealArray_L",
    "V106_RearShellShadowRevealArray_R",
]

ORIGINAL_COMPONENTS = [
    {"x": (-15.63, -15.27), "y": (6.05, 15.75), "z": (12.075, 12.165)},
    {"x": (-21.13, -20.77), "y": (5.25, 14.95), "z": (12.075, 12.165)},
    {"x": (-26.63, -26.27), "y": (4.35, 14.05), "z": (12.075, 12.165)},
    {"x": (-31.83, -31.47), "y": (3.65, 13.35), "z": (12.075, 12.165)},
    {"x": (15.27, 15.63), "y": (6.05, 15.75), "z": (12.075, 12.165)},
    {"x": (20.77, 21.13), "y": (5.25, 14.95), "z": (12.075, 12.165)},
    {"x": (26.27, 26.63), "y": (4.35, 14.05), "z": (12.075, 12.165)},
    {"x": (31.47, 31.83), "y": (3.65, 13.35), "z": (12.075, 12.165)},
]

SHADOW = "V20_RecessedWarmShadow"


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


def finalize(obj):
    triangulate_mesh(obj)
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


def source_component_bounds():
    components = []
    for name in LEGACY_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            components.append(world_bounds_for_object(obj))
    if components:
        return sorted(
            components,
            key=lambda bounds: ((bounds["x"][0] + bounds["x"][1]) * 0.5, (bounds["y"][0] + bounds["y"][1]) * 0.5),
        )

    return sorted(
        [dict(bounds) for bounds in ORIGINAL_COMPONENTS],
        key=lambda bounds: ((bounds["x"][0] + bounds["x"][1]) * 0.5, (bounds["y"][0] + bounds["y"][1]) * 0.5),
    )


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def component_groups(components, side):
    if side == "L":
        selected = [bounds for bounds in components if midpoint(bounds, "x") < 0.0]
    else:
        selected = [bounds for bounds in components if midpoint(bounds, "x") > 0.0]
    if len(selected) != 4:
        raise RuntimeError(f"Expected 4 {side} components, found {len(selected)}")
    return selected


def add_extruded_profile_x(bm, x_min, x_max, profile):
    lower_ring = [bm.verts.new((x_min, y, z)) for y, z in profile]
    upper_ring = [bm.verts.new((x_max, y, z)) for y, z in profile]
    count = len(profile)

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

    bm.faces.new(list(reversed(lower_ring)))
    bm.faces.new(upper_ring)
    return lower_ring, upper_ring


def add_cap_detail_triangle(bm, cap_verts, inward_x_offset):
    start_index = len(cap_verts) // 2 - 1
    edge_start = cap_verts[start_index]
    edge_end = cap_verts[start_index + 1]
    detail_vert = bm.verts.new(
        (
            edge_start.co.x + inward_x_offset,
            (edge_start.co.y + edge_end.co.y) * 0.5,
            (edge_start.co.z + edge_end.co.z) * 0.5 + 0.018,
        )
    )
    bm.faces.new([edge_start, edge_end, detail_vert])


def reveal_profile(bounds):
    y_min = -bounds["z"][1] - 0.015
    y_max = -bounds["z"][0] + 0.015
    z_min, z_max = bounds["y"]
    center_y = (y_min + y_max) * 0.5
    center_z = midpoint(bounds, "y")
    height = z_max - z_min
    thickness = y_max - y_min
    end_cap = max(height * 0.022, 0.11)
    lower_shoulder_y = y_min + thickness * 0.24
    upper_shoulder_y = y_max - thickness * 0.24
    floor_y = y_min - 0.03
    shoulder_z = max(z_min + 0.02, 5.72)
    lower_base_z = max(z_min + 0.04, 5.78)
    lower_mid_z = max(z_min + 0.16, 5.96)
    upper_shoulder_z = z_min + height * 0.38
    notch_z = z_min + height * 0.52
    inner_notch_z = z_min + height * 0.38
    crown_z = z_max - 0.03

    return [
        (floor_y, lower_base_z),
        (lower_shoulder_y, lower_mid_z),
        (y_min, shoulder_z),
        (y_min + thickness * 0.1, upper_shoulder_z),
        (center_y - thickness * 0.28, crown_z - 0.065),
        (center_y - thickness * 0.14, crown_z - 0.006),
        (center_y - thickness * 0.08, crown_z - 0.018),
        (center_y, crown_z),
        (center_y + thickness * 0.08, crown_z - 0.018),
        (center_y + thickness * 0.14, crown_z - 0.006),
        (center_y + thickness * 0.28, crown_z - 0.065),
        (y_max - thickness * 0.1, upper_shoulder_z),
        (y_max, shoulder_z),
        (upper_shoulder_y, lower_mid_z),
        (floor_y + thickness * 0.35, z_min + height * 0.36),
        (y_max, z_max - end_cap * 0.18),
        (center_y + thickness * 0.12, inner_notch_z),
        (center_y, notch_z),
        (center_y - thickness * 0.12, inner_notch_z),
    ]


def build_array(name, side, collection):
    components = component_groups(source_component_bounds(), side)
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in components:
        x_min = bounds["x"][0] - 0.045
        x_max = bounds["x"][1] + 0.045
        left_cap, right_cap = add_extruded_profile_x(bm, x_min, x_max, reveal_profile(bounds))
        add_cap_detail_triangle(bm, left_cap, inward_x_offset=0.008)
        add_cap_detail_triangle(bm, right_cap, inward_x_offset=-0.008)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, SHADOW)
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
    build_array("V106_RearShellShadowRevealArray_L", "L", collection)
    build_array("V106_RearShellShadowRevealArray_R", "R", collection)
    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()
    log_bounds("V106_RearShellShadowRevealArray_L")
    log_bounds("V106_RearShellShadowRevealArray_R")


if __name__ == "__main__":
    main()
