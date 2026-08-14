from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V53_SpawnGalleryArcadePearl_[L/R] <-> V53_SpawnGalleryCorniceGold_[L/R] overlap: 0.35m on Z crown seat
#   V53_SpawnGalleryArcadePearl_[L/R] <-> V53_SpawnGalleryShadowSpine_[L/R] overlap: 0.35m on X rear buttress
#   V53_SpawnGalleryArcadePearl_[L/R] <-> V53_SpawnGalleryCyanLancets_[L/R] overlap: 0.20m on X lantern reveal
#   V53_SpawnGalleryCorniceGold_[L/R] <-> V53_SpawnGalleryHaloGold_[L/R] overlap: 0.15m on Z crest register

LEGACY_NAMES = [
    "V8_SpawnGalleryBase_L",
    "V8_SpawnGalleryCap_L",
    "V8_SpawnGalleryRearShadow_L",
    "V8_SpawnGalleryBase_R",
    "V8_SpawnGalleryCap_R",
    "V8_SpawnGalleryRearShadow_R",
]

REPLACEMENT_NAMES = [
    "V53_SpawnGalleryArcadePearl_L",
    "V53_SpawnGalleryArcadePearl_R",
    "V53_SpawnGalleryCorniceGold_L",
    "V53_SpawnGalleryCorniceGold_R",
    "V53_SpawnGalleryShadowSpine_L",
    "V53_SpawnGalleryShadowSpine_R",
    "V53_SpawnGalleryCyanLancets_L",
    "V53_SpawnGalleryCyanLancets_R",
    "V53_SpawnGalleryHaloGold_L",
    "V53_SpawnGalleryHaloGold_R",
]

PEARL = "V16_PearlArchitecturalShell"
GOLD = "V20_ChasedGoldFiligree"
SHADOW = "V20_RecessedWarmShadow"
CYAN = "V20_CelestialCyanGlass"


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


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def axis_span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


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


def finalize(obj, bevel_width=0.1, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, components, bevel_width=0.1, bevel_segments=2):
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


def verify_overlap(name_a, name_b, axis="x", min_overlap=0.005):
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


def arcade_profile(width, z_min, z_max):
    spring = z_min + (z_max - z_min) * 0.56
    shoulder = z_min + (z_max - z_min) * 0.84
    return [
        (-width * 0.98, z_min + 0.32),
        (-width * 0.98, spring),
        (-width * 0.86, shoulder),
        (-width * 0.62, z_max - 0.18),
        (-width * 0.30, z_max + 0.44),
        (0.0, z_max + 0.92),
        (width * 0.30, z_max + 0.44),
        (width * 0.62, z_max - 0.18),
        (width * 0.86, shoulder),
        (width * 0.98, spring),
        (width * 0.98, z_min + 0.32),
        (width * 0.74, z_min - 0.14),
        (-width * 0.74, z_min - 0.14),
    ]


def cornice_profile(width, z_min, z_max):
    return [
        (-width, z_min + 0.08),
        (-width * 0.94, z_max - 0.06),
        (-width * 0.76, z_max + 0.10),
        (-width * 0.42, z_max + 0.24),
        (0.0, z_max + 0.36),
        (width * 0.42, z_max + 0.24),
        (width * 0.76, z_max + 0.10),
        (width * 0.94, z_max - 0.06),
        (width, z_min + 0.08),
        (width * 0.82, z_min - 0.14),
        (-width * 0.82, z_min - 0.14),
    ]


def shadow_profile(width, z_min, z_max):
    shoulder = z_min + (z_max - z_min) * 0.72
    return [
        (-width * 0.92, z_min + 0.18),
        (-width * 0.92, shoulder),
        (-width * 0.72, z_max - 0.22),
        (-width * 0.34, z_max + 0.22),
        (0.0, z_max + 0.46),
        (width * 0.34, z_max + 0.22),
        (width * 0.72, z_max - 0.22),
        (width * 0.92, shoulder),
        (width * 0.92, z_min + 0.18),
        (width * 0.64, z_min - 0.16),
        (-width * 0.64, z_min - 0.16),
    ]


