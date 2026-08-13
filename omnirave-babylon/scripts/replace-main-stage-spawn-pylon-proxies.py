from __future__ import annotations

import bmesh
import bpy


LEGACY_NAMES = [
    "V4_SpawnPylon_L",
    "V4_SpawnPylonCap_L",
    "V4_SpawnPylon_R",
    "V4_SpawnPylonCap_R",
]

REPLACEMENT_NAMES = [
    "V55_SpawnPylonPearlShell_L",
    "V55_SpawnPylonPearlShell_R",
    "V55_SpawnPylonCyanCore_L",
    "V55_SpawnPylonCyanCore_R",
    "V55_SpawnPylonGoldCrown_L",
    "V55_SpawnPylonGoldCrown_R",
    "V55_SpawnPylonShadowSpine_L",
    "V55_SpawnPylonShadowSpine_R",
]

PEARL = "V19_GatewayPearlIvory"
CYAN = "V19_ArrivalCyanGlow"
GOLD = "V19_ArrivalBrushedGold"
SHADOW = "V20_RecessedWarmShadow"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V4_SpawnCanopy_L")
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


def shell_profile(width, z_min, z_max):
    span = z_max - z_min
    shoulder = z_min + span * 0.38
    crown = z_min + span * 0.76
    return [
        (-width * 0.28, z_min - 0.16),
        (-width * 0.74, z_min - 0.04),
        (-width, z_min + span * 0.10),
        (-width * 0.92, shoulder),
        (-width * 0.74, crown),
        (-width * 0.36, z_max - 0.06),
        (-width * 0.08, z_max + 0.16),
        (0.0, z_max + 0.26),
        (width * 0.08, z_max + 0.16),
        (width * 0.36, z_max - 0.06),
        (width * 0.74, crown),
        (width * 0.92, shoulder),
        (width, z_min + span * 0.10),
        (width * 0.74, z_min - 0.04),
        (width * 0.28, z_min - 0.16),
        (0.0, z_min - 0.28),
    ]


def lens_profile(width, z_min, z_max):
    span = z_max - z_min
    mid = z_min + span * 0.54
    return [
        (-width * 0.18, z_min - 0.12),
        (-width * 0.56, z_min + span * 0.10),
        (-width * 0.90, z_min + span * 0.32),
        (-width, mid),
        (-width * 0.88, z_max - 0.22),
        (-width * 0.52, z_max + 0.04),
        (-width * 0.12, z_max + 0.18),
        (0.0, z_max + 0.28),
        (width * 0.12, z_max + 0.18),
        (width * 0.52, z_max + 0.04),
        (width * 0.88, z_max - 0.22),
        (width, mid),
        (width * 0.90, z_min + span * 0.32),
        (width * 0.56, z_min + span * 0.10),
        (width * 0.18, z_min - 0.12),
        (0.0, z_min - 0.24),
    ]


def crown_profile(width, z_min, z_max):
    span = z_max - z_min
    return [
        (-width * 0.26, z_min - 0.06),
        (-width * 0.84, z_min + span * 0.08),
        (-width, z_min + span * 0.34),
        (-width * 0.88, z_max - 0.10),
        (-width * 0.50, z_max + 0.08),
        (-width * 0.18, z_max + 0.26),
        (0.0, z_max + 0.40),
        (width * 0.18, z_max + 0.26),
        (width * 0.50, z_max + 0.08),
        (width * 0.88, z_max - 0.10),
        (width, z_min + span * 0.34),
        (width * 0.84, z_min + span * 0.08),
        (width * 0.26, z_min - 0.06),
        (0.0, z_min - 0.16),
    ]


def seam_profile(width, z_min, z_max):
    span = z_max - z_min
    return [
        (-width * 0.24, z_min - 0.08),
        (-width * 0.64, z_min + span * 0.12),
        (-width * 0.94, z_min + span * 0.42),
        (-width, z_min + span * 0.78),
        (-width * 0.82, z_max - 0.10),
        (-width * 0.34, z_max + 0.06),
        (0.0, z_max + 0.14),
        (width * 0.34, z_max + 0.06),
        (width * 0.82, z_max - 0.10),
        (width, z_min + span * 0.78),
        (width * 0.94, z_min + span * 0.42),
        (width * 0.64, z_min + span * 0.12),
        (width * 0.24, z_min - 0.08),
        (0.0, z_min - 0.18),
    ]


