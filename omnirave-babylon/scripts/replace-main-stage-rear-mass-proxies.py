from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V51_RearCathedralMass_[L/R] <-> V51_RearCathedralCore         overlap: 0.60m on X silhouette
#   V51_RearCathedralMass_[L/R] <-> V51_ShoulderCrownMass_[L/R]   overlap: 0.60m on Y shell depth
#   V51_ShoulderCrownMass_[L/R] <-> V51_OculusCanopy_[L/R]        overlap: 0.60m on Z canopy reveal
#   V51_ProsceniumPylon_[L/R]   <-> V51_PortalCrestBridge         overlap: 0.60m on X crown span
#   V51_ProsceniumPylon_[L/R]   <-> V50_InnerPortalPylon_[L/R]    overlap: 0.60m on Y portal stack

LEGACY_NAMES = [
    "V4_RearMass_L",
    "V4_RearMass_R",
    "V4_RearCore",
    "V5_ShoulderMass_L",
    "V5_ShoulderMass_R",
    "V5_OculusHousing_L",
    "V5_OculusHousing_R",
    "V4_ProscTower_L",
    "V4_ProscTower_R",
    "V4_PortalTop",
]

REPLACEMENT_NAMES = [
    "V51_RearCathedralMass_L",
    "V51_RearCathedralMass_R",
    "V51_RearCathedralCore",
    "V51_ShoulderCrownMass_L",
    "V51_ShoulderCrownMass_R",
    "V51_OculusCanopy_L",
    "V51_OculusCanopy_R",
    "V51_ProsceniumPylon_L",
    "V51_ProsceniumPylon_R",
    "V51_PortalCrestBridge",
]

PEARL = "V16_PearlArchitecturalShell"
GOLD = "V20_ChasedGoldFiligree"


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


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


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


def axis_span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


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


def finalize(obj, bevel_width=0.2, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, components, bevel_width=0.2, bevel_segments=2):
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


def cathedral_mass_profile(width, z_min, z_max):
    mid_low = z_min + (z_max - z_min) * 0.62
    upper = z_min + (z_max - z_min) * 0.86
    return [
        (-width * 0.98, z_min + 0.45),
        (-width * 0.98, mid_low),
        (-width * 0.82, upper),
        (-width * 0.60, z_max - 1.4),
        (-width * 0.32, z_max + 0.6),
        (0.0, z_max + 1.8),
        (width * 0.32, z_max + 0.6),
        (width * 0.60, z_max - 1.4),
        (width * 0.82, upper),
        (width * 0.98, mid_low),
        (width * 0.98, z_min + 0.45),
        (width * 0.70, z_min - 0.25),
        (-width * 0.70, z_min - 0.25),
    ]


def core_profile(width, z_min, z_max):
    mid = z_min + (z_max - z_min) * 0.72
    upper = z_min + (z_max - z_min) * 0.9
    return [
        (-width * 0.92, z_min + 0.4),
        (-width * 0.92, mid),
        (-width * 0.68, upper),
        (-width * 0.38, z_max + 0.9),
        (0.0, z_max + 2.1),
        (width * 0.38, z_max + 0.9),
        (width * 0.68, upper),
        (width * 0.92, mid),
        (width * 0.92, z_min + 0.4),
        (width * 0.62, z_min - 0.2),
        (-width * 0.62, z_min - 0.2),
    ]


def shoulder_profile(width, z_min, z_max):
    shoulder = z_min + (z_max - z_min) * 0.66
    return [
        (-width, z_min + 0.35),
        (-width, shoulder),
        (-width * 0.72, z_max - 0.2),
        (-width * 0.30, z_max + 1.3),
        (0.0, z_max + 1.9),
        (width * 0.30, z_max + 1.3),
        (width * 0.72, z_max - 0.2),
        (width, shoulder),
        (width, z_min + 0.35),
        (width * 0.66, z_min - 0.15),
        (-width * 0.66, z_min - 0.15),
    ]


