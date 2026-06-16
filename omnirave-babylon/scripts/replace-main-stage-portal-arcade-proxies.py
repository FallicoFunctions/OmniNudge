from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V68_PortalArcadePearl_[L/R] <-> V68_PortalArcadeGoldCrest_[L/R] overlap: 0.25m on Z arcade cornice
#   V68_PortalArcadePearl_[L/R] <-> V68_PortalArcadeCyanSpine_[L/R] overlap: 0.18m on X jeweled inset
#   V68_PortalArcadePearl_[L/R] <-> V68_PortalArcadeShadowCore_[L/R] overlap: 0.20m on Y rear depth
#   V68_GrandArcadePearlColonnade_[L/R] <-> V68_GrandArcadeGoldBands_[L/R] overlap: 0.20m on Z crown band
#   V68_HeroPortalPearlApron <-> V68_HeroPortalCyanPlinth overlap: 2.40m on X center dais
#   V68_HeroPortalCyanPlinth <-> V68_HeroPortalShadowDais overlap: 2.40m on X inset cradle

LEGACY_NAMES = [
    "V5_PortalCap",
    "V5_PortalApron",
    "V5_ScreenPlinth",
    "V5_ArcadeBeam_L",
    "V5_ArcadeBeam_R",
    *(f"V5_ArcadeCol_L_{index}" for index in range(3)),
    *(f"V5_ArcadeCol_R_{index}" for index in range(3)),
    *(f"V5_ArcadeColInner_L_{index}" for index in range(3)),
    *(f"V5_ArcadeColInner_R_{index}" for index in range(3)),
    *(f"V7_ArcadeCol_L_{index}" for index in range(5)),
    *(f"V7_ArcadeCol_R_{index}" for index in range(5)),
    *(f"V7_ArcadeColGoldBand_L_{index}" for index in range(5)),
    *(f"V7_ArcadeColGoldBand_R_{index}" for index in range(5)),
]

REPLACEMENT_NAMES = [
    "V68_PortalArcadePearl_L",
    "V68_PortalArcadePearl_R",
    "V68_PortalArcadeGoldCrest_L",
    "V68_PortalArcadeGoldCrest_R",
    "V68_PortalArcadeCyanSpine_L",
    "V68_PortalArcadeCyanSpine_R",
    "V68_PortalArcadeShadowCore_L",
    "V68_PortalArcadeShadowCore_R",
    "V68_GrandArcadePearlColonnade_L",
    "V68_GrandArcadePearlColonnade_R",
    "V68_GrandArcadeGoldBands_L",
    "V68_GrandArcadeGoldBands_R",
    "V68_HeroPortalPearlApron",
    "V68_HeroPortalGoldCap",
    "V68_HeroPortalCyanPlinth",
    "V68_HeroPortalShadowDais",
]

PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"
CYAN = "V19_ArrivalCyanGlow"
SHADOW = "V20_RecessedWarmShadow"


def bounds_from_location_dimensions(location, dimensions):
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    return {
        "x": (location[0] - half_x, location[0] + half_x),
        "y": (location[1] - half_y, location[1] + half_y),
        "z": (location[2] - half_z, location[2] + half_z),
        "center": location,
    }


LEGACY_FALLBACK_BOUNDS = {
    "V5_ArcadeBeam_L": bounds_from_location_dimensions((-14.0, -0.5, 0.9), (11.0, 28.0, 0.7)),
    "V5_ArcadeBeam_R": bounds_from_location_dimensions((14.0, -0.5, 0.9), (11.0, 28.0, 0.7)),
    "V5_PortalApron": bounds_from_location_dimensions((0.0, -10.0, 3.1), (6.0, 12.0, 0.36)),
    "V5_PortalCap": bounds_from_location_dimensions((0.0, -35.8, 35.6), (10.8, 1.6, 1.6)),
    "V5_ScreenPlinth": bounds_from_location_dimensions((0.0, -24.0, 3.2), (7.2, 6.4, 1.6)),
}

