from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V104_OuterWingGoldSpineArray_L components <-> neighboring left wing arcade ribs:
#     keep four stepped spine bays aligned to the legacy outer-wing gold cadence.
#   V104_OuterWingGoldSpineArray_R components <-> neighboring right wing arcade ribs:
#     mirror the left cadence with matching shell-facing depth and crest height.

LEGACY_NAME = "V21_Merged_V20_OuterWingGoldSpine"
REPLACEMENT_NAMES = [
    "V104_OuterWingGoldSpineArray_L",
    "V104_OuterWingGoldSpineArray_R",
]
STATION_COUNT = 3

ORIGINAL_COMPONENTS = [
    {"x": (-35.293, -33.677), "y": (-13.69, -9.61), "z": (3.281, 10.069)},
    {"x": (-30.793, -29.177), "y": (-13.691, -9.609), "z": (3.283, 10.868)},
    {"x": (-25.794, -24.176), "y": (-13.691, -9.608), "z": (3.284, 11.666)},
    {"x": (-20.794, -19.176), "y": (-13.692, -9.608), "z": (3.285, 12.465)},
    {"x": (19.176, 20.794), "y": (-13.692, -9.608), "z": (3.285, 12.465)},
    {"x": (24.176, 25.794), "y": (-13.691, -9.608), "z": (3.284, 11.666)},
    {"x": (29.177, 30.793), "y": (-13.691, -9.609), "z": (3.283, 10.868)},
    {"x": (33.677, 35.293), "y": (-13.69, -9.61), "z": (3.281, 10.069)},
]

GOLD = "V20_ChasedGoldFiligree"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get(LEGACY_NAME)
    if anchor is not None and anchor.users_collection:
        return anchor.users_collection[0]
    for name in REPLACEMENT_NAMES:
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


def finalize(obj, bevel_width=0.018, bevel_segments=1):
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


def world_component_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH" or not obj.data.vertices:
        raise RuntimeError(f"Missing mesh object: {name}")

    vertex_positions = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    adjacency = [set() for _ in obj.data.vertices]
    for polygon in obj.data.polygons:
        verts = polygon.vertices[:]
        for index, vertex_index in enumerate(verts):
            for neighbor_index in verts[index + 1 :]:
                adjacency[vertex_index].add(neighbor_index)
                adjacency[neighbor_index].add(vertex_index)

    visited = set()
    components = []
    for start_index in range(len(obj.data.vertices)):
        if start_index in visited:
            continue
        stack = [start_index]
        visited.add(start_index)
        verts = []
        while stack:
            current = stack.pop()
            verts.append(vertex_positions[current])
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)

        components.append(
            {
                "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
                "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
                "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
            }
        )

    return sorted(
        components,
        key=lambda bounds: ((bounds["x"][0] + bounds["x"][1]) * 0.5, (bounds["z"][0] + bounds["z"][1]) * 0.5),
    )


def source_component_bounds():
    legacy = bpy.data.objects.get(LEGACY_NAME)
    if legacy is not None:
        return world_component_bounds(LEGACY_NAME)

    return sorted(
        [dict(bounds) for bounds in ORIGINAL_COMPONENTS],
        key=lambda bounds: ((bounds["x"][0] + bounds["x"][1]) * 0.5, (bounds["z"][0] + bounds["z"][1]) * 0.5),
    )


def component_groups(components, side):
    if side == "L":
        selected = [bounds for bounds in components if (bounds["x"][0] + bounds["x"][1]) * 0.5 < 0.0]
    else:
        selected = [bounds for bounds in components if (bounds["x"][0] + bounds["x"][1]) * 0.5 > 0.0]
    if len(selected) != 4:
        raise RuntimeError(f"Expected 4 {side} components, found {len(selected)}")
    return selected


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def station_series(x_min, x_max, count):
    return [x_min + (x_max - x_min) * index / (count - 1) for index in range(count)]


