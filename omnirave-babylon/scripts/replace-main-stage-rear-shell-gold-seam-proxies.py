from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V105_RearShellGoldSeamArray_L preserves the four stepped rear-shell gold seams on the left shell shoulder.
#   V105_RearShellGoldSeamArray_R mirrors the same stepped cadence on the right shell shoulder.
#   Both arrays stay pinned to the existing rear-shell facade span so the distant crown silhouette does not shift.

LEGACY_NAME = "V21_Merged_V20_RearShellGoldSeam"
REPLACEMENT_NAMES = [
    "V105_RearShellGoldSeamArray_L",
    "V105_RearShellGoldSeamArray_R",
]

ORIGINAL_COMPONENTS = [
    {"x": (-35.2077, -31.1923), "y": (-12.2150, -12.1450), "z": (10.6659, 11.6341)},
    {"x": (-30.0077, -25.9923), "y": (-12.2150, -12.1450), "z": (12.1659, 13.1341)},
    {"x": (-24.5077, -20.4923), "y": (-12.2150, -12.1450), "z": (13.7659, 14.7341)},
    {"x": (-19.0077, -14.9923), "y": (-12.2150, -12.1450), "z": (15.2659, 16.2341)},
    {"x": (14.9923, 19.0077), "y": (-12.2150, -12.1450), "z": (15.2659, 16.2341)},
    {"x": (20.4923, 24.5077), "y": (-12.2150, -12.1450), "z": (13.7659, 14.7341)},
    {"x": (25.9923, 30.0077), "y": (-12.2150, -12.1450), "z": (12.1659, 13.1341)},
    {"x": (31.1923, 35.2077), "y": (-12.2150, -12.1450), "z": (10.6659, 11.6341)},
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
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj):
    triangulate_mesh(obj)
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
    return [dict(bounds) for bounds in ORIGINAL_COMPONENTS]


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def component_groups(components, side):
    if side == "L":
        selected = [bounds for bounds in components if midpoint(bounds, "x") < 0.0]
    else:
        selected = [bounds for bounds in components if midpoint(bounds, "x") > 0.0]
    if len(selected) != 4:
        raise RuntimeError(f"Expected 4 {side} components, found {len(selected)}")
    return selected


def add_extruded_profile_x(bm, x_min, x_max, profile):
    lower_ring = [bm.verts.new((x_min, y, z)) for y, z in profile]
    upper_ring = [bm.verts.new((x_max, y, z)) for y, z in profile]
    count = len(profile)

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

    bm.faces.new(list(reversed(lower_ring)))
    bm.faces.new(upper_ring)


def seam_profile(bounds):
    center_y = midpoint(bounds, "y") - 0.012
    base_z = bounds["z"][0] - 0.015
    lower_shoulder_z = bounds["z"][0] + span(bounds, "z") * 0.2
    upper_shoulder_z = bounds["z"][1] - max(span(bounds, "z") * 0.14, 0.12)
    crown_z = bounds["z"][1] + 0.085
    front_z = bounds["z"][1] - 0.02
    back = center_y - 0.055
    front = center_y + 0.055
    rear_mid = center_y - 0.03
    front_mid = center_y + 0.03
    center = center_y

    return [
        (back, base_z),
        (back - 0.01, lower_shoulder_z),
        (rear_mid, upper_shoulder_z),
        (center - 0.012, crown_z - 0.018),
        (center, crown_z),
        (center + 0.012, crown_z - 0.018),
        (front_mid, upper_shoulder_z),
        (front + 0.01, front_z),
        (front, front_z - 0.022),
        (front, base_z),
        (center, base_z - 0.01),
    ]


def build_array(name, side, collection):
    components = component_groups(source_component_bounds(), side)
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in components:
        x_min = bounds["x"][0] - 0.08
        x_max = bounds["x"][1] + 0.08
        add_extruded_profile_x(bm, x_min, x_max, seam_profile(bounds))

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, GOLD)
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
    build_array("V105_RearShellGoldSeamArray_L", "L", collection)
    build_array("V105_RearShellGoldSeamArray_R", "R", collection)
    delete_existing([LEGACY_NAME])
    bpy.ops.wm.save_mainfile()
    log_bounds("V105_RearShellGoldSeamArray_L")
    log_bounds("V105_RearShellGoldSeamArray_R")


if __name__ == "__main__":
    main()
