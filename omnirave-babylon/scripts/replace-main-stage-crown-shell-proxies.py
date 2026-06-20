from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V113_CrownShellLamellaArray_L <-> legacy V17_CrownShellLamella_L_* spans:
#     overlap >= 0.005m on X/Y while extending slightly on Z to read as layered shell plating.
#   V113_CrownShellLamellaArray_R <-> legacy V17_CrownShellLamella_R_* spans:
#     overlap >= 0.005m on X/Y with mirrored crown-shell cadence preserved.
#   V113_CrownShellGoldSeamArray_L <-> legacy V17_CrownShellGoldSeam_L_* spans:
#     overlap >= 0.005m on X/Y while projecting forward on Z so the seam reads as chased trim.
#   V113_CrownShellGoldSeamArray_R <-> legacy V17_CrownShellGoldSeam_R_* spans:
#     overlap >= 0.005m on X/Y with mirrored trim spacing preserved.

LEGACY_LAMELLA_NAMES = [
    "V17_CrownShellLamella_L_0",
    "V17_CrownShellLamella_L_1",
    "V17_CrownShellLamella_L_2",
    "V17_CrownShellLamella_L_3",
    "V17_CrownShellLamella_R_0",
    "V17_CrownShellLamella_R_1",
    "V17_CrownShellLamella_R_2",
    "V17_CrownShellLamella_R_3",
]
LEGACY_GOLD_NAMES = [
    "V17_CrownShellGoldSeam_L_0",
    "V17_CrownShellGoldSeam_L_1",
    "V17_CrownShellGoldSeam_L_2",
    "V17_CrownShellGoldSeam_L_3",
    "V17_CrownShellGoldSeam_R_0",
    "V17_CrownShellGoldSeam_R_1",
    "V17_CrownShellGoldSeam_R_2",
    "V17_CrownShellGoldSeam_R_3",
]
LEGACY_NAMES = [*LEGACY_LAMELLA_NAMES, *LEGACY_GOLD_NAMES]
REPLACEMENT_NAMES = [
    "V113_CrownShellLamellaArray_L",
    "V113_CrownShellLamellaArray_R",
    "V113_CrownShellGoldSeamArray_L",
    "V113_CrownShellGoldSeamArray_R",
]

PEARL = "V20_LayeredPearlShell"
GOLD = "V20_ChasedGoldFiligree"

FALLBACK_LAMELLA_COMPONENTS = [
    {"side": "L", "x": (-7.6737, -3.2263), "y": (29.9686, 62.0314), "z": (23.8401, 24.6099)},
    {"side": "L", "x": (-10.8721, -4.1279), "y": (30.8499, 60.6501), "z": (24.0100, 24.6200)},
    {"side": "L", "x": (-14.0591, -5.0409), "y": (31.7267, 59.2733), "z": (24.1976, 24.6124)},
    {"side": "L", "x": (-17.2470, -5.9530), "y": (32.6006, 57.8994), "z": (24.2882, 24.7018)},
    {"side": "R", "x": (3.2263, 7.6737), "y": (29.9686, 62.0314), "z": (23.8401, 24.6099)},
    {"side": "R", "x": (4.1279, 10.8721), "y": (30.8499, 60.6501), "z": (24.0100, 24.6200)},
    {"side": "R", "x": (5.0409, 14.0591), "y": (31.7267, 59.2733), "z": (24.1976, 24.6124)},
    {"side": "R", "x": (5.9530, 17.2470), "y": (32.6006, 57.8994), "z": (24.2882, 24.7018)},
]
FALLBACK_GOLD_COMPONENTS = [
    {"side": "L", "x": (-7.3054, -3.3766), "y": (29.9942, 62.0058), "z": (24.1351, 24.6749)},
    {"side": "L", "x": (-10.4414, -4.2586), "y": (30.8910, 60.6090), "z": (24.3132, 24.6768)},
    {"side": "L", "x": (-13.5743, -5.1437), "y": (31.7867, 59.2133), "z": (24.4946, 24.6754)},
    {"side": "L", "x": (-16.7078, -6.0282), "y": (32.6818, 57.8182), "z": (24.5847, 24.7653)},
    {"side": "R", "x": (3.3766, 7.3054), "y": (29.9942, 62.0058), "z": (24.1351, 24.6749)},
    {"side": "R", "x": (4.2586, 10.4414), "y": (30.8910, 60.6090), "z": (24.3132, 24.6768)},
    {"side": "R", "x": (5.1437, 13.5743), "y": (31.7867, 59.2133), "z": (24.4946, 24.6754)},
    {"side": "R", "x": (6.0282, 16.7078), "y": (32.6818, 57.8182), "z": (24.5847, 24.7653)},
]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*REPLACEMENT_NAMES, *LEGACY_NAMES, "V52_CrownObeliskPearlCore"]:
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


