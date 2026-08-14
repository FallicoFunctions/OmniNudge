from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V52_CrownObeliskPearlCore <-> V52_CrownObeliskGoldTracery  overlap: 0.40m on Z fronting
#   V52_CrownObeliskPearlCore <-> V52_CrownObeliskShadowSpine  overlap: 0.40m on Z rear spine
#   V52_CrownObeliskPearlCore <-> V52_CrownSpirePearlBlade_[L/R] overlap: 0.40m on X shoulder tie-in
#   V52_CrownSpirePearlBlade_[L/R] <-> V52_CrownSpireGoldFin_[L/R] overlap: 0.40m on X layered fin stack
#   V52_CrownSpirePearlBlade_[L/R] <-> V52_CrownApexPedestal  overlap: 0.40m on Y crown step-up
#   V52_CrownApexPedestal <-> V52_CrownApexCrystal            overlap: 0.40m on Y crystal seat

LEGACY_NAMES = [
    "V4_CrownTower",
    "V4_CrownSpire",
    "V4_CrownApex",
    "V7_CrownTowerGoldBand_44",
    "V7_CrownTowerGoldBand_50",
    "V7_CrownTowerGoldBand_56",
    "V7_CrownTowerGoldBand_62",
    "V14_CrownTowerVerticalInlay_0",
    "V14_CrownTowerVerticalInlay_1",
    "V14_CrownTowerVerticalInlay_2",
    "V14_CrownTowerVerticalInlay_3",
    "V14_CrownTowerVerticalInlay_4",
    "V14_CrownApexCyanCrystal",
    "V14_CrownCrystalPedestalGold",
]

REPLACEMENT_NAMES = [
    "V52_CrownObeliskPearlCore",
    "V52_CrownObeliskGoldTracery",
    "V52_CrownObeliskShadowSpine",
    "V52_CrownSpirePearlBlade_L",
    "V52_CrownSpirePearlBlade_R",
    "V52_CrownSpireGoldFin_L",
    "V52_CrownSpireGoldFin_R",
    "V52_CrownApexCrystal",
    "V52_CrownApexPedestal",
]

PEARL = "V16_PearlArchitecturalShell"
GOLD = "V20_ChasedGoldFiligree"
SHADOW = "V20_RecessedWarmShadow"
CRYSTAL = "V20_CelestialCyanGlass"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V25_HeroPortalOuterOgive_L")
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


def hide_legacy(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        obj.hide_render = True
        obj.hide_viewport = True


def proxy_bounds(name):
    obj = bpy.data.objects[name]
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
        "x": (obj.location.x - half_x, obj.location.x + half_x),
        "y": (obj.location.y - half_y, obj.location.y + half_y),
        "z": (obj.location.z - half_z, obj.location.z + half_z),
    }


def offset_profile(center_x, profile):
    return [(center_x + x, z) for x, z in profile]


def add_prism_component(bm, points, y_min, y_max):
    base = [bm.verts.new((x, y_min, z)) for x, z in points]
    top = [bm.verts.new((x, y_max, z)) for x, z in points]
    bm.faces.new(base)
    bm.faces.new(list(reversed(top)))
    count = len(points)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([base[index], base[next_index], top[next_index], top[index]])


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.12, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, components, bevel_width=0.12, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_prism_component(
            bm,
            component["points"],
            component["y_min"],
            component["y_max"],
        )

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


def obelisk_profile(width, z_min, z_max):
    mid_low = z_min + (z_max - z_min) * 0.48
    mid_high = z_min + (z_max - z_min) * 0.78
    return [
        (-width, z_min + 0.6),
        (-width, mid_low),
        (-width * 0.80, mid_high),
        (-width * 0.46, z_max - 1.4),
        (-width * 0.16, z_max + 1.6),
        (0.0, z_max + 3.0),
        (width * 0.16, z_max + 1.6),
        (width * 0.46, z_max - 1.4),
        (width * 0.80, mid_high),
        (width, mid_low),
        (width, z_min + 0.6),
        (width * 0.76, z_min - 0.35),
        (-width * 0.76, z_min - 0.35),
    ]


def slim_profile(width, z_min, z_max, crown=1.2):
    shoulder_low = z_min + (z_max - z_min) * 0.24
    upper = z_min + (z_max - z_min) * 0.76
    return [
        (-width * 0.70, z_min - 0.15),
        (-width, z_min + 0.2),
        (-width, shoulder_low),
        (-width * 0.92, upper),
        (-width * 0.70, z_max - 0.6),
        (-width * 0.30, z_max + 0.15),
        (0.0, z_max + crown),
        (width * 0.30, z_max + 0.15),
        (width * 0.70, z_max - 0.6),
        (width * 0.92, upper),
        (width, shoulder_low),
        (width, z_min + 0.2),
        (width * 0.70, z_min - 0.15),
    ]


