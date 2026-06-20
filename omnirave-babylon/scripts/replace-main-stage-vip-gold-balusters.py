from __future__ import annotations

import bmesh
import bpy


REPLACEMENT_NAMES = [
    *(f"V30_VipGoldBaluster_L_{index:02d}" for index in range(12)),
    *(f"V30_VipGoldBaluster_R_{index:02d}" for index in range(12)),
]

GOLD = "V20_ChasedGoldFiligree"


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


def finalize(obj, bevel_width=0.01, bevel_segments=2):
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


def add_loft_stack_z(bm, loops):
    rings = []
    for z, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, y in points])

    for low_ring, high_ring in zip(rings, rings[1:]):
        count = len(low_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    low_ring[index],
                    low_ring[next_index],
                    high_ring[next_index],
                    high_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def baluster_profile(center_x, center_y, half_x, half_y, x_scale=1.0, y_scale=1.0):
    return [
        (center_x, center_y - half_y * 1.00 * y_scale),
        (center_x - half_x * 0.32 * x_scale, center_y - half_y * 0.94 * y_scale),
        (center_x - half_x * 0.62 * x_scale, center_y - half_y * 0.78 * y_scale),
        (center_x - half_x * 0.88 * x_scale, center_y - half_y * 0.48 * y_scale),
        (center_x - half_x * 1.00 * x_scale, center_y - half_y * 0.12 * y_scale),
        (center_x - half_x * 0.92 * x_scale, center_y + half_y * 0.18 * y_scale),
        (center_x - half_x * 0.72 * x_scale, center_y + half_y * 0.54 * y_scale),
        (center_x - half_x * 0.44 * x_scale, center_y + half_y * 0.84 * y_scale),
        (center_x - half_x * 0.14 * x_scale, center_y + half_y * 0.98 * y_scale),
        (center_x, center_y + half_y * 1.02 * y_scale),
        (center_x + half_x * 0.14 * x_scale, center_y + half_y * 0.98 * y_scale),
        (center_x + half_x * 0.44 * x_scale, center_y + half_y * 0.84 * y_scale),
        (center_x + half_x * 0.72 * x_scale, center_y + half_y * 0.54 * y_scale),
        (center_x + half_x * 0.92 * x_scale, center_y + half_y * 0.18 * y_scale),
        (center_x + half_x * 1.00 * x_scale, center_y - half_y * 0.12 * y_scale),
        (center_x + half_x * 0.88 * x_scale, center_y - half_y * 0.48 * y_scale),
        (center_x + half_x * 0.62 * x_scale, center_y - half_y * 0.78 * y_scale),
        (center_x + half_x * 0.32 * x_scale, center_y - half_y * 0.94 * y_scale),
        (center_x + half_x * 0.10 * x_scale, center_y - half_y * 0.99 * y_scale),
        (center_x - half_x * 0.10 * x_scale, center_y - half_y * 0.99 * y_scale),
    ]


def build_baluster(bounds, collection, name):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    z_min, z_max = bounds["z"]
    half_x = (bounds["x"][1] - bounds["x"][0]) * 0.5
    half_y = (bounds["y"][1] - bounds["y"][0]) * 0.5
    height = z_max - z_min

    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    loops = [
        (z_min - 0.01, baluster_profile(center_x, center_y, half_x * 0.86, half_y * 0.86, x_scale=0.82, y_scale=0.82)),
        (z_min + height * 0.06, baluster_profile(center_x, center_y, half_x * 1.02, half_y * 1.00, x_scale=1.00, y_scale=0.98)),
        (z_min + height * 0.16, baluster_profile(center_x, center_y, half_x * 0.76, half_y * 0.76, x_scale=0.74, y_scale=0.74)),
        (z_min + height * 0.30, baluster_profile(center_x, center_y, half_x * 0.58, half_y * 0.58, x_scale=0.52, y_scale=0.52)),
        (z_min + height * 0.46, baluster_profile(center_x, center_y, half_x * 0.90, half_y * 0.86, x_scale=0.88, y_scale=0.84)),
        (z_min + height * 0.62, baluster_profile(center_x, center_y, half_x * 0.54, half_y * 0.54, x_scale=0.50, y_scale=0.50)),
        (z_min + height * 0.76, baluster_profile(center_x, center_y, half_x * 0.74, half_y * 0.72, x_scale=0.70, y_scale=0.68)),
        (z_min + height * 0.88, baluster_profile(center_x, center_y, half_x * 1.04, half_y * 1.00, x_scale=1.02, y_scale=0.98)),
        (z_max - 0.02, baluster_profile(center_x, center_y, half_x * 0.70, half_y * 0.70, x_scale=0.64, y_scale=0.64)),
        (z_max + 0.015, baluster_profile(center_x, center_y, half_x * 0.22, half_y * 0.22, x_scale=0.16, y_scale=0.16)),
    ]
    add_loft_stack_z(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, GOLD)
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


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


ensure_object_mode()
captured = capture_targets()
delete_existing(REPLACEMENT_NAMES)

for name in REPLACEMENT_NAMES:
    spec = captured[name]
    obj = build_baluster(spec["bounds"], spec["collection"], name)
    new_bounds = world_bounds(obj)
    old_bounds = spec["bounds"]
    verify_span(obj, "z", (old_bounds["z"][1] - old_bounds["z"][0]) - 0.02)
    verify_overlap(new_bounds, old_bounds, "x", (old_bounds["x"][1] - old_bounds["x"][0]) - 0.02, f"{name} <-> prior")
    verify_overlap(new_bounds, old_bounds, "y", (old_bounds["y"][1] - old_bounds["y"][0]) - 0.02, f"{name} <-> prior")
    verify_overlap(new_bounds, old_bounds, "z", (old_bounds["z"][1] - old_bounds["z"][0]) - 0.06, f"{name} <-> prior")

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V30_VIP_GOLD_BALUSTER_REPLACEMENT_COMPLETE replacements=24")
