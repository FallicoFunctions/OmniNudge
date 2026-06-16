from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   promenade pearl ribbons <-> promenade gold inlays overlap: 0.09m on Y
#   promenade gold inlays <-> promenade cyan threads overlap: 0.08m on Y
#   plaza stone spines <-> plaza cross bands overlap: 0.10m on Y
#   every authored inlay component preserves the legacy proxy centerline on the arrival promenade/plaza grid

LEGACY_NAMES = [
    *(f"V7_PromenadeInlay_{index}" for index in range(11)),
    *(f"V7_PlazaStoneLane_{index}" for index in range(6)),
    *(f"V7_PlazaCrossInlay_{index}" for index in range(4)),
]

REPLACEMENT_NAMES = [
    "V64_PromenadePearlRibbon",
    "V64_PromenadeGoldInlay",
    "V64_PromenadeCyanThread",
    "V64_PlazaStoneSpine",
    "V64_PlazaCrossBands",
]

PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"
CYAN = "V19_ArrivalCyanGlow"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V7_PromenadeInlay_0")
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


def finalize(obj, bevel_width=0.03, bevel_segments=2):
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


def build_profile_object(name, material_name, collection, components, bevel_width=0.03, bevel_segments=2):
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


def verify_overlap(name_a, name_b, axis="y", min_overlap=0.01):
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


def promenade_band_points(x_min, x_max, z_center, body_half=1.2, cap=0.9, shoulder=0.9, waist=0.72):
    center_x = (x_min + x_max) * 0.5
    z_min = z_center - body_half
    z_max = z_center + body_half
    return [
        (x_min - 0.18, z_center),
        (x_min + shoulder * 0.1, z_min - cap * 0.35),
        (center_x - 1.25, z_min - cap),
        (center_x, z_min - cap * 1.08),
        (center_x + 1.25, z_min - cap),
        (x_max - shoulder * 0.1, z_min - cap * 0.35),
        (x_max + 0.18, z_center),
        (x_max - shoulder * 0.1, z_max + cap * 0.35),
        (center_x + 1.25, z_max + cap),
        (center_x, z_max + cap * 1.08),
        (center_x - 1.25, z_max + cap),
        (x_min + shoulder * 0.1, z_max + cap * 0.35),
        (x_min + waist * 0.12, z_center + 0.38),
        (x_min + waist * 0.2, z_center - 0.38),
        (x_max - waist * 0.2, z_center - 0.38),
        (x_max - waist * 0.12, z_center + 0.38),
    ]


def cyan_thread_points(x_min, x_max, z_center, body_half=0.78, cap=0.48):
    center_x = (x_min + x_max) * 0.5
    z_min = z_center - body_half
    z_max = z_center + body_half
    return [
        (x_min, z_center),
        (center_x - 1.15, z_min - cap * 0.72),
        (center_x, z_min - cap),
        (center_x + 1.15, z_min - cap * 0.72),
        (x_max, z_center),
        (center_x + 1.15, z_max + cap * 0.72),
        (center_x, z_max + cap),
        (center_x - 1.15, z_max + cap * 0.72),
    ]


def plaza_lane_points(x_center, width, z_min, z_max, cap=1.45):
    half_width = width * 0.5
    x_min = x_center - half_width
    x_max = x_center + half_width
    mid_low = z_min + (z_max - z_min) * 0.32
    mid_high = z_min + (z_max - z_min) * 0.68
    return [
        (x_center, z_min - cap),
        (x_min + width * 0.18, z_min - cap * 0.44),
        (x_min, mid_low),
        (x_min + width * 0.12, mid_high),
        (x_center, z_max + cap),
        (x_max - width * 0.12, mid_high),
        (x_max, mid_low),
        (x_max - width * 0.18, z_min - cap * 0.44),
    ]


