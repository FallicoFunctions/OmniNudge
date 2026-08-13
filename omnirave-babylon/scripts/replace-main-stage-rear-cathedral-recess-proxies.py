from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V88 frame component encloses one legacy V13 rear-cathedral recess footprint with 0.08m Y overlap
#   each V88 pearl component stays nested inside its matching V88 frame with 0.12m Y overlap
#   each V88 gold component stays nested inside its matching V88 pearl blade with 0.10m Y overlap
#   all four components per side preserve the existing rear-cathedral recess X centerlines and full Z cadence

LEGACY_NAMES = [
    *(f"V13_RearCathedralRecess_L_{index}" for index in range(4)),
    *(f"V13_RearCathedralRecess_R_{index}" for index in range(4)),
]

REPLACEMENT_NAMES = [
    "V88_RearCathedralLancetFrameArray_L",
    "V88_RearCathedralLancetFrameArray_R",
    "V88_RearCathedralLancetPearlArray_L",
    "V88_RearCathedralLancetPearlArray_R",
    "V88_RearCathedralLancetGoldArray_L",
    "V88_RearCathedralLancetGoldArray_R",
]

SHADOW = "V20_RecessedWarmShadow"
PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"


def bounds_from_location_dimensions(location, dimensions):
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    return {
        "x": (location[0] - half_x, location[0] + half_x),
        "y": (location[1] - half_y, location[1] + half_y),
        "z": (location[2] - half_z, location[2] + half_z),
    }


