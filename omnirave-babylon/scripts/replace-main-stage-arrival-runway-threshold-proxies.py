from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   runway pearl bands <-> runway gold bands overlap: 0.16m on Z
#   runway gold bands <-> runway cyan threads overlap: 0.12m on Z
#   threshold gold bands <-> threshold shadow grooves overlap: 0.05m on Y
#   every authored band stays centered on the legacy runway and threshold rows

LEGACY_NAMES = [
    "V23_ArrivalRunwayInsetRib_0",
    "V23_ArrivalRunwayInsetRib_1",
    "V23_ArrivalRunwayInsetRib_2",
    "V23_ArrivalRunwayInsetRib_3",
    "V23_ArrivalThresholdGoldRail_0",
    "V23_ArrivalThresholdGoldRail_1",
    "V23_ArrivalThresholdGoldRail_2",
    "V23_ArrivalThresholdShadowGroove_0",
    "V23_ArrivalThresholdShadowGroove_1",
    "V23_ArrivalThresholdShadowGroove_2",
]

REPLACEMENT_NAMES = [
    "V65_ArrivalRunwayPearlBands",
    "V65_ArrivalRunwayGoldBands",
    "V65_ArrivalRunwayCyanThreads",
    "V65_ArrivalThresholdGoldBands",
    "V65_ArrivalThresholdShadowGrooves",
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
    anchor = bpy.data.objects.get("V23_ArrivalRunwayInsetRib_0")
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


def proxy_snapshot(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"Missing proxy object: {name}")
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
        "name": name,
        "x": (obj.location.x - half_x, obj.location.x + half_x),
        "y": (obj.location.y - half_y, obj.location.y + half_y),
        "z": (obj.location.z - half_z, obj.location.z + half_z),
        "center": (obj.location.x, obj.location.y, obj.location.z),
    }


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


def finalize(obj, bevel_width=0.024, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, components, bevel_width=0.024, bevel_segments=2):
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


def runway_profile(x_center, width, z_floor, z_peak, crown=0.08):
    half_width = width * 0.5
    rise = z_peak - z_floor
    return [
        (x_center - half_width, z_floor + rise * 0.06),
        (x_center - half_width * 0.82, z_floor - rise * 0.10),
        (x_center - half_width * 0.46, z_floor - rise * 0.18),
        (x_center - half_width * 0.16, z_floor - rise * 0.08),
        (x_center - half_width * 0.07, z_floor + rise * 0.24),
        (x_center - half_width * 0.28, z_peak - rise * 0.06),
        (x_center, z_peak + crown),
        (x_center + half_width * 0.28, z_peak - rise * 0.06),
        (x_center + half_width * 0.07, z_floor + rise * 0.24),
        (x_center + half_width * 0.16, z_floor - rise * 0.08),
        (x_center + half_width * 0.46, z_floor - rise * 0.18),
        (x_center + half_width * 0.82, z_floor - rise * 0.10),
        (x_center + half_width, z_floor + rise * 0.06),
        (x_center + half_width * 0.54, z_floor + rise * 0.34),
        (x_center, z_floor + rise * 0.40),
        (x_center - half_width * 0.54, z_floor + rise * 0.34),
    ]


def threshold_profile(x_half, z_floor, z_peak, lip=0.08):
    rise = z_peak - z_floor
    return [
        (-x_half, z_floor + rise * 0.08),
        (-x_half * 0.92, z_floor - rise * 0.08),
        (-x_half * 0.68, z_floor - rise * 0.16),
        (-x_half * 0.42, z_floor + rise * 0.10),
        (-x_half * 0.16, z_peak - rise * 0.08),
        (0.0, z_peak + lip),
        (x_half * 0.16, z_peak - rise * 0.08),
        (x_half * 0.42, z_floor + rise * 0.10),
        (x_half * 0.68, z_floor - rise * 0.16),
        (x_half * 0.92, z_floor - rise * 0.08),
        (x_half, z_floor + rise * 0.08),
        (x_half * 0.70, z_floor + rise * 0.36),
        (0.0, z_floor + rise * 0.42),
        (-x_half * 0.70, z_floor + rise * 0.36),
    ]