def cross_band_points(x_min, x_max, z_center, body_half=1.12, cap=0.72):
    center_x = (x_min + x_max) * 0.5
    z_min = z_center - body_half
    z_max = z_center + body_half
    return [
        (x_min - 0.2, z_center),
        (x_min + 0.6, z_min - cap * 0.35),
        (center_x - 4.2, z_min - cap),
        (center_x, z_min - cap * 1.08),
        (center_x + 4.2, z_min - cap),
        (x_max - 0.6, z_min - cap * 0.35),
        (x_max + 0.2, z_center),
        (x_max - 0.6, z_max + cap * 0.35),
        (center_x + 4.2, z_max + cap),
        (center_x, z_max + cap * 1.08),
        (center_x - 4.2, z_max + cap),
        (x_min + 0.6, z_max + cap * 0.35),
    ]


ensure_object_mode()
collection = resolve_collection()

promenade_proxies = [proxy_snapshot(f"V7_PromenadeInlay_{index}") for index in range(11)]
plaza_lane_proxies = [proxy_snapshot(f"V7_PlazaStoneLane_{index}") for index in range(6)]
cross_proxies = [proxy_snapshot(f"V7_PlazaCrossInlay_{index}") for index in range(4)]

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

promenade_pearl_components = []
promenade_gold_components = []
promenade_cyan_components = []
plaza_stone_components = []
plaza_cross_components = []

for proxy in promenade_proxies:
    z_center = (proxy["y"][0] + proxy["y"][1]) * 0.5
    x_min = proxy["x"][0] - 0.95
    x_max = proxy["x"][1] + 0.95

    promenade_pearl_components.append(
        {
            "points": promenade_band_points(x_min, x_max, z_center, body_half=1.14, cap=0.82),
            "y_min": 0.16,
            "y_max": 0.34,
        }
    )
    promenade_gold_components.append(
        {
            "points": promenade_band_points(x_min + 0.84, x_max - 0.84, z_center, body_half=0.84, cap=0.52),
            "y_min": 0.25,
            "y_max": 0.43,
        }
    )
    promenade_cyan_components.append(
        {
            "points": cyan_thread_points(x_min + 1.75, x_max - 1.75, z_center, body_half=0.56, cap=0.34),
            "y_min": 0.35,
            "y_max": 0.51,
        }
    )

for proxy in plaza_lane_proxies:
    x_center = (proxy["x"][0] + proxy["x"][1]) * 0.5
    z_min = proxy["y"][0] - 0.8
    z_max = proxy["y"][1] + 0.8
    plaza_stone_components.append(
        {
            "points": plaza_lane_points(x_center, width=1.28, z_min=z_min, z_max=z_max, cap=1.45),
            "y_min": 0.08,
            "y_max": 0.24,
        }
    )

for proxy in cross_proxies:
    z_center = (proxy["y"][0] + proxy["y"][1]) * 0.5
    x_min = proxy["x"][0] - 0.6
    x_max = proxy["x"][1] + 0.6
    plaza_cross_components.append(
        {
            "points": cross_band_points(x_min, x_max, z_center, body_half=1.2, cap=0.78),
            "y_min": 0.14,
            "y_max": 0.32,
        }
    )

build_profile_object(
    "V64_PromenadePearlRibbon",
    PEARL,
    collection,
    promenade_pearl_components,
    bevel_width=0.03,
    bevel_segments=2,
)
build_profile_object(
    "V64_PromenadeGoldInlay",
    GOLD,
    collection,
    promenade_gold_components,
    bevel_width=0.022,
    bevel_segments=2,
)
build_profile_object(
    "V64_PromenadeCyanThread",
    CYAN,
    collection,
    promenade_cyan_components,
    bevel_width=0.015,
    bevel_segments=2,
)
build_profile_object(
    "V64_PlazaStoneSpine",
    PEARL,
    collection,
    plaza_stone_components,
    bevel_width=0.025,
    bevel_segments=2,
)
build_profile_object(
    "V64_PlazaCrossBands",
    GOLD,
    collection,
    plaza_cross_components,
    bevel_width=0.022,
    bevel_segments=2,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V64_PromenadePearlRibbon", "V64_PromenadeGoldInlay", axis="y", min_overlap=0.09)
verify_overlap("V64_PromenadeGoldInlay", "V64_PromenadeCyanThread", axis="y", min_overlap=0.08)
verify_overlap("V64_PlazaStoneSpine", "V64_PlazaCrossBands", axis="y", min_overlap=0.095)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V64_PROMENADE_PLAZA_INLAY_REPLACEMENT_COMPLETE replacements=5")
