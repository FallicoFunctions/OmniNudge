from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V128_CenterScreenGoldInterruptRail_0 overlaps its left/right end caps and center boss by >= 0.04m on X
#   V128_CenterScreenGoldInterruptRail_1 overlaps its left/right end caps and center boss by >= 0.04m on X
#   V128_CenterScreenGoldInterruptRail_2 overlaps its left/right end caps and center boss by >= 0.04m on X
#   The three sculpted rails remain separate components, then join into one exported array node.

SOURCE_NAMES = [
    "V22_CenterScreenGoldInterruptRail_0",
    "V22_CenterScreenGoldInterruptRail_1",
    "V22_CenterScreenGoldInterruptRail_2",
]

TEMP_NAMES = [f"V128_CenterScreenGoldInterruptRail_{index}" for index in range(3)]
REPLACEMENT_NAME = "V128_CenterScreenGoldInterruptRailArray"
MATERIAL_NAME = "V20_ChasedGoldFiligree"

FALLBACK_BOUNDS = [
    {"x": (-14.75, 14.75), "y": (17.04, 17.26), "z": (23.00, 23.24)},
    {"x": (-14.75, 14.75), "y": (20.54, 20.76), "z": (23.00, 23.24)},
    {"x": (-14.75, 14.75), "y": (23.94, 24.16), "z": (23.00, 23.24)},
]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*SOURCE_NAMES, REPLACEMENT_NAME, "V127_CrownScreenShadowCoffer"):
        anchor = bpy.data.objects.get(anchor_name)
        if anchor is not None and anchor.users_collection:
            return anchor.users_collection[0]
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


def bounds_from_object(name, fallback_bounds):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        return fallback_bounds
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def add_box(bm, *, x_min, x_max, y_min, y_max, z_min, z_max):
    center = (
        (x_min + x_max) * 0.5,
        (y_min + y_max) * 0.5,
        (z_min + z_max) * 0.5,
    )
    half_extents = (
        (x_max - x_min) * 0.5,
        (y_max - y_min) * 0.5,
        (z_max - z_min) * 0.5,
    )
    result = bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.scale(bm, verts=result["verts"], vec=half_extents)
    bmesh.ops.translate(bm, verts=result["verts"], vec=center)


def create_box_object(name, material_name, bounds):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bm = bmesh.new()
    add_box(
        bm,
        x_min=bounds["x"][0],
        x_max=bounds["x"][1],
        y_min=bounds["y"][0],
        y_max=bounds["y"][1],
        z_min=bounds["z"][0],
        z_max=bounds["z"][1],
    )
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    assign_material(obj, material_name)
    return obj


def apply_boolean_difference(obj, cutter_bounds, suffix):
    cutter = create_box_object(f"{obj.name}_{suffix}", MATERIAL_NAME, cutter_bounds)
    set_active(obj)
    modifier = obj.modifiers.new(f"OmniRaveDifference_{suffix}", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    cutter_data = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    if cutter_data and cutter_data.users == 0:
        bpy.data.meshes.remove(cutter_data)


def apply_boolean_union(obj, addition_bounds, suffix):
    addition = create_box_object(f"{obj.name}_{suffix}", MATERIAL_NAME, addition_bounds)
    set_active(obj)
    modifier = obj.modifiers.new(f"OmniRaveUnion_{suffix}", "BOOLEAN")
    modifier.operation = "UNION"
    modifier.solver = "EXACT"
    modifier.object = addition
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    addition_data = addition.data
    bpy.data.objects.remove(addition, do_unlink=True)
    if addition_data and addition_data.users == 0:
        bpy.data.meshes.remove(addition_data)


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
    bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, *, bevel_width, bevel_segments):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.70
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    assign_material(obj, MATERIAL_NAME)
    obj.select_set(False)


def join_objects(objects, joined_name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = joined_name
    joined.data.name = joined_name
    assign_material(joined, MATERIAL_NAME)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    joined.select_set(False)
    return joined


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


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


def build_rail(name, source_bounds):
    rail_bounds = {
        "x": (source_bounds["x"][0] - 0.18, source_bounds["x"][1] + 0.18),
        "y": (source_bounds["y"][0] - 0.02, source_bounds["y"][1] + 0.02),
        "z": (source_bounds["z"][0] - 0.03, source_bounds["z"][1] + 0.03),
    }
    rail = create_box_object(name, MATERIAL_NAME, rail_bounds)
    apply_boolean_difference(
        rail,
        {
            "x": (rail_bounds["x"][0] + 0.72, rail_bounds["x"][1] - 0.72),
            "y": (rail_bounds["y"][0] - 0.08, rail_bounds["y"][1] + 0.08),
            "z": (source_bounds["z"][0] + 0.05, source_bounds["z"][1] + 0.09),
        },
        "center_reveal",
    )
    apply_boolean_difference(
        rail,
        {
            "x": (rail_bounds["x"][0] + 1.05, rail_bounds["x"][1] - 1.05),
            "y": (rail_bounds["y"][0] - 0.08, rail_bounds["y"][1] + 0.08),
            "z": (rail_bounds["z"][0] - 0.02, rail_bounds["z"][0] + 0.06),
        },
        "lower_step",
    )
    apply_boolean_union(
        rail,
        {
            "x": (source_bounds["x"][0] - 0.22, source_bounds["x"][0] + 1.55),
            "y": (source_bounds["y"][0] - 0.03, source_bounds["y"][1] + 0.03),
            "z": (source_bounds["z"][0] - 0.01, source_bounds["z"][1] + 0.08),
        },
        "left_cap",
    )
    apply_boolean_union(
        rail,
        {
            "x": (source_bounds["x"][1] - 1.55, source_bounds["x"][1] + 0.22),
            "y": (source_bounds["y"][0] - 0.03, source_bounds["y"][1] + 0.03),
            "z": (source_bounds["z"][0] - 0.01, source_bounds["z"][1] + 0.08),
        },
        "right_cap",
    )
    apply_boolean_union(
        rail,
        {
            "x": (-1.35, 1.35),
            "y": (source_bounds["y"][0] - 0.03, source_bounds["y"][1] + 0.03),
            "z": (source_bounds["z"][0] - 0.02, source_bounds["z"][1] + 0.12),
        },
        "center_boss",
    )
    finalize(rail, bevel_width=0.016, bevel_segments=1)
    return rail


ensure_object_mode()
collection = resolve_collection()

source_bounds_list = [
    bounds_from_object(source_name, fallback_bounds)
    for source_name, fallback_bounds in zip(SOURCE_NAMES, FALLBACK_BOUNDS, strict=True)
]

delete_existing([REPLACEMENT_NAME, *TEMP_NAMES])
delete_existing(SOURCE_NAMES)

rail_objects = [
    build_rail(temp_name, source_bounds)
    for temp_name, source_bounds in zip(TEMP_NAMES, source_bounds_list, strict=True)
]
joined = join_objects(rail_objects, REPLACEMENT_NAME)

log_bounds(REPLACEMENT_NAME)
audit_transforms([REPLACEMENT_NAME])
bpy.ops.wm.save_mainfile()
