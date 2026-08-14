from __future__ import annotations

import bmesh
import bpy


REPLACEMENT_NAMES = [
    *(f"V30_VipUndersideRib_L_{index:02d}" for index in range(8)),
    *(f"V30_VipUndersideRib_R_{index:02d}" for index in range(8)),
]

SHADOW = "V20_RecessedWarmShadow"


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


def finalize(obj, bevel_width=0.014, bevel_segments=2):
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


def world_bounds(obj):
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def capture_targets():
    captured = {}
    for name in REPLACEMENT_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"Missing target object: {name}")
        captured[name] = {
            "bounds": world_bounds(obj),
            "collection": obj.users_collection[0] if obj.users_collection else bpy.context.scene.collection,
        }
    return captured


def delete_existing(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def add_loft_stack_x(bm, loops):
    rings = []
    for x, points in loops:
        rings.append([bm.verts.new((x, y, z)) for y, z in points])

    for near_ring, far_ring in zip(rings, rings[1:]):
        count = len(near_ring)
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

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def rib_profile(center_y, center_z, half_y, half_z, y_scale=1.0, z_scale=1.0):
    return [
        (center_y - half_y * 1.00 * y_scale, center_z - half_z * 0.06 * z_scale),
        (center_y - half_y * 0.92 * y_scale, center_z - half_z * 0.34 * z_scale),
        (center_y - half_y * 0.74 * y_scale, center_z - half_z * 0.64 * z_scale),
        (center_y - half_y * 0.46 * y_scale, center_z - half_z * 0.88 * z_scale),
        (center_y - half_y * 0.12 * y_scale, center_z - half_z * 1.02 * z_scale),
        (center_y + half_y * 0.18 * y_scale, center_z - half_z * 0.94 * z_scale),
        (center_y + half_y * 0.52 * y_scale, center_z - half_z * 0.74 * z_scale),
        (center_y + half_y * 0.82 * y_scale, center_z - half_z * 0.46 * z_scale),
        (center_y + half_y * 1.00 * y_scale, center_z - half_z * 0.08 * z_scale),
        (center_y + half_y * 0.92 * y_scale, center_z + half_z * 0.22 * z_scale),
        (center_y + half_y * 0.72 * y_scale, center_z + half_z * 0.54 * z_scale),
        (center_y + half_y * 0.44 * y_scale, center_z + half_z * 0.82 * z_scale),
        (center_y + half_y * 0.10 * y_scale, center_z + half_z * 1.00 * z_scale),
        (center_y - half_y * 0.20 * y_scale, center_z + half_z * 0.92 * z_scale),
        (center_y - half_y * 0.54 * y_scale, center_z + half_z * 0.72 * z_scale),
        (center_y - half_y * 0.84 * y_scale, center_z + half_z * 0.42 * z_scale),
        (center_y - half_y * 0.98 * y_scale, center_z + half_z * 0.08 * z_scale),
        (center_y - half_y * 0.92 * y_scale, center_z - half_z * 0.02 * z_scale),
        (center_y - half_y * 0.74 * y_scale, center_z - half_z * 0.04 * z_scale),
        (center_y - half_y * 0.46 * y_scale, center_z - half_z * 0.02 * z_scale),
    ]


def build_rib(bounds, collection, name):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    center_z = midpoint(bounds, "z")
    half_y = (bounds["y"][1] - bounds["y"][0]) * 0.5
    half_z = (bounds["z"][1] - bounds["z"][0]) * 0.5 * 1.18
    length = bounds["x"][1] - bounds["x"][0]

    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    loops = [
        (center_x - length * 0.50, rib_profile(center_y, center_z, half_y * 0.78, half_z * 0.78, y_scale=0.80, z_scale=0.80)),
        (center_x - length * 0.38, rib_profile(center_y, center_z, half_y * 0.98, half_z * 0.92, y_scale=1.00, z_scale=0.94)),
        (center_x - length * 0.26, rib_profile(center_y, center_z, half_y * 0.62, half_z * 0.60, y_scale=0.56, z_scale=0.58)),
        (center_x - length * 0.14, rib_profile(center_y, center_z, half_y * 0.84, half_z * 0.80, y_scale=0.86, z_scale=0.82)),
        (center_x - length * 0.02, rib_profile(center_y, center_z, half_y * 0.54, half_z * 0.52, y_scale=0.48, z_scale=0.50)),
        (center_x + length * 0.10, rib_profile(center_y, center_z, half_y * 0.76, half_z * 0.74, y_scale=0.72, z_scale=0.74)),
        (center_x + length * 0.22, rib_profile(center_y, center_z, half_y * 0.56, half_z * 0.54, y_scale=0.50, z_scale=0.52)),
        (center_x + length * 0.34, rib_profile(center_y, center_z, half_y * 0.88, half_z * 0.84, y_scale=0.90, z_scale=0.86)),
        (center_x + length * 0.46, rib_profile(center_y, center_z, half_y * 0.66, half_z * 0.64, y_scale=0.62, z_scale=0.64)),
        (center_x + length * 0.50, rib_profile(center_y, center_z, half_y * 0.80, half_z * 0.78, y_scale=0.82, z_scale=0.80)),
    ]
    add_loft_stack_x(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, SHADOW)
    finalize(obj)
    return obj


def verify_span(obj, axis, minimum):
    bounds = world_bounds(obj)
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{obj.name} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{obj.name} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


def verify_overlap(bounds_a, bounds_b, axis, minimum, label):
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{label} overlap[{axis.upper()}]={overlap:.3f}")
    if overlap < minimum:
        raise RuntimeError(f"{label} overlap on {axis} below minimum {minimum:.3f}: {overlap:.3f}")


ensure_object_mode()
captured = capture_targets()
delete_existing(REPLACEMENT_NAMES)

for name in REPLACEMENT_NAMES:
    spec = captured[name]
    obj = build_rib(spec["bounds"], spec["collection"], name)
    new_bounds = world_bounds(obj)
    old_bounds = spec["bounds"]
    verify_span(obj, "x", (old_bounds["x"][1] - old_bounds["x"][0]) - 0.05)
    verify_span(obj, "z", (old_bounds["z"][1] - old_bounds["z"][0]) - 0.02)
    verify_overlap(new_bounds, old_bounds, "x", (old_bounds["x"][1] - old_bounds["x"][0]) - 0.06, f"{name} <-> prior")
    verify_overlap(new_bounds, old_bounds, "y", (old_bounds["y"][1] - old_bounds["y"][0]) - 0.03, f"{name} <-> prior")
    verify_overlap(new_bounds, old_bounds, "z", (old_bounds["z"][1] - old_bounds["z"][0]) - 0.05, f"{name} <-> prior")

bpy.ops.wm.save_mainfile()
print("V30_VIP_UNDERSIDE_RIB_REPLACEMENT_COMPLETE replacements=16")