FALLBACK_BOUNDS = {
    "V13_RearCathedralRecess_L_0": bounds_from_location_dimensions((-10.0, -34.10, 24.50), (1.0, 0.12, 17.60)),
    "V13_RearCathedralRecess_L_1": bounds_from_location_dimensions((-14.0, -34.10, 24.50), (1.0, 0.12, 17.60)),
    "V13_RearCathedralRecess_L_2": bounds_from_location_dimensions((-18.0, -34.10, 24.50), (1.0, 0.12, 17.60)),
    "V13_RearCathedralRecess_L_3": bounds_from_location_dimensions((-22.0, -34.10, 24.50), (1.0, 0.12, 17.60)),
    "V13_RearCathedralRecess_R_0": bounds_from_location_dimensions((10.0, -34.10, 24.50), (1.0, 0.12, 17.60)),
    "V13_RearCathedralRecess_R_1": bounds_from_location_dimensions((14.0, -34.10, 24.50), (1.0, 0.12, 17.60)),
    "V13_RearCathedralRecess_R_2": bounds_from_location_dimensions((18.0, -34.10, 24.50), (1.0, 0.12, 17.60)),
    "V13_RearCathedralRecess_R_3": bounds_from_location_dimensions((22.0, -34.10, 24.50), (1.0, 0.12, 17.60)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V13_RearCathedralRecess_L_0")
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
        fallback = FALLBACK_BOUNDS.get(name)
        if fallback is None:
            raise RuntimeError(f"Missing object: {name}")
        return fallback
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def transform_points(points, center_x, center_z, scale_x=1.0, scale_z=1.0, z_shift=0.0):
    return [
        (center_x + (x - center_x) * scale_x, center_z + (z - center_z) * scale_z + z_shift)
        for x, z in points
    ]


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


def finalize(obj, bevel_width=0.018, bevel_segments=2):
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


def build_loft_object(name, material_name, collection, components, bevel_width=0.018, bevel_segments=2):
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


def lancet_profile(center_x, z_min, z_max, half_width, shoulder_ratio=0.66):
    height = z_max - z_min
    shoulder_z = z_min + height * shoulder_ratio
    return [
        (center_x - half_width * 0.34, z_min - height * 0.03),
        (center_x - half_width * 0.68, z_min + height * 0.02),
        (center_x - half_width * 0.92, z_min + height * 0.10),
        (center_x - half_width, shoulder_z - height * 0.14),
        (center_x - half_width * 0.96, shoulder_z + height * 0.05),
        (center_x - half_width * 0.74, shoulder_z + height * 0.18),
        (center_x - half_width * 0.42, z_max - height * 0.02),
        (center_x - half_width * 0.16, z_max + height * 0.05),
        (center_x, z_max + height * 0.08),
        (center_x + half_width * 0.16, z_max + height * 0.05),
        (center_x + half_width * 0.42, z_max - height * 0.02),
        (center_x + half_width * 0.74, shoulder_z + height * 0.18),
        (center_x + half_width * 0.96, shoulder_z + height * 0.05),
        (center_x + half_width, shoulder_z - height * 0.14),
        (center_x + half_width * 0.92, z_min + height * 0.10),
        (center_x + half_width * 0.68, z_min + height * 0.02),
        (center_x + half_width * 0.34, z_min - height * 0.03),
        (center_x, z_min - height * 0.06),
    ]


def frame_components(side):
    components = []
    for index in range(4):
        bounds = existing_bounds(f"V13_RearCathedralRecess_{side}_{index}")
        center_x = midpoint(bounds, "x")
        center_z = midpoint(bounds, "z")
        width = (bounds["x"][1] - bounds["x"][0]) * 0.5 + 0.24
        z_min = bounds["z"][0] - 0.18
        z_max = bounds["z"][1] + 0.42
        profile = lancet_profile(center_x, z_min, z_max, width, shoulder_ratio=0.60)
        front_y = bounds["y"][1] + 0.12
        back_y = bounds["y"][0] - 0.18
        components.append(
            [
                (front_y, profile),
                (front_y - 0.05, transform_points(profile, center_x, center_z, scale_x=0.992, scale_z=0.988)),
                (back_y + 0.05, transform_points(profile, center_x, center_z, scale_x=0.962, scale_z=0.950, z_shift=-0.05)),
                (back_y, transform_points(profile, center_x, center_z, scale_x=0.942, scale_z=0.928, z_shift=-0.08)),
            ]
        )
    return components


def pearl_components(side):
    components = []
    for index in range(4):
        bounds = existing_bounds(f"V13_RearCathedralRecess_{side}_{index}")
        center_x = midpoint(bounds, "x")
        center_z = midpoint(bounds, "z")
        width = (bounds["x"][1] - bounds["x"][0]) * 0.5 - 0.06
        z_min = bounds["z"][0] + 0.46
        z_max = bounds["z"][1] - 0.26
        profile = lancet_profile(center_x, z_min, z_max, width, shoulder_ratio=0.63)
        front_y = bounds["y"][1] + 0.08
        back_y = bounds["y"][0] - 0.08
        components.append(
            [
                (front_y, profile),
                (back_y + 0.03, transform_points(profile, center_x, center_z, scale_x=0.974, scale_z=0.964, z_shift=-0.03)),
                (back_y, transform_points(profile, center_x, center_z, scale_x=0.954, scale_z=0.944, z_shift=-0.05)),
            ]
        )
    return components


def gold_components(side):
    components = []
    for index in range(4):
        bounds = existing_bounds(f"V13_RearCathedralRecess_{side}_{index}")
        center_x = midpoint(bounds, "x")
        center_z = midpoint(bounds, "z")
        width = (bounds["x"][1] - bounds["x"][0]) * 0.5 - 0.30
        z_min = bounds["z"][0] + 0.30
        z_max = bounds["z"][1] + 0.16
        profile = lancet_profile(center_x, z_min, z_max, width, shoulder_ratio=0.68)
        front_y = bounds["y"][1] + 0.15
        back_y = bounds["y"][0] + 0.01
        components.append(
            [
                (front_y, profile),
                (back_y + 0.02, transform_points(profile, center_x, center_z, scale_x=0.970, scale_z=0.976, z_shift=-0.01)),
                (back_y, transform_points(profile, center_x, center_z, scale_x=0.952, scale_z=0.958, z_shift=-0.02)),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)

frame_left = frame_components("L")
frame_right = frame_components("R")
pearl_left = pearl_components("L")
pearl_right = pearl_components("R")
gold_left = gold_components("L")
gold_right = gold_components("R")

delete_existing(LEGACY_NAMES)

build_loft_object("V88_RearCathedralLancetFrameArray_L", SHADOW, collection, frame_left, bevel_width=0.02, bevel_segments=1)
build_loft_object("V88_RearCathedralLancetFrameArray_R", SHADOW, collection, frame_right, bevel_width=0.02, bevel_segments=1)
build_loft_object("V88_RearCathedralLancetPearlArray_L", PEARL, collection, pearl_left, bevel_width=0.016, bevel_segments=1)
build_loft_object("V88_RearCathedralLancetPearlArray_R", PEARL, collection, pearl_right, bevel_width=0.016, bevel_segments=1)
build_loft_object("V88_RearCathedralLancetGoldArray_L", GOLD, collection, gold_left, bevel_width=0.012, bevel_segments=1)
build_loft_object("V88_RearCathedralLancetGoldArray_R", GOLD, collection, gold_right, bevel_width=0.012, bevel_segments=1)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V88_REAR_CATHEDRAL_RECESS_REPLACEMENT_COMPLETE replacements=6")
