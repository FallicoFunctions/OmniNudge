from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V89 pedestal component centers on one legacy V13 basin fountain light footprint with 0.18m Z overlap
#   each V89 light component nests inside its matching V89 pedestal bowl with 0.12m Z overlap
#   each V89 jet component rises through its matching V89 light bowl and stops 0.12m below the V35 mist veil
#   all nine components per side preserve the existing fountain X/Y cadence inside the V13 basin stone lip coverage

LEGACY_NAMES = [
    *(f"V13_BasinFountainJet_{side}_{row}_{col}" for side in ("L", "R") for row in range(3) for col in range(3)),
    *(f"V13_BasinFountainLight_{side}_{row}_{col}" for side in ("L", "R") for row in range(3) for col in range(3)),
]

REPLACEMENT_NAMES = [
    "V89_BasinFountainPedestalArray_L",
    "V89_BasinFountainPedestalArray_R",
    "V89_BasinFountainLightArray_L",
    "V89_BasinFountainLightArray_R",
    "V89_BasinFountainJetArray_L",
    "V89_BasinFountainJetArray_R",
]

PEARL = "V15_PearlShellBeveled"
LIGHT = "V13_WarmPracticalLight"
JET = "V14_CosmicScreenEmission"

FALLBACK_X = {
    "L": (-9.2, -12.0, -15.4),
    "R": (9.2, 12.0, 15.4),
}
FALLBACK_Y = (
    (-7.5, -3.0, 1.5),
    (10.15, 16.0, 21.85),
    (30.05, 35.0, 39.95),
)
FALLBACK_LIGHT_Z = 0.72
FALLBACK_JET_Z = 1.8
FALLBACK_LIGHT_DIMS = (0.36, 0.36, 0.10)
FALLBACK_JET_DIMS = (0.0666, 0.07, 1.7)
FALLBACK_MIST_BOUNDS = {
    "L": {"x": (-29.8525, -23.8633), "y": (-9.1471, -6.1087), "z": (3.14, 5.272)},
    "R": {"x": (23.8897, 29.8674), "y": (-9.1471, -6.1087), "z": (3.14, 5.272)},
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V13_BasinFountainJet_L_0_0") or bpy.data.objects.get("V13_BasinStoneLip_L_0")
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


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.012, bevel_segments=2):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


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


