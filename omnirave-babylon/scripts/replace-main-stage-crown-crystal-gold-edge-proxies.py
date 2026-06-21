from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V112_CrownCrystalGoldEdgeArray lower shoulders <-> V25_CrownApexCrystal upper crown:
#     overlap >= 0.005m on Z so the gold array reads cradled around the crystal body.
#   V112_CrownCrystalGoldEdgeArray inner faces <-> adjacent edge components:
#     overlap >= 0.005m on X across the halo cadence while still preserving five discrete pieces.
#   The authored five-piece array preserves the existing crown-edge station spacing while replacing the flat strip proxies.

LEGACY_NAMES = [f"V20_CrownCrystalGoldEdge_{index}" for index in range(5)]
REPLACEMENT_NAME = "V112_CrownCrystalGoldEdgeArray"
GOLD = "V20_ChasedGoldFiligree"

ORIGINAL_COMPONENTS = [
    {"x": (-3.5269, -1.6731), "y": (-20.35, -20.29), "z": (39.3567, 43.0133)},
    {"x": (-1.9483, -0.4517), "y": (-20.55, -20.49), "z": (40.5651, 44.7099)},
    {"x": (-0.6490, 0.6490), "y": (-20.65, -20.59), "z": (41.1399, 45.8577)},
    {"x": (0.4517, 1.9483), "y": (-20.55, -20.49), "z": (40.5651, 44.7099)},
    {"x": (1.6731, 3.5269), "y": (-20.35, -20.29), "z": (39.3567, 43.0133)},
]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [*LEGACY_NAMES, REPLACEMENT_NAME]:
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


def world_bounds_for_object(obj):
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def source_component_bounds():
    components = []
    for name in LEGACY_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is not None and obj.type == "MESH" and obj.data.vertices:
            components.append(world_bounds_for_object(obj))
    if len(components) == 5:
        return sorted(components, key=lambda bounds: midpoint(bounds, "x"))
    return [dict(component) for component in ORIGINAL_COMPONENTS]


def add_extruded_profile_y(bm, y_min, y_max, profile):
    near_ring = [bm.verts.new((x_value, y_min, z_value)) for x_value, z_value in profile]
    far_ring = [bm.verts.new((x_value, y_max, z_value)) for x_value, z_value in profile]
    count = len(profile)

    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new(
            [
                near_ring[index],
                near_ring[next_index],
                far_ring[next_index],
                far_ring[index],
            ]
        )

    bm.faces.new(list(reversed(near_ring)))
    bm.faces.new(far_ring)


def edge_profile(bounds):
    x_min, x_max = bounds["x"]
    z_min, z_max = bounds["z"]
    center_x = midpoint(bounds, "x")
    width = x_max - x_min
    height = z_max - z_min

    skirt_z = z_min - 0.10
    waist_z = z_min + height * 0.38
    shoulder_z = z_min + height * 0.74
    tip_z = z_max + 0.18

    outer_x = x_min - 0.08
    inner_x = x_max + 0.08
    lower_left = x_min + width * 0.14
    lower_right = x_max - width * 0.14
    inset_left = center_x - width * 0.22
    inset_right = center_x + width * 0.22
    lower_shoulder_z = z_min + height * 0.56

    return [
        (outer_x, skirt_z),
        (x_min - 0.03, waist_z),
        (lower_left, lower_shoulder_z),
        (center_x - width * 0.10, shoulder_z + height * 0.08),
        (inset_left, shoulder_z),
        (center_x, tip_z),
        (inset_right, shoulder_z),
        (center_x + width * 0.10, shoulder_z + height * 0.08),
        (lower_right, lower_shoulder_z),
        (x_max + 0.03, waist_z),
        (inner_x, skirt_z),
        (center_x, z_min - 0.03),
    ]


def build_array(collection):
    mesh = bpy.data.meshes.new(REPLACEMENT_NAME)
    obj = bpy.data.objects.new(REPLACEMENT_NAME, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for bounds in source_component_bounds():
        y_min = bounds["y"][0] - 0.045
        y_max = bounds["y"][1] + 0.045
        add_extruded_profile_y(bm, y_min, y_max, edge_profile(bounds))

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
    delete_existing([REPLACEMENT_NAME])
    build_array(collection)
    delete_existing(LEGACY_NAMES)
    bpy.ops.wm.save_mainfile()
    log_bounds(REPLACEMENT_NAME)


if __name__ == "__main__":
    main()
