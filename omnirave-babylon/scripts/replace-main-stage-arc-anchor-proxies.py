from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V75_ArcAnchorGoldCluster_L <-> V75_ArcAnchorShadowCluster_L overlap: 0.08m on Y at each left anchor bay
#   V75_ArcAnchorGoldCluster_R <-> V75_ArcAnchorShadowCluster_R overlap: 0.08m on Y at each right anchor bay
#   Each side cluster contains five disconnected anchor crests aligned to the retired V15 anchor proxy positions.

LEGACY_PLATES = [f"V15_ArcAnchorPlate_{index}" for index in range(10)]
LEGACY_SOCKETS = [f"V15_ArcAnchorSocket_{index}" for index in range(10)]
LEGACY_NAMES = [*LEGACY_PLATES, *LEGACY_SOCKETS]

REPLACEMENT_NAMES = [
    "V75_ArcAnchorGoldCluster_L",
    "V75_ArcAnchorGoldCluster_R",
    "V75_ArcAnchorShadowCluster_L",
    "V75_ArcAnchorShadowCluster_R",
]

GOLD = "V15_EngineeredGoldAnchors"
SHADOW = "V15_MatteProductionBlack"


def bounds_from_location_dimensions(location, dimensions):
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    return {
        "x": (location[0] - half_x, location[0] + half_x),
        "y": (location[1] - half_y, location[1] + half_y),
        "z": (location[2] - half_z, location[2] + half_z),
        "center": location,
    }


