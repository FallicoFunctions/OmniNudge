from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V103_PearlSurfaceGoldRelief_L plaques <-> V103_PearlSurfaceCyanInset_L plaques:
#     preserve >=4.40m X overlap and >=1.20m Z overlap for each left-side plaque so the inset reads nested in the relief.
#   V103_PearlSurfaceGoldRelief_R plaques <-> V103_PearlSurfaceCyanInset_R plaques:
#     preserve >=4.40m X overlap and >=1.20m Z overlap for each right-side plaque so the inset reads nested in the relief.
#   Every plaque family <-> neighboring plaque on X:
#     keep three evenly stepped facade bays per side with >=4.80m separation between plaque centers.

LEGACY_NAMES = [
    "V21_Merged_V20_PearlSurfaceRelief",
    "V21_Merged_V20_PearlSurfaceInset",
]
REPLACEMENT_NAMES = [
    "V103_PearlSurfaceGoldRelief_L",
    "V103_PearlSurfaceGoldRelief_R",
    "V103_PearlSurfaceCyanInset_L",
    "V103_PearlSurfaceCyanInset_R",
]

GOLD = "V20_ChasedGoldFiligree"
CYAN = "V20_CelestialCyanGlass"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in LEGACY_NAMES + REPLACEMENT_NAMES:
        anchor = bpy.data.objects.get(name)
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


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.012):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = 1
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.7
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


def side_bounds(components, side):
    if side == "L":
        selected = [bounds for bounds in components if (bounds["x"][0] + bounds["x"][1]) * 0.5 <= 0.0]
    else:
        selected = [bounds for bounds in components if (bounds["x"][0] + bounds["x"][1]) * 0.5 >= 0.0]

    if not selected:
        raise RuntimeError(f"Missing {side} component bounds")

    return {
        "x": (min(bounds["x"][0] for bounds in selected), max(bounds["x"][1] for bounds in selected)),
        "y": (min(bounds["y"][0] for bounds in selected), max(bounds["y"][1] for bounds in selected)),
        "z": (min(bounds["z"][0] for bounds in selected), max(bounds["z"][1] for bounds in selected)),
    }


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


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


def verify_overlap(bounds_a, bounds_b, axis, minimum, label):
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{label} overlap[{axis.upper()}]={overlap:.3f}")
    if overlap < minimum:
        raise RuntimeError(f"{label} overlap on {axis} below minimum {minimum:.3f}: {overlap:.3f}")


def verify_span(name, axis, minimum):
    actual = span(world_bounds(name), axis)
    print(f"{name} span[{axis.upper()}]={actual:.3f}")
    if actual < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {actual:.3f}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


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


def build_loft_object(name, material_name, collection, component_loops, bevel_width):
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
    finalize(obj, bevel_width=bevel_width)
    return obj


def station_series(x_min, x_max, count):
    return [x_min + (x_max - x_min) * index / (count - 1) for index in range(count)]


def plaque_profile(center_y, z_min, z_max, front_depth, back_depth, shoulder, crest):
    mid_z = (z_min + z_max) * 0.5
    return [
        (center_y - back_depth * 0.92, z_min + shoulder * 0.25),
        (center_y - back_depth, z_min + shoulder * 0.82),
        (center_y - back_depth * 0.84, mid_z - crest * 0.18),
        (center_y - back_depth * 0.38, z_max - crest * 0.34),
        (center_y + front_depth * 0.28, z_max),
        (center_y + front_depth, z_max - crest * 0.38),
        (center_y + front_depth * 0.92, mid_z),
        (center_y + front_depth * 0.54, z_min + crest * 0.48),
        (center_y - back_depth * 0.18, z_min),
    ]


def gold_component_loops(x_center, half_width, center_y, z_min, z_max, plaque_index, side):
    stations = station_series(x_center - half_width, x_center + half_width, 7)
    loops = []
    side_sign = -1.0 if side == "L" else 1.0
    for station_index, station_x in enumerate(stations):
        t = station_index / (len(stations) - 1)
        arch = math.sin(t * math.pi)
        sway = math.cos(t * math.pi)
        local_center_y = center_y + side_sign * sway * 0.018
        local_z_min = z_min + arch * (0.08 + plaque_index * 0.015)
        local_z_max = z_max + arch * (0.22 + plaque_index * 0.03)
        front_depth = 0.12 + 0.05 * arch
        back_depth = 0.13 + 0.025 * (1.0 - arch)
        shoulder = 0.36 + 0.06 * arch
        crest = 0.44 + 0.05 * arch
        loops.append(
            (
                station_x,
                plaque_profile(local_center_y, local_z_min, local_z_max, front_depth, back_depth, shoulder, crest),
            )
        )
    return loops


