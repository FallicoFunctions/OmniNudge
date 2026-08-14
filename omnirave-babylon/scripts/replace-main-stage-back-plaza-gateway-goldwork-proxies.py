from __future__ import annotations

import bmesh
import bpy


REPLACEMENT_NAMES = [
    "V34_BackPlazaGatewayGoldCrown_L",
    "V34_BackPlazaGatewayGoldCrown_R",
    "V34_BackPlazaBannerRail_L",
    "V34_BackPlazaBannerRail_R",
]

GOLD = "V19_ArrivalBrushedGold"
BASELINE_BOUNDS = {
    "V34_BackPlazaGatewayGoldCrown_L": {
        "x": (-19.45, -16.55),
        "y": (235.0, 266.0),
        "z": (9.08, 10.35),
    },
    "V34_BackPlazaGatewayGoldCrown_R": {
        "x": (16.55, 19.45),
        "y": (235.0, 266.0),
        "z": (9.08, 10.35),
    },
    "V34_BackPlazaBannerRail_L": {
        "x": (-14.96, -14.64),
        "y": (236.0, 266.0),
        "z": (5.90, 7.58),
    },
    "V34_BackPlazaBannerRail_R": {
        "x": (14.64, 14.96),
        "y": (236.0, 266.0),
        "z": (5.90, 7.58),
    },
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


def finalize(obj, bevel_width=0.018, bevel_segments=2):
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


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def capture_targets():
    captured = {}
    for name in REPLACEMENT_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"Missing target object: {name}")
        captured[name] = {
            "bounds": BASELINE_BOUNDS[name],
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


def build_mesh_object(name, material_name, collection, builders, bevel_width=0.018):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for builder in builders:
        builder(bm)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width)
    return obj


def mirrored_profile(center_x, left_points):
    mirrored = [(center_x, left_points[-1][1])]
    mirrored.extend([(center_x + (center_x - x), z) for x, z in reversed(left_points[:-1])])
    return left_points + mirrored


def crown_profile(center_x, z_floor, z_peak, width, flare=1.0, crest=0.12):
    rise = z_peak - z_floor
    half_width = width * 0.5
    left = [
        (center_x - half_width * 0.14, z_floor - 0.05),
        (center_x - half_width * 0.30, z_floor - 0.01),
        (center_x - half_width * 0.48, z_floor + rise * 0.04),
        (center_x - half_width * 0.66, z_floor + rise * 0.12),
        (center_x - half_width * 0.82, z_floor + rise * 0.24),
        (center_x - half_width * 0.94 * flare, z_floor + rise * 0.38),
        (center_x - half_width * 1.00 * flare, z_floor + rise * 0.54),
        (center_x - half_width * 0.96 * flare, z_floor + rise * 0.68),
        (center_x - half_width * 0.82, z_floor + rise * 0.80),
        (center_x - half_width * 0.64, z_floor + rise * 0.90),
        (center_x - half_width * 0.42, z_floor + rise * 0.98),
        (center_x - half_width * 0.18, z_peak + crest),
        (center_x, z_peak + crest * 1.3),
    ]
    return mirrored_profile(center_x, left)


def banner_profile(center_x, z_floor, z_peak, width, waist=1.0, crest=0.08):
    rise = z_peak - z_floor
    half_width = width * 0.5
    left = [
        (center_x - half_width * 0.26, z_floor - 0.04),
        (center_x - half_width * 0.58, z_floor + rise * 0.02),
        (center_x - half_width * 0.86 * waist, z_floor + rise * 0.14),
        (center_x - half_width * 1.02 * waist, z_floor + rise * 0.26),
        (center_x - half_width * 1.00 * waist, z_floor + rise * 0.40),
        (center_x - half_width * 0.82, z_floor + rise * 0.56),
        (center_x - half_width * 0.68, z_floor + rise * 0.72),
        (center_x - half_width * 0.86, z_floor + rise * 0.86),
        (center_x - half_width * 0.48, z_peak + crest),
        (center_x - half_width * 0.20, z_peak + crest * 1.15),
        (center_x, z_peak + crest * 1.25),
    ]
    return mirrored_profile(center_x, left)