def lancet_profile(width, z_min, z_max):
    mid = z_min + (z_max - z_min) * 0.54
    return [
        (-width * 0.40, z_min - 0.10),
        (-width * 0.82, z_min + 0.52),
        (-width, mid),
        (-width * 0.84, z_max - 0.38),
        (-width * 0.46, z_max + 0.08),
        (-width * 0.14, z_max + 0.30),
        (0.0, z_max + 0.46),
        (width * 0.14, z_max + 0.30),
        (width * 0.46, z_max + 0.08),
        (width * 0.84, z_max - 0.38),
        (width, mid),
        (width * 0.82, z_min + 0.52),
        (width * 0.40, z_min - 0.10),
        (0.0, z_min - 0.26),
    ]


def halo_profile(width, z_min, z_max):
    return [
        (-width, z_min + 0.04),
        (-width * 0.90, z_max - 0.10),
        (-width * 0.64, z_max + 0.06),
        (-width * 0.30, z_max + 0.24),
        (-width * 0.10, z_max + 0.38),
        (0.0, z_max + 0.52),
        (width * 0.10, z_max + 0.38),
        (width * 0.30, z_max + 0.24),
        (width * 0.64, z_max + 0.06),
        (width * 0.90, z_max - 0.10),
        (width, z_min + 0.04),
        (width * 0.84, z_min - 0.10),
        (-width * 0.84, z_min - 0.10),
    ]


def build_side(center_sign, collection, base_bounds, cap_bounds, rear_bounds):
    suffix = "L" if center_sign < 0 else "R"
    column_bounds = [proxy_bounds(f"V8_SpawnGalleryCol_{suffix}_{index}") for index in range(5)]
    bay_centers = [midpoint(bounds, "y") for bounds in column_bounds]
    bay_half_span = min(bay_centers[index + 1] - bay_centers[index] for index in range(len(bay_centers) - 1)) * 0.36

    if center_sign < 0:
        inner_face_x = max(bounds["x"][1] for bounds in column_bounds) + 0.26
        rear_face_x = rear_bounds["x"][0] + 0.12
    else:
        inner_face_x = min(bounds["x"][0] for bounds in column_bounds) - 0.26
        rear_face_x = rear_bounds["x"][1] - 0.12

    x_min = min(inner_face_x, rear_face_x)
    x_max = max(inner_face_x, rear_face_x)
    arcade_center_x = (x_min + x_max) * 0.5
    arcade_width = (x_max - x_min) * 0.5
    arcade_y_min = cap_bounds["y"][0] + 0.18
    arcade_y_max = cap_bounds["y"][1] - 0.18
    arcade_z_min = base_bounds["z"][0]
    arcade_z_max = cap_bounds["z"][1] + 0.05

    build_profile_object(
        f"V53_SpawnGalleryArcadePearl_{suffix}",
        PEARL,
        collection,
        [
            {
                "points": offset_profile(
                    arcade_center_x,
                    arcade_profile(arcade_width, arcade_z_min, arcade_z_max),
                ),
                "y_min": arcade_y_min,
                "y_max": arcade_y_max,
            },
            *[
                {
                    "points": offset_profile(
                        arcade_center_x,
                        arcade_profile(arcade_width * 0.82, arcade_z_min + 0.34, arcade_z_max + 0.26),
                    ),
                    "y_min": bay_center - bay_half_span,
                    "y_max": bay_center + bay_half_span,
                }
                for bay_center in bay_centers
            ],
        ],
        bevel_width=0.12,
    )

    build_profile_object(
        f"V53_SpawnGalleryCorniceGold_{suffix}",
        GOLD,
        collection,
        [
            {
                "points": offset_profile(
                    arcade_center_x,
                    cornice_profile(arcade_width * 1.08, cap_bounds["z"][0] + 0.05, cap_bounds["z"][1] + 0.18),
                ),
                "y_min": cap_bounds["y"][0] + 0.08,
                "y_max": cap_bounds["y"][1] - 0.08,
            },
            *[
                {
                    "points": offset_profile(
                        arcade_center_x,
                        halo_profile(arcade_width * 0.34, cap_bounds["z"][1] - 0.12, cap_bounds["z"][1] + 0.58),
                    ),
                    "y_min": bay_center - bay_half_span * 0.65,
                    "y_max": bay_center + bay_half_span * 0.65,
                }
                for bay_center in bay_centers
            ],
        ],
        bevel_width=0.06,
        bevel_segments=3,
    )

    shadow_center_x = rear_face_x - center_sign * 0.10
    build_profile_object(
        f"V53_SpawnGalleryShadowSpine_{suffix}",
        SHADOW,
        collection,
        [
            {
                "points": offset_profile(
                    shadow_center_x,
                    shadow_profile(max(axis_span(rear_bounds, "x") * 1.6, 0.34), rear_bounds["z"][0] - 0.08, rear_bounds["z"][1] + 0.26),
                ),
                "y_min": rear_bounds["y"][0] + 0.22,
                "y_max": rear_bounds["y"][1] - 0.22,
            },
            *[
                {
                    "points": offset_profile(
                        shadow_center_x - center_sign * 0.12,
                        shadow_profile(0.20, rear_bounds["z"][0] + 0.42, rear_bounds["z"][1] + 0.18),
                    ),
                    "y_min": bay_center - bay_half_span * 0.60,
                    "y_max": bay_center + bay_half_span * 0.60,
                }
                for bay_center in bay_centers
            ],
        ],
        bevel_width=0.05,
    )

    lancet_center_x = inner_face_x + center_sign * 0.78
    build_profile_object(
        f"V53_SpawnGalleryCyanLancets_{suffix}",
        CYAN,
        collection,
        [
            {
                "points": offset_profile(
                    lancet_center_x,
                    lancet_profile(0.40, base_bounds["z"][0] + 1.14, cap_bounds["z"][1] - 0.88),
                ),
                "y_min": bay_center - bay_half_span * 0.28,
                "y_max": bay_center + bay_half_span * 0.28,
            }
            for bay_center in bay_centers
        ],
        bevel_width=0.05,
        bevel_segments=3,
    )

    halo_center_x = arcade_center_x + center_sign * 0.18
    build_profile_object(
        f"V53_SpawnGalleryHaloGold_{suffix}",
        GOLD,
        collection,
        [
            {
                "points": offset_profile(
                    halo_center_x,
                    halo_profile(arcade_width * 0.38, cap_bounds["z"][1] - 0.30, cap_bounds["z"][1] + 0.26),
                ),
                "y_min": bay_center - bay_half_span * 0.55,
                "y_max": bay_center + bay_half_span * 0.55,
            }
            for bay_center in bay_centers
        ],
        bevel_width=0.05,
        bevel_segments=3,
    )


