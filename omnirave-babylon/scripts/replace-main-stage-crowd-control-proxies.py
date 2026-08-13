from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V84_CrowdControlFrameArray_L <-> V84_CrowdControlRailArray_L overlap: 0.40m on Y inside each left barrier module
#   V84_CrowdControlFrameArray_R <-> V84_CrowdControlRailArray_R overlap: 0.40m on Y inside each right barrier module
#   every V84 frame panel covers the full legacy V13 foot-to-rail silhouette with a 0.02m ground overlap
#   every V84 gold rail panel stays inset inside its matching frame while widening the ceremonial spawn-lane read

LEGACY_NAMES = [
    *(f"V13_CrowdControlFoot_L_{index}" for index in range(4)),
    *(f"V13_CrowdControlFoot_R_{index}" for index in range(4)),
    *(f"V13_CrowdControlRail_L_{index}" for index in range(4)),
    *(f"V13_CrowdControlRail_R_{index}" for index in range(4)),
]

REPLACEMENT_NAMES = [
    "V84_CrowdControlFrameArray_L",
    "V84_CrowdControlFrameArray_R",
    "V84_CrowdControlRailArray_L",
    "V84_CrowdControlRailArray_R",
]

FRAME_MATERIAL = "V13_BlackStageRigging"
RAIL_MATERIAL = "V14_BurnishedCelestialGold"

FALLBACK_BOUNDS = {
    "V13_CrowdControlFoot_L_0": {"x": (-18.55, -17.45), "y": (-60.2, -59.8), "z": (0.2, 0.36)},
    "V13_CrowdControlFoot_L_1": {"x": (-18.55, -17.45), "y": (-48.2, -47.8), "z": (0.2, 0.36)},
    "V13_CrowdControlFoot_L_2": {"x": (-18.55, -17.45), "y": (-36.2, -35.8), "z": (0.2, 0.36)},
    "V13_CrowdControlFoot_L_3": {"x": (-18.55, -17.45), "y": (-24.2, -23.8), "z": (0.2, 0.36)},
    "V13_CrowdControlFoot_R_0": {"x": (17.45, 18.55), "y": (-60.2, -59.8), "z": (0.2, 0.36)},
    "V13_CrowdControlFoot_R_1": {"x": (17.45, 18.55), "y": (-48.2, -47.8), "z": (0.2, 0.36)},
    "V13_CrowdControlFoot_R_2": {"x": (17.45, 18.55), "y": (-36.2, -35.8), "z": (0.2, 0.36)},
    "V13_CrowdControlFoot_R_3": {"x": (17.45, 18.55), "y": (-24.2, -23.8), "z": (0.2, 0.36)},
    "V13_CrowdControlRail_L_0": {"x": (-18.08, -17.92), "y": (-63.8, -56.2), "z": (0.53, 1.37)},
    "V13_CrowdControlRail_L_1": {"x": (-18.08, -17.92), "y": (-51.8, -44.2), "z": (0.53, 1.37)},
    "V13_CrowdControlRail_L_2": {"x": (-18.08, -17.92), "y": (-39.8, -32.2), "z": (0.53, 1.37)},
    "V13_CrowdControlRail_L_3": {"x": (-18.08, -17.92), "y": (-27.8, -20.2), "z": (0.53, 1.37)},
    "V13_CrowdControlRail_R_0": {"x": (17.92, 18.08), "y": (-63.8, -56.2), "z": (0.53, 1.37)},
    "V13_CrowdControlRail_R_1": {"x": (17.92, 18.08), "y": (-51.8, -44.2), "z": (0.53, 1.37)},
    "V13_CrowdControlRail_R_2": {"x": (17.92, 18.08), "y": (-39.8, -32.2), "z": (0.53, 1.37)},
    "V13_CrowdControlRail_R_3": {"x": (17.92, 18.08), "y": (-27.8, -20.2), "z": (0.53, 1.37)},
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in LEGACY_NAMES:
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


def existing_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        fallback = FALLBACK_BOUNDS.get(name)
        if fallback is None:
            raise RuntimeError(f"Missing object or fallback bounds for {name}")
        return fallback

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


def arc_points(radius_y, radius_z, start_angle, end_angle, segments, center_y=0.0, center_z=0.0):
    return [
        (
            center_y + math.cos(start_angle + (end_angle - start_angle) * (step / segments)) * radius_y,
            center_z + math.sin(start_angle + (end_angle - start_angle) * (step / segments)) * radius_z,
        )
        for step in range(segments + 1)
    ]


def build_frame_outline(half_length, base_z, top_z):
    left_center = -half_length + 0.68
    right_center = half_length - 0.68
    top_crown_base = top_z - 0.24
    outline = [
        (-half_length - 0.28, 0.02),
        (-half_length - 0.06, 0.02),
        (left_center - 0.30, base_z + 0.18),
        (left_center - 0.16, top_crown_base),
    ]
    outline.extend(arc_points(half_length - 1.10, 0.34, math.pi, 0.0, 3, center_y=0.0, center_z=top_crown_base))
    outline.extend(
        [
            (right_center + 0.16, top_crown_base),
            (right_center + 0.30, base_z + 0.18),
            (half_length + 0.06, 0.02),
            (half_length + 0.28, 0.02),
            (half_length + 0.16, 0.22),
            (right_center + 0.12, 0.98),
            (0.0, top_z),
            (left_center - 0.12, 0.98),
            (-half_length - 0.16, 0.22),
        ]
    )
    return outline


def build_rail_outline(half_length, lower_z, upper_z):
    left_inner = -half_length + 0.92
    right_inner = half_length - 0.92
    outline = [
        (left_inner - 0.14, lower_z),
        (left_inner + 0.14, lower_z),
        (left_inner + 0.20, upper_z - 0.20),
    ]
    outline.extend(arc_points(half_length - 1.20, 0.20, math.pi, 0.0, 3, center_y=0.0, center_z=upper_z - 0.20))
    outline.extend(
        [
            (right_inner - 0.20, upper_z - 0.20),
            (right_inner - 0.14, lower_z),
            (right_inner + 0.14, lower_z),
            (right_inner, lower_z + 0.16),
            (0.0, upper_z),
            (left_inner, lower_z + 0.16),
        ]
    )
    return outline


def add_extruded_panel(bm, x_center, half_thickness, outline):
    front = [bm.verts.new((x_center - half_thickness, y, z)) for y, z in outline]
    back = [bm.verts.new((x_center + half_thickness, y, z)) for y, z in outline]
    count = len(outline)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([front[index], front[next_index], back[next_index], back[index]])
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))


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


