from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   pearl post clusters <-> gold cap rails overlap: 0.34m on Z
#   gold cap rails <-> cyan threads overlap: 0.18m on Z
#   every replacement stays centered on the back-plaza sightline row at Y=49.5

LEGACY_NAMES = [
    "V16_BackPlazaSightlineRail_L",
    "V16_BackPlazaSightlineRail_R",
    "V16_BackPlazaRailPost_L_0",
    "V16_BackPlazaRailPost_L_1",
    "V16_BackPlazaRailPost_L_2",
    "V16_BackPlazaRailPost_L_3",
    "V16_BackPlazaRailPost_L_4",
    "V16_BackPlazaRailPost_R_0",
    "V16_BackPlazaRailPost_R_1",
    "V16_BackPlazaRailPost_R_2",
    "V16_BackPlazaRailPost_R_3",
    "V16_BackPlazaRailPost_R_4",
]

REPLACEMENT_NAMES = [
    "V66_BackPlazaSightlinePearlPostCluster_L",
    "V66_BackPlazaSightlinePearlPostCluster_R",
    "V66_BackPlazaSightlineGoldRail_L",
    "V66_BackPlazaSightlineGoldRail_R",
    "V66_BackPlazaSightlineCyanThread_L",
    "V66_BackPlazaSightlineCyanThread_R",
]

PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"
CYAN = "V19_ArrivalCyanGlow"
DEFAULT_POST_CENTERS_BY_SIDE = {
    "L": [-9.5, -14.0, -18.5, -23.0, -27.5],
    "R": [9.5, 14.0, 18.5, 23.0, 27.5],
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V16_BackPlazaRailPost_L_0")
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


def default_post_proxy(center_x):
    return {
        "x": (center_x - 0.08, center_x + 0.08),
        "y": (49.5 - 0.08, 49.5 + 0.08),
        "z": (0.13, 1.37),
        "center": (center_x, 49.5, 0.75),
    }


def proxy_bounds(name, fallback=None):
    obj = bpy.data.objects.get(name)
    if obj is None:
        if fallback is not None:
            return fallback
        raise RuntimeError(f"Missing proxy object: {name}")
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
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


def post_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.46, z_floor - 0.06),
        (-width * 0.82, z_floor),
        (-width, z_floor + rise * 0.08),
        (-width * 0.90, z_floor + rise * 0.28),
        (-width * 0.54, z_floor + rise * 0.38),
        (-width * 0.40, z_floor + rise * 0.78),
        (-width * 0.86, z_peak - 0.08),
        (-width * 0.40, z_peak + 0.04),
        (0.0, z_peak + 0.10),
        (width * 0.40, z_peak + 0.04),
        (width * 0.86, z_peak - 0.08),
        (width * 0.40, z_floor + rise * 0.78),
        (width * 0.54, z_floor + rise * 0.38),
        (width * 0.90, z_floor + rise * 0.28),
        (width, z_floor + rise * 0.08),
        (width * 0.82, z_floor),
        (width * 0.46, z_floor - 0.06),
        (0.0, z_floor - 0.10),
    ]


def rail_profile(x_start, x_end, bay_centers, z_floor, z_peak):
    rise = z_peak - z_floor
    points = [
        (x_start, z_floor + rise * 0.20),
        (x_start + 0.50, z_floor),
    ]
    for center in bay_centers:
        points.extend(
            [
                (center - 0.90, z_floor + rise * 0.18),
                (center - 0.46, z_floor + rise * 0.56),
                (center, z_peak + 0.04),
                (center + 0.46, z_floor + rise * 0.56),
                (center + 0.90, z_floor + rise * 0.18),
            ]
        )
    points.extend(
        [
            (x_end - 0.50, z_floor),
            (x_end, z_floor + rise * 0.20),
            (x_end - 0.60, z_floor + rise * 0.54),
            (x_start + 0.60, z_floor + rise * 0.54),
        ]
    )
    return points


