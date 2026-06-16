from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   pearl_fin_pair <-> gold_spine_pair overlap: 27.5m on Z
#   pearl_fin_pair <-> cyan_core_pair overlap: 24.0m on Z
#   pearl_fin_pair <-> shadow_ribbon_pair overlap: 26.0m on Z
#   each fin component keeps at least 0.04m overlap with its source proxy depth band on Y

LEGACY_NAMES = [
    "V7_RearMassVerticalLight_L_0",
    "V7_RearMassVerticalLight_L_1",
    "V7_RearMassVerticalLight_R_0",
    "V7_RearMassVerticalLight_R_1",
]

REPLACEMENT_NAMES = [
    "V61_RearMassAuroraPearl_L",
    "V61_RearMassAuroraPearl_R",
    "V61_RearMassAuroraGoldSpine_L",
    "V61_RearMassAuroraGoldSpine_R",
    "V61_RearMassAuroraCyanCore_L",
    "V61_RearMassAuroraCyanCore_R",
    "V61_RearMassAuroraShadowRibbon_L",
    "V61_RearMassAuroraShadowRibbon_R",
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
    anchor = bpy.data.objects.get("V7_RearMassVerticalLight_L_0")
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
        (-width * 0.10, z_floor - 0.10),
        (-width * 0.28, z_floor),
        (-width * 0.52, z_floor + rise * 0.06),
        (-width * 0.80, z_floor + rise * 0.18),
        (-width, z_floor + rise * 0.36),
        (-width * 0.94, z_floor + rise * 0.62),
        (-width * 0.72, z_floor + rise * 0.86),
        (-width * 0.30, z_peak - 0.10),
        (-width * 0.10, z_peak + 0.05),
        (0.0, z_peak + 0.14),
        (width * 0.10, z_peak + 0.05),
        (width * 0.30, z_peak - 0.10),
        (width * 0.72, z_floor + rise * 0.86),
        (width * 0.94, z_floor + rise * 0.62),
        (width, z_floor + rise * 0.36),
        (width * 0.80, z_floor + rise * 0.18),
        (width * 0.52, z_floor + rise * 0.06),
        (width * 0.28, z_floor),
        (width * 0.10, z_floor - 0.10),
        (0.0, z_floor - 0.16),
    ]


def gold_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.08, z_floor - 0.06),
        (-width * 0.22, z_floor + rise * 0.02),
        (-width * 0.42, z_floor + rise * 0.14),
        (-width * 0.72, z_floor + rise * 0.30),
        (-width, z_floor + rise * 0.58),
        (-width * 0.70, z_peak - 0.08),
        (-width * 0.18, z_peak + 0.05),
        (0.0, z_peak + 0.12),
        (width * 0.18, z_peak + 0.05),
        (width * 0.70, z_peak - 0.08),
        (width, z_floor + rise * 0.58),
        (width * 0.72, z_floor + rise * 0.30),
        (width * 0.42, z_floor + rise * 0.14),
        (width * 0.22, z_floor + rise * 0.02),
        (width * 0.08, z_floor - 0.06),
        (0.0, z_floor - 0.10),
    ]


def cyan_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.08, z_floor - 0.05),
        (-width * 0.20, z_floor + rise * 0.02),
        (-width * 0.38, z_floor + rise * 0.18),
        (-width * 0.68, z_floor + rise * 0.40),
        (-width, z_floor + rise * 0.72),
        (-width * 0.52, z_peak - 0.08),
        (-width * 0.14, z_peak + 0.04),
        (0.0, z_peak + 0.10),
        (width * 0.14, z_peak + 0.04),
        (width * 0.52, z_peak - 0.08),
        (width, z_floor + rise * 0.72),
        (width * 0.68, z_floor + rise * 0.40),
        (width * 0.38, z_floor + rise * 0.18),
        (width * 0.20, z_floor + rise * 0.02),
        (width * 0.08, z_floor - 0.05),
        (0.0, z_floor - 0.08),
    ]