def shadow_spine_profile(width, z_min, z_max, crown=1.5):
    lower_step = z_min + (z_max - z_min) * 0.22
    upper_step = z_min + (z_max - z_min) * 0.74
    return [
        (-width * 0.82, z_min - 0.35),
        (-width, z_min + 0.55),
        (-width, lower_step),
        (-width * 0.90, upper_step),
        (-width * 0.56, z_max - 0.5),
        (-width * 0.20, z_max + 0.45),
        (0.0, z_max + crown),
        (width * 0.20, z_max + 0.45),
        (width * 0.56, z_max - 0.5),
        (width * 0.90, upper_step),
        (width, lower_step),
        (width, z_min + 0.2),
        (width * 0.82, z_min - 0.35),
    ]


def crystal_profile(width, z_min, z_max):
    mid = (z_min + z_max) * 0.5
    return [
        (-width * 0.30, z_min),
        (-width, mid - 1.2),
        (-width * 0.44, z_max - 0.6),
        (0.0, z_max + 1.6),
        (width * 0.44, z_max - 0.6),
        (width, mid - 1.2),
        (width * 0.30, z_min),
        (0.0, z_min - 0.8),
    ]


ensure_object_mode()
collection = resolve_collection()

tower_bounds = proxy_bounds("V4_CrownTower")
spire_bounds = proxy_bounds("V4_CrownSpire")
apex_bounds = proxy_bounds("V4_CrownApex")
crystal_bounds = proxy_bounds("V14_CrownApexCyanCrystal")
pedestal_bounds = proxy_bounds("V14_CrownCrystalPedestalGold")

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

core_center_x = 0.0
core_z_min = tower_bounds["z"][0] - 0.6
core_z_max = tower_bounds["z"][1] + 2.6
core_y_min = tower_bounds["y"][0] - 1.0
core_y_max = tower_bounds["y"][1] + 1.4

build_profile_object(
    "V52_CrownObeliskPearlCore",
    PEARL,
    collection,
    [
        {
            "points": offset_profile(core_center_x, obelisk_profile(2.35, core_z_min, core_z_max)),
            "y_min": core_y_min,
            "y_max": core_y_max,
        },
        {
            "points": offset_profile(core_center_x, obelisk_profile(1.45, core_z_min + 4.2, core_z_max - 3.0)),
            "y_min": core_y_max - 1.9,
            "y_max": core_y_max + 0.8,
        },
    ],
    bevel_width=0.18,
)

tracery_components = []
for center_x, width in [(-1.75, 0.24), (-0.9, 0.18), (0.0, 0.16), (0.9, 0.18), (1.75, 0.24)]:
    tracery_components.append(
        {
            "points": offset_profile(
                center_x,
                slim_profile(width, tower_bounds["z"][0] + 2.0, core_z_max + 1.4, crown=1.1),
            ),
            "y_min": tower_bounds["y"][1] + 1.05,
            "y_max": tower_bounds["y"][1] + 1.55,
        }
    )
for z_center, width in [(44.0, 3.8), (50.0, 3.1), (56.0, 2.5), (62.0, 1.9)]:
    tracery_components.append(
        {
            "points": offset_profile(core_center_x, [
                (-width, z_center - 0.24),
                (-width, z_center + 0.24),
                (width, z_center + 0.24),
                (width, z_center - 0.24),
            ]),
            "y_min": tower_bounds["y"][1] + 0.95,
            "y_max": tower_bounds["y"][1] + 1.7,
        }
    )
build_profile_object(
    "V52_CrownObeliskGoldTracery",
    GOLD,
    collection,
    tracery_components,
    bevel_width=0.07,
    bevel_segments=3,
)

build_profile_object(
    "V52_CrownObeliskShadowSpine",
    SHADOW,
    collection,
    [
        {
            "points": offset_profile(
                core_center_x,
                shadow_spine_profile(0.86, tower_bounds["z"][0] + 1.8, spire_bounds["z"][1] + 2.7, crown=2.3),
            ),
            "y_min": tower_bounds["y"][0] - 1.55,
            "y_max": tower_bounds["y"][0] - 0.45,
        },
        {
            "points": offset_profile(
                -0.92,
                slim_profile(0.34, tower_bounds["z"][0] + 4.4, spire_bounds["z"][1] + 0.8, crown=0.9),
            ),
            "y_min": tower_bounds["y"][0] - 1.35,
            "y_max": tower_bounds["y"][0] - 0.15,
        },
        {
            "points": offset_profile(
                0.92,
                slim_profile(0.34, tower_bounds["z"][0] + 4.4, spire_bounds["z"][1] + 0.8, crown=0.9),
            ),
            "y_min": tower_bounds["y"][0] - 1.35,
            "y_max": tower_bounds["y"][0] - 0.15,
        },
        {
            "points": offset_profile(core_center_x, [
                (-1.18, tower_bounds["z"][0] + 6.0),
                (-0.52, tower_bounds["z"][0] + 7.1),
                (0.52, tower_bounds["z"][0] + 7.1),
                (1.18, tower_bounds["z"][0] + 6.0),
                (0.76, tower_bounds["z"][0] + 5.2),
                (-0.76, tower_bounds["z"][0] + 5.2),
            ]),
            "y_min": tower_bounds["y"][0] - 1.65,
            "y_max": tower_bounds["y"][0] - 0.95,
        },
    ],
    bevel_width=0.05,
)

