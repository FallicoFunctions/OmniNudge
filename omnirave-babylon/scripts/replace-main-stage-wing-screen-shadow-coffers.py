from __future__ import annotations

import bpy
import bmesh


# Connection Map:
#   V132_WingScreenShadowCofferArray_L keeps overlap between the top beam core and both end shoulders by >= 0.05m on X
#   V132_WingScreenShadowCofferArray_L keeps overlap between the bottom beam core and both end shoulders by >= 0.05m on X
#   V132_WingScreenShadowCofferArray_R keeps overlap between the top beam core and both end shoulders by >= 0.05m on X
#   V132_WingScreenShadowCofferArray_R keeps overlap between the bottom beam core and both end shoulders by >= 0.05m on X
#   Each side exports as one node with two separate sculpted coffer bars.

SOURCE_NAMES = [
    "V22_WingScreenTopCoffer_L",
    "V22_WingScreenBottomCoffer_L",
    "V22_WingScreenTopCoffer_R",
    "V22_WingScreenBottomCoffer_R",
]
LEFT_TEMP_NAMES = ["V132_WingScreenTopCoffer_L", "V132_WingScreenBottomCoffer_L"]
RIGHT_TEMP_NAMES = ["V132_WingScreenTopCoffer_R", "V132_WingScreenBottomCoffer_R"]
REPLACEMENT_NAMES = ["V132_WingScreenShadowCofferArray_L", "V132_WingScreenShadowCofferArray_R"]
MATERIAL_NAME = "V15_ShadowedInsetSeams"

FALLBACK_BOUNDS = {
    "V22_WingScreenTopCoffer_L": {"x": (-36.35, -25.65), "y": (24.92, 25.48), "z": (16.94, 17.30)},
    "V22_WingScreenBottomCoffer_L": {"x": (-36.35, -25.65), "y": (14.92, 15.48), "z": (16.94, 17.30)},
    "V22_WingScreenTopCoffer_R": {"x": (25.65, 36.35), "y": (24.92, 25.48), "z": (16.94, 17.30)},
    "V22_WingScreenBottomCoffer_R": {"x": (25.65, 36.35), "y": (14.92, 15.48), "z": (16.94, 17.30)},
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*SOURCE_NAMES, *REPLACEMENT_NAMES, "V131_WingScreenDepthBaffleArray_L"):
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


def finalize(obj):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = 0.014
    bevel.segments = 1
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
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


def build_bar(name, source_bounds):
    outer = {
        "x": (source_bounds["x"][0] - 0.08, source_bounds["x"][1] + 0.08),
        "y": (source_bounds["y"][0] - 0.04, source_bounds["y"][1] + 0.04),
        "z": (source_bounds["z"][0] - 0.04, source_bounds["z"][1] + 0.04),
    }
    obj = create_box_object(name, MATERIAL_NAME, outer)
    apply_boolean_difference(
        obj,
        {
            "x": (outer["x"][0] + 0.92, outer["x"][1] - 0.92),
            "y": (outer["y"][0] - 0.05, outer["y"][1] + 0.05),
            "z": (outer["z"][0] + 0.10, outer["z"][1] + 0.08),
        },
        "front_reveal",
    )
    apply_boolean_difference(
        obj,
        {
            "x": (outer["x"][0] + 1.28, outer["x"][1] - 1.28),
            "y": (outer["y"][0] - 0.05, outer["y"][1] + 0.05),
            "z": (outer["z"][0] - 0.02, outer["z"][0] + 0.08),
        },
        "lower_step",
    )
    apply_boolean_union(
        obj,
        {
            "x": (outer["x"][0] - 0.02, outer["x"][0] + 1.20),
            "y": (outer["y"][0] - 0.02, outer["y"][1] + 0.02),
            "z": (outer["z"][0] - 0.01, outer["z"][1] + 0.08),
        },
        "left_shoulder",
    )
    apply_boolean_union(
        obj,
        {
            "x": (outer["x"][1] - 1.20, outer["x"][1] + 0.02),
            "y": (outer["y"][0] - 0.02, outer["y"][1] + 0.02),
            "z": (outer["z"][0] - 0.01, outer["z"][1] + 0.08),
        },
        "right_shoulder",
    )
    finalize(obj)
    return obj


ensure_object_mode()
collection = resolve_collection()

source_bounds = {
    source_name: bounds_from_object(source_name, FALLBACK_BOUNDS[source_name])
    for source_name in SOURCE_NAMES
}

delete_existing([*REPLACEMENT_NAMES, *LEFT_TEMP_NAMES, *RIGHT_TEMP_NAMES])
delete_existing(SOURCE_NAMES)

left_objects = [
    build_bar(temp_name, source_bounds[source_name])
    for temp_name, source_name in zip(LEFT_TEMP_NAMES, SOURCE_NAMES[:2], strict=True)
]
right_objects = [
    build_bar(temp_name, source_bounds[source_name])
    for temp_name, source_name in zip(RIGHT_TEMP_NAMES, SOURCE_NAMES[2:], strict=True)
]

join_objects(left_objects, REPLACEMENT_NAMES[0])
join_objects(right_objects, REPLACEMENT_NAMES[1])

for name in REPLACEMENT_NAMES:
    log_bounds(name)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
