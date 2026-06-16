from __future__ import annotations

import bmesh
import bpy


LEGACY_NAMES = [
    *(f"V8_SpawnGalleryCol_L_{index}" for index in range(5)),
    *(f"V8_SpawnGalleryCol_R_{index}" for index in range(5)),
    *(f"V8_SpawnGalleryGlow_L_{index}" for index in range(5)),
    *(f"V8_SpawnGalleryGlow_R_{index}" for index in range(5)),
]

REPLACEMENT_NAMES = [
    "V54_SpawnGalleryPierPearl_L",
    "V54_SpawnGalleryPierPearl_R",
    "V54_SpawnGalleryFiligreeGold_L",
    "V54_SpawnGalleryFiligreeGold_R",
    "V54_SpawnGalleryBeaconCyan_L",
    "V54_SpawnGalleryBeaconCyan_R",
    "V54_SpawnGalleryShadowSeam_L",
    "V54_SpawnGalleryShadowSeam_R",
]

PEARL = "V16_PearlArchitecturalShell"
GOLD = "V20_ChasedGoldFiligree"
CYAN = "V20_CelestialCyanGlass"
SHADOW = "V20_RecessedWarmShadow"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V53_SpawnGalleryArcadePearl_L")
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


def finalize(obj, bevel_width=0.08, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, components, bevel_width=0.08, bevel_segments=2):
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


def pearl_profile(width, z_min, z_max):
    span = z_max - z_min
    crown = z_min + span * 0.82
    waist = z_min + span * 0.54
    return [
        (-width * 0.28, z_min - 0.18),
        (-width * 0.62, z_min - 0.06),
        (-width * 0.86, z_min + 0.40),
        (-width, waist),
        (-width * 0.92, crown),
        (-width * 0.60, z_max - 0.12),
        (-width * 0.22, z_max + 0.16),
        (0.0, z_max + 0.30),
        (width * 0.22, z_max + 0.16),
        (width * 0.60, z_max - 0.12),
        (width * 0.92, crown),
        (width, waist),
        (width * 0.86, z_min + 0.40),
        (width * 0.62, z_min - 0.06),
        (width * 0.28, z_min - 0.18),
        (width * 0.18, z_min + 0.64),
        (width * 0.12, z_min + 1.46),
        (-width * 0.12, z_min + 1.46),
        (-width * 0.18, z_min + 0.64),
    ]


def filigree_profile(width, z_min, z_max):
    span = z_max - z_min
    return [
        (-width * 0.34, z_min - 0.08),
        (-width * 0.82, z_min + span * 0.10),
        (-width, z_min + span * 0.44),
        (-width * 0.84, z_max - 0.12),
        (-width * 0.46, z_max + 0.10),
        (-width * 0.12, z_max + 0.32),
        (0.0, z_max + 0.42),
        (width * 0.12, z_max + 0.32),
        (width * 0.46, z_max + 0.10),
        (width * 0.84, z_max - 0.12),
        (width, z_min + span * 0.44),
        (width * 0.82, z_min + span * 0.10),
        (width * 0.34, z_min - 0.08),
        (width * 0.22, z_min + span * 0.38),
        (0.0, z_min + span * 0.58),
        (-width * 0.22, z_min + span * 0.38),
    ]


def beacon_profile(width, z_min, z_max):
    span = z_max - z_min
    shoulder = z_min + span * 0.30
    mid = z_min + span * 0.55
    return [
        (-width * 0.18, z_min - 0.10),
        (-width * 0.54, z_min + 0.18),
        (-width * 0.86, shoulder),
        (-width, mid),
        (-width * 0.88, z_max - 0.30),
        (-width * 0.54, z_max + 0.02),
        (-width * 0.18, z_max + 0.22),
        (0.0, z_max + 0.34),
        (width * 0.18, z_max + 0.22),
        (width * 0.54, z_max + 0.02),
        (width * 0.88, z_max - 0.30),
        (width, mid),
        (width * 0.86, shoulder),
        (width * 0.54, z_min + 0.18),
        (width * 0.18, z_min - 0.10),
        (0.0, z_min - 0.24),
    ]


def shadow_profile(width, z_min, z_max):
    span = z_max - z_min
    return [
        (-width * 0.20, z_min - 0.06),
        (-width * 0.64, z_min + span * 0.12),
        (-width * 0.98, z_min + span * 0.42),
        (-width, z_min + span * 0.78),
        (-width * 0.82, z_max - 0.12),
        (-width * 0.34, z_max + 0.06),
        (0.0, z_max + 0.16),
        (width * 0.34, z_max + 0.06),
        (width * 0.82, z_max - 0.12),
        (width, z_min + span * 0.78),
        (width * 0.98, z_min + span * 0.42),
        (width * 0.64, z_min + span * 0.12),
        (width * 0.20, z_min - 0.06),
        (0.0, z_min - 0.18),
    ]


