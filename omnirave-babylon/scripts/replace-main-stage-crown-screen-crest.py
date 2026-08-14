from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V127_CrownScreenShadowCoffer <-> V127_CrownScreenVerticalKeystone overlap: 0.42m on X, 0.72m on Y, 0.54m on Z
#   The replacement pair upgrades the low-detail crown-screen top cap while preserving the existing screen-center placement.

SOURCE_NAMES = [
    "V22_CrownScreenShadowCoffer",
    "V22_CrownScreenVerticalKeystone",
]

REPLACEMENT_NAMES = [
    "V127_CrownScreenShadowCoffer",
    "V127_CrownScreenVerticalKeystone",
]

SHADOW = "V14_MatteBlackProductionRig"
GOLD = "V14_BurnishedCelestialGold"

FALLBACK_COffer_BOUNDS = {
    "x": (-8.2, 8.2),
    "y": (27.72, 28.48),
    "z": (22.72, 23.44),
}
FALLBACK_KEYSTONE_BOUNDS = {
    "x": (-0.24, 0.24),
    "y": (25.65, 30.55),
    "z": (22.78, 23.22),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*SOURCE_NAMES, "V31_CenterGlassLens", "V126_WideHeroScreenShadowCoffer"):
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


def bounds_from_objects(names, fallback_bounds):
    verts = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            continue
        verts.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
    if not verts:
        return fallback_bounds
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


def create_multi_box_object(name, material_name, boxes):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bm = bmesh.new()
    for bounds in boxes:
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
    cutter = create_box_object(f"{obj.name}_{suffix}", SHADOW, cutter_bounds)
    set_active(obj)
    modifier = obj.modifiers.new(f"OmniRaveBoolean_{suffix}", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    cutter_data = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    if cutter_data and cutter_data.users == 0:
        bpy.data.meshes.remove(cutter_data)


def apply_boolean_union(obj, addition_bounds, suffix, material_name):
    addition = create_box_object(f"{obj.name}_{suffix}", material_name, addition_bounds)
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


def finalize(obj, *, bevel_width, bevel_segments, material_name):
    set_active(obj)
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
    assign_material(obj, material_name)
    obj.select_set(False)


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


def verify_overlap(name_a, name_b, axis="x", min_overlap=0.005):
    bounds_a = world_bounds(name_a)
    bounds_b = world_bounds(name_b)
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{name_a} <-> {name_b} [{axis.upper()}] overlap={overlap:.3f}")
    if overlap < min_overlap:
        raise RuntimeError(f"Gap between {name_a} and {name_b} on axis {axis}: {overlap:.3f}")


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

coffer_bounds = bounds_from_objects(["V22_CrownScreenShadowCoffer"], FALLBACK_COffer_BOUNDS)
keystone_bounds = bounds_from_objects(["V22_CrownScreenVerticalKeystone"], FALLBACK_KEYSTONE_BOUNDS)

delete_existing(REPLACEMENT_NAMES)
delete_existing(SOURCE_NAMES)

shadow_bounds = {
    "x": (coffer_bounds["x"][0] - 0.15, coffer_bounds["x"][1] + 0.15),
    "y": (coffer_bounds["y"][0] - 0.04, coffer_bounds["y"][1] + 0.04),
    "z": (coffer_bounds["z"][0] - 0.10, coffer_bounds["z"][1] + 0.10),
}
shadow = create_box_object("V127_CrownScreenShadowCoffer", SHADOW, shadow_bounds)
apply_boolean_difference(
    shadow,
    {
        "x": (coffer_bounds["x"][0] + 0.85, coffer_bounds["x"][1] - 0.85),
        "y": (shadow_bounds["y"][0] - 0.10, shadow_bounds["y"][1] + 0.10),
        "z": (coffer_bounds["z"][0] + 0.14, coffer_bounds["z"][1] - 0.14),
    },
    "center_cut",
)
apply_boolean_difference(
    shadow,
    {
        "x": (-1.30, 1.30),
        "y": (shadow_bounds["y"][0] - 0.10, shadow_bounds["y"][1] + 0.10),
        "z": (shadow_bounds["z"][0] + 0.28, shadow_bounds["z"][1] + 0.04),
    },
    "crest_notch",
)
finalize(shadow, bevel_width=0.02, bevel_segments=2, material_name=SHADOW)

shaft_half_x = (keystone_bounds["x"][1] - keystone_bounds["x"][0]) * 0.9
shaft_mid_y = (keystone_bounds["y"][0] + keystone_bounds["y"][1]) * 0.5
shaft_half_y = (keystone_bounds["y"][1] - keystone_bounds["y"][0]) * 0.5
shaft_mid_z = (keystone_bounds["z"][0] + keystone_bounds["z"][1]) * 0.5
shaft_half_z = (keystone_bounds["z"][1] - keystone_bounds["z"][0]) * 0.62

keystone_boxes = [
    {
        "x": (-shaft_half_x, shaft_half_x),
        "y": (shaft_mid_y - shaft_half_y, shaft_mid_y + shaft_half_y),
        "z": (shaft_mid_z - shaft_half_z, shaft_mid_z + shaft_half_z),
    },
    {
        "x": (-0.78, 0.78),
        "y": (keystone_bounds["y"][1] - 0.95, keystone_bounds["y"][1] + 0.16),
        "z": (keystone_bounds["z"][0] - 0.02, keystone_bounds["z"][1] + 0.22),
    },
    {
        "x": (-1.05, 1.05),
        "y": (keystone_bounds["y"][0] - 0.10, keystone_bounds["y"][0] + 0.78),
        "z": (keystone_bounds["z"][0] - 0.06, keystone_bounds["z"][1] + 0.16),
    },
    {
        "x": (-1.55, -0.52),
        "y": (keystone_bounds["y"][1] - 0.76, keystone_bounds["y"][1] - 0.08),
        "z": (keystone_bounds["z"][0] + 0.02, keystone_bounds["z"][1] + 0.18),
    },
    {
        "x": (0.52, 1.55),
        "y": (keystone_bounds["y"][1] - 0.76, keystone_bounds["y"][1] - 0.08),
        "z": (keystone_bounds["z"][0] + 0.02, keystone_bounds["z"][1] + 0.18),
    },
]
keystone = create_box_object("V127_CrownScreenVerticalKeystone", GOLD, keystone_boxes[0])
for index, bounds in enumerate(keystone_boxes[1:], start=1):
    apply_boolean_union(keystone, bounds, f"union_{index}", GOLD)
finalize(keystone, bevel_width=0.018, bevel_segments=1, material_name=GOLD)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V127_CrownScreenShadowCoffer", "V127_CrownScreenVerticalKeystone", axis="x", min_overlap=0.35)
verify_overlap("V127_CrownScreenShadowCoffer", "V127_CrownScreenVerticalKeystone", axis="y", min_overlap=0.65)
verify_overlap("V127_CrownScreenShadowCoffer", "V127_CrownScreenVerticalKeystone", axis="z", min_overlap=0.45)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
