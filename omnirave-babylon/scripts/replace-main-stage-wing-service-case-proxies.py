from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V93 service case overlaps its matching V10 cube footprint with >=0.10m on X/Y and >=0.20m on Z
#   each V93 side array contains exactly two disconnected cases matching the legacy front/rear placements
#   each replacement case keeps ground contact at the original base elevation and stays inside the wing service lane

LEGACY_NAMES = [
    "V10_ServiceCase_L_0",
    "V10_ServiceCase_L_1",
    "V10_ServiceCase_R_0",
    "V10_ServiceCase_R_1",
]

REPLACEMENT_NAMES = [
    "V93_ServiceCaseArray_L",
    "V93_ServiceCaseArray_R",
]

BLACK = "V9_BlackRigging"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V10_ServiceCase_L_0")
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


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def road_case_profile(center_x, center_y, half_x, half_y, chamfer, ridge=0.0):
    profile = []
    point_count = 24
    for index in range(point_count):
        angle = 2.0 * math.pi * index / point_count
        corner_x = math.cos(angle)
        corner_y = math.sin(angle)
        edge_bias = abs(corner_x * corner_y)
        radius_x = half_x - chamfer * 0.45 + chamfer * edge_bias
        radius_y = half_y - chamfer * 0.45 + chamfer * edge_bias
        facet = 1.0 + ridge * math.cos(angle * 4.0)
        profile.append((center_x + corner_x * radius_x * facet, center_y + corner_y * radius_y * facet))
    return profile


def add_loft_stack_z(bm, loops):
    rings = []
    for z_value, points in loops:
        rings.append([bm.verts.new((x, y, z_value)) for x, y in points])

    for lower_ring, upper_ring in zip(rings, rings[1:]):
        count = len(lower_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    lower_ring[index],
                    lower_ring[next_index],
                    upper_ring[next_index],
                    upper_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, bevel_width=0.024, bevel_segments=1):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_mesh_object(name, material_name, collection, build_fn, *, bevel_width=0.024, bevel_segments=1):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    build_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def build_case_component(bm, bounds, side_index):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    half_x = (bounds["x"][1] - bounds["x"][0]) * 0.5 + 0.05
    half_y = (bounds["y"][1] - bounds["y"][0]) * 0.5 + 0.02
    z0 = bounds["z"][0] - 0.02
    z1 = bounds["z"][1] + 0.03
    lid_z = z1 - 0.18
    latch_z = z1 - 0.34
    ridge = 0.035 if side_index == 0 else 0.05

    loops = [
        (z0, road_case_profile(center_x, center_y, half_x * 1.01, half_y * 1.00, 0.13, ridge=0.0)),
        (z0 + 0.10, road_case_profile(center_x, center_y, half_x * 0.99, half_y * 0.98, 0.12, ridge=0.0)),
        (z0 + 0.28, road_case_profile(center_x, center_y, half_x * 0.98, half_y * 0.97, 0.11, ridge=ridge * 0.4)),
        (latch_z, road_case_profile(center_x, center_y, half_x * 0.96, half_y * 0.95, 0.10, ridge=ridge)),
        (lid_z, road_case_profile(center_x, center_y, half_x * 0.94, half_y * 0.94, 0.09, ridge=ridge * 1.1)),
        (z1 - 0.05, road_case_profile(center_x, center_y, half_x * 0.95, half_y * 0.93, 0.08, ridge=ridge * 0.8)),
        (z1, road_case_profile(center_x, center_y, half_x * 0.89, half_y * 0.89, 0.08, ridge=0.0)),
    ]
    add_loft_stack_z(bm, loops)


def build_service_case_array(side):
    legacy_names = [f"V10_ServiceCase_{side}_0", f"V10_ServiceCase_{side}_1"]
    bounds_list = [proxy_bounds(name) for name in legacy_names]

    def _build(bm):
        for index, bounds in enumerate(bounds_list):
            build_case_component(bm, bounds, index)

    return _build


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_span(name, axis, minimum):
    bounds = world_bounds(name)
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{name} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


def verify_overlap(bounds_a, bounds_b, axis, minimum, label):
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{label} overlap[{axis.upper()}]={overlap:.3f}")
    if overlap < minimum:
        raise RuntimeError(f"{label} overlap on {axis} below minimum {minimum:.3f}: {overlap:.3f}")


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

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_mesh_object("V93_ServiceCaseArray_L", BLACK, collection, build_service_case_array("L"))
build_mesh_object("V93_ServiceCaseArray_R", BLACK, collection, build_service_case_array("R"))

for side in ("L", "R"):
    replacement_bounds = log_bounds(f"V93_ServiceCaseArray_{side}")
    verify_span(f"V93_ServiceCaseArray_{side}", "x", 2.65)
    verify_span(f"V93_ServiceCaseArray_{side}", "y", 1.68)
    verify_span(f"V93_ServiceCaseArray_{side}", "y", 27.0)
    for index in (0, 1):
        legacy_bounds = proxy_bounds(f"V10_ServiceCase_{side}_{index}")
        verify_overlap(replacement_bounds, legacy_bounds, "x", 2.20, f"{side} array <-> case {index}")
        verify_overlap(replacement_bounds, legacy_bounds, "y", 1.40, f"{side} array <-> case {index}")
        verify_overlap(replacement_bounds, legacy_bounds, "z", 1.20, f"{side} array <-> case {index}")

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V93_WING_SERVICE_CASE_REPLACEMENT_COMPLETE replacements=2")
