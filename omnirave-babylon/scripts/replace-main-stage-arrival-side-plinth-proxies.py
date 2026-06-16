from __future__ import annotations

import bmesh
import bpy


LEGACY_NAMES = [
    "V23_ArrivalSidePlinthPearlCap_L",
    "V23_ArrivalSidePlinthPearlCap_R",
    "V23_ArrivalSidePlinthGoldInlay_L",
    "V23_ArrivalSidePlinthGoldInlay_R",
]

REPLACEMENT_NAMES = [
    "V58_ArrivalPlinthPearlDais_L",
    "V58_ArrivalPlinthPearlDais_R",
    "V58_ArrivalPlinthGoldInlay_L",
    "V58_ArrivalPlinthGoldInlay_R",
    "V58_ArrivalPlinthCyanSpine_L",
    "V58_ArrivalPlinthCyanSpine_R",
    "V58_ArrivalPlinthShadowReveal_L",
    "V58_ArrivalPlinthShadowReveal_R",
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
    anchor = bpy.data.objects.get("V23_ArrivalSidePlinthPearlCap_L")
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


def bay_ranges(y_min, y_max, count=4, gap=0.44):
    span = y_max - y_min
    bay_length = (span - gap * (count - 1)) / count
    ranges = []
    cursor = y_min
    for _ in range(count):
        ranges.append((cursor, cursor + bay_length))
        cursor += bay_length + gap
    return ranges


def dais_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.12, z_floor - 0.05),
        (-width * 0.50, z_floor - 0.01),
        (-width * 0.78, z_floor + rise * 0.04),
        (-width, z_floor + rise * 0.22),
        (-width * 0.92, z_floor + rise * 0.46),
        (-width * 0.74, z_floor + rise * 0.66),
        (-width * 0.44, z_floor + rise * 0.82),
        (-width * 0.14, z_peak - 0.03),
        (0.0, z_peak + 0.06),
        (width * 0.14, z_peak - 0.03),
        (width * 0.44, z_floor + rise * 0.82),
        (width * 0.74, z_floor + rise * 0.66),
        (width * 0.92, z_floor + rise * 0.46),
        (width, z_floor + rise * 0.22),
        (width * 0.78, z_floor + rise * 0.04),
        (width * 0.50, z_floor - 0.01),
        (width * 0.12, z_floor - 0.05),
        (0.0, z_floor - 0.09),
    ]


def inlay_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.03),
        (-width * 0.42, z_floor),
        (-width * 0.72, z_floor + rise * 0.08),
        (-width, z_floor + rise * 0.26),
        (-width * 0.86, z_floor + rise * 0.58),
        (-width * 0.34, z_peak - 0.03),
        (0.0, z_peak + 0.04),
        (width * 0.34, z_peak - 0.03),
        (width * 0.86, z_floor + rise * 0.58),
        (width, z_floor + rise * 0.26),
        (width * 0.72, z_floor + rise * 0.08),
        (width * 0.42, z_floor),
        (width * 0.10, z_floor - 0.03),
        (0.0, z_floor - 0.06),
    ]


def spine_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.12, z_floor - 0.03),
        (-width * 0.34, z_floor + rise * 0.02),
        (-width * 0.68, z_floor + rise * 0.22),
        (-width, z_floor + rise * 0.50),
        (-width * 0.70, z_peak - 0.02),
        (-width * 0.18, z_peak + 0.06),
        (0.0, z_peak + 0.10),
        (width * 0.18, z_peak + 0.06),
        (width * 0.70, z_peak - 0.02),
        (width, z_floor + rise * 0.50),
        (width * 0.68, z_floor + rise * 0.22),
        (width * 0.34, z_floor + rise * 0.02),
        (width * 0.12, z_floor - 0.03),
        (0.0, z_floor - 0.06),
    ]


def shadow_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.02),
        (-width * 0.24, z_floor + rise * 0.04),
        (-width * 0.54, z_floor + rise * 0.22),
        (-width, z_floor + rise * 0.56),
        (-width * 0.64, z_peak - 0.02),
        (-width * 0.16, z_peak + 0.03),
        (0.0, z_peak + 0.06),
        (width * 0.16, z_peak + 0.03),
        (width * 0.64, z_peak - 0.02),
        (width, z_floor + rise * 0.56),
        (width * 0.54, z_floor + rise * 0.22),
        (width * 0.24, z_floor + rise * 0.04),
        (width * 0.10, z_floor - 0.02),
        (0.0, z_floor - 0.05),
    ]