for side, sign in (("L", -1.0), ("R", 1.0)):
    beam_x = -14.0 if side == "L" else 14.0
    for index, y_center in enumerate((-11.0, -3.0, 5.0)):
        LEGACY_FALLBACK_BOUNDS[f"V5_ArcadeCol_{side}_{index}"] = bounds_from_location_dimensions(
            (sign * 9.2, y_center, 0.9), (0.7, 0.9, 1.8)
        )
        LEGACY_FALLBACK_BOUNDS[f"V5_ArcadeColInner_{side}_{index}"] = bounds_from_location_dimensions(
            (sign * 14.8, y_center, 0.9), (0.7, 0.9, 1.8)
        )
    for index, x_center in enumerate((28.5, 36.0, 43.5, 51.0, 58.5)):
        LEGACY_FALLBACK_BOUNDS[f"V7_ArcadeCol_{side}_{index}"] = bounds_from_location_dimensions(
            (sign * x_center, -7.2, 7.2), (0.76, 0.76, 10.2)
        )
        LEGACY_FALLBACK_BOUNDS[f"V7_ArcadeColGoldBand_{side}_{index}"] = bounds_from_location_dimensions(
            (sign * x_center, -7.2, 12.35), (1.1, 0.3, 0.24)
        )


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V5_ArcadeBeam_L")
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
        fallback = LEGACY_FALLBACK_BOUNDS.get(name)
        if fallback is None:
            raise RuntimeError(f"Missing proxy object: {name}")
        return fallback
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
        "x": (obj.location.x - half_x, obj.location.x + half_x),
        "y": (obj.location.y - half_y, obj.location.y + half_y),
        "z": (obj.location.z - half_z, obj.location.z + half_z),
        "center": (obj.location.x, obj.location.y, obj.location.z),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.03, bevel_segments=2):
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


def rounded_loop(center_a, center_b, half_a, half_b, power, segments):
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        cos_angle = math.cos(angle)
        sin_angle = math.sin(angle)
        a = center_a + math.copysign(abs(cos_angle) ** power, cos_angle) * half_a
        b = center_b + math.copysign(abs(sin_angle) ** power, sin_angle) * half_b
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


def add_ring_stack_y(bm, loops):
    rings = []
    for y, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, z in points])

    for near_ring, far_ring in zip(rings, rings[1:]):
        count = len(near_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    near_ring[index],
                    far_ring[index],
                    far_ring[next_index],
                    near_ring[next_index],
                ]
            )

    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))


def build_loft_object_z(name, material_name, collection, components, bevel_width=0.03, bevel_segments=2):
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


def build_loft_object_y(name, material_name, collection, components, bevel_width=0.03, bevel_segments=2):
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
    return bounds


def verify_overlap(name_a, name_b, axis="z", min_overlap=0.005):
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


def grand_arcade_snapshot(side):
    return {
        "columns": [proxy_bounds(f"V7_ArcadeCol_{side}_{index}") for index in range(5)],
        "bands": [proxy_bounds(f"V7_ArcadeColGoldBand_{side}_{index}") for index in range(5)],
    }


def portal_arcade_snapshot(side):
    return {
        "beam": proxy_bounds(f"V5_ArcadeBeam_{side}"),
        "outer_columns": [proxy_bounds(f"V5_ArcadeCol_{side}_{index}") for index in range(3)],
        "inner_columns": [proxy_bounds(f"V5_ArcadeColInner_{side}_{index}") for index in range(3)],
    }


def center_portal_snapshot():
    return {
        "apron": proxy_bounds("V5_PortalApron"),
        "cap": proxy_bounds("V5_PortalCap"),
        "plinth": proxy_bounds("V5_ScreenPlinth"),
    }


def grand_arcade_column_components(snapshot):
    components = []
    for bounds in snapshot["columns"]:
        center_x = midpoint(bounds, "x")
        center_y = midpoint(bounds, "y")
        z_min = bounds["z"][0] - 0.55
        z_max = bounds["z"][1] + 1.05
        components.append(
            [
                (z_min, rounded_loop(center_x, center_y, 0.62, 0.62, 3.6, 28)),
                (z_min + 0.45, rounded_loop(center_x, center_y, 0.52, 0.52, 3.8, 28)),
                (z_min + 1.15, rounded_loop(center_x, center_y, 0.44, 0.44, 4.2, 28)),
                (z_max - 1.55, rounded_loop(center_x, center_y, 0.44, 0.44, 4.2, 28)),
                (z_max - 0.40, rounded_loop(center_x, center_y, 0.54, 0.54, 3.8, 28)),
                (z_max + 0.28, rounded_loop(center_x, center_y, 0.66, 0.66, 3.4, 28)),
            ]
        )
    return components