def canopy_profile(width, z_min, z_max):
    arc = z_min + (z_max - z_min) * 0.58
    return [
        (-width, z_min + 0.6),
        (-width, arc),
        (-width * 0.75, z_max - 0.3),
        (-width * 0.36, z_max + 1.0),
        (0.0, z_max + 1.4),
        (width * 0.36, z_max + 1.0),
        (width * 0.75, z_max - 0.3),
        (width, arc),
        (width, z_min + 0.6),
        (width * 0.74, z_min - 0.1),
        (-width * 0.74, z_min - 0.1),
    ]


def canopy_inner_profile(width, z_min, z_max):
    arc = z_min + (z_max - z_min) * 0.66
    return [
        (-width * 0.94, z_min + 0.55),
        (-width * 0.94, arc),
        (-width * 0.68, z_max - 0.1),
        (-width * 0.28, z_max + 1.05),
        (0.0, z_max + 1.45),
        (width * 0.28, z_max + 1.05),
        (width * 0.68, z_max - 0.1),
        (width * 0.94, arc),
        (width * 0.94, z_min + 0.55),
        (width * 0.60, z_min + 0.05),
        (-width * 0.60, z_min + 0.05),
    ]


def canopy_brow_profile(width, z_min, z_max):
    shoulder = z_min + (z_max - z_min) * 0.42
    return [
        (-width * 0.92, z_min + 0.18),
        (-width * 0.92, shoulder),
        (-width * 0.62, z_max - 0.35),
        (-width * 0.18, z_max + 0.45),
        (0.0, z_max + 0.75),
        (width * 0.18, z_max + 0.45),
        (width * 0.62, z_max - 0.35),
        (width * 0.92, shoulder),
        (width * 0.92, z_min + 0.18),
        (width * 0.54, z_min - 0.08),
        (-width * 0.54, z_min - 0.08),
    ]


def pylon_profile(width, z_min, z_max):
    upper = z_min + (z_max - z_min) * 0.78
    return [
        (-width * 0.82, z_min + 0.3),
        (-width * 0.82, upper),
        (-width * 0.58, z_max - 0.8),
        (-width * 0.22, z_max + 1.1),
        (0.0, z_max + 1.9),
        (width * 0.22, z_max + 1.1),
        (width * 0.58, z_max - 0.8),
        (width * 0.82, upper),
        (width * 0.82, z_min + 0.3),
        (width * 0.52, z_min - 0.2),
        (-width * 0.52, z_min - 0.2),
    ]


def crest_profile(width, z_min, z_max):
    return [
        (-width, z_min + 0.15),
        (-width * 0.86, z_max - 0.45),
        (-width * 0.38, z_max + 1.15),
        (0.0, z_max + 1.75),
        (width * 0.38, z_max + 1.15),
        (width * 0.86, z_max - 0.45),
        (width, z_min + 0.15),
        (width * 0.80, z_min - 0.2),
        (-width * 0.80, z_min - 0.2),
    ]


