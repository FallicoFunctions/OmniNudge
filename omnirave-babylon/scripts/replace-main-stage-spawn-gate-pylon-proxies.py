from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   pearl_sentinel_body <-> gold_crown_wrapper overlap: 7.8m on Z
#   pearl_sentinel_body <-> cyan_core_lens overlap: 8.8m on Z
#   pearl_sentinel_body <-> shadow_keel overlap: 9.1m on Z
#   all parts sit on the legacy spawn-gate pylon footprint with at least 0.05m Y overlap

LEGACY_NAMES = [
    "V7_SpawnGatePylon_L",
    "V7_SpawnGatePylon_R",
    "V7_SpawnGateCap_L",
    "V7_SpawnGateCap_R",
]

REPLACEMENT_NAMES = [
    "V60_SpawnGateSentinelPearl_L",
    "V60_SpawnGateSentinelPearl_R",
    "V60_SpawnGateSentinelGoldCrown_L",
    "V60_SpawnGateSentinelGoldCrown_R",
    "V60_SpawnGateSentinelCyanCore_L",
    "V60_SpawnGateSentinelCyanCore_R",
    "V60_SpawnGateSentinelShadowKeel_L",
    "V60_SpawnGateSentinelShadowKeel_R",
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
    anchor = bpy.data.objects.get("V7_SpawnGatePylon_L")
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


def finalize(obj, bevel_width=0.04, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, points, y_min, y_max, bevel_width=0.04, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    add_prism_component(bm, points, y_min, y_max)
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


def shell_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.08),
        (-width * 0.34, z_floor),
        (-width * 0.58, z_floor + rise * 0.06),
        (-width * 0.84, z_floor + rise * 0.18),
        (-width, z_floor + rise * 0.36),
        (-width * 0.94, z_floor + rise * 0.58),
        (-width * 0.74, z_floor + rise * 0.82),
        (-width * 0.34, z_peak - 0.04),
        (-width * 0.10, z_peak + 0.06),
        (0.0, z_peak + 0.14),
        (width * 0.10, z_peak + 0.06),
        (width * 0.34, z_peak - 0.04),
        (width * 0.74, z_floor + rise * 0.82),
        (width * 0.94, z_floor + rise * 0.58),
        (width, z_floor + rise * 0.36),
        (width * 0.84, z_floor + rise * 0.18),
        (width * 0.58, z_floor + rise * 0.06),
        (width * 0.34, z_floor),
        (width * 0.10, z_floor - 0.08),
        (0.0, z_floor - 0.14),
    ]


def crown_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.14, z_floor - 0.05),
        (-width * 0.36, z_floor + rise * 0.02),
        (-width * 0.62, z_floor + rise * 0.14),
        (-width * 0.88, z_floor + rise * 0.32),
        (-width, z_floor + rise * 0.60),
        (-width * 0.72, z_peak - 0.08),
        (-width * 0.24, z_peak + 0.06),
        (0.0, z_peak + 0.18),
        (width * 0.24, z_peak + 0.06),
        (width * 0.72, z_peak - 0.08),
        (width, z_floor + rise * 0.60),
        (width * 0.88, z_floor + rise * 0.32),
        (width * 0.62, z_floor + rise * 0.14),
        (width * 0.36, z_floor + rise * 0.02),
        (width * 0.14, z_floor - 0.05),
        (0.0, z_floor - 0.10),
    ]


def core_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.04),
        (-width * 0.28, z_floor + rise * 0.02),
        (-width * 0.52, z_floor + rise * 0.18),
        (-width * 0.82, z_floor + rise * 0.42),
        (-width, z_floor + rise * 0.68),
        (-width * 0.58, z_peak - 0.04),
        (-width * 0.18, z_peak + 0.04),
        (0.0, z_peak + 0.10),
        (width * 0.18, z_peak + 0.04),
        (width * 0.58, z_peak - 0.04),
        (width, z_floor + rise * 0.68),
        (width * 0.82, z_floor + rise * 0.42),
        (width * 0.52, z_floor + rise * 0.18),
        (width * 0.28, z_floor + rise * 0.02),
        (width * 0.10, z_floor - 0.04),
        (0.0, z_floor - 0.08),
    ]