def build_side(center_sign, collection):
    suffix = "L" if center_sign < 0 else "R"
    inward_direction = -center_sign

    column_names = [f"V8_SpawnGalleryCol_{suffix}_{index}" for index in range(5)]
    glow_names = [f"V8_SpawnGalleryGlow_{suffix}_{index}" for index in range(5)]
    bay_centers = [bpy.data.objects[name].location.y for name in column_names]
    column_x = bpy.data.objects[column_names[0]].location.x
    glow_x = bpy.data.objects[glow_names[0]].location.x

    cornice_bounds = world_bounds(f"V53_SpawnGalleryCorniceGold_{suffix}")
    lancet_bounds = world_bounds(f"V53_SpawnGalleryCyanLancets_{suffix}")

    pearl_center_x = column_x + center_sign * 0.42
    gold_center_x = pearl_center_x + inward_direction * 0.04
    beacon_center_x = glow_x + inward_direction * 0.03
    shadow_center_x = pearl_center_x + center_sign * 0.36

    pearl_z_min = max(0.02, lancet_bounds["z"][0] - 0.22)
    pearl_z_max = lancet_bounds["z"][1] + 0.28
    gold_z_min = lancet_bounds["z"][1] - 0.82
    gold_z_max = cornice_bounds["z"][1] - 0.62
    beacon_z_min = lancet_bounds["z"][0] + 0.04
    beacon_z_max = lancet_bounds["z"][1] - 0.24
    shadow_z_min = pearl_z_min + 0.22
    shadow_z_max = gold_z_min + 0.74

    build_profile_object(
        f"V54_SpawnGalleryPierPearl_{suffix}",
        PEARL,
        collection,
        [
            {
                "points": offset_profile(pearl_center_x, pearl_profile(0.42, pearl_z_min, pearl_z_max)),
                "y_min": bay_center - 0.74,
                "y_max": bay_center + 0.74,
            }
            for bay_center in bay_centers
        ],
        bevel_width=0.08,
        bevel_segments=2,
    )

    build_profile_object(
        f"V54_SpawnGalleryFiligreeGold_{suffix}",
        GOLD,
        collection,
        [
            {
                "points": offset_profile(gold_center_x, filigree_profile(0.50, gold_z_min, gold_z_max)),
                "y_min": bay_center - 0.68,
                "y_max": bay_center + 0.68,
            }
            for bay_center in bay_centers
        ],
        bevel_width=0.05,
        bevel_segments=2,
    )

    build_profile_object(
        f"V54_SpawnGalleryBeaconCyan_{suffix}",
        CYAN,
        collection,
        [
            {
                "points": offset_profile(beacon_center_x, beacon_profile(0.22, beacon_z_min, beacon_z_max)),
                "y_min": bay_center - 0.46,
                "y_max": bay_center + 0.46,
            }
            for bay_center in bay_centers
        ],
        bevel_width=0.04,
        bevel_segments=2,
    )

    build_profile_object(
        f"V54_SpawnGalleryShadowSeam_{suffix}",
        SHADOW,
        collection,
        [
            {
                "points": offset_profile(shadow_center_x, shadow_profile(0.20, shadow_z_min, shadow_z_max)),
                "y_min": bay_center - 0.58,
                "y_max": bay_center + 0.58,
            }
            for bay_center in bay_centers
        ],
        bevel_width=0.04,
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

verify_overlap("V54_SpawnGalleryPierPearl_L", "V54_SpawnGalleryFiligreeGold_L", axis="z", min_overlap=0.30)
verify_overlap("V54_SpawnGalleryPierPearl_R", "V54_SpawnGalleryFiligreeGold_R", axis="z", min_overlap=0.30)
verify_overlap("V54_SpawnGalleryPierPearl_L", "V54_SpawnGalleryBeaconCyan_L", axis="z", min_overlap=2.40)
verify_overlap("V54_SpawnGalleryPierPearl_R", "V54_SpawnGalleryBeaconCyan_R", axis="z", min_overlap=2.40)
verify_overlap("V54_SpawnGalleryPierPearl_L", "V54_SpawnGalleryShadowSeam_L", axis="z", min_overlap=2.80)
verify_overlap("V54_SpawnGalleryPierPearl_R", "V54_SpawnGalleryShadowSeam_R", axis="z", min_overlap=2.80)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V54_SPAWN_GALLERY_SUPPORT_REPLACEMENT_COMPLETE replacements=8")
