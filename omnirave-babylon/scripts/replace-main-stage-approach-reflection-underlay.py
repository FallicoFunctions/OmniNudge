from __future__ import annotations

import bmesh
import bpy


TARGET_NAME = "V34_ApproachReflectionUnderlay"
MATERIAL = "V19_DeepWetArrivalStone"
BASELINE_BOUNDS = {
    "x": (-12.8, 12.8),
    "y": (-16.7, 284.7),
    "z": (-0.08, 0.045),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def world_bounds(obj):
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def delete_existing(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        return
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data and data.users == 0:
        bpy.data.meshes.remove(data)


def add_loft_stack_y(bm, loops):
    rings = []
    for y, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, z in points])

    for near_ring, far_ring in zip(rings, rings[1:]):
        count = len(near_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    near_ring[index],
                    far_ring[index],
                    far_ring[next_index],
                    near_ring[next_index],
                ]
            )

    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))


def mirrored_profile(center_x, left_points):
    mirrored = [(center_x, left_points[-1][1])]
    mirrored.extend([(center_x + (center_x - x), z) for x, z in reversed(left_points[:-1])])
    return left_points + mirrored


def reflection_profile(center_x, z_floor, z_peak, width, flare=1.0, crown=0.0):
    rise = z_peak - z_floor
    half_width = width * 0.5
    left = [
        (center_x - half_width * 0.10, z_floor - 0.016),
        (center_x - half_width * 0.24, z_floor - 0.010),
        (center_x - half_width * 0.42, z_floor),
        (center_x - half_width * 0.60, z_floor + rise * 0.10),
        (center_x - half_width * 0.78 * flare, z_floor + rise * 0.24),
        (center_x - half_width * 0.92 * flare, z_floor + rise * 0.38),
        (center_x - half_width * 1.00 * flare, z_floor + rise * 0.52),
        (center_x - half_width * 0.96 * flare, z_floor + rise * 0.66),
        (center_x - half_width * 0.84, z_floor + rise * 0.80),
        (center_x - half_width * 0.66, z_floor + rise * 0.90),
        (center_x - half_width * 0.44, z_floor + rise * 0.98),
        (center_x - half_width * 0.18, z_peak + crown),
        (center_x, z_peak + crown * 1.1),
    ]
    return mirrored_profile(center_x, left)


def build_reflection_underlay(bounds, collection):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    width = bounds["x"][1] - bounds["x"][0]
    y_half = (bounds["y"][1] - bounds["y"][0]) * 0.5
    z_floor = bounds["z"][0] + 0.005
    z_peak = bounds["z"][1] - 0.01

    mesh = bpy.data.meshes.new(TARGET_NAME)
    obj = bpy.data.objects.new(TARGET_NAME, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    loops = [
        (center_y - y_half, reflection_profile(center_x, z_floor - 0.006, z_peak - 0.008, width * 0.93, flare=0.90, crown=0.002)),
        (center_y - y_half * 0.62, reflection_profile(center_x, z_floor - 0.002, z_peak - 0.002, width * 0.98, flare=0.95, crown=0.006)),
        (center_y - y_half * 0.20, reflection_profile(center_x, z_floor + 0.003, z_peak + 0.006, width * 1.02, flare=1.00, crown=0.010)),
        (center_y + y_half * 0.20, reflection_profile(center_x, z_floor + 0.004, z_peak + 0.008, width * 1.02, flare=1.00, crown=0.012)),
        (center_y + y_half * 0.62, reflection_profile(center_x, z_floor - 0.001, z_peak, width * 0.98, flare=0.95, crown=0.006)),
        (center_y + y_half, reflection_profile(center_x, z_floor - 0.005, z_peak - 0.007, width * 0.93, flare=0.90, crown=0.002)),
    ]
    add_loft_stack_y(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, MATERIAL)
    finalize(obj)
    return obj


def verify_span(obj, axis, minimum):
    bounds = world_bounds(obj)
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{TARGET_NAME} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{TARGET_NAME} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


ensure_object_mode()
existing = bpy.data.objects.get(TARGET_NAME)
if existing is None:
    raise RuntimeError(f"Missing target object: {TARGET_NAME}")
collection = existing.users_collection[0] if existing.users_collection else bpy.context.scene.collection
delete_existing(TARGET_NAME)
obj = build_reflection_underlay(BASELINE_BOUNDS, collection)
verify_span(obj, "x", 24.5)
verify_span(obj, "y", 300.0)
verify_span(obj, "z", 0.11)
bpy.ops.wm.save_mainfile()
print("V34_APPROACH_REFLECTION_UNDERLAY_REPLACEMENT_COMPLETE replacements=1")
