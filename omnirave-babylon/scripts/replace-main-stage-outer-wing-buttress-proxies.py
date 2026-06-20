from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V107_OuterWingButtressArray_L component crowns <-> V104_OuterWingGoldSpineArray_L:
#     overlap >= 0.005m on Y so each pearl buttress reads nested behind the authored gold spine.
#   V107_OuterWingButtressArray_R component crowns <-> V104_OuterWingGoldSpineArray_R:
#     overlap >= 0.005m on Y with mirrored shell depth and the same stepped wing cadence.
#   Each four-piece side array preserves the existing outer-wing station spacing while replacing the boxy proxy silhouette.

LEGACY_NAMES = [
    "V20_OuterWingButtress_L_0",
    "V20_OuterWingButtress_L_1",
    "V20_OuterWingButtress_L_2",
    "V20_OuterWingButtress_L_3",
    "V20_OuterWingButtress_R_0",
    "V20_OuterWingButtress_R_1",
    "V20_OuterWingButtress_R_2",
    "V20_OuterWingButtress_R_3",
]
REPLACEMENT_NAMES = [
    "V107_OuterWingButtressArray_L",
    "V107_OuterWingButtressArray_R",
]

ORIGINAL_COMPONENTS = [
    {"x": (-35.1908, -33.2592), "y": (-13.9651, -9.6349), "z": (2.5894, 10.8606)},
    {"x": (-30.6915, -28.7585), "y": (-13.9671, -9.6329), "z": (2.5938, 11.6562)},
    {"x": (-25.6922, -23.7578), "y": (-13.9688, -9.6312), "z": (2.5976, 12.4524)},
    {"x": (-20.6927, -18.7573), "y": (-13.9701, -9.6299), "z": (2.6010, 13.2490)},
    {"x": (18.7573, 20.6927), "y": (-13.9701, -9.6299), "z": (2.6010, 13.2490)},
    {"x": (23.7578, 25.6922), "y": (-13.9688, -9.6312), "z": (2.5976, 12.4524)},
    {"x": (28.7585, 30.6915), "y": (-13.9671, -9.6329), "z": (2.5938, 11.6562)},
    {"x": (33.2592, 35.1908), "y": (-13.9651, -9.6349), "z": (2.5894, 10.8606)},
]

PEARL = "V20_LayeredPearlShell"
STATION_COUNT = 4


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*LEGACY_NAMES, *REPLACEMENT_NAMES]:
        obj = bpy.data.objects.get(name)
        if obj is not None and obj.users_collection:
            return obj.users_collection[0]
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


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def auto_uv_project(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(70.0), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj):
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def world_bounds_for_object(obj):
    if obj.type != "MESH" or not obj.data.vertices:
        raise RuntimeError(f"Missing mesh vertices: {obj.name}")
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def source_component_bounds():
    components = []
    for name in LEGACY_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            components.append(world_bounds_for_object(obj))
    if components:
        return sorted(
            components,
            key=lambda bounds: ((bounds["x"][0] + bounds["x"][1]) * 0.5, (bounds["z"][0] + bounds["z"][1]) * 0.5),
        )

    return sorted(
        [dict(bounds) for bounds in ORIGINAL_COMPONENTS],
        key=lambda bounds: ((bounds["x"][0] + bounds["x"][1]) * 0.5, (bounds["z"][0] + bounds["z"][1]) * 0.5),
    )


def component_groups(components, side):
    if side == "L":
        selected = [bounds for bounds in components if midpoint(bounds, "x") < 0.0]
    else:
        selected = [bounds for bounds in components if midpoint(bounds, "x") > 0.0]
    if len(selected) != 4:
        raise RuntimeError(f"Expected 4 {side} components, found {len(selected)}")
    return selected


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def station_series(x_min, x_max, count):
    return [x_min + (x_max - x_min) * index / (count - 1) for index in range(count)]


def buttress_profile(bounds, station_t):
    y_min, y_max = bounds["y"]
    z_min, z_max = bounds["z"]
    center_y = midpoint(bounds, "y")
    depth = span(bounds, "y")
    height = span(bounds, "z")
    arch = math.sin(station_t * math.pi)

    back_y = y_min - (0.20 + depth * 0.025) - arch * 0.06
    front_y = y_max + (0.18 + depth * 0.02) + arch * 0.08
    inner_y = center_y - depth * (0.11 + arch * 0.015)
    shoulder_y = center_y + depth * (0.18 + arch * 0.02)

    base_z = z_min - 0.06
    knee_z = z_min + height * (0.16 + arch * 0.01)
    shoulder_z = z_min + height * (0.56 + arch * 0.02)
    crown_z = z_max + 0.28 + arch * 0.10
    return [
        (back_y, base_z),
        (back_y - 0.08, knee_z),
        (inner_y, shoulder_z),
        (center_y, crown_z),
        (front_y, shoulder_z + 0.04),
        (front_y + 0.05, knee_z),
        (shoulder_y, base_z + 0.08),
    ]


def buttress_component_loops(bounds):
    x_center = midpoint(bounds, "x")
    half_width = span(bounds, "x") * 0.5 + 0.08
    x_min = x_center - half_width
    x_max = x_center + half_width
    stations = station_series(x_min, x_max, STATION_COUNT)

    loops = []
    for station_index, station_x in enumerate(stations):
        t = station_index / (len(stations) - 1)
        arch = math.sin(t * math.pi)
        edge_pull = abs(0.5 - t) * 2.0
        profile = []
        for y_value, z_value in buttress_profile(bounds, t):
            profile.append(
                (
                    y_value - edge_pull * 0.05,
                    z_value - edge_pull * 0.08 + arch * 0.02,
                )
            )
        loops.append((station_x, profile))
    return loops


def add_ring_stack_x(bm, loops):
    rings = []
    for x_value, points in loops:
        rings.append([bm.verts.new((x_value, y_value, z_value)) for y_value, z_value in points])

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


def build_array(name, side, collection):
    components = component_groups(source_component_bounds(), side)
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in components:
        add_ring_stack_x(bm, buttress_component_loops(bounds))

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, PEARL)
    finalize(obj)
    return obj


def log_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    bounds = (
        tuple(round(min(vertex[i] for vertex in verts), 4) for i in range(3)),
        tuple(round(max(vertex[i] for vertex in verts), 4) for i in range(3)),
    )
    print(f"{name} bounds: {bounds}")


def main():
    ensure_object_mode()
    collection = resolve_collection()
    delete_existing(REPLACEMENT_NAMES)
    build_array("V107_OuterWingButtressArray_L", "L", collection)
    build_array("V107_OuterWingButtressArray_R", "R", collection)
    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()
    log_bounds("V107_OuterWingButtressArray_L")
    log_bounds("V107_OuterWingButtressArray_R")


if __name__ == "__main__":
    main()
