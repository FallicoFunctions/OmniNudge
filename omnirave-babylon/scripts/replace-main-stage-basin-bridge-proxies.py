from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   pearl_span_segment <-> left_gold_rail overlap: 0.65m on Z
#   pearl_span_segment <-> right_gold_rail overlap: 0.65m on Z
#   pearl_span_segment <-> cyan_inlay overlap: 0.55m on Z
#   pearl_span_segment <-> shadow_reveal overlap: 0.45m on Z
#   each of the four segments shares the legacy bridge row with at least 0.04m Y overlap

LEGACY_NAMES = [
    "V7_BasinBridge_0",
    "V7_BasinBridge_1",
    "V7_BasinBridge_2",
    "V7_BasinBridge_3",
    "V7_BasinBridgeGoldRail_0_L",
    "V7_BasinBridgeGoldRail_0_R",
    "V7_BasinBridgeGoldRail_1_L",
    "V7_BasinBridgeGoldRail_1_R",
    "V7_BasinBridgeGoldRail_2_L",
    "V7_BasinBridgeGoldRail_2_R",
    "V7_BasinBridgeGoldRail_3_L",
    "V7_BasinBridgeGoldRail_3_R",
]

REPLACEMENT_NAMES = [
    "V62_BasinCausewayPearlSpan",
    "V62_BasinCausewayGoldRail_L",
    "V62_BasinCausewayGoldRail_R",
    "V62_BasinCausewayCyanInlay",
    "V62_BasinCausewayShadowReveal",
]

PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"
CYAN = "V19_ArrivalCyanGlow"
SHADOW = "V20_RecessedWarmShadow"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V7_BasinBridge_0")
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


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


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


def finalize(obj, bevel_width=0.035, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, components, bevel_width=0.035, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_prism_component(bm, component["points"], component["y_min"], component["y_max"])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def offset_profile(center_x, profile):
    return [(center_x + x, z) for x, z in profile]


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


def pearl_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.08, z_floor - 0.08),
        (-width * 0.36, z_floor),
        (-width * 0.68, z_floor + rise * 0.08),
        (-width * 0.92, z_floor + rise * 0.26),
        (-width, z_floor + rise * 0.52),
        (-width * 0.88, z_floor + rise * 0.80),
        (-width * 0.44, z_peak - 0.06),
        (-width * 0.14, z_peak + 0.02),
        (0.0, z_peak + 0.08),
        (width * 0.14, z_peak + 0.02),
        (width * 0.44, z_peak - 0.06),
        (width * 0.88, z_floor + rise * 0.80),
        (width, z_floor + rise * 0.52),
        (width * 0.92, z_floor + rise * 0.26),
        (width * 0.68, z_floor + rise * 0.08),
        (width * 0.36, z_floor),
        (width * 0.08, z_floor - 0.08),
        (0.0, z_floor - 0.12),
    ]


def rail_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.04),
        (-width * 0.32, z_floor + rise * 0.02),
        (-width * 0.70, z_floor + rise * 0.18),
        (-width, z_floor + rise * 0.56),
        (-width * 0.62, z_peak - 0.04),
        (-width * 0.18, z_peak + 0.03),
        (0.0, z_peak + 0.07),
        (width * 0.18, z_peak + 0.03),
        (width * 0.62, z_peak - 0.04),
        (width, z_floor + rise * 0.56),
        (width * 0.70, z_floor + rise * 0.18),
        (width * 0.32, z_floor + rise * 0.02),
        (width * 0.10, z_floor - 0.04),
        (0.0, z_floor - 0.08),
    ]


def inlay_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.03),
        (-width * 0.30, z_floor + rise * 0.04),
        (-width * 0.68, z_floor + rise * 0.24),
        (-width, z_floor + rise * 0.56),
        (-width * 0.52, z_peak - 0.04),
        (0.0, z_peak + 0.06),
        (width * 0.52, z_peak - 0.04),
        (width, z_floor + rise * 0.56),
        (width * 0.68, z_floor + rise * 0.24),
        (width * 0.30, z_floor + rise * 0.04),
        (width * 0.10, z_floor - 0.03),
        (0.0, z_floor - 0.06),
    ]