def cyan_component_loops(x_center, half_width, center_y, z_min, z_max, plaque_index, side):
    stations = station_series(x_center - half_width, x_center + half_width, 7)
    loops = []
    side_sign = -1.0 if side == "L" else 1.0
    for station_index, station_x in enumerate(stations):
        t = station_index / (len(stations) - 1)
        arch = math.sin(t * math.pi)
        sway = math.cos(t * math.pi)
        local_center_y = center_y - 0.01 + side_sign * sway * 0.012
        local_z_min = z_min + arch * (0.05 + plaque_index * 0.01)
        local_z_max = z_max + arch * (0.10 + plaque_index * 0.02)
        front_depth = 0.045 + 0.025 * arch
        back_depth = 0.05 + 0.016 * (1.0 - arch)
        shoulder = 0.16 + 0.03 * arch
        crest = 0.18 + 0.03 * arch
        loops.append(
            (
                station_x,
                plaque_profile(local_center_y, local_z_min, local_z_max, front_depth, back_depth, shoulder, crest),
            )
        )
    return loops


def side_plaque_centers(bounds):
    x_min, x_max = bounds["x"]
    width = x_max - x_min
    return [x_min + width * ratio for ratio in (0.17, 0.5, 0.83)]


def build_gold_components(bounds, side):
    x_span = span(bounds, "x")
    half_width = x_span * 0.145
    center_y = midpoint(bounds, "y")
    z_min = bounds["z"][0] + 0.08
    z_max = bounds["z"][1] - 0.16
    return [
        gold_component_loops(x_center, half_width, center_y, z_min, z_max, plaque_index, side)
        for plaque_index, x_center in enumerate(side_plaque_centers(bounds))
    ]


def build_cyan_components(gold_bounds, inset_bounds, side):
    x_span = span(inset_bounds, "x")
    half_width = x_span * 0.123
    center_y = midpoint(gold_bounds, "y") - 0.006
    z_min = inset_bounds["z"][0] + 0.04
    z_max = inset_bounds["z"][1] - 0.04
    return [
        cyan_component_loops(x_center, half_width, center_y, z_min, z_max, plaque_index, side)
        for plaque_index, x_center in enumerate(side_plaque_centers(inset_bounds))
    ]


def main():
    ensure_object_mode()
    collection = resolve_collection()

    relief_components = world_component_bounds("V21_Merged_V20_PearlSurfaceRelief")
    inset_components = world_component_bounds("V21_Merged_V20_PearlSurfaceInset")
    gold_side_bounds = {side: side_bounds(relief_components, side) for side in ("L", "R")}
    inset_side_bounds = {side: side_bounds(inset_components, side) for side in ("L", "R")}

    delete_existing(REPLACEMENT_NAMES)
    delete_existing(LEGACY_NAMES)

    replacements = [
        build_loft_object(
            "V103_PearlSurfaceGoldRelief_L",
            GOLD,
            collection,
            build_gold_components(gold_side_bounds["L"], "L"),
            bevel_width=0.012,
        ),
        build_loft_object(
            "V103_PearlSurfaceGoldRelief_R",
            GOLD,
            collection,
            build_gold_components(gold_side_bounds["R"], "R"),
            bevel_width=0.012,
        ),
        build_loft_object(
            "V103_PearlSurfaceCyanInset_L",
            CYAN,
            collection,
            build_cyan_components(gold_side_bounds["L"], inset_side_bounds["L"], "L"),
            bevel_width=0.009,
        ),
        build_loft_object(
            "V103_PearlSurfaceCyanInset_R",
            CYAN,
            collection,
            build_cyan_components(gold_side_bounds["R"], inset_side_bounds["R"], "R"),
            bevel_width=0.009,
        ),
    ]

    left_gold_bounds = log_bounds("V103_PearlSurfaceGoldRelief_L")
    right_gold_bounds = log_bounds("V103_PearlSurfaceGoldRelief_R")
    left_cyan_bounds = log_bounds("V103_PearlSurfaceCyanInset_L")
    right_cyan_bounds = log_bounds("V103_PearlSurfaceCyanInset_R")

    verify_overlap(left_gold_bounds, left_cyan_bounds, "x", 4.4, "Left pearl relief <-> cyan inset")
    verify_overlap(right_gold_bounds, right_cyan_bounds, "x", 4.4, "Right pearl relief <-> cyan inset")
    verify_overlap(left_gold_bounds, left_cyan_bounds, "z", 1.2, "Left pearl relief <-> cyan inset")
    verify_overlap(right_gold_bounds, right_cyan_bounds, "z", 1.2, "Right pearl relief <-> cyan inset")
    verify_span("V103_PearlSurfaceGoldRelief_L", "x", 16.0)
    verify_span("V103_PearlSurfaceGoldRelief_R", "x", 16.0)
    verify_span("V103_PearlSurfaceGoldRelief_L", "z", 6.4)
    verify_span("V103_PearlSurfaceGoldRelief_R", "z", 6.4)
    verify_span("V103_PearlSurfaceCyanInset_L", "x", 15.45)
    verify_span("V103_PearlSurfaceCyanInset_R", "x", 15.45)
    verify_span("V103_PearlSurfaceCyanInset_L", "z", 1.5)
    verify_span("V103_PearlSurfaceCyanInset_R", "z", 1.5)
    audit_transforms([obj.name for obj in replacements])
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