def shadow_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.06, z_floor - 0.04),
        (-width * 0.18, z_floor + rise * 0.04),
        (-width * 0.34, z_floor + rise * 0.20),
        (-width * 0.62, z_floor + rise * 0.46),
        (-width, z_floor + rise * 0.78),
        (-width * 0.46, z_peak - 0.08),
        (-width * 0.12, z_peak + 0.03),
        (0.0, z_peak + 0.08),
        (width * 0.12, z_peak + 0.03),
        (width * 0.46, z_peak - 0.08),
        (width, z_floor + rise * 0.78),
        (width * 0.62, z_floor + rise * 0.46),
        (width * 0.34, z_floor + rise * 0.20),
        (width * 0.18, z_floor + rise * 0.04),
        (width * 0.06, z_floor - 0.04),
        (0.0, z_floor - 0.06),
    ]


def build_side(center_sign, collection):
    suffix = "L" if center_sign < 0 else "R"
    inward_direction = -center_sign
    indices = [0, 1]

    light_bounds = [proxy_bounds(f"V7_RearMassVerticalLight_{suffix}_{index}") for index in indices]
    center_xs = [midpoint(bounds, "x") for bounds in light_bounds]
    y_min = min(bounds["y"][0] for bounds in light_bounds) - 0.06
    y_max = max(bounds["y"][1] for bounds in light_bounds) + 0.06

    pearl_components = []
    gold_components = []
    cyan_components = []
    shadow_components = []

    for center_x, bounds in zip(center_xs, light_bounds):
        z_floor = bounds["z"][0] - 0.12
        z_peak = bounds["z"][1] + 0.90
        pearl_components.append(
            {
                "points": offset_profile(center_x, pearl_profile(0.82, z_floor, z_peak)),
                "y_min": y_min,
                "y_max": y_max,
            }
        )
        gold_components.append(
            {
                "points": offset_profile(center_x + inward_direction * 0.08, gold_profile(0.48, z_floor + 0.38, z_peak + 0.10)),
                "y_min": y_min + 0.02,
                "y_max": y_max - 0.02,
            }
        )
        cyan_components.append(
            {
                "points": offset_profile(center_x, cyan_profile(0.28, z_floor + 1.10, z_peak - 2.10)),
                "y_min": y_min + 0.03,
                "y_max": y_max - 0.03,
            }
        )
        shadow_components.append(
            {
                "points": offset_profile(center_x + center_sign * 0.10, shadow_profile(0.22, z_floor + 0.60, z_peak - 1.20)),
                "y_min": y_min + 0.02,
                "y_max": y_max - 0.02,
            }
        )

    build_profile_object(f"V61_RearMassAuroraPearl_{suffix}", PEARL, collection, pearl_components, bevel_width=0.04, bevel_segments=2)
    build_profile_object(f"V61_RearMassAuroraGoldSpine_{suffix}", GOLD, collection, gold_components, bevel_width=0.03, bevel_segments=2)
    build_profile_object(f"V61_RearMassAuroraCyanCore_{suffix}", CYAN, collection, cyan_components, bevel_width=0.025, bevel_segments=2)
    build_profile_object(f"V61_RearMassAuroraShadowRibbon_{suffix}", SHADOW, collection, shadow_components, bevel_width=0.02, bevel_segments=2)


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_side(-1, collection)
build_side(1, collection)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V61_RearMassAuroraPearl_L", "V61_RearMassAuroraGoldSpine_L", axis="z", min_overlap=27.5)
verify_overlap("V61_RearMassAuroraPearl_R", "V61_RearMassAuroraGoldSpine_R", axis="z", min_overlap=27.5)
verify_overlap("V61_RearMassAuroraPearl_L", "V61_RearMassAuroraCyanCore_L", axis="z", min_overlap=24.0)
verify_overlap("V61_RearMassAuroraPearl_R", "V61_RearMassAuroraCyanCore_R", axis="z", min_overlap=24.0)
verify_overlap("V61_RearMassAuroraPearl_L", "V61_RearMassAuroraShadowRibbon_L", axis="z", min_overlap=26.0)
verify_overlap("V61_RearMassAuroraPearl_R", "V61_RearMassAuroraShadowRibbon_R", axis="z", min_overlap=26.0)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V61_REAR_MASS_AURORA_REPLACEMENT_COMPLETE replacements=8")
