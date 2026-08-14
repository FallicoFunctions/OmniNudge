from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   every V86 pool component stays nested inside its corresponding legacy V14 wet inset footprint with 0.01m ground overlap on Z
#   every V86 stone coping component stays centered on its corresponding legacy V14 garden edge footprint while rising 0.08m higher on Z
#   the left and right V86 pool arrays preserve the four spawn-lane basin centerlines at Y=-42,-34,-26,-18
#   the left and right V86 stone edge arrays preserve the six promenade garden rows at Y=-8,-1,8,18,29,38

LEGACY_NAMES = [
    *(f"V14_SpawnWetStoneInset_{index}_{side}" for index in range(4) for side in ("L", "R")),
    *(f"V14_GardenStoneEdge_{side}_{index}" for side in ("L", "R") for index in range(6)),
]

REPLACEMENT_NAMES = [
    "V86_SpawnWetInsetPoolArray_L",
    "V86_SpawnWetInsetPoolArray_R",
    "V86_GardenStoneEdgeArray_L",
    "V86_GardenStoneEdgeArray_R",
]

WATER = "V14_DeepReflectingWater"
STONE = "V14_PolishedMoonstoneShell"


def bounds_from_location_dimensions(location, dimensions):
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    return {
        "x": (location[0] - half_x, location[0] + half_x),
        "y": (location[1] - half_y, location[1] + half_y),
        "z": (location[2] - half_z, location[2] + half_z),
    }