def build_gateway_crown(bounds):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    width = bounds["x"][1] - bounds["x"][0]
    y_half = (bounds["y"][1] - bounds["y"][0]) * 0.5
    z_floor = bounds["z"][0] + 0.05
    z_peak = bounds["z"][1] - 0.06

    def _build(bm):
        loops = [
            (center_y - y_half, crown_profile(center_x, z_floor - 0.02, z_peak - 0.04, width * 0.94, flare=0.92, crest=0.07)),
            (center_y - y_half * 0.58, crown_profile(center_x, z_floor + 0.01, z_peak, width * 0.98, flare=0.97, crest=0.10)),
            (center_y - y_half * 0.18, crown_profile(center_x, z_floor + 0.05, z_peak + 0.04, width, flare=1.00, crest=0.13)),
            (center_y + y_half * 0.18, crown_profile(center_x, z_floor + 0.06, z_peak + 0.06, width * 0.995, flare=1.02, crest=0.15)),
            (center_y + y_half * 0.56, crown_profile(center_x, z_floor + 0.02, z_peak + 0.01, width * 0.98, flare=0.98, crest=0.11)),
            (center_y + y_half, crown_profile(center_x, z_floor - 0.01, z_peak - 0.03, width * 0.95, flare=0.93, crest=0.08)),
        ]
        add_loft_stack_y(bm, loops)

    return _build


def build_banner_rail(bounds):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    width = bounds["x"][1] - bounds["x"][0]
    y_half = (bounds["y"][1] - bounds["y"][0]) * 0.5
    z_floor = bounds["z"][0] + 0.03
    z_peak = bounds["z"][1] - 0.08

    def _build(bm):
        loops = [
            (center_y - y_half, banner_profile(center_x, z_floor - 0.03, z_peak - 0.03, width * 0.92, waist=0.88, crest=0.04)),
            (center_y - y_half * 0.62, banner_profile(center_x, z_floor, z_peak + 0.01, width * 0.98, waist=0.94, crest=0.06)),
            (center_y - y_half * 0.20, banner_profile(center_x, z_floor + 0.05, z_peak + 0.05, width * 1.04, waist=1.00, crest=0.08)),
            (center_y + y_half * 0.20, banner_profile(center_x, z_floor + 0.07, z_peak + 0.07, width * 1.04, waist=1.00, crest=0.09)),
            (center_y + y_half * 0.62, banner_profile(center_x, z_floor + 0.01, z_peak + 0.02, width * 0.98, waist=0.94, crest=0.06)),
            (center_y + y_half, banner_profile(center_x, z_floor - 0.02, z_peak - 0.02, width * 0.92, waist=0.88, crest=0.04)),
        ]
        add_loft_stack_y(bm, loops)

    return _build


def log_bounds(name):
    bounds = world_bounds(bpy.data.objects[name])
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_span(name, axis, minimum):
    bounds = world_bounds(bpy.data.objects[name])
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{name} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


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

for name in ("V34_BackPlazaGatewayGoldCrown_L", "V34_BackPlazaGatewayGoldCrown_R"):
    spec = captured[name]
    build_mesh_object(name, GOLD, spec["collection"], [build_gateway_crown(spec["bounds"])], bevel_width=0.02)

for name in ("V34_BackPlazaBannerRail_L", "V34_BackPlazaBannerRail_R"):
    spec = captured[name]
    build_mesh_object(name, GOLD, spec["collection"], [build_banner_rail(spec["bounds"])], bevel_width=0.016)

for name in REPLACEMENT_NAMES:
    new_bounds = log_bounds(name)
    old_bounds = captured[name]["bounds"]
    verify_span(name, "y", (old_bounds["y"][1] - old_bounds["y"][0]) - 0.5)
    verify_span(name, "z", (old_bounds["z"][1] - old_bounds["z"][0]) - 0.15)
    verify_overlap(new_bounds, old_bounds, "y", (old_bounds["y"][1] - old_bounds["y"][0]) - 0.5, f"{name} <-> prior")
    verify_overlap(new_bounds, old_bounds, "z", (old_bounds["z"][1] - old_bounds["z"][0]) - 0.2, f"{name} <-> prior")

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V34_BACK_PLAZA_GATEWAY_GOLDWORK_REPLACEMENT_COMPLETE replacements=4")