def grand_arcade_gold_components(snapshot):
    components = []
    for column_bounds, band_bounds in zip(snapshot["columns"], snapshot["bands"]):
        center_x = midpoint(column_bounds, "x")
        center_y = midpoint(column_bounds, "y")
        z_mid = midpoint(band_bounds, "z") + 0.15
        components.append(
            [
                (z_mid - 0.34, rounded_loop(center_x, center_y, 0.82, 0.74, 3.0, 24)),
                (z_mid, rounded_loop(center_x, center_y, 0.68, 0.60, 3.2, 24)),
                (z_mid + 0.34, rounded_loop(center_x, center_y, 0.82, 0.74, 3.0, 24)),
            ]
        )
    return components


def beam_profile(x_min, x_max, z_min, z_max):
    center_x = (x_min + x_max) * 0.5
    inset = (x_max - x_min) * 0.08
    return [
        (x_min + inset, z_min - 0.10),
        (x_min, z_min + 0.22),
        (x_min, z_max - 0.28),
        (x_min + inset * 0.6, z_max + 0.10),
        (center_x - inset * 0.7, z_max + 0.30),
        (center_x, z_max + 0.52),
        (center_x + inset * 0.7, z_max + 0.30),
        (x_max - inset * 0.6, z_max + 0.10),
        (x_max, z_max - 0.28),
        (x_max, z_min + 0.22),
        (x_max - inset, z_min - 0.10),
        (center_x + inset * 0.7, z_min - 0.28),
        (center_x - inset * 0.7, z_min - 0.28),
    ]


def ogive_profile(center_x, z_min, z_max, half_width):
    return [
        (center_x - half_width * 0.80, z_min - 0.18),
        (center_x - half_width, z_min + 0.55),
        (center_x - half_width * 0.96, z_min + 1.55),
        (center_x - half_width * 0.72, z_max - 0.72),
        (center_x - half_width * 0.34, z_max - 0.08),
        (center_x, z_max + 0.44),
        (center_x + half_width * 0.34, z_max - 0.08),
        (center_x + half_width * 0.72, z_max - 0.72),
        (center_x + half_width * 0.96, z_min + 1.55),
        (center_x + half_width, z_min + 0.55),
        (center_x + half_width * 0.80, z_min - 0.18),
        (center_x + half_width * 0.35, z_min - 0.34),
        (center_x - half_width * 0.35, z_min - 0.34),
    ]


def crown_profile(center_x, z_mid, half_width):
    return [
        (center_x - half_width, z_mid - 0.15),
        (center_x - half_width * 0.88, z_mid + 0.20),
        (center_x - half_width * 0.48, z_mid + 0.42),
        (center_x, z_mid + 0.62),
        (center_x + half_width * 0.48, z_mid + 0.42),
        (center_x + half_width * 0.88, z_mid + 0.20),
        (center_x + half_width, z_mid - 0.15),
        (center_x + half_width * 0.55, z_mid - 0.40),
        (center_x - half_width * 0.55, z_mid - 0.40),
    ]