def build_side(center_sign, collection, rear_bounds, shoulder_bounds, canopy_bounds, pylon_bounds):
    suffix = "L" if center_sign < 0 else "R"

    rear_center_x = midpoint(rear_bounds, "x")
    rear_width = axis_span(rear_bounds, "x") * 0.5
    rear_z_min = rear_bounds["z"][0]
    rear_z_max = rear_bounds["z"][1]
    build_profile_object(
        f"V51_RearCathedralMass_{suffix}",
        PEARL,
        collection,
        [
            {
                "points": offset_profile(rear_center_x, cathedral_mass_profile(rear_width, rear_z_min, rear_z_max)),
                "y_min": rear_bounds["y"][0] + 0.4,
                "y_max": rear_bounds["y"][1] - 0.8,
            },
            {
                "points": offset_profile(
                    rear_center_x,
                    cathedral_mass_profile(rear_width * 0.66, rear_z_min + 2.4, rear_z_max - 2.3),
                ),
                "y_min": rear_bounds["y"][1] - 3.0,
                "y_max": rear_bounds["y"][1] - 0.35,
            },
        ],
        bevel_width=0.22,
    )

    shoulder_center_x = midpoint(shoulder_bounds, "x")
    shoulder_width = axis_span(shoulder_bounds, "x") * 0.5
    shoulder_z_min = shoulder_bounds["z"][0]
    shoulder_z_max = shoulder_bounds["z"][1]
    build_profile_object(
        f"V51_ShoulderCrownMass_{suffix}",
        PEARL,
        collection,
        [
            {
                "points": offset_profile(
                    shoulder_center_x,
                    shoulder_profile(shoulder_width, shoulder_z_min, shoulder_z_max),
                ),
                "y_min": shoulder_bounds["y"][0] + 0.25,
                "y_max": shoulder_bounds["y"][1] - 0.3,
            },
            {
                "points": offset_profile(
                    shoulder_center_x,
                    shoulder_profile(shoulder_width * 0.58, shoulder_z_min + 2.2, shoulder_z_max - 1.7),
                ),
                "y_min": shoulder_bounds["y"][1] - 2.1,
                "y_max": shoulder_bounds["y"][1] - 0.15,
            },
        ],
        bevel_width=0.2,
    )

    canopy_center_x = midpoint(canopy_bounds, "x")
    canopy_width = axis_span(canopy_bounds, "x") * 0.5 * 1.08
    canopy_z_min = canopy_bounds["z"][0] - 0.55
    canopy_z_max = canopy_bounds["z"][1] + 1.15
    build_profile_object(
        f"V51_OculusCanopy_{suffix}",
        GOLD,
        collection,
        [
            {
                "points": offset_profile(
                    canopy_center_x,
                    canopy_profile(canopy_width, canopy_z_min, canopy_z_max),
                ),
                "y_min": canopy_bounds["y"][0] - 0.15,
                "y_max": canopy_bounds["y"][1] + 0.15,
            },
            {
                "points": offset_profile(
                    canopy_center_x,
                    canopy_inner_profile(canopy_width * 0.76, canopy_z_min + 0.9, canopy_z_max - 0.7),
                ),
                "y_min": canopy_bounds["y"][0] + 1.35,
                "y_max": canopy_bounds["y"][1] - 1.2,
            },
            {
                "points": offset_profile(
                    canopy_center_x,
                    canopy_brow_profile(canopy_width * 0.9, canopy_z_min - 0.05, canopy_z_min + 2.6),
                ),
                "y_min": canopy_bounds["y"][0] + 0.55,
                "y_max": canopy_bounds["y"][0] + 2.2,
            },
        ],
        bevel_width=0.12,
        bevel_segments=2,
    )

    pylon_center_x = midpoint(pylon_bounds, "x")
    pylon_width = axis_span(pylon_bounds, "x") * 0.5
    pylon_z_min = pylon_bounds["z"][0]
    pylon_z_max = pylon_bounds["z"][1]
    build_profile_object(
        f"V51_ProsceniumPylon_{suffix}",
        PEARL,
        collection,
        [
            {
                "points": offset_profile(
                    pylon_center_x,
                    pylon_profile(pylon_width, pylon_z_min, pylon_z_max),
                ),
                "y_min": pylon_bounds["y"][0],
                "y_max": pylon_bounds["y"][1] - 0.25,
            },
            {
                "points": offset_profile(
                    pylon_center_x,
                    pylon_profile(pylon_width * 0.56, pylon_z_min + 1.9, pylon_z_max - 2.5),
                ),
                "y_min": pylon_bounds["y"][1] - 1.55,
                "y_max": pylon_bounds["y"][1] - 0.15,
            },
        ],
        bevel_width=0.16,
    )


ensure_object_mode()
collection = resolve_collection()