ensure_object_mode()
collection = resolve_collection()

base_left_bounds = proxy_bounds("V8_SpawnGalleryBase_L")
cap_left_bounds = proxy_bounds("V8_SpawnGalleryCap_L")
shadow_left_bounds = proxy_bounds("V8_SpawnGalleryRearShadow_L")
base_right_bounds = proxy_bounds("V8_SpawnGalleryBase_R")
cap_right_bounds = proxy_bounds("V8_SpawnGalleryCap_R")
shadow_right_bounds = proxy_bounds("V8_SpawnGalleryRearShadow_R")

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_side(-1, collection, base_left_bounds, cap_left_bounds, shadow_left_bounds)
build_side(1, collection, base_right_bounds, cap_right_bounds, shadow_right_bounds)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V53_SpawnGalleryArcadePearl_L", "V53_SpawnGalleryCorniceGold_L", axis="z", min_overlap=0.35)
verify_overlap("V53_SpawnGalleryArcadePearl_R", "V53_SpawnGalleryCorniceGold_R", axis="z", min_overlap=0.35)
verify_overlap("V53_SpawnGalleryArcadePearl_L", "V53_SpawnGalleryShadowSpine_L", axis="x", min_overlap=0.35)
verify_overlap("V53_SpawnGalleryArcadePearl_R", "V53_SpawnGalleryShadowSpine_R", axis="x", min_overlap=0.35)
verify_overlap("V53_SpawnGalleryArcadePearl_L", "V53_SpawnGalleryCyanLancets_L", axis="x", min_overlap=0.20)
verify_overlap("V53_SpawnGalleryArcadePearl_R", "V53_SpawnGalleryCyanLancets_R", axis="x", min_overlap=0.20)
verify_overlap("V53_SpawnGalleryCorniceGold_L", "V53_SpawnGalleryHaloGold_L", axis="z", min_overlap=0.15)
verify_overlap("V53_SpawnGalleryCorniceGold_R", "V53_SpawnGalleryHaloGold_R", axis="z", min_overlap=0.15)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V53_SPAWN_GALLERY_PROXY_REPLACEMENT_COMPLETE replacements=10")
