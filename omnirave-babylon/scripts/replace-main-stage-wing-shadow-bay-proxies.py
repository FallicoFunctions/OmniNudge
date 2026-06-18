from __future__ import annotations

import math

import bmesh
import bpy


LEGACY_NAMES = [
    *(f"V13_WingFacadeShadowBay_L_{index}" for index in range(4)),
    *(f"V13_WingFacadeShadowBay_R_{index}" for index in range(4)),
    *(f"V15_WingShadowInset_L_{index}" for index in range(4)),
    *(f"V15_WingShadowInset_R_{index}" for index in range(4)),
    *(f"V15_WingShadowInsetVerticalA_L_{index}" for index in range(4)),
    *(f"V15_WingShadowInsetVerticalA_R_{index}" for index in range(4)),
    *(f"V15_WingShadowInsetVerticalB_L_{index}" for index in range(4)),
    *(f"V15_WingShadowInsetVerticalB_R_{index}" for index in range(4)),
    *(f"V15_WingGoldCap_L_{index}" for index in range(4)),
    *(f"V15_WingGoldCap_R_{index}" for index in range(4)),
]

REPLACEMENT_NAMES = [
    "V87_WingFacadeShadowFrameArray_L",
    "V87_WingFacadeShadowFrameArray_R",
    "V87_WingFacadeShadowVaultArray_L",
    "V87_WingFacadeShadowVaultArray_R",
    "V87_WingFacadeGoldLintelArray_L",
    "V87_WingFacadeGoldLintelArray_R",
]

FRAME = "V15_PearlShellBeveled"
SHADOW = "V20_RecessedWarmShadow"
GOLD = "V20_ChasedGoldFiligree"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V13_WingFacadeShadowBay_L_0")
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


def existing_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"Missing object: {name}")
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def rounded_rect_points(center_x, center_z, half_x, half_z, radius, corner_steps=3):
    radius = min(radius, half_x * 0.95, half_z * 0.95)
    x0 = center_x - half_x
    x1 = center_x + half_x
    z0 = center_z - half_z
    z1 = center_z + half_z
    points = []
    corners = [
        ((x1 - radius, z1 - radius), 0.0, 1.57079632679),
        ((x0 + radius, z1 - radius), 1.57079632679, 3.14159265359),
        ((x0 + radius, z0 + radius), 3.14159265359, 4.71238898038),
        ((x1 - radius, z0 + radius), 4.71238898038, 6.28318530718),
    ]
    for (corner_x, corner_z), start_angle, end_angle in corners:
        for step in range(corner_steps):
            t = step / max(corner_steps - 1, 1)
            angle = start_angle + (end_angle - start_angle) * t
            points.append((corner_x + radius * math.cos(angle), corner_z + radius * math.sin(angle)))
    return points


def lancet_profile(x_min, x_max, z_min, z_max):
    center_x = (x_min + x_max) * 0.5
    width = x_max - x_min
    height = z_max - z_min
    shoulder = width * 0.18
    return [
        (center_x, z_max + height * 0.12),
        (center_x - shoulder * 0.35, z_max + height * 0.08),
        (x_min + width * 0.14, z_max - height * 0.02),
        (x_min + width * 0.05, z_max - height * 0.14),
        (x_min, z_max - height * 0.28),
        (x_min + width * 0.03, z_min + height * 0.58),
        (x_min + width * 0.08, z_min + height * 0.22),
        (x_min + width * 0.24, z_min - height * 0.02),
        (center_x, z_min - height * 0.09),
        (x_max - width * 0.24, z_min - height * 0.02),
        (x_max - width * 0.08, z_min + height * 0.22),
        (x_max - width * 0.03, z_min + height * 0.58),
        (x_max, z_max - height * 0.28),
        (x_max - width * 0.05, z_max - height * 0.14),
        (x_max - width * 0.14, z_max - height * 0.02),
        (center_x + shoulder * 0.35, z_max + height * 0.08),
    ]