ensure_object_mode()
collection = resolve_collection()

runway_proxies = [proxy_snapshot(f"V23_ArrivalRunwayInsetRib_{index}") for index in range(4)]
threshold_gold_proxies = [proxy_snapshot(f"V23_ArrivalThresholdGoldRail_{index}") for index in range(3)]
threshold_shadow_proxies = [proxy_snapshot(f"V23_ArrivalThresholdShadowGroove_{index}") for index in range(3)]

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

runway_pearl_components = []
runway_gold_components = []
runway_cyan_components = []
threshold_gold_components = []
threshold_shadow_components = []

for proxy in runway_proxies:
    x_center = proxy["center"][0]
    y_min = proxy["y"][0] - 0.18
    y_max = proxy["y"][1] + 0.18
    z_mid = (proxy["z"][0] + proxy["z"][1]) * 0.5

    runway_pearl_components.append(
        {
            "points": runway_profile(x_center, 0.72, z_mid - 0.04, z_mid + 0.19, crown=0.09),
            "y_min": y_min,
            "y_max": y_max,
        }
    )
    runway_gold_components.append(
        {
            "points": runway_profile(x_center, 0.48, z_mid - 0.08, z_mid + 0.12, crown=0.05),
            "y_min": y_min + 0.24,
            "y_max": y_max - 0.24,
        }
    )
    runway_cyan_components.append(
        {
            "points": runway_profile(x_center, 0.24, z_mid - 0.11, z_mid + 0.04, crown=0.02),
            "y_min": y_min + 0.42,
            "y_max": y_max - 0.42,
        }
    )

for gold_proxy, shadow_proxy in zip(threshold_gold_proxies, threshold_shadow_proxies):
    gold_x_half = (gold_proxy["x"][1] - gold_proxy["x"][0]) * 0.5 + 0.45
    shadow_x_half = (shadow_proxy["x"][1] - shadow_proxy["x"][0]) * 0.5 + 0.18
    threshold_gold_components.append(
        {
            "points": threshold_profile(gold_x_half, gold_proxy["z"][0] - 0.05, gold_proxy["z"][1] + 0.09, lip=0.08),
            "y_min": gold_proxy["y"][0] - 0.06,
            "y_max": gold_proxy["y"][1] + 0.06,
        }
    )
    threshold_shadow_components.append(
        {
            "points": threshold_profile(
                shadow_x_half,
                shadow_proxy["z"][0] - 0.06,
                shadow_proxy["z"][1] + 0.01,
                lip=0.02,
            ),
            "y_min": shadow_proxy["y"][0] - 0.02,
            "y_max": shadow_proxy["y"][1] + 0.20,
        }
    )

build_profile_object(
    "V65_ArrivalRunwayPearlBands",
    PEARL,
    collection,
    runway_pearl_components,
    bevel_width=0.026,
    bevel_segments=2,
)
build_profile_object(
    "V65_ArrivalRunwayGoldBands",
    GOLD,
    collection,
    runway_gold_components,
    bevel_width=0.022,
    bevel_segments=2,
)
build_profile_object(
    "V65_ArrivalRunwayCyanThreads",
    CYAN,
    collection,
    runway_cyan_components,
    bevel_width=0.016,
    bevel_segments=2,
)
build_profile_object(
    "V65_ArrivalThresholdGoldBands",
    GOLD,
    collection,
    threshold_gold_components,
    bevel_width=0.03,
    bevel_segments=2,
)
build_profile_object(
    "V65_ArrivalThresholdShadowGrooves",
    SHADOW,
    collection,
    threshold_shadow_components,
    bevel_width=0.018,
    bevel_segments=2,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V65_ArrivalRunwayPearlBands", "V65_ArrivalRunwayGoldBands", axis="z", min_overlap=0.16)
verify_overlap("V65_ArrivalRunwayGoldBands", "V65_ArrivalRunwayCyanThreads", axis="z", min_overlap=0.12)
verify_overlap("V65_ArrivalThresholdGoldBands", "V65_ArrivalThresholdShadowGrooves", axis="y", min_overlap=0.05)
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V65_ARRIVAL_RUNWAY_THRESHOLD_REPLACEMENT_COMPLETE replacements=5")
