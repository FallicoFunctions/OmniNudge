from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V123 central-stair gold component replaces one V15_CentralStairGoldNosing row at the same stair center:
#     preserve >=0.03m X/Z overlap so the stair rhythm remains unchanged in review shots.
#   each V123 spawn-route gold component replaces one legacy V15_SpawnRouteGoldEdge row on the same left/right route edge:
#     preserve >=0.03m Y/Z overlap so the route edge still reads as continuous trim.
#   each V123 wet-center component replaces one legacy V15_SpawnRouteWetCenterInlay row on the same route centerline:
#     preserve >=0.03m X/Z overlap so the wet center band continues through the full spawn procession.
#   the three V123 families share the original nine route rows and seven stair rows:
#     the authored replacements must keep the legacy cadence instead of merging into one continuous slab.

STAIR_LEGACY = [f"V15_CentralStairGoldNosing_{index}" for index in range(7)]
ROUTE_GOLD_L_LEGACY = [f"V15_SpawnRouteGoldEdge_{index}_L" for index in range(9)]
ROUTE_GOLD_R_LEGACY = [f"V15_SpawnRouteGoldEdge_{index}_R" for index in range(9)]
ROUTE_WET_LEGACY = [f"V15_SpawnRouteWetCenterInlay_{index}" for index in range(9)]

LEGACY_NAMES = [*STAIR_LEGACY, *ROUTE_GOLD_L_LEGACY, *ROUTE_GOLD_R_LEGACY, *ROUTE_WET_LEGACY]
REPLACEMENT_NAMES = [
    "V123_CentralStairGoldNosingArray",
    "V123_SpawnRouteGoldEdgeArray_L",
    "V123_SpawnRouteGoldEdgeArray_R",
    "V123_SpawnRouteWetCenterInlayArray",
]

GOLD = "V15_EngineeredGoldAnchors"
WET = "V15_WetPlazaInlay"


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


