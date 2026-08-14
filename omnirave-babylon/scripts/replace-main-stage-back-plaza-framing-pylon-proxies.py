from __future__ import annotations

import bmesh
import bpy


LEGACY_NAMES = [
    "V23_BackPlazaFramingPylon_L",
    "V23_BackPlazaFramingPylon_R",
    "V23_BackPlazaFramingPylonGlow_L",
    "V23_BackPlazaFramingPylonGlow_R",
]

REPLACEMENT_NAMES = [
    "V57_BackPlazaSentinelPearl_L",
    "V57_BackPlazaSentinelPearl_R",
    "V57_BackPlazaSentinelGoldCrown_L",
    "V57_BackPlazaSentinelGoldCrown_R",
    "V57_BackPlazaSentinelCyanSpine_L",
    "V57_BackPlazaSentinelCyanSpine_R",
    "V57_BackPlazaSentinelShadowCore_L",
    "V57_BackPlazaSentinelShadowCore_R",
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
    anchor = bpy.data.objects.get("V23_BackPlazaFramingPylon_L")
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


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


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


def build_profile_object(name, material_name, collection, components, bevel_width=0.04, bevel_segments=2):
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
        (-width * 0.16, z_floor - 0.05),
        (-width * 0.42, z_floor),
        (-width * 0.72, z_floor + rise * 0.10),
        (-width * 0.94, z_floor + rise * 0.28),
        (-width, z_floor + rise * 0.52),
        (-width * 0.84, z_floor + rise * 0.82),
        (-width * 0.48, z_peak - 0.04),
        (-width * 0.14, z_peak + 0.04),
        (0.0, z_peak + 0.10),
        (width * 0.14, z_peak + 0.04),
        (width * 0.48, z_peak - 0.04),
        (width * 0.84, z_floor + rise * 0.82),
        (width, z_floor + rise * 0.52),
        (width * 0.94, z_floor + rise * 0.28),
        (width * 0.72, z_floor + rise * 0.10),
        (width * 0.42, z_floor),
        (width * 0.16, z_floor - 0.05),
        (0.0, z_floor - 0.10),
    ]


def crown_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.14, z_floor - 0.04),
        (-width * 0.36, z_floor + rise * 0.04),
        (-width * 0.60, z_floor + rise * 0.18),
        (-width * 0.82, z_floor + rise * 0.38),
        (-width, z_floor + rise * 0.64),
        (-width * 0.74, z_peak - 0.06),
        (-width * 0.30, z_peak + 0.04),
        (0.0, z_peak + 0.12),
        (width * 0.30, z_peak + 0.04),
        (width * 0.74, z_peak - 0.06),
        (width, z_floor + rise * 0.64),
        (width * 0.82, z_floor + rise * 0.38),
        (width * 0.60, z_floor + rise * 0.18),
        (width * 0.36, z_floor + rise * 0.04),
        (width * 0.14, z_floor - 0.04),
        (0.0, z_floor - 0.08),
    ]


def lens_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.04),
        (-width * 0.26, z_floor + rise * 0.02),
        (-width * 0.46, z_floor + rise * 0.16),
        (-width * 0.72, z_floor + rise * 0.34),
        (-width, z_floor + rise * 0.54),
        (-width * 0.86, z_floor + rise * 0.80),
        (-width * 0.34, z_peak - 0.04),
        (0.0, z_peak + 0.08),
        (width * 0.34, z_peak - 0.04),
        (width * 0.86, z_floor + rise * 0.80),
        (width, z_floor + rise * 0.54),
        (width * 0.72, z_floor + rise * 0.34),
        (width * 0.46, z_floor + rise * 0.16),
        (width * 0.26, z_floor + rise * 0.02),
        (width * 0.10, z_floor - 0.04),
        (0.0, z_floor - 0.08),
    ]


def shadow_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.03),
        (-width * 0.24, z_floor + rise * 0.04),
        (-width * 0.44, z_floor + rise * 0.18),
        (-width * 0.72, z_floor + rise * 0.40),
        (-width, z_floor + rise * 0.70),
        (-width * 0.82, z_peak - 0.04),
        (-width * 0.26, z_peak + 0.02),
        (0.0, z_peak + 0.06),
        (width * 0.26, z_peak + 0.02),
        (width * 0.82, z_peak - 0.04),
        (width, z_floor + rise * 0.70),
        (width * 0.72, z_floor + rise * 0.40),
        (width * 0.44, z_floor + rise * 0.18),
        (width * 0.24, z_floor + rise * 0.04),
        (width * 0.10, z_floor - 0.03),
        (0.0, z_floor - 0.06),
    ]