def portal_arcade_pearl_components(snapshot):
    beam = snapshot["beam"]
    beam_x = beam["x"]
    beam_y = beam["y"]
    beam_z = beam["z"]
    components = [
        [
            (beam_y[0] - 0.25, beam_profile(beam_x[0] - 0.45, beam_x[1] + 0.45, 0.05, beam_z[1] + 0.95)),
            (beam_y[0] + 0.90, beam_profile(beam_x[0] - 0.30, beam_x[1] + 0.30, 0.10, beam_z[1] + 1.05)),
            (midpoint(beam, "y"), beam_profile(beam_x[0] - 0.20, beam_x[1] + 0.20, 0.16, beam_z[1] + 1.10)),
            (beam_y[1] - 0.90, beam_profile(beam_x[0] - 0.30, beam_x[1] + 0.30, 0.10, beam_z[1] + 1.05)),
            (beam_y[1] + 0.25, beam_profile(beam_x[0] - 0.45, beam_x[1] + 0.45, 0.05, beam_z[1] + 0.95)),
        ]
    ]

    for bounds in [*snapshot["outer_columns"], *snapshot["inner_columns"]]:
        center_x = midpoint(bounds, "x")
        center_y = midpoint(bounds, "y")
        components.append(
            [
                (center_y - 0.64, ogive_profile(center_x, 0.04, 4.15, 0.62)),
                (center_y, ogive_profile(center_x, 0.00, 4.45, 0.72)),
                (center_y + 0.64, ogive_profile(center_x, 0.04, 4.15, 0.62)),
            ]
        )
    return components


def portal_arcade_gold_components(snapshot):
    beam = snapshot["beam"]
    beam_x = beam["x"]
    beam_y = beam["y"]
    components = [
        [
            (beam_y[0] + 0.40, crown_profile(midpoint(beam, "x"), 2.35, (beam_x[1] - beam_x[0]) * 0.54)),
            (midpoint(beam, "y"), crown_profile(midpoint(beam, "x"), 2.55, (beam_x[1] - beam_x[0]) * 0.50)),
            (beam_y[1] - 0.40, crown_profile(midpoint(beam, "x"), 2.35, (beam_x[1] - beam_x[0]) * 0.54)),
        ]
    ]

    for bounds in snapshot["outer_columns"]:
        center_x = midpoint(bounds, "x")
        center_y = midpoint(bounds, "y")
        components.append(
            [
                (center_y - 0.34, crown_profile(center_x, 3.52, 0.56)),
                (center_y, crown_profile(center_x, 3.70, 0.48)),
                (center_y + 0.34, crown_profile(center_x, 3.52, 0.56)),
            ]
        )
    return components


def portal_arcade_cyan_components(snapshot):
    components = []
    for outer_bounds, inner_bounds in zip(snapshot["outer_columns"], snapshot["inner_columns"]):
        center_x = (midpoint(outer_bounds, "x") + midpoint(inner_bounds, "x")) * 0.5
        center_y = midpoint(outer_bounds, "y")
        components.append(
            [
                (center_y - 0.24, ogive_profile(center_x, 0.65, 3.20, 0.26)),
                (center_y, ogive_profile(center_x, 0.55, 3.55, 0.32)),
                (center_y + 0.24, ogive_profile(center_x, 0.65, 3.20, 0.26)),
            ]
        )
    return components


def portal_arcade_shadow_components(snapshot, side):
    beam = snapshot["beam"]
    x_min = beam["x"][0] - 0.65 if side == "L" else beam["x"][0] - 0.15
    x_max = beam["x"][1] + 0.15 if side == "L" else beam["x"][1] + 0.65
    center_x = (x_min + x_max) * 0.5
    half_x = (x_max - x_min) * 0.5
    z_center = 2.15
    half_z = 2.18
    return [
        [
            (beam["y"][0] - 0.10, rounded_loop(center_x, z_center, half_x * 0.94, half_z * 0.92, 2.8, 18)),
            (midpoint(beam, "y"), rounded_loop(center_x, z_center + 0.04, half_x, half_z, 3.0, 18)),
            (beam["y"][1] + 0.10, rounded_loop(center_x, z_center, half_x * 0.94, half_z * 0.92, 2.8, 18)),
        ]
    ]