rear_mass_left_bounds = proxy_bounds("V4_RearMass_L")
rear_mass_right_bounds = proxy_bounds("V4_RearMass_R")
rear_core_bounds = proxy_bounds("V4_RearCore")
shoulder_left_bounds = proxy_bounds("V5_ShoulderMass_L")
shoulder_right_bounds = proxy_bounds("V5_ShoulderMass_R")
oculus_left_bounds = proxy_bounds("V5_OculusHousing_L")
oculus_right_bounds = proxy_bounds("V5_OculusHousing_R")
prosc_left_bounds = proxy_bounds("V4_ProscTower_L")
prosc_right_bounds = proxy_bounds("V4_ProscTower_R")
portal_top_bounds = proxy_bounds("V4_PortalTop")

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_side(-1, collection, rear_mass_left_bounds, shoulder_left_bounds, oculus_left_bounds, prosc_left_bounds)
build_side(1, collection, rear_mass_right_bounds, shoulder_right_bounds, oculus_right_bounds, prosc_right_bounds)

core_center_x = midpoint(rear_core_bounds, "x")
core_width = axis_span(rear_core_bounds, "x") * 0.5 * 2.0
core_z_min = rear_core_bounds["z"][0]
core_z_max = rear_core_bounds["z"][1]
build_profile_object(
    "V51_RearCathedralCore",
    PEARL,
    collection,
    [
        {
            "points": offset_profile(core_center_x, core_profile(core_width, core_z_min, core_z_max)),
            "y_min": rear_core_bounds["y"][0] + 0.3,
            "y_max": rear_core_bounds["y"][1] - 0.3,
        },
        {
            "points": offset_profile(
                core_center_x,
                core_profile(core_width * 0.58, core_z_min + 2.4, core_z_max - 2.0),
            ),
            "y_min": rear_core_bounds["y"][1] - 2.0,
            "y_max": rear_core_bounds["y"][1] - 0.15,
        },
    ],
    bevel_width=0.18,
)

bridge_center_x = midpoint(portal_top_bounds, "x")
bridge_width = axis_span(portal_top_bounds, "x") * 0.5 * 1.47
bridge_z_min = portal_top_bounds["z"][0] - 0.55
bridge_z_max = portal_top_bounds["z"][1] + 0.9
build_profile_object(
    "V51_PortalCrestBridge",
    GOLD,
    collection,
    [
        {
            "points": offset_profile(bridge_center_x, crest_profile(bridge_width, bridge_z_min, bridge_z_max)),
            "y_min": portal_top_bounds["y"][0] + 0.45,
            "y_max": portal_top_bounds["y"][1] - 0.25,
        }
    ],
    bevel_width=0.12,
    bevel_segments=3,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V51_RearCathedralMass_L", "V51_RearCathedralCore", axis="x", min_overlap=0.6)
verify_overlap("V51_RearCathedralMass_R", "V51_RearCathedralCore", axis="x", min_overlap=0.6)
verify_overlap("V51_RearCathedralMass_L", "V51_ShoulderCrownMass_L", axis="y", min_overlap=0.6)
verify_overlap("V51_RearCathedralMass_R", "V51_ShoulderCrownMass_R", axis="y", min_overlap=0.6)
verify_overlap("V51_ShoulderCrownMass_L", "V51_OculusCanopy_L", axis="z", min_overlap=0.6)
verify_overlap("V51_ShoulderCrownMass_R", "V51_OculusCanopy_R", axis="z", min_overlap=0.6)
verify_overlap("V51_ProsceniumPylon_L", "V51_PortalCrestBridge", axis="x", min_overlap=0.6)
verify_overlap("V51_ProsceniumPylon_R", "V51_PortalCrestBridge", axis="x", min_overlap=0.6)
verify_overlap("V51_ProsceniumPylon_L", "V50_InnerPortalPylon_L", axis="y", min_overlap=0.6)
verify_overlap("V51_ProsceniumPylon_R", "V50_InnerPortalPylon_R", axis="y", min_overlap=0.6)

bpy.ops.wm.save_mainfile()
print("V51_REAR_CATHEDRAL_PROXY_REPLACEMENT_COMPLETE replacements=10")