def shadow_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.02),
        (-width * 0.28, z_floor + rise * 0.03),
        (-width * 0.56, z_floor + rise * 0.16),
        (-width, z_floor + rise * 0.48),
        (-width * 0.64, z_peak - 0.02),
        (-width * 0.22, z_peak + 0.02),
        (0.0, z_peak + 0.04),
        (width * 0.22, z_peak + 0.02),
        (width * 0.64, z_peak - 0.02),
        (width, z_floor + rise * 0.48),
        (width * 0.56, z_floor + rise * 0.16),
        (width * 0.28, z_floor + rise * 0.03),
        (width * 0.10, z_floor - 0.02),
        (0.0, z_floor - 0.04),
    ]


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

row_indices = [0, 1, 2, 3]
bridge_bounds = [proxy_bounds(f"V7_BasinBridge_{index}") for index in row_indices]
left_rail_bounds = [proxy_bounds(f"V7_BasinBridgeGoldRail_{index}_L") for index in row_indices]
right_rail_bounds = [proxy_bounds(f"V7_BasinBridgeGoldRail_{index}_R") for index in row_indices]

pearl_components = []
gold_left_components = []
gold_right_components = []
cyan_components = []
shadow_components = []

for bridge, left_rail, right_rail in zip(bridge_bounds, left_rail_bounds, right_rail_bounds):
    y_min = bridge["y"][0] - 0.08
    y_max = bridge["y"][1] + 0.08
    center_z = midpoint(bridge, "y")
    pearl_components.append(
        {
            "points": offset_profile(0.0, pearl_profile(10.95, center_z - 0.92, center_z + 0.92)),
            "y_min": bridge["z"][0] - 0.04,
            "y_max": right_rail["z"][1] + 0.46,
        }
    )
    gold_left_components.append(
        {
            "points": offset_profile(midpoint(left_rail, "x"), rail_profile(0.44, center_z - 0.76, center_z + 0.76)),
            "y_min": left_rail["z"][0] - 0.06,
            "y_max": left_rail["z"][1] + 0.54,
        }
    )
    gold_right_components.append(
        {
            "points": offset_profile(midpoint(right_rail, "x"), rail_profile(0.44, center_z - 0.76, center_z + 0.76)),
            "y_min": right_rail["z"][0] - 0.06,
            "y_max": right_rail["z"][1] + 0.54,
        }
    )
    cyan_components.append(
        {
            "points": offset_profile(0.0, inlay_profile(4.90, center_z - 0.54, center_z + 0.54)),
            "y_min": bridge["z"][0] + 0.08,
            "y_max": bridge["z"][1] + 0.26,
        }
    )
    shadow_components.append(
        {
            "points": offset_profile(0.0, shadow_profile(8.80, center_z - 0.50, center_z + 0.50)),
            "y_min": bridge["z"][0] + 0.02,
            "y_max": bridge["z"][1] + 0.14,
        }
    )

build_profile_object("V62_BasinCausewayPearlSpan", PEARL, collection, pearl_components, bevel_width=0.04, bevel_segments=2)
build_profile_object("V62_BasinCausewayGoldRail_L", GOLD, collection, gold_left_components, bevel_width=0.03, bevel_segments=2)
build_profile_object("V62_BasinCausewayGoldRail_R", GOLD, collection, gold_right_components, bevel_width=0.03, bevel_segments=2)
build_profile_object("V62_BasinCausewayCyanInlay", CYAN, collection, cyan_components, bevel_width=0.02, bevel_segments=2)
build_profile_object("V62_BasinCausewayShadowReveal", SHADOW, collection, shadow_components, bevel_width=0.02, bevel_segments=1)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V62_BasinCausewayPearlSpan", "V62_BasinCausewayGoldRail_L", axis="z", min_overlap=43.0)
verify_overlap("V62_BasinCausewayPearlSpan", "V62_BasinCausewayGoldRail_R", axis="z", min_overlap=43.0)
verify_overlap("V62_BasinCausewayPearlSpan", "V62_BasinCausewayCyanInlay", axis="z", min_overlap=42.0)
verify_overlap("V62_BasinCausewayPearlSpan", "V62_BasinCausewayShadowReveal", axis="z", min_overlap=41.0)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V62_BASIN_CAUSEWAY_REPLACEMENT_COMPLETE replacements=5")
