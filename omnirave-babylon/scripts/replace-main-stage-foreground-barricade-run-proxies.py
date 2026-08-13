from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V108_ForegroundBarricadeGoldRun outer shoulders <-> legacy V21_Merged_V18_ForegroundBarricadeRun envelope:
#     overlap >= 0.010m on X/Y so the authored gold sweep fully covers the prior ceremonial rail span.
#   V108_ForegroundBarricadePearlRun outer shoulders <-> legacy V21_Merged_V18_ForegroundBarricadeLowerRun envelope:
#     overlap >= 0.010m on X/Y so the authored pearl sweep preserves the full lower barricade read.
#   V108_ForegroundBarricadeGoldRun crown <-> V108_ForegroundBarricadePearlRun crown:
#     vertical reveal >= 0.250m so the gold cap continues to read as a separate upper accent, not a fused slab.

LEGACY_NAMES = [
    "V21_Merged_V18_ForegroundBarricadeRun",
    "V21_Merged_V18_ForegroundBarricadeLowerRun",
]
REPLACEMENT_NAMES = [
    "V108_ForegroundBarricadeGoldRun",
    "V108_ForegroundBarricadePearlRun",
]

FALLBACK_BOUNDS = {
    "V21_Merged_V18_ForegroundBarricadeRun": {
        "x": (-9.0450, 9.0450),
        "y": (0.0800, 41.9200),
        "z": (0.9250, 0.9950),
    },
    "V21_Merged_V18_ForegroundBarricadeLowerRun": {
        "x": (-9.0350, 9.0350),
        "y": (0.0800, 41.9200),
        "z": (0.5520, 0.6080),
    },
}

GOLD = "V18_BrushedGoldTrim"
PEARL = "V18_PearlFacadeInlay"


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
    bpy.ops.uv.smart_project(angle_limit=math.radians(68.0), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj):
    triangulate_mesh(obj)
    auto_uv_project(obj)
    set_active(obj)
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


def source_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is not None:
        return world_bounds_for_object(obj)
    return dict(FALLBACK_BOUNDS[name])


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def station_series(y_min, y_max, count):
    return [y_min + (y_max - y_min) * index / (count - 1) for index in range(count)]


def build_profile(bounds, t, *, lower=False):
    center_x = midpoint(bounds, "x")
    half_width = span(bounds, "x") * 0.5 + (0.10 if not lower else 0.06)
    z_min, z_max = bounds["z"]
    rise = z_max - z_min
    swell = math.sin(t * math.pi)
    edge_pull = abs(0.5 - t) * 2.0

    if lower:
        base_z = z_min - 0.020
        shoulder_z = z_min + rise * (0.38 + swell * 0.04)
        crown_z = z_max + 0.036 + swell * 0.010
        inner_z = z_min + rise * 0.24
        waist = half_width * (0.16 - swell * 0.02)
    else:
        base_z = z_min - 0.014
        shoulder_z = z_min + rise * (0.48 + swell * 0.05)
        crown_z = z_max + 0.052 + swell * 0.016
        inner_z = z_min + rise * 0.30
        waist = half_width * (0.20 - swell * 0.03)

    wing = half_width * (1.0 - edge_pull * 0.02)
    mid = half_width * 0.82
    upper = half_width * 0.58
    inner = half_width * 0.28

    return [
        (center_x - wing, base_z + 0.012),
        (center_x - mid, base_z - 0.008),
        (center_x - upper, shoulder_z - 0.010),
        (center_x - inner, inner_z),
        (center_x - waist, crown_z - 0.012),
        (center_x, crown_z),
        (center_x + waist, crown_z - 0.012),
        (center_x + inner, inner_z),
        (center_x + upper, shoulder_z - 0.010),
        (center_x + mid, base_z - 0.008),
        (center_x + wing, base_z + 0.012),
        (center_x + upper * 0.64, base_z + 0.028),
        (center_x, base_z + 0.040),
        (center_x - upper * 0.64, base_z + 0.028),
    ]


def add_ring_stack_y(bm, loops):
    rings = []
    for y_value, points in loops:
        rings.append([bm.verts.new((x_value, y_value, z_value)) for x_value, z_value in points])

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


def build_run(name, material_name, bounds, collection, *, lower=False):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    y_min = bounds["y"][0] - 0.020
    y_max = bounds["y"][1] + 0.020
    station_count = 8
    loops = [
        (y_value, build_profile(bounds, index / (station_count - 1), lower=lower))
        for index, y_value in enumerate(station_series(y_min, y_max, station_count))
    ]

    bm = bmesh.new()
    add_ring_stack_y(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj)
    return obj


def log_bounds(name):
    bounds = world_bounds_for_object(bpy.data.objects[name])
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.4f},{bounds['x'][1]:.4f}] "
        f"Y[{bounds['y'][0]:.4f},{bounds['y'][1]:.4f}] "
        f"Z[{bounds['z'][0]:.4f},{bounds['z'][1]:.4f}]"
    )
    return bounds


def verify_xy_coverage(name, legacy_bounds, min_overlap=0.010):
    bounds = world_bounds_for_object(bpy.data.objects[name])
    x_overlap = min(bounds["x"][1], legacy_bounds["x"][1]) - max(bounds["x"][0], legacy_bounds["x"][0])
    y_overlap = min(bounds["y"][1], legacy_bounds["y"][1]) - max(bounds["y"][0], legacy_bounds["y"][0])
    print(f"{name} coverage overlap: X={x_overlap:.4f} Y={y_overlap:.4f}")
    if x_overlap < span(legacy_bounds, "x") - min_overlap:
        raise RuntimeError(f"{name} lost X coverage: {x_overlap:.4f}")
    if y_overlap < span(legacy_bounds, "y") - min_overlap:
        raise RuntimeError(f"{name} lost Y coverage: {y_overlap:.4f}")


def verify_vertical_reveal(upper_name, lower_name, min_gap=0.240):
    upper = world_bounds_for_object(bpy.data.objects[upper_name])
    lower = world_bounds_for_object(bpy.data.objects[lower_name])
    gap = upper["z"][0] - lower["z"][1]
    print(f"{upper_name} above {lower_name}: gap={gap:.4f}")
    if gap < min_gap:
        raise RuntimeError(f"Insufficient vertical reveal between {upper_name} and {lower_name}: {gap:.4f}")


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
    gold_bounds = source_bounds("V21_Merged_V18_ForegroundBarricadeRun")
    pearl_bounds = source_bounds("V21_Merged_V18_ForegroundBarricadeLowerRun")

    delete_existing(REPLACEMENT_NAMES)
    build_run("V108_ForegroundBarricadeGoldRun", GOLD, gold_bounds, collection, lower=False)
    build_run("V108_ForegroundBarricadePearlRun", PEARL, pearl_bounds, collection, lower=True)
    delete_existing(LEGACY_NAMES)

    bpy.ops.wm.save_mainfile()

    verify_xy_coverage("V108_ForegroundBarricadeGoldRun", gold_bounds)
    verify_xy_coverage("V108_ForegroundBarricadePearlRun", pearl_bounds)
    verify_vertical_reveal("V108_ForegroundBarricadeGoldRun", "V108_ForegroundBarricadePearlRun")
    log_bounds("V108_ForegroundBarricadeGoldRun")
    log_bounds("V108_ForegroundBarricadePearlRun")
    audit_transforms(REPLACEMENT_NAMES)


if __name__ == "__main__":
    main()