def lintel_profile(x_min, x_max, z_min, z_max):
    center_x = (x_min + x_max) * 0.5
    width = x_max - x_min
    height = z_max - z_min
    return [
        (x_min, z_min + height * 0.22),
        (x_min + width * 0.04, z_min),
        (x_min + width * 0.20, z_min + height * 0.08),
        (x_min + width * 0.34, z_min + height * 0.30),
        (x_min + width * 0.48, z_max - height * 0.06),
        (center_x, z_max + height * 0.12),
        (x_max - width * 0.48, z_max - height * 0.06),
        (x_max - width * 0.34, z_min + height * 0.30),
        (x_max - width * 0.20, z_min + height * 0.08),
        (x_max - width * 0.04, z_min),
        (x_max, z_min + height * 0.22),
        (center_x, z_min + height * 0.18),
    ]


def transform_points(points, center_x, center_z, scale_x=1.0, scale_z=1.0, z_shift=0.0):
    transformed = []
    for x, z in points:
        transformed.append((center_x + (x - center_x) * scale_x, center_z + (z - center_z) * scale_z + z_shift))
    return transformed


def add_ring_stack_y(bm, loops):
    rings = []
    for y, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, z in points])

    for front_ring, back_ring in zip(rings, rings[1:]):
        count = len(front_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    front_ring[index],
                    front_ring[next_index],
                    back_ring[next_index],
                    back_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def material_uses_textures(material_name):
    material = bpy.data.materials.get(material_name)
    if material is None or not material.use_nodes or material.node_tree is None:
        return False
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image is not None:
            return True
    return False


def ensure_uv_map(obj):
    set_active(obj)
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, clip_to_bounds=False, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, bevel_width=0.015, bevel_segments=2):
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


