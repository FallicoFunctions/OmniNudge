from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   pearl basin shell <-> reflecting pool overlap: 11.80m on X, 2.70m on Y
#   pearl basin shell <-> gold rib canopy overlap: 0.22m on Z
#   every replacement stays centered on the VIP garden rows at Y=-7.6

LEGACY_NAMES = [
    "V16_VipGardenBasin_L",
    "V16_VipGardenBasin_R",
    "V16_VipGardenWater_L",
    "V16_VipGardenWater_R",
    *(f"V16_VipGardenGoldRib_L_{index}" for index in range(7)),
    *(f"V16_VipGardenGoldRib_R_{index}" for index in range(7)),
]

REPLACEMENT_NAMES = [
    "V67_VipGardenPearlBasin_L",
    "V67_VipGardenPearlBasin_R",
    "V67_VipGardenReflectingPool_L",
    "V67_VipGardenReflectingPool_R",
    "V67_VipGardenGoldRibCanopy_L",
    "V67_VipGardenGoldRibCanopy_R",
]

PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"
WATER = "V14_DeepReflectingWater"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V16_VipGardenWater_R")
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


def proxy_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"Missing proxy object: {name}")
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
        "x": (obj.location.x - half_x, obj.location.x + half_x),
        "y": (obj.location.y - half_y, obj.location.y + half_y),
        "z": (obj.location.z - half_z, obj.location.z + half_z),
        "center": (obj.location.x, obj.location.y, obj.location.z),
    }


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.02, bevel_segments=2):
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


def superellipse_loop(
    center_a,
    center_b,
    half_a,
    half_b,
    power,
    segments,
    modulation_amplitude=0.0,
    modulation_frequency=0,
    phase=0.0,
):
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        cos_angle = math.cos(angle)
        sin_angle = math.sin(angle)
        radius_scale = 1.0
        if modulation_frequency:
            radius_scale += modulation_amplitude * math.cos(modulation_frequency * angle + phase)
        a = center_a + math.copysign(abs(cos_angle) ** power, cos_angle) * half_a * radius_scale
        b = center_b + math.copysign(abs(sin_angle) ** power, sin_angle) * half_b * radius_scale
        points.append((a, b))
    return points


def add_ring_stack_z(bm, loops):
    rings = []
    for z, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, y in points])

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


def add_ring_stack_x(bm, loops):
    rings = []
    for x, points in loops:
        rings.append([bm.verts.new((x, y, z)) for y, z in points])

    for lower_ring, upper_ring in zip(rings, rings[1:]):
        count = len(lower_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    lower_ring[index],
                    upper_ring[index],
                    upper_ring[next_index],
                    lower_ring[next_index],
                ]
            )

    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))