def component_bounds_for_object(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH" or not obj.data.vertices:
        raise RuntimeError(f"Missing mesh object: {name}")

    world_vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
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
            verts.append(world_vertices[current])
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
    return components


def sort_bounds(bounds_list, axis):
    return sorted(bounds_list, key=lambda bounds: (bounds[axis][0] + bounds[axis][1]) * 0.5)


def capture_bounds_series(legacy_names, replacement_name, axis):
    if all(bpy.data.objects.get(name) is not None for name in legacy_names):
        return [proxy_bounds(name) for name in legacy_names]
    replacement = bpy.data.objects.get(replacement_name)
    if replacement is None:
        raise RuntimeError(f"Missing legacy series and replacement object for {replacement_name}")
    components = component_bounds_for_object(replacement_name)
    if len(components) != len(legacy_names):
        raise RuntimeError(
            f"Expected {len(legacy_names)} components in {replacement_name}, found {len(components)}"
        )
    return sort_bounds(components, axis)


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def rounded_rect_points(center_x, center_z, half_x, half_z, point_count=8, pinch=0.0, taper=1.0):
    points = []
    for index in range(point_count):
        angle = 2.0 * math.pi * index / point_count
        wave = 1.0 + pinch * math.cos(angle * 4.0)
        x = center_x + math.cos(angle) * half_x * wave
        z = center_z + math.sin(angle) * half_z * taper
        points.append((x, z))
    return points


def add_loft_stack_y(bm, loops):
    rings = []
    for y_value, points in loops:
        rings.append([bm.verts.new((x, y_value, z)) for x, z in points])

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


def assign_planar_uvs(mesh, uv_scale=0.08):
    existing = mesh.uv_layers.get("UVMap")
    if existing is not None:
        mesh.uv_layers.remove(existing)
    uv_layer = mesh.uv_layers.new(name="UVMap")

    for polygon in mesh.polygons:
        normal = polygon.normal
        axis_x = abs(normal.x)
        axis_y = abs(normal.y)
        axis_z = abs(normal.z)
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if axis_y >= axis_x and axis_y >= axis_z:
                uv = (vertex.x * uv_scale + 0.5, vertex.z * uv_scale + 0.5)
            elif axis_x >= axis_z:
                uv = (vertex.z * uv_scale + 0.5, vertex.y * uv_scale + 0.5)
            else:
                uv = (vertex.x * uv_scale + 0.5, vertex.y * uv_scale + 0.5)
            uv_layer.data[loop_index].uv = uv


def finalize(obj, bevel_width=0.012, bevel_segments=1):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    assign_planar_uvs(obj.data)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_mesh_object(name, material_name, collection, build_fn, *, bevel_width=0.012, bevel_segments=1):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    build_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def build_stair_gold_component(bm, bounds, variant):
    center_x = midpoint(bounds, "x")
    center_z = midpoint(bounds, "z")
    half_x = span(bounds, "x") * 0.5 + 0.14
    half_z = span(bounds, "z") * 0.5 + 0.1
    y0 = bounds["y"][0] - 0.035
    y1 = bounds["y"][0] + 0.025
    y2 = midpoint(bounds, "y") + 0.08
    y3 = bounds["y"][1] + 0.24
    flare = 1.0 + variant * 0.03
    outer = rounded_rect_points(center_x, center_z, half_x * 1.02, half_z * 1.12, point_count=8, pinch=0.05)
    shoulder = rounded_rect_points(center_x, center_z, half_x * 0.9, half_z * 0.82, point_count=8, pinch=0.1 * flare)
    crown = rounded_rect_points(center_x, center_z, half_x * 0.72, half_z * 0.54, point_count=8, pinch=0.02)
    add_loft_stack_y(bm, [(y0, outer), (y1, shoulder), (y2, crown), (y3, crown)])


def build_route_gold_component(bm, bounds, variant):
    center_x = midpoint(bounds, "x")
    center_z = midpoint(bounds, "z")
    half_x = span(bounds, "x") * 0.5 + 0.09
    half_z = span(bounds, "z") * 0.5 + 0.12
    y0 = bounds["y"][0] - 0.025
    y1 = bounds["y"][0] + 0.018
    y2 = midpoint(bounds, "y") + 0.028
    y3 = bounds["y"][1] + 0.09
    pinch = 0.08 + variant * 0.01
    outer = rounded_rect_points(center_x, center_z, half_x * 1.12, half_z * 1.02, point_count=8, pinch=pinch, taper=1.02)
    mid = rounded_rect_points(center_x, center_z, half_x * 0.9, half_z * 0.82, point_count=8, pinch=pinch * 0.9, taper=1.0)
    crown = rounded_rect_points(center_x, center_z, half_x * 0.54, half_z * 0.62, point_count=8, pinch=0.02)
    add_loft_stack_y(bm, [(y0, outer), (y1, mid), (y2, crown), (y3, crown)])


def build_wet_inlay_component(bm, bounds, variant):
    center_x = midpoint(bounds, "x")
    center_z = midpoint(bounds, "z")
    half_x = span(bounds, "x") * 0.5 + 0.16
    half_z = span(bounds, "z") * 0.5 + 0.12
    y0 = bounds["y"][0] - 0.02
    y1 = bounds["y"][0] + 0.01
    y2 = midpoint(bounds, "y") + 0.018
    y3 = bounds["y"][1] + 0.055
    taper = 1.0 + variant * 0.01
    outer = rounded_rect_points(center_x, center_z, half_x * 1.05, half_z * 1.04, point_count=8, pinch=0.04, taper=taper)
    inner = rounded_rect_points(center_x, center_z, half_x * 0.82, half_z * 0.8, point_count=8, pinch=0.08, taper=1.02)
    crown = rounded_rect_points(center_x, center_z, half_x * 0.48, half_z * 0.5, point_count=8, pinch=0.01)
    add_loft_stack_y(bm, [(y0, outer), (y1, inner), (y2, crown), (y3, crown)])


def build_array(bounds_list, component_builder, variant_step):
    def _build(bm):
        for index, bounds in enumerate(bounds_list):
            component_builder(bm, bounds, 1.0 + index * variant_step)

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

    stair_bounds = capture_bounds_series(STAIR_LEGACY, "V123_CentralStairGoldNosingArray", "z")
    route_gold_l_bounds = capture_bounds_series(ROUTE_GOLD_L_LEGACY, "V123_SpawnRouteGoldEdgeArray_L", "z")
    route_gold_r_bounds = capture_bounds_series(ROUTE_GOLD_R_LEGACY, "V123_SpawnRouteGoldEdgeArray_R", "z")
    route_wet_bounds = capture_bounds_series(ROUTE_WET_LEGACY, "V123_SpawnRouteWetCenterInlayArray", "z")

    delete_existing(REPLACEMENT_NAMES)
    delete_existing(LEGACY_NAMES)

    build_mesh_object(
        "V123_CentralStairGoldNosingArray",
        GOLD,
        collection,
        build_array(stair_bounds, build_stair_gold_component, 0.06),
        bevel_width=0.012,
        bevel_segments=1,
    )
    build_mesh_object(
        "V123_SpawnRouteGoldEdgeArray_L",
        GOLD,
        collection,
        build_array(route_gold_l_bounds, build_route_gold_component, 0.03),
        bevel_width=0.01,
        bevel_segments=1,
    )
    build_mesh_object(
        "V123_SpawnRouteGoldEdgeArray_R",
        GOLD,
        collection,
        build_array(route_gold_r_bounds, build_route_gold_component, 0.03),
        bevel_width=0.01,
        bevel_segments=1,
    )
    build_mesh_object(
        "V123_SpawnRouteWetCenterInlayArray",
        WET,
        collection,
        build_array(route_wet_bounds, build_wet_inlay_component, 0.025),
        bevel_width=0.008,
        bevel_segments=1,
    )

    for name in REPLACEMENT_NAMES:
        log_bounds(name)
    audit_transforms(REPLACEMENT_NAMES)

    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