FALLBACK_BOUNDS = {
    "V14_SpawnWetStoneInset_0_L": bounds_from_location_dimensions((-4.5, -42.0, 0.035), (4.4, 5.6, 0.07)),
    "V14_SpawnWetStoneInset_0_R": bounds_from_location_dimensions((4.5, -42.0, 0.035), (4.4, 5.6, 0.07)),
    "V14_SpawnWetStoneInset_1_L": bounds_from_location_dimensions((-4.5, -34.0, 0.035), (4.4, 5.6, 0.07)),
    "V14_SpawnWetStoneInset_1_R": bounds_from_location_dimensions((4.5, -34.0, 0.035), (4.4, 5.6, 0.07)),
    "V14_SpawnWetStoneInset_2_L": bounds_from_location_dimensions((-4.5, -26.0, 0.035), (4.4, 5.6, 0.07)),
    "V14_SpawnWetStoneInset_2_R": bounds_from_location_dimensions((4.5, -26.0, 0.035), (4.4, 5.6, 0.07)),
    "V14_SpawnWetStoneInset_3_L": bounds_from_location_dimensions((-4.5, -18.0, 0.035), (4.4, 5.6, 0.07)),
    "V14_SpawnWetStoneInset_3_R": bounds_from_location_dimensions((4.5, -18.0, 0.035), (4.4, 5.6, 0.07)),
    "V14_GardenStoneEdge_L_0": bounds_from_location_dimensions((-10.35, -8.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_L_1": bounds_from_location_dimensions((-10.35, -1.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_L_2": bounds_from_location_dimensions((-11.63, 8.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_L_3": bounds_from_location_dimensions((-13.23, 18.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_L_4": bounds_from_location_dimensions((-14.99, 29.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_L_5": bounds_from_location_dimensions((-16.43, 38.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_R_0": bounds_from_location_dimensions((10.35, -8.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_R_1": bounds_from_location_dimensions((10.35, -1.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_R_2": bounds_from_location_dimensions((11.63, 8.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_R_3": bounds_from_location_dimensions((13.23, 18.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_R_4": bounds_from_location_dimensions((14.99, 29.0, 0.62), (4.4, 0.76, 0.36)),
    "V14_GardenStoneEdge_R_5": bounds_from_location_dimensions((16.43, 38.0, 0.62), (4.4, 0.76, 0.36)),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V14_SpawnWetStoneInset_0_L")
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


def existing_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        fallback = FALLBACK_BOUNDS.get(name)
        if fallback is None:
            raise RuntimeError(f"Missing object or fallback bounds for {name}")
        return fallback

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


def rounded_rect_points(center_x, center_y, half_x, half_y, radius, segments):
    radius = min(radius, half_x - 0.01, half_y - 0.01)
    corners = [
        (center_x + half_x - radius, center_y + half_y - radius, 0.0, math.pi * 0.5),
        (center_x - half_x + radius, center_y + half_y - radius, math.pi * 0.5, math.pi),
        (center_x - half_x + radius, center_y - half_y + radius, math.pi, math.pi * 1.5),
        (center_x + half_x - radius, center_y - half_y + radius, math.pi * 1.5, math.pi * 2.0),
    ]
    points = []
    for corner_x, corner_y, start_angle, end_angle in corners:
        for step in range(segments):
            angle = start_angle + (end_angle - start_angle) * (step / segments)
            points.append((corner_x + math.cos(angle) * radius, corner_y + math.sin(angle) * radius))
    return points


def add_ring_stack_z(bm, loops):
    rings = []
    for z, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, y in points])

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


def finalize(obj, bevel_width=0.018, bevel_segments=2):
    set_active(obj)
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


def build_loft_object_z(name, material_name, collection, components, bevel_width=0.018, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_ring_stack_z(bm, component)

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


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def pool_components(proxies):
    components = []
    for proxy in proxies:
        center_x = midpoint(proxy, "x")
        center_y = midpoint(proxy, "y")
        half_x = (proxy["x"][1] - proxy["x"][0]) * 0.5
        half_y = (proxy["y"][1] - proxy["y"][0]) * 0.5
        components.append(
            [
                (-0.01, rounded_rect_points(center_x, center_y, half_x + 0.12, half_y + 0.14, 0.82, 8)),
                (0.02, rounded_rect_points(center_x, center_y, half_x + 0.20, half_y + 0.22, 0.98, 8)),
                (0.06, rounded_rect_points(center_x, center_y, half_x - 0.06, half_y - 0.04, 0.72, 8)),
                (0.11, rounded_rect_points(center_x, center_y, half_x - 0.22, half_y - 0.28, 0.60, 8)),
                (0.16, rounded_rect_points(center_x, center_y, half_x - 0.40, half_y - 0.46, 0.46, 8)),
            ]
        )
    return components


def stone_edge_components(proxies):
    components = []
    for proxy in proxies:
        center_x = midpoint(proxy, "x")
        center_y = midpoint(proxy, "y")
        half_x = (proxy["x"][1] - proxy["x"][0]) * 0.5
        half_y = (proxy["y"][1] - proxy["y"][0]) * 0.5
        components.append(
            [
                (0.40, rounded_rect_points(center_x, center_y, half_x + 0.18, half_y + 0.10, 0.42, 6)),
                (0.50, rounded_rect_points(center_x, center_y, half_x + 0.12, half_y + 0.06, 0.38, 6)),
                (0.62, rounded_rect_points(center_x, center_y, half_x - 0.04, half_y - 0.01, 0.32, 6)),
                (0.76, rounded_rect_points(center_x, center_y, half_x - 0.22, half_y - 0.08, 0.24, 6)),
                (0.88, rounded_rect_points(center_x, center_y, half_x - 0.44, half_y - 0.14, 0.16, 6)),
            ]
        )
    return components


ensure_object_mode()
collection = resolve_collection()

pool_left_proxies = [existing_bounds(f"V14_SpawnWetStoneInset_{index}_L") for index in range(4)]
pool_right_proxies = [existing_bounds(f"V14_SpawnWetStoneInset_{index}_R") for index in range(4)]
edge_left_proxies = [existing_bounds(f"V14_GardenStoneEdge_L_{index}") for index in range(6)]
edge_right_proxies = [existing_bounds(f"V14_GardenStoneEdge_R_{index}") for index in range(6)]

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

build_loft_object_z("V86_SpawnWetInsetPoolArray_L", WATER, collection, pool_components(pool_left_proxies), bevel_width=0.012, bevel_segments=1)
build_loft_object_z("V86_SpawnWetInsetPoolArray_R", WATER, collection, pool_components(pool_right_proxies), bevel_width=0.012, bevel_segments=1)
build_loft_object_z("V86_GardenStoneEdgeArray_L", STONE, collection, stone_edge_components(edge_left_proxies), bevel_width=0.018, bevel_segments=1)
build_loft_object_z("V86_GardenStoneEdgeArray_R", STONE, collection, stone_edge_components(edge_right_proxies), bevel_width=0.018, bevel_segments=1)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V86_WET_STONE_POCKET_REPLACEMENT_COMPLETE replacements=4")