def build_loft_object(name, material_name, collection, components, bevel_width=0.012, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_ring_stack_z(bm, component)
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


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def bounds_from_location_dimensions(location, dimensions):
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    return {
        "x": (location[0] - half_x, location[0] + half_x),
        "y": (location[1] - half_y, location[1] + half_y),
        "z": (location[2] - half_z, location[2] + half_z),
    }


def existing_bounds(name, fallback):
    obj = bpy.data.objects.get(name)
    if obj is None:
        return fallback
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def floral_profile(center_x, center_y, radius_x, radius_y, petals=8, modulation=0.12, points=16, phase=0.0):
    profile = []
    for index in range(points):
        angle = 2.0 * math.pi * index / points
        lobe = 1.0 + modulation * math.cos(petals * angle + phase)
        profile.append(
            (
                center_x + math.cos(angle) * radius_x * lobe,
                center_y + math.sin(angle) * radius_y * lobe,
            )
        )
    return profile


def light_profile(center_x, center_y, radius_x, radius_y, points=14):
    profile = []
    for index in range(points):
        angle = 2.0 * math.pi * index / points
        modulation = 1.0 + 0.07 * math.cos(4.0 * angle)
        profile.append(
            (
                center_x + math.cos(angle) * radius_x * modulation,
                center_y + math.sin(angle) * radius_y * modulation,
            )
        )
    return profile


def jet_profile(center_x, center_y, radius, count=12, swirl=0.0):
    profile = []
    for index in range(count):
        angle = 2.0 * math.pi * index / count
        modulation = 1.0 + 0.12 * math.cos(3.0 * angle + swirl)
        profile.append(
            (
                center_x + math.cos(angle) * radius * modulation,
                center_y + math.sin(angle) * radius * modulation,
            )
        )
    return profile


def scale_points(points, center_x, center_y, scale_x, scale_y, x_shift=0.0, y_shift=0.0):
    return [
        (
            center_x + (x - center_x) * scale_x + x_shift,
            center_y + (y - center_y) * scale_y + y_shift,
        )
        for x, y in points
    ]


def verify_span(name, axis, minimum):
    bounds = world_bounds(name)
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{name} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


def jet_fallback(side, row, col):
    return bounds_from_location_dimensions(
        (FALLBACK_X[side][row], FALLBACK_Y[row][col], FALLBACK_JET_Z),
        FALLBACK_JET_DIMS,
    )


def light_fallback(side, row, col):
    return bounds_from_location_dimensions(
        (FALLBACK_X[side][row], FALLBACK_Y[row][col], FALLBACK_LIGHT_Z),
        FALLBACK_LIGHT_DIMS,
    )


def side_mist_bounds(side):
    return existing_bounds(f"V35_BasinFountainMist_{side}", FALLBACK_MIST_BOUNDS[side])


def gather_side_snapshots(side):
    mist = side_mist_bounds(side)
    snapshots = []
    for row in range(3):
        for col in range(3):
            jet_name = f"V13_BasinFountainJet_{side}_{row}_{col}"
            light_name = f"V13_BasinFountainLight_{side}_{row}_{col}"
            jet_bounds = existing_bounds(jet_name, jet_fallback(side, row, col))
            light_bounds = existing_bounds(light_name, light_fallback(side, row, col))
            snapshots.append(
                {
                    "jet_name": jet_name,
                    "light_name": light_name,
                    "center_x": midpoint(jet_bounds, "x"),
                    "center_y": midpoint(jet_bounds, "y"),
                    "light_bounds": light_bounds,
                    "jet_bounds": jet_bounds,
                    "mist_z_min": mist["z"][0],
                }
            )
    return snapshots


def pedestal_components(side):
    components = []
    for index, snapshot in enumerate(gather_side_snapshots(side)):
        center_x = snapshot["center_x"]
        center_y = snapshot["center_y"]
        light_bounds = snapshot["light_bounds"]
        bowl_radius_x = max((light_bounds["x"][1] - light_bounds["x"][0]) * 0.92, 0.44)
        bowl_radius_y = max((light_bounds["y"][1] - light_bounds["y"][0]) * 0.92, 0.44)
        z_base = light_bounds["z"][0] - 0.02
        z_mid = light_bounds["z"][0] + 0.08
        z_shoulder = light_bounds["z"][1] + 0.12
        z_top = light_bounds["z"][1] + 0.26
        phase = (index % 3) * 0.18
        profile = floral_profile(center_x, center_y, bowl_radius_x, bowl_radius_y, petals=6, modulation=0.10, points=12, phase=phase)
        components.append(
            [
                (z_base, scale_points(profile, center_x, center_y, 1.06, 1.06)),
                (z_mid, scale_points(profile, center_x, center_y, 1.00, 1.00)),
                (z_shoulder, scale_points(profile, center_x, center_y, 0.76, 0.76)),
                (z_top, scale_points(profile, center_x, center_y, 0.58, 0.58)),
            ]
        )
    return components


def light_components(side):
    components = []
    for index, snapshot in enumerate(gather_side_snapshots(side)):
        center_x = snapshot["center_x"]
        center_y = snapshot["center_y"]
        light_bounds = snapshot["light_bounds"]
        radius_x = max((light_bounds["x"][1] - light_bounds["x"][0]) * 0.50, 0.19)
        radius_y = max((light_bounds["y"][1] - light_bounds["y"][0]) * 0.50, 0.19)
        z_base = light_bounds["z"][0] + 0.02
        z_mid = light_bounds["z"][1] + 0.03
        z_top = light_bounds["z"][1] + 0.14
        profile = light_profile(center_x, center_y, radius_x, radius_y, points=12)
        phase_shift = 0.02 * ((index % 2) * 2 - 1)
        components.append(
            [
                (z_base, scale_points(profile, center_x, center_y, 1.02, 1.02)),
                (z_mid, scale_points(profile, center_x, center_y, 0.86, 0.86, x_shift=phase_shift)),
                (z_top, scale_points(profile, center_x, center_y, 0.68, 0.68)),
            ]
        )
    return components


def jet_components(side):
    components = []
    for index, snapshot in enumerate(gather_side_snapshots(side)):
        center_x = snapshot["center_x"]
        center_y = snapshot["center_y"]
        light_bounds = snapshot["light_bounds"]
        jet_bounds = snapshot["jet_bounds"]
        top_z = snapshot["mist_z_min"] - 0.12
        base_z = light_bounds["z"][0] + 0.03
        lower_z = light_bounds["z"][1] + 0.28
        mid_z = (lower_z + top_z) * 0.48
        upper_z = top_z - 0.34
        crown_z = top_z - 0.10
        radius_base = max((jet_bounds["x"][1] - jet_bounds["x"][0]) * 1.95, 0.11)
        radius_shaft = max((jet_bounds["x"][1] - jet_bounds["x"][0]) * 1.10, 0.055)
        phase = index * 0.22
        base_profile = jet_profile(center_x, center_y, radius_base, count=8, swirl=phase)
        shaft_profile = jet_profile(center_x, center_y, radius_shaft, count=8, swirl=phase + 0.4)
        crown_profile = jet_profile(center_x, center_y, radius_shaft * 1.55, count=8, swirl=phase + 0.8)
        tip_profile = jet_profile(center_x, center_y, radius_shaft * 0.50, count=8, swirl=phase + 1.1)
        components.append(
            [
                (base_z, base_profile),
                (lower_z, scale_points(base_profile, center_x, center_y, 0.56, 0.56)),
                (mid_z, shaft_profile),
                (crown_z, crown_profile),
                (top_z, tip_profile),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)

left_pedestals = pedestal_components("L")
right_pedestals = pedestal_components("R")
left_lights = light_components("L")
right_lights = light_components("R")
left_jets = jet_components("L")
right_jets = jet_components("R")

delete_existing(LEGACY_NAMES)

build_loft_object("V89_BasinFountainPedestalArray_L", PEARL, collection, left_pedestals, bevel_width=0.008, bevel_segments=1)
build_loft_object("V89_BasinFountainPedestalArray_R", PEARL, collection, right_pedestals, bevel_width=0.008, bevel_segments=1)
build_loft_object("V89_BasinFountainLightArray_L", LIGHT, collection, left_lights, bevel_width=0.0, bevel_segments=0)
build_loft_object("V89_BasinFountainLightArray_R", LIGHT, collection, right_lights, bevel_width=0.0, bevel_segments=0)
build_loft_object("V89_BasinFountainJetArray_L", JET, collection, left_jets, bevel_width=0.0, bevel_segments=0)
build_loft_object("V89_BasinFountainJetArray_R", JET, collection, right_jets, bevel_width=0.0, bevel_segments=0)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_span("V89_BasinFountainPedestalArray_L", "y", 47.0)
verify_span("V89_BasinFountainPedestalArray_R", "y", 47.0)
verify_span("V89_BasinFountainJetArray_L", "z", 2.2)
verify_span("V89_BasinFountainJetArray_R", "z", 2.2)
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V89_BASIN_FOUNTAIN_NOZZLE_REPLACEMENT_COMPLETE replacements=6")