def finalize(obj, *, bevel_width):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = 1
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_panel_array(name, material_name, collection, panels, *, bevel_width):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for panel in panels:
        add_extruded_panel(bm, panel["x_center"], panel["half_thickness"], panel["outline"])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width)
    return obj


def module_specs(side):
    modules = []
    for index in range(4):
        rail = existing_bounds(f"V13_CrowdControlRail_{side}_{index}")
        foot = existing_bounds(f"V13_CrowdControlFoot_{side}_{index}")
        y_min = rail["y"][0]
        y_max = rail["y"][1]
        modules.append(
            {
                "x_center": midpoint(foot, "x"),
                "frame_outline": build_frame_outline((y_max - y_min) * 0.5 + 0.28, 0.02, rail["z"][1] + 0.22),
                "rail_outline": build_rail_outline((y_max - y_min) * 0.5 + 0.06, rail["z"][0] + 0.10, rail["z"][1] - 0.02),
                "y_center": midpoint(rail, "y"),
            }
        )
    return [
        {
            "x_center": module["x_center"],
            "half_thickness": 0.20,
            "outline": [(module["y_center"] + y_offset, z_value) for y_offset, z_value in module["frame_outline"]],
        }
        for module in modules
    ], [
        {
            "x_center": module["x_center"],
            "half_thickness": 0.09,
            "outline": [(module["y_center"] + y_offset, z_value) for y_offset, z_value in module["rail_outline"]],
        }
        for module in modules
    ]


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


def verify_overlap(name_a, name_b, axis="y", min_overlap=0.01):
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

delete_existing(REPLACEMENT_NAMES)
frame_left, rail_left = module_specs("L")
frame_right, rail_right = module_specs("R")
delete_existing(LEGACY_NAMES)

build_panel_array("V84_CrowdControlFrameArray_L", FRAME_MATERIAL, collection, frame_left, bevel_width=0.0)
build_panel_array("V84_CrowdControlFrameArray_R", FRAME_MATERIAL, collection, frame_right, bevel_width=0.0)
build_panel_array("V84_CrowdControlRailArray_L", RAIL_MATERIAL, collection, rail_left, bevel_width=0.0)
build_panel_array("V84_CrowdControlRailArray_R", RAIL_MATERIAL, collection, rail_right, bevel_width=0.0)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V84_CrowdControlFrameArray_L", "V84_CrowdControlRailArray_L", axis="y", min_overlap=0.40)
verify_overlap("V84_CrowdControlFrameArray_R", "V84_CrowdControlRailArray_R", axis="y", min_overlap=0.40)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
