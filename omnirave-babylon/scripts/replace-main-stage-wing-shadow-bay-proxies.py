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

FRAME = "V20_RecessedWarmShadow"
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
    for anchor_name in (
        "V87_WingFacadeShadowFrameArray_L",
        "V38_WingFacadeShadowReveal_L",
        "V13_WingFacadeShadowBay_L_0",
    ):
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
        raise RuntimeError(f"Missing object: {name}")
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def split_span(minimum, maximum, count, outer_margin, gap):
    span = maximum - minimum
    usable_span = span - outer_margin * 2.0 - gap * (count - 1)
    section_span = usable_span / count
    sections = []
    cursor = minimum + outer_margin
    for _ in range(count):
        sections.append((cursor, cursor + section_span))
        cursor += section_span + gap
    return sections


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
        (center_x - shoulder * 0.18, z_max + height * 0.105),
        (center_x - shoulder * 0.35, z_max + height * 0.08),
        (x_min + width * 0.10, z_max + height * 0.02),
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
        (x_max - width * 0.10, z_max + height * 0.02),
        (center_x + shoulder * 0.35, z_max + height * 0.08),
        (center_x + shoulder * 0.18, z_max + height * 0.105),
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


def facade_seed(side):
    frame = existing_bounds(f"V87_WingFacadeShadowFrameArray_{side}")
    vault = existing_bounds(f"V87_WingFacadeShadowVaultArray_{side}")
    lintel = existing_bounds(f"V87_WingFacadeGoldLintelArray_{side}")
    reveal = existing_bounds(f"V38_WingFacadeShadowReveal_{side}")
    return {
        "frame": frame,
        "vault": vault,
        "lintel": lintel,
        "reveal": reveal,
    }


def frame_components(side, seed):
    components = []
    frame = seed["frame"]
    vault = seed["vault"]
    reveal = seed["reveal"]
    sections = split_span(frame["x"][0], frame["x"][1], 4, outer_margin=0.56, gap=0.72)
    front_y = reveal["y"][0] - 0.18
    back_y = front_y + 1.88
    mid_y = front_y + 0.92
    outer_z_min = frame["z"][0] + 0.18
    outer_z_max = max(frame["z"][1], vault["z"][1]) - 0.42
    sill_z_max = outer_z_min + 1.42
    crown_z_min = outer_z_max - 2.3

    for outer_x_min, outer_x_max in sections:
        inner_x_min = outer_x_min + 1.08
        inner_x_max = outer_x_max - 1.08
        center_x = (outer_x_min + outer_x_max) * 0.5
        center_z = (outer_z_min + outer_z_max) * 0.5

        profiles = [
            rounded_rect_points(
                (outer_x_min + inner_x_min) * 0.5,
                center_z,
                (inner_x_min - outer_x_min) * 0.5,
                (outer_z_max - outer_z_min) * 0.5,
                0.14,
                4,
            ),
            rounded_rect_points(
                (inner_x_max + outer_x_max) * 0.5,
                center_z,
                (outer_x_max - inner_x_max) * 0.5,
                (outer_z_max - outer_z_min) * 0.5,
                0.14,
                4,
            ),
            rounded_rect_points(
                (inner_x_min + inner_x_max) * 0.5,
                (outer_z_min + sill_z_max) * 0.5,
                (inner_x_max - inner_x_min) * 0.5,
                (sill_z_max - outer_z_min) * 0.5,
                0.14,
                4,
            ),
            rounded_rect_points(
                (inner_x_min + inner_x_max) * 0.5,
                (crown_z_min + outer_z_max) * 0.5,
                (inner_x_max - inner_x_min) * 0.5,
                (outer_z_max - crown_z_min) * 0.5,
                0.18,
                4,
            ),
        ]
        for profile in profiles:
            components.append(
                [
                    (front_y, profile),
                    (front_y + 0.24, transform_points(profile, center_x, center_z, scale_x=0.996, scale_z=0.992)),
                    (mid_y, transform_points(profile, center_x, center_z, scale_x=0.984, scale_z=0.978, z_shift=-0.04)),
                    (back_y, transform_points(profile, center_x, center_z, scale_x=0.964, scale_z=0.952, z_shift=-0.12)),
                ]
            )
    return components


def vault_components(side, seed):
    components = []
    frame = seed["frame"]
    vault = seed["vault"]
    reveal = seed["reveal"]
    sections = split_span(frame["x"][0], frame["x"][1], 4, outer_margin=0.9, gap=1.18)
    front_y = reveal["y"][0] + 0.28
    back_y = front_y + 1.1
    z_min = vault["z"][0] + 0.3
    z_max = vault["z"][1] - 0.26

    for x_min, x_max in sections:
        profile = lancet_profile(x_min, x_max, z_min, z_max)
        center_x = midpoint({"x": (x_min, x_max)}, "x")
        center_z = midpoint({"z": (z_min, z_max)}, "z")
        components.append(
            [
                (front_y, profile),
                (front_y + 0.18, transform_points(profile, center_x, center_z, scale_x=0.988, scale_z=0.986)),
                (back_y - 0.18, transform_points(profile, center_x, center_z, scale_x=0.964, scale_z=0.948, z_shift=-0.05)),
                (back_y, transform_points(profile, center_x, center_z, scale_x=0.948, scale_z=0.932, z_shift=-0.08)),
            ]
        )
    return components


def lintel_components(side, seed):
    components = []
    frame = seed["frame"]
    lintel = seed["lintel"]
    reveal = seed["reveal"]
    sections = split_span(frame["x"][0], frame["x"][1], 4, outer_margin=0.44, gap=0.58)
    front_y = reveal["y"][0] - 0.12
    back_y = front_y + 0.92
    z_min = lintel["z"][0] + 0.08
    z_max = lintel["z"][1] + 0.08

    for x_min, x_max in sections:
        profile = lintel_profile(x_min, x_max, z_min, z_max)
        center_x = midpoint({"x": (x_min, x_max)}, "x")
        center_z = midpoint({"z": (z_min, z_max)}, "z")
        components.append(
            [
                (front_y, profile),
                (front_y + 0.12, transform_points(profile, center_x, center_z, scale_x=0.994, scale_z=0.992)),
                (back_y - 0.12, transform_points(profile, center_x, center_z, scale_x=0.974, scale_z=0.968, z_shift=-0.02)),
                (back_y, transform_points(profile, center_x, center_z, scale_x=0.958, scale_z=0.950, z_shift=-0.04)),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()
left_seed = facade_seed("L")
right_seed = facade_seed("R")

delete_existing(REPLACEMENT_NAMES)

left_frame = frame_components("L", left_seed)
right_frame = frame_components("R", right_seed)
left_vault = vault_components("L", left_seed)
right_vault = vault_components("R", right_seed)
left_lintel = lintel_components("L", left_seed)
right_lintel = lintel_components("R", right_seed)

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