def ensure_vertex_stable_uvs(mesh, cube_size=8.0):
    existing = mesh.uv_layers.get("OmniRaveGeneratedUV")
    if existing is not None:
        mesh.uv_layers.remove(existing)
    uv_layer = mesh.uv_layers.new(name="OmniRaveGeneratedUV")
    min_bounds = [min(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3)]
    max_bounds = [max(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3)]
    extents = [max_bounds[axis] - min_bounds[axis] for axis in range(3)]
    uv_axes = sorted(range(3), key=lambda axis: extents[axis], reverse=True)[:2]

    per_vertex_uvs = {}
    for vertex in mesh.vertices:
        u = vertex.co[uv_axes[0]] / cube_size + 0.5
        v = vertex.co[uv_axes[1]] / cube_size + 0.5
        per_vertex_uvs[vertex.index] = (u, v)

    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = per_vertex_uvs[loop.vertex_index]


def finalize(obj):
    triangulate_mesh(obj)
    ensure_vertex_stable_uvs(obj.data)
    set_active(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def world_bounds_for_points(points):
    return {
        "x": (min(point.x for point in points), max(point.x for point in points)),
        "y": (min(point.y for point in points), max(point.y for point in points)),
        "z": (min(point.z for point in points), max(point.z for point in points)),
    }


def world_bounds_for_object(obj):
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return world_bounds_for_points(verts)


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def source_component_bounds(names, fallback):
    components = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH" or not obj.data.vertices:
            continue
        bounds = world_bounds_for_object(obj)
        bounds["side"] = "L" if midpoint(bounds, "x") < 0.0 else "R"
        components.append(bounds)
    if components:
        return sorted(components, key=lambda bounds: midpoint(bounds, "x"))
    return [dict(bounds) for bounds in fallback]


def grouped_side_bounds(components, side):
    groups = [bounds for bounds in components if bounds["side"] == side]
    if len(groups) != 4:
        raise RuntimeError(f"Expected 4 {side} components, found {len(groups)}")
    return groups


def lamella_polygon(bounds):
    center_x = midpoint(bounds, "x")
    x_half = span(bounds, "x") * 0.5 + 0.18
    y_min, y_max = bounds["y"]
    y_span = y_max - y_min
    lower = y_min - 0.10
    upper = y_max + 0.10
    shoulder_low = y_min + y_span * 0.18
    shoulder_high = y_min + y_span * 0.80
    waist_low = y_min + y_span * 0.32
    waist_high = y_min + y_span * 0.64
    return [
        (center_x - x_half * 0.58, lower),
        (center_x - x_half * 0.92, shoulder_low),
        (center_x - x_half, waist_low),
        (center_x - x_half * 0.96, waist_high),
        (center_x - x_half * 0.76, shoulder_high),
        (center_x - x_half * 0.38, upper),
        (center_x, upper + 0.16),
        (center_x + x_half * 0.38, upper),
        (center_x + x_half * 0.76, shoulder_high),
        (center_x + x_half * 0.96, waist_high),
        (center_x + x_half, waist_low),
        (center_x + x_half * 0.92, shoulder_low),
        (center_x + x_half * 0.58, lower),
        (center_x, lower - 0.14),
    ]


def gold_polygon(bounds):
    center_x = midpoint(bounds, "x")
    x_half = span(bounds, "x") * 0.5 + 0.08
    y_min, y_max = bounds["y"]
    y_span = y_max - y_min
    lower = y_min - 0.06
    upper = y_max + 0.04
    lower_step = y_min + y_span * 0.16
    mid_low = y_min + y_span * 0.34
    mid_high = y_min + y_span * 0.62
    upper_step = y_min + y_span * 0.84
    return [
        (center_x - x_half * 0.42, lower),
        (center_x - x_half * 0.68, lower_step),
        (center_x - x_half * 0.74, mid_low),
        (center_x - x_half * 0.70, mid_high),
        (center_x - x_half * 0.52, upper_step),
        (center_x - x_half * 0.22, upper),
        (center_x, upper + 0.06),
        (center_x + x_half * 0.22, upper),
        (center_x + x_half * 0.52, upper_step),
        (center_x + x_half * 0.70, mid_high),
        (center_x + x_half * 0.74, mid_low),
        (center_x + x_half * 0.68, lower_step),
        (center_x + x_half * 0.42, lower),
        (center_x, lower - 0.06),
    ]


def add_extruded_polygon_z(bm, polygon, z_min, z_max):
    front = [bm.verts.new((x_value, y_value, z_min)) for x_value, y_value in polygon]
    back = [bm.verts.new((x_value, y_value, z_max)) for x_value, y_value in polygon]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    count = len(polygon)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([front[index], front[next_index], back[next_index], back[index]])


def build_array(name, side, collection, components, polygon_factory, z_offsets, material_name):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in grouped_side_bounds(components, side):
        add_extruded_polygon_z(
            bm,
            polygon_factory(bounds),
            bounds["z"][0] + z_offsets[0],
            bounds["z"][1] + z_offsets[1],
        )

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj)
    return obj