LEGACY_FALLBACK_BOUNDS = {
    "V15_ArcAnchorPlate_0": bounds_from_location_dimensions((-56.0, -4.0, 13.0), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_1": bounds_from_location_dimensions((56.0, -4.0, 13.0), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_2": bounds_from_location_dimensions((-45.0, -17.1, 20.2), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_3": bounds_from_location_dimensions((45.0, -17.1, 20.2), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_4": bounds_from_location_dimensions((-23.5, -22.5, 29.5), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_5": bounds_from_location_dimensions((23.5, -22.5, 29.5), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_6": bounds_from_location_dimensions((-16.0, -36.0, 43.0), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_7": bounds_from_location_dimensions((16.0, -36.0, 43.0), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_8": bounds_from_location_dimensions((-61.5, -3.7, 5.8), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorPlate_9": bounds_from_location_dimensions((61.5, -3.7, 5.8), (1.04, 0.18, 0.64)),
    "V15_ArcAnchorSocket_0": bounds_from_location_dimensions((-56.0, -4.08, 13.0), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_1": bounds_from_location_dimensions((56.0, -4.08, 13.0), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_2": bounds_from_location_dimensions((-45.0, -17.18, 20.2), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_3": bounds_from_location_dimensions((45.0, -17.18, 20.2), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_4": bounds_from_location_dimensions((-23.5, -22.58, 29.5), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_5": bounds_from_location_dimensions((23.5, -22.58, 29.5), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_6": bounds_from_location_dimensions((-16.0, -36.08, 43.0), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_7": bounds_from_location_dimensions((16.0, -36.08, 43.0), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_8": bounds_from_location_dimensions((-61.5, -3.78, 5.8), (0.48, 0.20, 0.34)),
    "V15_ArcAnchorSocket_9": bounds_from_location_dimensions((61.5, -3.78, 5.8), (0.48, 0.20, 0.34)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*LEGACY_NAMES, "V74_SweepOuterAnchorGoldCrown_L", "V50_OuterSweepSpire_L"):
        anchor = bpy.data.objects.get(anchor_name)
        if anchor is not None and anchor.users_collection:
            return anchor.users_collection[0]
    return bpy.context.scene.collection


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
        fallback = LEGACY_FALLBACK_BOUNDS.get(name)
        if fallback is None:
            raise RuntimeError(f"Missing proxy object: {name}")
        return fallback

    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
        "center": (
            sum(vertex.x for vertex in verts) / len(verts),
            sum(vertex.y for vertex in verts) / len(verts),
            sum(vertex.z for vertex in verts) / len(verts),
        ),
    }


def combine_snapshot(plate_name, socket_name):
    plate = proxy_snapshot(plate_name)
    socket = proxy_snapshot(socket_name)
    return {
        "x": (min(plate["x"][0], socket["x"][0]), max(plate["x"][1], socket["x"][1])),
        "y": (min(plate["y"][0], socket["y"][0]), max(plate["y"][1], socket["y"][1])),
        "z": (min(plate["z"][0], socket["z"][0]), max(plate["z"][1], socket["z"][1])),
        "center": (
            (plate["center"][0] + socket["center"][0]) * 0.5,
            (plate["center"][1] + socket["center"][1]) * 0.5,
            (plate["center"][2] + socket["center"][2]) * 0.5,
        ),
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


def faceted_band_profile(center_x, center_z, half_width, half_height):
    return [
        (center_x - half_width, center_z),
        (center_x - half_width * 0.46, center_z - half_height),
        (center_x + half_width * 0.46, center_z - half_height),
        (center_x + half_width, center_z),
        (center_x + half_width * 0.46, center_z + half_height),
        (center_x - half_width * 0.46, center_z + half_height),
    ]


def pointed_crest_profile(center_x, lower_z, upper_z, half_width):
    height = upper_z - lower_z
    shoulder_z = lower_z + height * 0.48
    inset_width = half_width * 0.42
    return [
        (center_x - half_width, lower_z),
        (center_x - half_width * 0.76, shoulder_z),
        (center_x - inset_width, upper_z - height * 0.16),
        (center_x, upper_z),
        (center_x + inset_width, upper_z - height * 0.16),
        (center_x + half_width * 0.76, shoulder_z),
        (center_x + half_width, lower_z),
        (center_x + half_width * 0.28, lower_z - height * 0.08),
        (center_x - half_width * 0.28, lower_z - height * 0.08),
    ]


def shadow_keel_profile(center_x, lower_z, upper_z, half_width):
    height = upper_z - lower_z
    shoulder_z = lower_z + height * 0.44
    return [
        (center_x - half_width, lower_z),
        (center_x - half_width * 0.68, shoulder_z),
        (center_x - half_width * 0.18, upper_z - height * 0.08),
        (center_x, upper_z),
        (center_x + half_width * 0.18, upper_z - height * 0.08),
        (center_x + half_width * 0.68, shoulder_z),
        (center_x + half_width, lower_z),
        (center_x + half_width * 0.22, lower_z - height * 0.10),
        (center_x - half_width * 0.22, lower_z - height * 0.10),
    ]


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def auto_uv_project(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, bevel_width=0.02, bevel_segments=1):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.68
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_profile_object(name, material_name, collection, components, bevel_width, bevel_segments):
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


def verify_overlap(name_a, name_b, axis="y", min_overlap=0.005):
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


def gold_components(snapshots):
    components = []
    for snapshot in snapshots:
        center_x, center_y, center_z = snapshot["center"]
        span_x = snapshot["x"][1] - snapshot["x"][0]
        span_y = snapshot["y"][1] - snapshot["y"][0]
        span_z = snapshot["z"][1] - snapshot["z"][0]
        half_width = span_x * 1.02
        crest_depth = span_y * 1.42
        base_z = snapshot["z"][0] - 0.10
        top_z = snapshot["z"][1] + 0.32

        components.append(
            {
                "points": pointed_crest_profile(center_x, base_z, top_z, half_width * 1.14),
                "y_min": center_y - crest_depth,
                "y_max": center_y + crest_depth * 0.96,
            }
        )
    return components


def shadow_components(snapshots):
    components = []
    for snapshot in snapshots:
        center_x, center_y, center_z = snapshot["center"]
        span_x = snapshot["x"][1] - snapshot["x"][0]
        span_y = snapshot["y"][1] - snapshot["y"][0]
        span_z = snapshot["z"][1] - snapshot["z"][0]
        half_width = span_x * 0.52
        depth = span_y * 1.15

        components.append(
            {
                "points": shadow_keel_profile(
                    center_x,
                    snapshot["z"][0] - 0.08,
                    snapshot["z"][1] + 0.20,
                    half_width,
                ),
                "y_min": center_y - depth,
                "y_max": center_y + depth * 1.10,
            }
        )
    return components


ensure_object_mode()
collection = resolve_collection()

left_snapshots = [
    combine_snapshot("V15_ArcAnchorPlate_8", "V15_ArcAnchorSocket_8"),
    combine_snapshot("V15_ArcAnchorPlate_0", "V15_ArcAnchorSocket_0"),
    combine_snapshot("V15_ArcAnchorPlate_2", "V15_ArcAnchorSocket_2"),
    combine_snapshot("V15_ArcAnchorPlate_4", "V15_ArcAnchorSocket_4"),
    combine_snapshot("V15_ArcAnchorPlate_6", "V15_ArcAnchorSocket_6"),
]
right_snapshots = [
    combine_snapshot("V15_ArcAnchorPlate_7", "V15_ArcAnchorSocket_7"),
    combine_snapshot("V15_ArcAnchorPlate_5", "V15_ArcAnchorSocket_5"),
    combine_snapshot("V15_ArcAnchorPlate_3", "V15_ArcAnchorSocket_3"),
    combine_snapshot("V15_ArcAnchorPlate_1", "V15_ArcAnchorSocket_1"),
    combine_snapshot("V15_ArcAnchorPlate_9", "V15_ArcAnchorSocket_9"),
]

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

build_profile_object(
    "V75_ArcAnchorGoldCluster_L",
    GOLD,
    collection,
    gold_components(left_snapshots),
    bevel_width=0.018,
    bevel_segments=1,
)
build_profile_object(
    "V75_ArcAnchorGoldCluster_R",
    GOLD,
    collection,
    gold_components(right_snapshots),
    bevel_width=0.018,
    bevel_segments=1,
)
build_profile_object(
    "V75_ArcAnchorShadowCluster_L",
    SHADOW,
    collection,
    shadow_components(left_snapshots),
    bevel_width=0.014,
    bevel_segments=1,
)
build_profile_object(
    "V75_ArcAnchorShadowCluster_R",
    SHADOW,
    collection,
    shadow_components(right_snapshots),
    bevel_width=0.014,
    bevel_segments=1,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V75_ArcAnchorGoldCluster_L", "V75_ArcAnchorShadowCluster_L", axis="y", min_overlap=0.08)
verify_overlap("V75_ArcAnchorGoldCluster_R", "V75_ArcAnchorShadowCluster_R", axis="y", min_overlap=0.08)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