def build_planform_object(name, material_name, collection, loops, bevel_width=0.02, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    add_ring_stack_z(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def build_rib_object(name, material_name, collection, components, bevel_width=0.015, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_ring_stack_x(bm, component)
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
    return bounds


def verify_overlap(name_a, name_b, axis="z", min_overlap=0.01):
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


def collect_side_snapshot(side):
    water = proxy_bounds(f"V16_VipGardenWater_{side}")
    ribs = [proxy_bounds(f"V16_VipGardenGoldRib_{side}_{index}") for index in range(7)]
    center_x = water["center"][0]
    center_y = water["center"][1]
    half_x = max(center_x - water["x"][0], water["x"][1] - center_x) + 0.70
    half_y = max(center_y - water["y"][0], water["y"][1] - center_y) + 0.64
    rib_centers = [rib["center"][0] for rib in ribs]
    return {
        "water": water,
        "ribs": ribs,
        "center_x": center_x,
        "center_y": center_y,
        "basin_half_x": half_x,
        "basin_half_y": half_y,
        "rib_centers": rib_centers,
    }


def basin_loops(snapshot):
    cx = snapshot["center_x"]
    cy = snapshot["center_y"]
    hx = snapshot["basin_half_x"]
    hy = snapshot["basin_half_y"]
    return [
        (
            2.82,
            superellipse_loop(cx, cy, hx * 0.84, hy * 0.82, 0.62, 160, modulation_amplitude=0.01, modulation_frequency=8),
        ),
        (
            2.98,
            superellipse_loop(cx, cy, hx * 0.94, hy * 0.90, 0.60, 160, modulation_amplitude=0.018, modulation_frequency=8),
        ),
        (
            3.26,
            superellipse_loop(cx, cy, hx * 1.00, hy * 0.98, 0.58, 160, modulation_amplitude=0.025, modulation_frequency=8),
        ),
        (
            3.64,
            superellipse_loop(cx, cy, hx * 1.03, hy * 1.00, 0.57, 160, modulation_amplitude=0.032, modulation_frequency=8),
        ),
        (
            3.98,
            superellipse_loop(cx, cy, hx * 0.93, hy * 0.90, 0.60, 160, modulation_amplitude=0.022, modulation_frequency=8),
        ),
    ]


def pool_loops(snapshot):
    water = snapshot["water"]
    cx, cy = water["center"][0], water["center"][1]
    hx = max(cx - water["x"][0], water["x"][1] - cx) - 0.14
    hy = max(cy - water["y"][0], water["y"][1] - cy) - 0.12
    return [
        (
            3.30,
            superellipse_loop(cx, cy, hx * 0.99, hy * 0.98, 0.70, 96, modulation_amplitude=0.008, modulation_frequency=4),
        ),
        (
            3.44,
            superellipse_loop(cx, cy, hx, hy, 0.72, 96, modulation_amplitude=0.012, modulation_frequency=4),
        ),
    ]


def rib_components(snapshot):
    components = []
    center_y = snapshot["center_y"]
    for index, center_x in enumerate(snapshot["rib_centers"]):
        phase = (index % 2) * 0.35
        outer_loop = superellipse_loop(
            center_y,
            3.92,
            1.82,
            0.34,
            0.74,
            72,
            modulation_amplitude=0.018,
            modulation_frequency=3,
            phase=phase,
        )
        core_loop = superellipse_loop(
            center_y,
            3.95,
            1.64,
            0.30,
            0.78,
            72,
            modulation_amplitude=0.012,
            modulation_frequency=3,
            phase=phase,
        )
        components.append(
            [
                (center_x - 0.10, outer_loop),
                (center_x, core_loop),
                (center_x + 0.10, outer_loop),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()
delete_existing(REPLACEMENT_NAMES)

left_snapshot = collect_side_snapshot("L")
right_snapshot = collect_side_snapshot("R")

build_planform_object(
    "V67_VipGardenPearlBasin_L",
    PEARL,
    collection,
    basin_loops(left_snapshot),
    bevel_width=0.03,
    bevel_segments=2,
)
build_planform_object(
    "V67_VipGardenPearlBasin_R",
    PEARL,
    collection,
    basin_loops(right_snapshot),
    bevel_width=0.03,
    bevel_segments=2,
)
build_planform_object(
    "V67_VipGardenReflectingPool_L",
    WATER,
    collection,
    pool_loops(left_snapshot),
    bevel_width=0.01,
    bevel_segments=2,
)
build_planform_object(
    "V67_VipGardenReflectingPool_R",
    WATER,
    collection,
    pool_loops(right_snapshot),
    bevel_width=0.01,
    bevel_segments=2,
)
build_rib_object(
    "V67_VipGardenGoldRibCanopy_L",
    GOLD,
    collection,
    rib_components(left_snapshot),
    bevel_width=0.016,
    bevel_segments=2,
)
build_rib_object(
    "V67_VipGardenGoldRibCanopy_R",
    GOLD,
    collection,
    rib_components(right_snapshot),
    bevel_width=0.016,
    bevel_segments=2,
)

delete_existing(LEGACY_NAMES)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V67_VipGardenPearlBasin_L", "V67_VipGardenReflectingPool_L", axis="x", min_overlap=11.5)
verify_overlap("V67_VipGardenPearlBasin_R", "V67_VipGardenReflectingPool_R", axis="x", min_overlap=11.5)
verify_overlap("V67_VipGardenPearlBasin_L", "V67_VipGardenReflectingPool_L", axis="y", min_overlap=2.6)
verify_overlap("V67_VipGardenPearlBasin_R", "V67_VipGardenReflectingPool_R", axis="y", min_overlap=2.6)
verify_overlap("V67_VipGardenPearlBasin_L", "V67_VipGardenGoldRibCanopy_L", axis="z", min_overlap=0.20)
verify_overlap("V67_VipGardenPearlBasin_R", "V67_VipGardenGoldRibCanopy_R", axis="z", min_overlap=0.20)
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V67_VIP_GARDEN_BASIN_REPLACEMENT_COMPLETE replacements=6")