def shadow_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.08, z_floor - 0.03),
        (-width * 0.22, z_floor + rise * 0.03),
        (-width * 0.44, z_floor + rise * 0.18),
        (-width * 0.74, z_floor + rise * 0.44),
        (-width, z_floor + rise * 0.74),
        (-width * 0.56, z_peak - 0.04),
        (-width * 0.18, z_peak + 0.03),
        (0.0, z_peak + 0.08),
        (width * 0.18, z_peak + 0.03),
        (width * 0.56, z_peak - 0.04),
        (width, z_floor + rise * 0.74),
        (width * 0.74, z_floor + rise * 0.44),
        (width * 0.44, z_floor + rise * 0.18),
        (width * 0.22, z_floor + rise * 0.03),
        (width * 0.08, z_floor - 0.03),
        (0.0, z_floor - 0.06),
    ]


def build_side(center_sign, collection):
    suffix = "L" if center_sign < 0 else "R"
    inward_direction = -center_sign

    pylon_bounds = proxy_bounds(f"V7_SpawnGatePylon_{suffix}")
    cap_bounds = proxy_bounds(f"V7_SpawnGateCap_{suffix}")
    center_x = midpoint(pylon_bounds, "x")
    y_min = min(pylon_bounds["y"][0], cap_bounds["y"][0]) - 0.10
    y_max = max(pylon_bounds["y"][1], cap_bounds["y"][1]) + 0.10
    z_floor = max(0.06, pylon_bounds["z"][0] + 0.04)
    z_peak = cap_bounds["z"][1] + 1.48

    pearl_points = offset_profile(center_x, shell_profile(1.78, z_floor, z_peak))
    gold_points = offset_profile(center_x + inward_direction * 0.10, crown_profile(1.34, z_floor + 0.20, z_peak + 0.18))
    cyan_points = offset_profile(center_x, core_profile(0.70, z_floor + 0.28, z_peak - 1.08))
    shadow_points = offset_profile(center_x + center_sign * 0.16, shadow_profile(0.58, z_floor + 0.16, z_peak - 0.64))

    build_profile_object(
        f"V60_SpawnGateSentinelPearl_{suffix}",
        PEARL,
        collection,
        pearl_points,
        y_min,
        y_max,
        bevel_width=0.05,
        bevel_segments=2,
    )
    build_profile_object(
        f"V60_SpawnGateSentinelGoldCrown_{suffix}",
        GOLD,
        collection,
        gold_points,
        y_min + 0.06,
        y_max - 0.06,
        bevel_width=0.04,
        bevel_segments=2,
    )
    build_profile_object(
        f"V60_SpawnGateSentinelCyanCore_{suffix}",
        CYAN,
        collection,
        cyan_points,
        y_min + 0.12,
        y_max - 0.12,
        bevel_width=0.03,
        bevel_segments=2,
    )
    build_profile_object(
        f"V60_SpawnGateSentinelShadowKeel_{suffix}",
        SHADOW,
        collection,
        shadow_points,
        y_min + 0.10,
        y_max - 0.10,
        bevel_width=0.03,
        bevel_segments=2,
    )


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_side(-1, collection)
build_side(1, collection)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V60_SpawnGateSentinelPearl_L", "V60_SpawnGateSentinelGoldCrown_L", axis="z", min_overlap=10.8)
verify_overlap("V60_SpawnGateSentinelPearl_R", "V60_SpawnGateSentinelGoldCrown_R", axis="z", min_overlap=10.8)
verify_overlap("V60_SpawnGateSentinelPearl_L", "V60_SpawnGateSentinelCyanCore_L", axis="z", min_overlap=8.8)
verify_overlap("V60_SpawnGateSentinelPearl_R", "V60_SpawnGateSentinelCyanCore_R", axis="z", min_overlap=8.8)
verify_overlap("V60_SpawnGateSentinelPearl_L", "V60_SpawnGateSentinelShadowKeel_L", axis="z", min_overlap=9.1)
verify_overlap("V60_SpawnGateSentinelPearl_R", "V60_SpawnGateSentinelShadowKeel_R", axis="z", min_overlap=9.1)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V60_SPAWN_GATE_SENTINEL_REPLACEMENT_COMPLETE replacements=8")