def center_apron_components(snapshot):
    apron = snapshot["apron"]
    x_center = midpoint(apron, "x")
    width = (apron["x"][1] - apron["x"][0]) * 0.93
    z_low = apron["z"][0] - 0.38
    z_high = apron["z"][1] + 0.82
    return [
        [
            (apron["y"][0] - 0.35, rounded_loop(x_center, (z_low + z_high) * 0.5, width * 0.52, (z_high - z_low) * 0.44, 3.0, 22)),
            (apron["y"][0] + 1.10, rounded_loop(x_center, (z_low + z_high) * 0.5, width * 0.50, (z_high - z_low) * 0.46, 3.3, 22)),
            (midpoint(apron, "y"), rounded_loop(x_center, (z_low + z_high) * 0.5 + 0.18, width * 0.56, (z_high - z_low) * 0.52, 3.6, 22)),
            (apron["y"][1] - 1.10, rounded_loop(x_center, (z_low + z_high) * 0.5, width * 0.50, (z_high - z_low) * 0.46, 3.3, 22)),
            (apron["y"][1] + 0.35, rounded_loop(x_center, (z_low + z_high) * 0.5, width * 0.52, (z_high - z_low) * 0.44, 3.0, 22)),
        ]
    ]


def center_cap_components(snapshot):
    cap = snapshot["cap"]
    x_center = midpoint(cap, "x")
    width = (cap["x"][1] - cap["x"][0]) * 0.66
    z_center = midpoint(cap, "z")
    return [
        [
            (cap["y"][0] - 0.30, rounded_loop(x_center, z_center, width, 0.74, 2.8, 18)),
            (midpoint(cap, "y"), rounded_loop(x_center, z_center + 0.24, width * 0.90, 0.92, 3.0, 18)),
            (cap["y"][1] + 0.30, rounded_loop(x_center, z_center, width, 0.74, 2.8, 18)),
        ]
    ]


def center_cyan_components(snapshot):
    plinth = snapshot["plinth"]
    x_center = midpoint(plinth, "x")
    z_center = midpoint(plinth, "z")
    return [
        [
            (plinth["y"][0] - 0.28, rounded_loop(x_center, z_center, 4.25, 1.55, 3.0, 18)),
            (midpoint(plinth, "y"), rounded_loop(x_center, z_center + 0.10, 3.80, 1.75, 3.2, 18)),
            (plinth["y"][1] + 0.28, rounded_loop(x_center, z_center, 4.25, 1.55, 3.0, 18)),
        ]
    ]


def center_shadow_components(snapshot):
    plinth = snapshot["plinth"]
    x_center = midpoint(plinth, "x")
    z_center = midpoint(plinth, "z") - 0.15
    return [
        [
            (plinth["y"][0] - 0.40, rounded_loop(x_center, z_center, 4.65, 1.35, 2.8, 18)),
            (midpoint(plinth, "y"), rounded_loop(x_center, z_center - 0.08, 4.10, 1.55, 3.0, 18)),
            (plinth["y"][1] + 0.40, rounded_loop(x_center, z_center, 4.65, 1.35, 2.8, 18)),
        ]
    ]


ensure_object_mode()
collection = resolve_collection()
delete_existing(REPLACEMENT_NAMES)

left_grand_arcade = grand_arcade_snapshot("L")
right_grand_arcade = grand_arcade_snapshot("R")
left_portal_arcade = portal_arcade_snapshot("L")
right_portal_arcade = portal_arcade_snapshot("R")
center_portal = center_portal_snapshot()