def build_side(center_sign, collection):
    suffix = "L" if center_sign < 0 else "R"
    inward_direction = -center_sign

    pylon_bounds = proxy_bounds(f"V23_BackPlazaFramingPylon_{suffix}")
    glow_bounds = proxy_bounds(f"V23_BackPlazaFramingPylonGlow_{suffix}")
    center_x = midpoint(pylon_bounds, "x")
    y_min = pylon_bounds["y"][0] - 0.08
    y_max = pylon_bounds["y"][1] + 0.08
    cyan_y_min = glow_bounds["y"][0] - 0.06
    cyan_y_max = glow_bounds["y"][1] + 0.06

    pearl_center_x = center_x
    gold_center_x = center_x + inward_direction * 0.08
    cyan_center_x = midpoint(glow_bounds, "x")
    shadow_center_x = center_x + center_sign * 0.12

    section_specs = [
        (0.10, 1.24, 0.76),
        (1.34, 2.54, 0.64),
        (2.72, 4.10, 0.56),
        (4.30, 5.92, 0.70),
    ]

    pearl_components = []
    gold_components = []
    cyan_components = []
    shadow_components = []

    for index, (z_floor, z_peak, width) in enumerate(section_specs):
        taper = 1.0 - index * 0.04
        pearl_components.append(
            {
                "points": offset_profile(pearl_center_x, shell_profile(width, z_floor, z_peak)),
                "y_min": y_min,
                "y_max": y_max,
            }
        )
        gold_components.append(
            {
                "points": offset_profile(
                    gold_center_x,
                    crown_profile(width * 0.74 * taper, z_floor + 0.12, z_peak + 0.18),
                ),
                "y_min": y_min + 0.10,
                "y_max": y_max - 0.10,
            }
        )
        cyan_components.append(
            {
                "points": offset_profile(
                    cyan_center_x,
                    lens_profile(width * 0.36 * taper, z_floor + 0.26, z_peak - 0.18),
                ),
                "y_min": cyan_y_min,
                "y_max": cyan_y_max,
            }
        )
        shadow_components.append(
            {
                "points": offset_profile(
                    shadow_center_x,
                    shadow_profile(width * 0.26 * taper, z_floor + 0.08, z_peak - 0.10),
                ),
                "y_min": y_min + 0.12,
                "y_max": y_max - 0.12,
            }
        )

    build_profile_object(
        f"V57_BackPlazaSentinelPearl_{suffix}",
        PEARL,
        collection,
        pearl_components,
        bevel_width=0.05,
        bevel_segments=2,
    )
    build_profile_object(
        f"V57_BackPlazaSentinelGoldCrown_{suffix}",
        GOLD,
        collection,
        gold_components,
        bevel_width=0.04,
        bevel_segments=2,
    )
    build_profile_object(
        f"V57_BackPlazaSentinelCyanSpine_{suffix}",
        CYAN,
        collection,
        cyan_components,
        bevel_width=0.03,
        bevel_segments=2,
    )
    build_profile_object(
        f"V57_BackPlazaSentinelShadowCore_{suffix}",
        SHADOW,
        collection,
        shadow_components,
        bevel_width=0.03,
        bevel_segments=1,
    )


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_side(-1, collection)
build_side(1, collection)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V57_BackPlazaSentinelPearl_L", "V57_BackPlazaSentinelGoldCrown_L", axis="z", min_overlap=1.30)
verify_overlap("V57_BackPlazaSentinelPearl_R", "V57_BackPlazaSentinelGoldCrown_R", axis="z", min_overlap=1.30)
verify_overlap("V57_BackPlazaSentinelPearl_L", "V57_BackPlazaSentinelCyanSpine_L", axis="z", min_overlap=3.80)
verify_overlap("V57_BackPlazaSentinelPearl_R", "V57_BackPlazaSentinelCyanSpine_R", axis="z", min_overlap=3.80)
verify_overlap("V57_BackPlazaSentinelPearl_L", "V57_BackPlazaSentinelShadowCore_L", axis="z", min_overlap=4.20)
verify_overlap("V57_BackPlazaSentinelPearl_R", "V57_BackPlazaSentinelShadowCore_R", axis="z", min_overlap=4.20)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V57_BACK_PLAZA_SENTINEL_REPLACEMENT_COMPLETE replacements=8")