def read_connected_component_bounds(obj):
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    adjacency = [set() for _ in obj.data.vertices]
    for polygon in obj.data.polygons:
        indices = polygon.vertices[:]
        for index, start in enumerate(indices):
            end = indices[(index + 1) % len(indices)]
            adjacency[start].add(end)
            adjacency[end].add(start)

    seen = set()
    components = []
    for start_index in range(len(obj.data.vertices)):
        if start_index in seen:
            continue
        stack = [start_index]
        seen.add(start_index)
        points = []
        while stack:
            vertex_index = stack.pop()
            points.append(verts[vertex_index])
            for neighbour in adjacency[vertex_index]:
                if neighbour not in seen:
                    seen.add(neighbour)
                    stack.append(neighbour)
        components.append(world_bounds_for_points(points))

    return sorted(components, key=lambda bounds: midpoint(bounds, "x"))


def verify_array(name, source_groups, min_z_extension=0.04):
    obj = bpy.data.objects[name]
    components = read_connected_component_bounds(obj)
    if len(components) != len(source_groups):
        raise RuntimeError(f"{name} expected {len(source_groups)} components, found {len(components)}")

    for index, (component, source) in enumerate(zip(components, source_groups)):
        center_dx = abs(midpoint(component, "x") - midpoint(source, "x"))
        center_dy = abs(midpoint(component, "y") - midpoint(source, "y"))
        z_extension = component["z"][1] - source["z"][1]
        print(
            f"{name} component {index}: "
            f"dX={center_dx:.4f} dY={center_dy:.4f} Z extension={z_extension:.4f}"
        )
        if center_dx > max(span(source, "x") * 0.12, 0.25):
            raise RuntimeError(f"{name} component {index} drifted on X")
        if center_dy > max(span(source, "y") * 0.12, 0.35):
            raise RuntimeError(f"{name} component {index} drifted on Y")
        if z_extension < min_z_extension:
            raise RuntimeError(f"{name} component {index} is not proud enough on Z")


def log_bounds(name):
    bounds = world_bounds_for_object(bpy.data.objects[name])
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.4f},{bounds['x'][1]:.4f}] "
        f"Y[{bounds['y'][0]:.4f},{bounds['y'][1]:.4f}] "
        f"Z[{bounds['z'][0]:.4f},{bounds['z'][1]:.4f}]"
    )


def main():
    ensure_object_mode()
    collection = resolve_collection()
    lamella_components = source_component_bounds(LEGACY_LAMELLA_NAMES, FALLBACK_LAMELLA_COMPONENTS)
    gold_components = source_component_bounds(LEGACY_GOLD_NAMES, FALLBACK_GOLD_COMPONENTS)

    delete_existing(REPLACEMENT_NAMES)
    build_array(
        "V113_CrownShellLamellaArray_L",
        "L",
        collection,
        lamella_components,
        lamella_polygon,
        (-0.10, 0.12),
        PEARL,
    )
    build_array(
        "V113_CrownShellLamellaArray_R",
        "R",
        collection,
        lamella_components,
        lamella_polygon,
        (-0.10, 0.12),
        PEARL,
    )
    build_array(
        "V113_CrownShellGoldSeamArray_L",
        "L",
        collection,
        gold_components,
        gold_polygon,
        (-0.02, 0.10),
        GOLD,
    )
    build_array(
        "V113_CrownShellGoldSeamArray_R",
        "R",
        collection,
        gold_components,
        gold_polygon,
        (-0.02, 0.10),
        GOLD,
    )

    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()
    for name in REPLACEMENT_NAMES:
        log_bounds(name)


if __name__ == "__main__":
    main()