blade_y_min = spire_bounds["y"][0] - 1.1
blade_y_max = apex_bounds["y"][1] + 0.35
for suffix, center_x, blade_width, fin_width in [("L", -3.12, 1.18, 0.42), ("R", 3.12, 1.18, 0.42)]:
    build_profile_object(
        f"V52_CrownSpirePearlBlade_{suffix}",
        PEARL,
        collection,
        [
            {
                "points": offset_profile(center_x, slim_profile(blade_width, spire_bounds["z"][0] + 1.1, apex_bounds["z"][1] + 1.4, crown=2.4)),
                "y_min": blade_y_min,
                "y_max": blade_y_max,
            }
        ],
        bevel_width=0.12,
    )
    build_profile_object(
        f"V52_CrownSpireGoldFin_{suffix}",
        GOLD,
        collection,
        [
            {
                "points": offset_profile(center_x * 1.14, slim_profile(fin_width, spire_bounds["z"][0] + 3.0, apex_bounds["z"][1] + 0.4, crown=1.3)),
                "y_min": blade_y_min + 0.2,
                "y_max": blade_y_max - 0.2,
            }
        ],
        bevel_width=0.06,
        bevel_segments=3,
    )

build_profile_object(
    "V52_CrownApexPedestal",
    GOLD,
    collection,
    [
        {
            "points": offset_profile(0.0, [
                (-2.35, pedestal_bounds["z"][0] - 0.15),
                (-1.75, pedestal_bounds["z"][1] + 0.2),
                (-0.48, pedestal_bounds["z"][1] + 0.85),
                (0.48, pedestal_bounds["z"][1] + 0.85),
                (1.75, pedestal_bounds["z"][1] + 0.2),
                (2.35, pedestal_bounds["z"][0] - 0.15),
                (1.65, pedestal_bounds["z"][0] - 0.55),
                (-1.65, pedestal_bounds["z"][0] - 0.55),
            ]),
            "y_min": pedestal_bounds["y"][0] - 1.75,
            "y_max": pedestal_bounds["y"][1] - 0.55,
        }
    ],
    bevel_width=0.08,
    bevel_segments=3,
)

build_profile_object(
    "V52_CrownApexCrystal",
    CRYSTAL,
    collection,
    [
        {
            "points": offset_profile(0.0, crystal_profile(2.7, crystal_bounds["z"][0] - 0.2, crystal_bounds["z"][1] + 2.0)),
            "y_min": crystal_bounds["y"][0] - 0.55,
            "y_max": crystal_bounds["y"][1] + 0.75,
        }
    ],
    bevel_width=0.09,
    bevel_segments=3,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V52_CrownObeliskPearlCore", "V52_CrownObeliskGoldTracery", axis="z", min_overlap=0.4)
verify_overlap("V52_CrownObeliskPearlCore", "V52_CrownObeliskShadowSpine", axis="z", min_overlap=0.4)
verify_overlap("V52_CrownObeliskPearlCore", "V52_CrownSpirePearlBlade_L", axis="x", min_overlap=0.4)
verify_overlap("V52_CrownObeliskPearlCore", "V52_CrownSpirePearlBlade_R", axis="x", min_overlap=0.4)
verify_overlap("V52_CrownSpirePearlBlade_L", "V52_CrownSpireGoldFin_L", axis="x", min_overlap=0.4)
verify_overlap("V52_CrownSpirePearlBlade_R", "V52_CrownSpireGoldFin_R", axis="x", min_overlap=0.4)
verify_overlap("V52_CrownSpirePearlBlade_L", "V52_CrownApexPedestal", axis="y", min_overlap=0.4)
verify_overlap("V52_CrownSpirePearlBlade_R", "V52_CrownApexPedestal", axis="y", min_overlap=0.4)
verify_overlap("V52_CrownApexPedestal", "V52_CrownApexCrystal", axis="y", min_overlap=0.4)

bpy.ops.wm.save_mainfile()
print("V52_CROWN_CORE_PROXY_REPLACEMENT_COMPLETE replacements=9")