def build_side(center_sign, collection):
    suffix = "L" if center_sign < 0 else "R"
    inward_direction = -center_sign

    pylon_bounds = proxy_bounds(f"V4_SpawnPylon_{suffix}")
    cap_bounds = proxy_bounds(f"V4_SpawnPylonCap_{suffix}")

    center_x = midpoint(pylon_bounds, "x")
    y_min = pylon_bounds["y"][0] - 0.26
    y_max = pylon_bounds["y"][1] + 0.26

    shell_center_x = center_x
    core_center_x = center_x + inward_direction * 0.42
    crown_center_x = center_x + inward_direction * 0.10
    shadow_center_x = center_x + center_sign * 0.34

    build_profile_object(
        f"V55_SpawnPylonPearlShell_{suffix}",
        PEARL,
        collection,
        [
            {
                "points": offset_profile(shell_center_x, shell_profile(1.38, 0.62, 2.60)),
                "y_min": y_min,
                "y_max": y_max,
            },
            {
                "points": offset_profile(shell_center_x, shell_profile(1.22, 2.18, 7.90)),
                "y_min": y_min + 0.10,
                "y_max": y_max - 0.10,
            },
            {
                "points": offset_profile(shell_center_x, shell_profile(1.04, 7.46, 12.70)),
                "y_min": y_min + 0.16,
                "y_max": y_max - 0.16,
            },
            {
                "points": offset_profile(shell_center_x, shell_profile(0.88, 12.24, 15.92)),
                "y_min": y_min + 0.22,
                "y_max": y_max - 0.22,
            },
            {
                "points": offset_profile(shell_center_x, shell_profile(1.08, 15.10, cap_bounds["z"][1] - 0.10)),
                "y_min": y_min + 0.28,
                "y_max": y_max - 0.28,
            },
        ],
        bevel_width=0.08,
        bevel_segments=2,
    )

    build_profile_object(
        f"V55_SpawnPylonCyanCore_{suffix}",
        CYAN,
        collection,
        [
            {
                "points": offset_profile(core_center_x, lens_profile(0.34, 3.28, 4.72)),
                "y_min": y_min + 0.44,
                "y_max": y_max - 0.44,
            },
            {
                "points": offset_profile(core_center_x, lens_profile(0.42, 4.08, 7.84)),
                "y_min": y_min + 0.38,
                "y_max": y_max - 0.38,
            },
            {
                "points": offset_profile(core_center_x, lens_profile(0.38, 7.44, 11.08)),
                "y_min": y_min + 0.34,
                "y_max": y_max - 0.34,
            },
            {
                "points": offset_profile(core_center_x, lens_profile(0.34, 10.68, 14.86)),
                "y_min": y_min + 0.30,
                "y_max": y_max - 0.30,
            },
            {
                "points": offset_profile(core_center_x, lens_profile(0.26, 14.20, 16.64)),
                "y_min": y_min + 0.40,
                "y_max": y_max - 0.40,
            },
        ],
        bevel_width=0.04,
        bevel_segments=2,
    )

    build_profile_object(
        f"V55_SpawnPylonGoldCrown_{suffix}",
        GOLD,
        collection,
        [
            {
                "points": offset_profile(crown_center_x, crown_profile(1.12, 14.02, 15.42)),
                "y_min": y_min + 0.18,
                "y_max": y_max - 0.18,
            },
            {
                "points": offset_profile(crown_center_x, crown_profile(1.36, 15.12, 16.50)),
                "y_min": y_min + 0.10,
                "y_max": y_max - 0.10,
            },
            {
                "points": offset_profile(crown_center_x, crown_profile(1.18, 16.18, 17.50)),
                "y_min": y_min + 0.24,
                "y_max": y_max - 0.24,
            },
            {
                "points": offset_profile(crown_center_x, crown_profile(0.72, 17.12, 18.42)),
                "y_min": y_min + 0.36,
                "y_max": y_max - 0.36,
            },
            {
                "points": offset_profile(crown_center_x + inward_direction * 0.12, crown_profile(0.52, 15.80, 17.18)),
                "y_min": y_min - 0.02,
                "y_max": y_max + 0.02,
            },
        ],
        bevel_width=0.05,
        bevel_segments=2,
    )

    build_profile_object(
        f"V55_SpawnPylonShadowSpine_{suffix}",
        SHADOW,
        collection,
        [
            {
                "points": offset_profile(shadow_center_x, seam_profile(0.30, 1.72, 3.40)),
                "y_min": y_min + 0.24,
                "y_max": y_max - 0.24,
            },
            {
                "points": offset_profile(shadow_center_x, seam_profile(0.34, 2.84, 6.36)),
                "y_min": y_min + 0.18,
                "y_max": y_max - 0.18,
            },
            {
                "points": offset_profile(shadow_center_x, seam_profile(0.30, 5.96, 10.30)),
                "y_min": y_min + 0.14,
                "y_max": y_max - 0.14,
            },
            {
                "points": offset_profile(shadow_center_x, seam_profile(0.26, 9.92, 14.36)),
                "y_min": y_min + 0.10,
                "y_max": y_max - 0.10,
            },
            {
                "points": offset_profile(shadow_center_x, seam_profile(0.22, 13.96, 15.88)),
                "y_min": y_min + 0.20,
                "y_max": y_max - 0.20,
            },
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

verify_overlap("V55_SpawnPylonPearlShell_L", "V55_SpawnPylonGoldCrown_L", axis="z", min_overlap=1.80)
verify_overlap("V55_SpawnPylonPearlShell_R", "V55_SpawnPylonGoldCrown_R", axis="z", min_overlap=1.80)
verify_overlap("V55_SpawnPylonPearlShell_L", "V55_SpawnPylonCyanCore_L", axis="z", min_overlap=10.0)
verify_overlap("V55_SpawnPylonPearlShell_R", "V55_SpawnPylonCyanCore_R", axis="z", min_overlap=10.0)
verify_overlap("V55_SpawnPylonPearlShell_L", "V55_SpawnPylonShadowSpine_L", axis="z", min_overlap=10.0)
verify_overlap("V55_SpawnPylonPearlShell_R", "V55_SpawnPylonShadowSpine_R", axis="z", min_overlap=10.0)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V55_SPAWN_PYLON_REPLACEMENT_COMPLETE replacements=8")
