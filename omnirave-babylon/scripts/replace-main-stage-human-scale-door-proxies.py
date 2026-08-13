from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V73_HeroPortalServiceDoorLeafCluster_L <-> V73_HeroPortalServiceDoorFrameCluster_L overlap: 0.08m on Y at each left service bay
#   V73_HeroPortalServiceDoorLeafCluster_R <-> V73_HeroPortalServiceDoorFrameCluster_R overlap: 0.08m on Y at each right service bay
#   Each service-door cluster contains two connected bay components centered on the legacy door proxy positions

LEGACY_NAMES = [
    "V7_HumanScaleDoor_0",
    "V7_HumanScaleDoor_1",
    "V7_HumanScaleDoor_2",
    "V7_HumanScaleDoor_3",
]

REPLACEMENT_NAMES = [
    "V73_HeroPortalServiceDoorLeafCluster_L",
    "V73_HeroPortalServiceDoorLeafCluster_R",
    "V73_HeroPortalServiceDoorFrameCluster_L",
    "V73_HeroPortalServiceDoorFrameCluster_R",
]

MATTE_BLACK = "V16_MatteBlackStageHardware"
PRODUCTION_GOLD = "V16_BrushedProductionGold"


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
    "V7_HumanScaleDoor_0": bounds_from_location_dimensions((-7.5, -23.7, 4.15), (1.1, 0.16, 3.2)),
    "V7_HumanScaleDoor_1": bounds_from_location_dimensions((-5.0, -23.7, 4.15), (1.1, 0.16, 3.2)),
    "V7_HumanScaleDoor_2": bounds_from_location_dimensions((5.0, -23.7, 4.15), (1.1, 0.16, 3.2)),
    "V7_HumanScaleDoor_3": bounds_from_location_dimensions((7.5, -23.7, 4.15), (1.1, 0.16, 3.2)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*LEGACY_NAMES, "V68_HeroPortalShadowDais", "V68_HeroPortalCyanPlinth"):
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
    x_min = min(vertex.x for vertex in verts)
    x_max = max(vertex.x for vertex in verts)
    y_min = min(vertex.y for vertex in verts)
    y_max = max(vertex.y for vertex in verts)
    z_min = min(vertex.z for vertex in verts)
    z_max = max(vertex.z for vertex in verts)
    return {
        "x": (x_min, x_max),
        "y": (y_min, y_max),
        "z": (z_min, z_max),
        "center": ((x_min + x_max) * 0.5, (y_min + y_max) * 0.5, (z_min + z_max) * 0.5),
    }


def pointed_arch_loop(center_x, center_z, half_width, sill_z, shoulder_z, crown_z, segments=28):
    points = [(center_x - half_width, sill_z), (center_x + half_width, sill_z)]
    for index in range(segments + 1):
        t = index / segments
        angle = math.pi * t
        x = center_x + math.cos(angle) * half_width
        z = shoulder_z + (math.sin(angle) ** 1.1) * (crown_z - shoulder_z)
        points.append((x, z))
    return points


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


def finalize(obj, bevel_width=0.03, bevel_segments=2):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_profile_object(name, material_name, collection, components, bevel_width=0.0, bevel_segments=2):
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


ensure_object_mode()
collection = resolve_collection()

left_doors = [proxy_snapshot("V7_HumanScaleDoor_0"), proxy_snapshot("V7_HumanScaleDoor_1")]
right_doors = [proxy_snapshot("V7_HumanScaleDoor_2"), proxy_snapshot("V7_HumanScaleDoor_3")]

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)


def build_leaf_components(door_snapshots):
    components = []
    for door in door_snapshots:
        center_x, _, center_z = door["center"]
        sill_z = door["z"][0] - 0.02
        shoulder_z = door["z"][1] - 0.92
        crown_z = door["z"][1] + 0.12
        components.append(
            {
                "points": pointed_arch_loop(center_x, center_z, 0.62, sill_z, shoulder_z, crown_z, segments=20),
                "y_min": door["y"][0] - 0.52,
                "y_max": door["y"][1] + 0.18,
            }
        )
    return components


def build_frame_components(door_snapshots):
    components = []
    for door in door_snapshots:
        center_x, _, center_z = door["center"]
        sill_z = door["z"][0] - 0.18
        shoulder_z = door["z"][1] - 0.84
        crown_z = door["z"][1] + 0.36
        components.append(
            {
                "points": pointed_arch_loop(center_x, center_z, 0.82, sill_z, shoulder_z, crown_z, segments=13),
                "y_min": door["y"][0] - 0.70,
                "y_max": door["y"][1] + 0.26,
            }
        )
    return components


build_profile_object(
    "V73_HeroPortalServiceDoorLeafCluster_L",
    MATTE_BLACK,
    collection,
    build_leaf_components(left_doors),
    bevel_width=0.035,
    bevel_segments=1,
)
build_profile_object(
    "V73_HeroPortalServiceDoorLeafCluster_R",
    MATTE_BLACK,
    collection,
    build_leaf_components(right_doors),
    bevel_width=0.035,
    bevel_segments=1,
)
build_profile_object(
    "V73_HeroPortalServiceDoorFrameCluster_L",
    PRODUCTION_GOLD,
    collection,
    build_frame_components(left_doors),
    bevel_width=0.04,
    bevel_segments=1,
)
build_profile_object(
    "V73_HeroPortalServiceDoorFrameCluster_R",
    PRODUCTION_GOLD,
    collection,
    build_frame_components(right_doors),
    bevel_width=0.04,
    bevel_segments=1,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V73_HeroPortalServiceDoorLeafCluster_L", "V73_HeroPortalServiceDoorFrameCluster_L", axis="y", min_overlap=0.08)
verify_overlap("V73_HeroPortalServiceDoorLeafCluster_R", "V73_HeroPortalServiceDoorFrameCluster_R", axis="y", min_overlap=0.08)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