def build_loft_object(name, material_name, collection, components, bevel_width=0.015, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_ring_stack_y(bm, component)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    if material_uses_textures(material_name):
        ensure_uv_map(obj)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


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


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def frame_components(side):
    components = []
    for index in range(4):
        panel = existing_bounds(f"V13_WingFacadeShadowBay_{side}_{index}")
        shadow = existing_bounds(f"V15_WingShadowInset_{side}_{index}")
        vertical_bounds = sorted(
            [
                existing_bounds(f"V15_WingShadowInsetVerticalA_{side}_{index}"),
                existing_bounds(f"V15_WingShadowInsetVerticalB_{side}_{index}"),
            ],
            key=lambda bounds: bounds["x"][0],
        )
        gold = existing_bounds(f"V15_WingGoldCap_{side}_{index}")

        outer_x_min = vertical_bounds[0]["x"][0] - 0.35
        outer_x_max = vertical_bounds[1]["x"][1] + 0.35
        inner_x_min = vertical_bounds[0]["x"][1] + 0.12
        inner_x_max = vertical_bounds[1]["x"][0] - 0.12
        outer_z_min = panel["z"][0] - 0.18
        outer_z_max = gold["z"][1] + 0.16
        opening_z_min = panel["z"][0] + 0.26
        opening_z_max = shadow["z"][0] - 0.18
        sill_z_max = opening_z_min + 0.32
        crown_z_min = opening_z_max - 0.22

        front_y = max(panel["y"][1], shadow["y"][1], gold["y"][1]) + 0.05
        back_y = min(panel["y"][0], shadow["y"][0], gold["y"][0]) - 0.22
        center_x = (outer_x_min + outer_x_max) * 0.5
        center_z = (outer_z_min + outer_z_max) * 0.5

        profiles = [
            rounded_rect_points((outer_x_min + inner_x_min) * 0.5, center_z, (inner_x_min - outer_x_min) * 0.5, (outer_z_max - outer_z_min) * 0.5, 0.12, 3),
            rounded_rect_points((inner_x_max + outer_x_max) * 0.5, center_z, (outer_x_max - inner_x_max) * 0.5, (outer_z_max - outer_z_min) * 0.5, 0.12, 3),
            rounded_rect_points((inner_x_min + inner_x_max) * 0.5, (outer_z_min + sill_z_max) * 0.5, (inner_x_max - inner_x_min) * 0.5, (sill_z_max - outer_z_min) * 0.5, 0.12, 3),
            rounded_rect_points((inner_x_min + inner_x_max) * 0.5, (crown_z_min + outer_z_max) * 0.5, (inner_x_max - inner_x_min) * 0.5, (outer_z_max - crown_z_min) * 0.5, 0.12, 3),
        ]
        for profile in profiles:
            components.append(
                [
                    (front_y, profile),
                    (front_y - 0.08, transform_points(profile, center_x, center_z, scale_x=0.992, scale_z=0.986)),
                    (back_y + 0.08, transform_points(profile, center_x, center_z, scale_x=0.975, scale_z=0.972, z_shift=-0.03)),
                    (back_y, transform_points(profile, center_x, center_z, scale_x=0.960, scale_z=0.960, z_shift=-0.05)),
                ]
            )
    return components


def vault_components(side):
    components = []
    for index in range(4):
        panel = existing_bounds(f"V13_WingFacadeShadowBay_{side}_{index}")
        shadow = existing_bounds(f"V15_WingShadowInset_{side}_{index}")
        vertical_bounds = sorted(
            [
                existing_bounds(f"V15_WingShadowInsetVerticalA_{side}_{index}"),
                existing_bounds(f"V15_WingShadowInsetVerticalB_{side}_{index}"),
            ],
            key=lambda bounds: bounds["x"][0],
        )

        x_min = vertical_bounds[0]["x"][1] + 0.22
        x_max = vertical_bounds[1]["x"][0] - 0.22
        z_min = panel["z"][0] + 0.34
        z_max = shadow["z"][0] - 0.28
        profile = lancet_profile(x_min, x_max, z_min, z_max)
        center_x = midpoint({"x": (x_min, x_max)}, "x")
        center_z = midpoint({"z": (z_min, z_max)}, "z")
        front_y = panel["y"][0] - 0.05
        back_y = front_y - 0.28
        components.append(
            [
                (front_y, profile),
                (front_y - 0.06, transform_points(profile, center_x, center_z, scale_x=0.985, scale_z=0.982)),
                (front_y - 0.12, transform_points(profile, center_x, center_z, scale_x=0.968, scale_z=0.955, z_shift=-0.03)),
                (back_y + 0.05, transform_points(profile, center_x, center_z, scale_x=0.950, scale_z=0.930, z_shift=-0.06)),
                (back_y, transform_points(profile, center_x, center_z, scale_x=0.938, scale_z=0.918, z_shift=-0.08)),
            ]
        )
    return components


def lintel_components(side):
    components = []
    for index in range(4):
        shadow = existing_bounds(f"V15_WingShadowInset_{side}_{index}")
        gold = existing_bounds(f"V15_WingGoldCap_{side}_{index}")
        x_min = gold["x"][0]
        x_max = gold["x"][1]
        z_min = shadow["z"][1] + 0.03
        z_max = gold["z"][1] + 0.12
        profile = lintel_profile(x_min, x_max, z_min, z_max)
        center_x = midpoint({"x": (x_min, x_max)}, "x")
        center_z = midpoint({"z": (z_min, z_max)}, "z")
        front_y = gold["y"][1] + 0.04
        back_y = gold["y"][0] - 0.12
        components.append(
            [
                (front_y, profile),
                (front_y - 0.05, transform_points(profile, center_x, center_z, scale_x=0.992, scale_z=0.990)),
                (back_y + 0.04, transform_points(profile, center_x, center_z, scale_x=0.970, scale_z=0.960, z_shift=-0.01)),
                (back_y, transform_points(profile, center_x, center_z, scale_x=0.955, scale_z=0.945, z_shift=-0.02)),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)

left_frame = frame_components("L")
right_frame = frame_components("R")
left_vault = vault_components("L")
right_vault = vault_components("R")
left_lintel = lintel_components("L")
right_lintel = lintel_components("R")

delete_existing(LEGACY_NAMES)

build_loft_object("V87_WingFacadeShadowFrameArray_L", FRAME, collection, left_frame)
build_loft_object("V87_WingFacadeShadowFrameArray_R", FRAME, collection, right_frame)
build_loft_object("V87_WingFacadeShadowVaultArray_L", SHADOW, collection, left_vault, bevel_width=0.012, bevel_segments=1)
build_loft_object("V87_WingFacadeShadowVaultArray_R", SHADOW, collection, right_vault, bevel_width=0.012, bevel_segments=1)
build_loft_object("V87_WingFacadeGoldLintelArray_L", GOLD, collection, left_lintel, bevel_width=0.012, bevel_segments=1)
build_loft_object("V87_WingFacadeGoldLintelArray_R", GOLD, collection, right_lintel, bevel_width=0.012, bevel_segments=1)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V87_WING_SHADOW_BAY_REPLACEMENT_COMPLETE replacements=6")