build_loft_object_y(
    "V68_PortalArcadePearl_L",
    PEARL,
    collection,
    portal_arcade_pearl_components(left_portal_arcade),
    bevel_width=0.035,
    bevel_segments=2,
)
build_loft_object_y(
    "V68_PortalArcadePearl_R",
    PEARL,
    collection,
    portal_arcade_pearl_components(right_portal_arcade),
    bevel_width=0.035,
    bevel_segments=2,
)
build_loft_object_y(
    "V68_PortalArcadeGoldCrest_L",
    GOLD,
    collection,
    portal_arcade_gold_components(left_portal_arcade),
    bevel_width=0.02,
    bevel_segments=2,
)
build_loft_object_y(
    "V68_PortalArcadeGoldCrest_R",
    GOLD,
    collection,
    portal_arcade_gold_components(right_portal_arcade),
    bevel_width=0.02,
    bevel_segments=2,
)
build_loft_object_y(
    "V68_PortalArcadeCyanSpine_L",
    CYAN,
    collection,
    portal_arcade_cyan_components(left_portal_arcade),
    bevel_width=0.012,
    bevel_segments=1,
)
build_loft_object_y(
    "V68_PortalArcadeCyanSpine_R",
    CYAN,
    collection,
    portal_arcade_cyan_components(right_portal_arcade),
    bevel_width=0.012,
    bevel_segments=1,
)
build_loft_object_y(
    "V68_PortalArcadeShadowCore_L",
    SHADOW,
    collection,
    portal_arcade_shadow_components(left_portal_arcade, "L"),
    bevel_width=0.02,
    bevel_segments=1,
)
build_loft_object_y(
    "V68_PortalArcadeShadowCore_R",
    SHADOW,
    collection,
    portal_arcade_shadow_components(right_portal_arcade, "R"),
    bevel_width=0.02,
    bevel_segments=1,
)
build_loft_object_z(
    "V68_GrandArcadePearlColonnade_L",
    PEARL,
    collection,
    grand_arcade_column_components(left_grand_arcade),
    bevel_width=0.03,
    bevel_segments=2,
)
build_loft_object_z(
    "V68_GrandArcadePearlColonnade_R",
    PEARL,
    collection,
    grand_arcade_column_components(right_grand_arcade),
    bevel_width=0.03,
    bevel_segments=2,
)
build_loft_object_z(
    "V68_GrandArcadeGoldBands_L",
    GOLD,
    collection,
    grand_arcade_gold_components(left_grand_arcade),
    bevel_width=0.018,
    bevel_segments=2,
)
build_loft_object_z(
    "V68_GrandArcadeGoldBands_R",
    GOLD,
    collection,
    grand_arcade_gold_components(right_grand_arcade),
    bevel_width=0.018,
    bevel_segments=2,
)
build_loft_object_y(
    "V68_HeroPortalPearlApron",
    PEARL,
    collection,
    center_apron_components(center_portal),
    bevel_width=0.03,
    bevel_segments=2,
)
build_loft_object_y(
    "V68_HeroPortalGoldCap",
    GOLD,
    collection,
    center_cap_components(center_portal),
    bevel_width=0.02,
    bevel_segments=2,
)
build_loft_object_y(
    "V68_HeroPortalCyanPlinth",
    CYAN,
    collection,
    center_cyan_components(center_portal),
    bevel_width=0.014,
    bevel_segments=1,
)
build_loft_object_y(
    "V68_HeroPortalShadowDais",
    SHADOW,
    collection,
    center_shadow_components(center_portal),
    bevel_width=0.02,
    bevel_segments=1,
)

delete_existing(LEGACY_NAMES)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V68_PortalArcadePearl_L", "V68_PortalArcadeGoldCrest_L", axis="z", min_overlap=0.25)
verify_overlap("V68_PortalArcadePearl_R", "V68_PortalArcadeGoldCrest_R", axis="z", min_overlap=0.25)
verify_overlap("V68_PortalArcadePearl_L", "V68_PortalArcadeCyanSpine_L", axis="x", min_overlap=0.18)
verify_overlap("V68_PortalArcadePearl_R", "V68_PortalArcadeCyanSpine_R", axis="x", min_overlap=0.18)
verify_overlap("V68_PortalArcadePearl_L", "V68_PortalArcadeShadowCore_L", axis="y", min_overlap=0.20)
verify_overlap("V68_PortalArcadePearl_R", "V68_PortalArcadeShadowCore_R", axis="y", min_overlap=0.20)
verify_overlap("V68_GrandArcadePearlColonnade_L", "V68_GrandArcadeGoldBands_L", axis="z", min_overlap=0.20)
verify_overlap("V68_GrandArcadePearlColonnade_R", "V68_GrandArcadeGoldBands_R", axis="z", min_overlap=0.20)
verify_overlap("V68_HeroPortalPearlApron", "V68_HeroPortalCyanPlinth", axis="x", min_overlap=2.40)
verify_overlap("V68_HeroPortalCyanPlinth", "V68_HeroPortalShadowDais", axis="x", min_overlap=2.40)
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V68_PORTAL_ARCADE_REPLACEMENT_COMPLETE replacements=16")