def spine_profile(center_y, z_min, z_max, front_depth, back_depth, flare, crest, station_t, side_sign):
    arch = math.sin(station_t * math.pi)
    shoulder = math.sin(station_t * math.pi * 0.5)
    crest_z = z_max - crest * (0.16 + 0.12 * arch)
    waist_z = z_min + (z_max - z_min) * (0.38 + 0.05 * math.cos(station_t * math.pi))
    heel_z = z_min + crest * 0.22
    front = center_y + front_depth * (0.82 + 0.18 * arch)
    back = center_y - back_depth * (0.85 + 0.15 * arch)
    cheek = flare * (0.9 + 0.1 * shoulder)
    return [
        (back + cheek * 0.05 * side_sign, heel_z),
        (back - cheek * 0.18 * side_sign, crest_z - crest * 0.32),
        (center_y - cheek * 0.10 * side_sign, z_max),
        (front + cheek * 0.22 * side_sign, crest_z),
        (center_y + cheek * 0.08 * side_sign, z_min),
    ]


def gold_spine_component_loops(bounds, side):
    x_center = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    z_center = midpoint(bounds, "z")
    side_sign = -1.0 if side == "L" else 1.0

    half_width = span(bounds, "x") * 0.535
    x_min = x_center - half_width
    x_max = x_center + half_width
    stations = station_series(x_min, x_max, STATION_COUNT)

    lower_z = bounds["z"][0] - 0.24
    upper_z = bounds["z"][1] + 0.28
    back_depth = max(span(bounds, "y") * 0.46, 1.75)
    front_depth = max(span(bounds, "y") * 0.24, 0.92)
    flare = max(span(bounds, "y") * 0.18, 0.36)
    crest = max(span(bounds, "z") * 0.11, 0.44)

    loops = []
    for station_index, station_x in enumerate(stations):
        t = station_index / (len(stations) - 1)
        edge_taper = 0.78 + 0.22 * math.sin(t * math.pi)
        profile = spine_profile(
            center_y=center_y,
            z_min=lower_z + crest * (0.14 * (1.0 - edge_taper)),
            z_max=z_center + (upper_z - z_center) * edge_taper,
            front_depth=front_depth * (0.92 + 0.08 * math.sin(t * math.pi)),
            back_depth=back_depth * (0.90 + 0.10 * math.sin(t * math.pi)),
            flare=flare,
            crest=crest,
            station_t=t,
            side_sign=side_sign,
        )
        loops.append((station_x, profile))

    return loops


def add_ring_stack_x(bm, loops):
    rings = []
    for x, points in loops:
        rings.append([bm.verts.new((x, y, z)) for y, z in points])

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


def build_loft_object(name, material_name, collection, component_loops, bevel_width=0.018, bevel_segments=1):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for loops in component_loops:
        add_ring_stack_x(bm, loops)
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


def verify_span(name, axis, minimum):
    actual = span(world_bounds(name), axis)
    print(f"{name} span[{axis.upper()}]={actual:.3f}")
    if actual < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {actual:.3f}")


def verify_component_count(name, expected_count):
    components = world_component_bounds(name)
    print(f"{name} components={len(components)}")
    if len(components) != expected_count:
        raise RuntimeError(f"{name} expected {expected_count} components, found {len(components)}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def main():
    ensure_object_mode()
    collection = resolve_collection()
    legacy_components = source_component_bounds()
    left_components = component_groups(legacy_components, "L")
    right_components = component_groups(legacy_components, "R")

    delete_existing(REPLACEMENT_NAMES)

    build_loft_object(
        "V104_OuterWingGoldSpineArray_L",
        GOLD,
        collection,
        [gold_spine_component_loops(bounds, "L") for bounds in left_components],
    )
    build_loft_object(
        "V104_OuterWingGoldSpineArray_R",
        GOLD,
        collection,
        [gold_spine_component_loops(bounds, "R") for bounds in right_components],
    )

    delete_existing([LEGACY_NAME])

    log_bounds("V104_OuterWingGoldSpineArray_L")
    log_bounds("V104_OuterWingGoldSpineArray_R")
    verify_span("V104_OuterWingGoldSpineArray_L", "x", 16.2)
    verify_span("V104_OuterWingGoldSpineArray_R", "x", 16.2)
    verify_span("V104_OuterWingGoldSpineArray_L", "z", 8.9)
    verify_span("V104_OuterWingGoldSpineArray_R", "z", 8.9)
    verify_component_count("V104_OuterWingGoldSpineArray_L", 4)
    verify_component_count("V104_OuterWingGoldSpineArray_R", 4)
    audit_transforms(REPLACEMENT_NAMES)

    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