def thread_profile(x_start, x_end, bay_centers, z_floor, z_peak):
    rise = z_peak - z_floor
    points = [
        (x_start, z_floor + rise * 0.28),
        (x_start + 0.44, z_floor + rise * 0.04),
    ]
    for center in bay_centers:
        points.extend(
            [
                (center - 0.84, z_floor + rise * 0.24),
                (center - 0.28, z_floor + rise * 0.72),
                (center, z_peak + 0.02),
                (center + 0.28, z_floor + rise * 0.72),
                (center + 0.84, z_floor + rise * 0.24),
            ]
        )
    points.extend(
        [
            (x_end - 0.44, z_floor + rise * 0.04),
            (x_end, z_floor + rise * 0.28),
            (x_end - 0.40, z_floor + rise * 0.62),
            (x_start + 0.40, z_floor + rise * 0.62),
        ]
    )
    return points


def build_side_components(side, post_names):
    fallback_centers = DEFAULT_POST_CENTERS_BY_SIDE[side]
    post_proxies = [proxy_bounds(name, fallback=default_post_proxy(center_x)) for name, center_x in zip(post_names, fallback_centers)]
    row_y_center = sum(proxy["center"][1] for proxy in post_proxies) / len(post_proxies)
    y_min = row_y_center - 0.18
    y_max = row_y_center + 0.18
    post_centers = [proxy["center"][0] for proxy in post_proxies]
    x_start = min(proxy["x"][0] for proxy in post_proxies) - 0.52
    x_end = max(proxy["x"][1] for proxy in post_proxies) + 0.52

    post_components = []
    for proxy in post_proxies:
        x_center = proxy["center"][0]
        post_components.append(
            {
                "points": [(x_center + x, z) for x, z in post_profile(0.23, 0.10, 1.42)],
                "y_min": y_min,
                "y_max": y_max,
            }
        )

    gold_component = [
        {
            "points": rail_profile(x_start, x_end, post_centers, 1.04, 1.52),
            "y_min": row_y_center - 0.12,
            "y_max": row_y_center + 0.12,
        }
    ]
    cyan_component = [
        {
            "points": thread_profile(x_start + 0.12, x_end - 0.12, post_centers, 1.06, 1.28),
            "y_min": row_y_center - 0.07,
            "y_max": row_y_center + 0.07,
        }
    ]
    return post_components, gold_component, cyan_component


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)

left_post_components, left_gold_component, left_cyan_component = build_side_components(
    "L",
    [f"V16_BackPlazaRailPost_L_{index}" for index in range(5)]
)
right_post_components, right_gold_component, right_cyan_component = build_side_components(
    "R",
    [f"V16_BackPlazaRailPost_R_{index}" for index in range(5)]
)

build_profile_object(
    "V66_BackPlazaSightlinePearlPostCluster_L",
    PEARL,
    collection,
    left_post_components,
    bevel_width=0.028,
    bevel_segments=2,
)
build_profile_object(
    "V66_BackPlazaSightlinePearlPostCluster_R",
    PEARL,
    collection,
    right_post_components,
    bevel_width=0.028,
    bevel_segments=2,
)
build_profile_object(
    "V66_BackPlazaSightlineGoldRail_L",
    GOLD,
    collection,
    left_gold_component,
    bevel_width=0.024,
    bevel_segments=2,
)
build_profile_object(
    "V66_BackPlazaSightlineGoldRail_R",
    GOLD,
    collection,
    right_gold_component,
    bevel_width=0.024,
    bevel_segments=2,
)
build_profile_object(
    "V66_BackPlazaSightlineCyanThread_L",
    CYAN,
    collection,
    left_cyan_component,
    bevel_width=0.016,
    bevel_segments=2,
)
build_profile_object(
    "V66_BackPlazaSightlineCyanThread_R",
    CYAN,
    collection,
    right_cyan_component,
    bevel_width=0.016,
    bevel_segments=2,
)

delete_existing(LEGACY_NAMES)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V66_BackPlazaSightlinePearlPostCluster_L", "V66_BackPlazaSightlineGoldRail_L", axis="z", min_overlap=0.34)
verify_overlap("V66_BackPlazaSightlinePearlPostCluster_R", "V66_BackPlazaSightlineGoldRail_R", axis="z", min_overlap=0.34)
verify_overlap("V66_BackPlazaSightlineGoldRail_L", "V66_BackPlazaSightlineCyanThread_L", axis="z", min_overlap=0.18)
verify_overlap("V66_BackPlazaSightlineGoldRail_R", "V66_BackPlazaSightlineCyanThread_R", axis="z", min_overlap=0.18)
audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V66_BACK_PLAZA_SIGHTLINE_REPLACEMENT_COMPLETE replacements=6")