def build_side(center_sign, collection):
    suffix = "L" if center_sign < 0 else "R"
    inward_direction = -center_sign

    pearl_bounds = proxy_bounds(f"V23_ArrivalSidePlinthPearlCap_{suffix}")
    gold_bounds = proxy_bounds(f"V23_ArrivalSidePlinthGoldInlay_{suffix}")
    center_x = midpoint(pearl_bounds, "x")
    y_ranges = bay_ranges(pearl_bounds["y"][0] + 0.42, pearl_bounds["y"][1] - 0.42, count=4, gap=0.46)

    pearl_center_x = center_x
    gold_center_x = center_x + inward_direction * 0.12
    cyan_center_x = center_x + inward_direction * 1.48
    shadow_center_x = center_x + center_sign * 1.62

    width_scales = [1.00, 1.08, 1.08, 1.00]
    pearl_components = []
    gold_components = []
    cyan_components = []
    shadow_components = []

    for index, (bay_y_min, bay_y_max) in enumerate(y_ranges):
        width_scale = width_scales[index]
        pearl_components.append(
            {
                "points": offset_profile(
                    pearl_center_x,
                    dais_profile((pearl_bounds["x"][1] - center_x - 0.26) * width_scale, 1.14, 3.22),
                ),
                "y_min": bay_y_min,
                "y_max": bay_y_max,
            }
        )
        gold_components.append(
            {
                "points": offset_profile(
                    gold_center_x,
                    inlay_profile((gold_bounds["x"][1] - midpoint(gold_bounds, "x") - 0.22) * width_scale, 1.46, 3.46),
                ),
                "y_min": bay_y_min + 0.22,
                "y_max": bay_y_max - 0.22,
            }
        )
        cyan_components.append(
            {
                "points": offset_profile(
                    cyan_center_x,
                    spine_profile(0.74 * width_scale, 1.58, 2.98),
                ),
                "y_min": bay_y_min + 0.32,
                "y_max": bay_y_max - 0.32,
            }
        )
        shadow_components.append(
            {
                "points": offset_profile(
                    shadow_center_x,
                    shadow_profile(0.66 * width_scale, 1.18, 2.86),
                ),
                "y_min": bay_y_min + 0.18,
                "y_max": bay_y_max - 0.18,
            }
        )

    build_profile_object(
        f"V58_ArrivalPlinthPearlDais_{suffix}",
        PEARL,
        collection,
        pearl_components,
        bevel_width=0.05,
        bevel_segments=2,
    )
    build_profile_object(
        f"V58_ArrivalPlinthGoldInlay_{suffix}",
        GOLD,
        collection,
        gold_components,
        bevel_width=0.04,
        bevel_segments=2,
    )
    build_profile_object(
        f"V58_ArrivalPlinthCyanSpine_{suffix}",
        CYAN,
        collection,
        cyan_components,
        bevel_width=0.03,
        bevel_segments=2,
    )
    build_profile_object(
        f"V58_ArrivalPlinthShadowReveal_{suffix}",
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

verify_overlap("V58_ArrivalPlinthPearlDais_L", "V58_ArrivalPlinthGoldInlay_L", axis="z", min_overlap=1.70)
verify_overlap("V58_ArrivalPlinthPearlDais_R", "V58_ArrivalPlinthGoldInlay_R", axis="z", min_overlap=1.70)
verify_overlap("V58_ArrivalPlinthPearlDais_L", "V58_ArrivalPlinthCyanSpine_L", axis="z", min_overlap=1.20)
verify_overlap("V58_ArrivalPlinthPearlDais_R", "V58_ArrivalPlinthCyanSpine_R", axis="z", min_overlap=1.20)
verify_overlap("V58_ArrivalPlinthPearlDais_L", "V58_ArrivalPlinthShadowReveal_L", axis="z", min_overlap=1.40)
verify_overlap("V58_ArrivalPlinthPearlDais_R", "V58_ArrivalPlinthShadowReveal_R", axis="z", min_overlap=1.40)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V58_ARRIVAL_PLINTH_REPLACEMENT_COMPLETE replacements=8")
