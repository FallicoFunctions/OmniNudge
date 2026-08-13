from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V102_VipBalustradeFiligreeArray_L lower lace <-> V101_VipBalustradeLowerChordArray_L upper chord:
#     >=4.00m Y overlap and >=0.18m Z overlap so the filigree reads interlocked with the new lower chord.
#   V102_VipBalustradeFiligreeArray_R lower lace <-> V101_VipBalustradeLowerChordArray_R upper chord:
#     >=4.00m Y overlap and >=0.18m Z overlap so the filigree reads interlocked with the new lower chord.
#   Each stacked filigree tier <-> neighboring tier on Y:
#     preserve the three-level cadence at y ~= -7.80 / -5.80 / -3.80 with >=1.80m separation.

LEGACY_NAMES = ["V21_Merged_V20_VipBalustradeFiligree"]
REPLACEMENT_NAMES = [
    "V102_VipBalustradeFiligreeArray_L",
    "V102_VipBalustradeFiligreeArray_R",
]
LOWER_CHORD_NAMES = {
    "L": "V101_VipBalustradeLowerChordArray_L",
    "R": "V101_VipBalustradeLowerChordArray_R",
}

GOLD = "V20_ChasedGoldFiligree"

FALLBACK_LAYOUT = {
    "L": {"x": (-30.66, -22.94), "y_centers": [-7.8, -5.8, -3.8]},
    "R": {"x": (22.94, 30.66), "y_centers": [-7.8, -5.8, -3.8]},
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [LEGACY_NAMES[0], LOWER_CHORD_NAMES["L"], REPLACEMENT_NAMES[0]]:
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


def finalize(obj, bevel_width=0.01, bevel_segments=1):
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


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


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
    finalize(obj, bevel_width=bevel_width, bevel_segments=1)
    return obj


def station_series(x_min, x_max, count):
    return [x_min + (x_max - x_min) * index / (count - 1) for index in range(count)]


def filigree_profile(center_y, center_z, phase, end_taper):
    forward = (0.54 + 0.12 * phase) * end_taper
    aft = (0.22 + 0.06 * phase) * end_taper
    crest = 0.15 + 0.03 * phase
    belly = 0.11 + 0.025 * phase
    lace = 0.075 + 0.012 * phase
    low_drop = 0.49 + 0.09 * phase

    return [
        (center_y - forward, center_z + belly * 0.12),
        (center_y - forward * 0.96, center_z + belly * 0.48),
        (center_y - forward * 0.82, center_z + crest * 0.88),
        (center_y - forward * 0.44, center_z + crest * 1.20),
        (center_y - forward * 0.08, center_z + crest * 1.36),
        (center_y + aft * 0.22, center_z + lace * 0.50),
        (center_y + aft, center_z - lace * 0.08),
        (center_y + aft * 0.82, center_z - belly * 0.72),
        (center_y + aft * 0.18, center_z - low_drop * 0.92),
        (center_y - forward * 0.14, center_z - low_drop),
        (center_y - forward * 0.58, center_z - low_drop * 0.66),
        (center_y - forward * 0.92, center_z - belly * 0.30),
    ]


def component_loops(x_bounds, y_center, side):
    x_min, x_max = x_bounds
    x_padding = 0.02
    stations = station_series(x_min - x_padding, x_max + x_padding, 7)
    loops = []
    side_sign = -1.0 if side == "L" else 1.0

    for index, station_x in enumerate(stations):
        t = index / (len(stations) - 1)
        arch = math.sin(t * math.pi)
        shoulder = math.cos(t * math.pi)
        center_y = y_center + 0.015 * shoulder
        center_z = 4.56 + 0.19 * arch - 0.045 * side_sign * shoulder
        phase = 0.45 + 0.55 * arch
        end_taper = 0.84 + 0.16 * arch
        loops.append((station_x, filigree_profile(center_y, center_z, phase, end_taper)))

    return loops


def capture_layout():
    layout = {}
    for side, node_name in LOWER_CHORD_NAMES.items():
        obj = bpy.data.objects.get(node_name)
        if obj is None:
            layout[side] = FALLBACK_LAYOUT[side]
            continue

        bounds = world_bounds(node_name)
        layout[side] = {
            "x": (bounds["x"][0] - 0.02, bounds["x"][1] + 0.02),
            "y_centers": FALLBACK_LAYOUT[side]["y_centers"],
        }

    return layout


def main():
    ensure_object_mode()
    collection = resolve_collection()
    layout = capture_layout()
    lower_chord_bounds = {side: world_bounds(name) for side, name in LOWER_CHORD_NAMES.items()}

    delete_existing(REPLACEMENT_NAMES)
    delete_existing(LEGACY_NAMES)

    replacements = []
    for side, node_name in (("L", REPLACEMENT_NAMES[0]), ("R", REPLACEMENT_NAMES[1])):
        side_layout = layout[side]
        component_sets = [component_loops(side_layout["x"], y_center, side) for y_center in side_layout["y_centers"]]
        replacements.append(build_loft_object(node_name, GOLD, collection, component_sets, bevel_width=0.012))

    left_bounds = log_bounds(REPLACEMENT_NAMES[0])
    right_bounds = log_bounds(REPLACEMENT_NAMES[1])

    verify_overlap(left_bounds, lower_chord_bounds["L"], "x", 7.4, "Left filigree <-> lower chord")
    verify_overlap(right_bounds, lower_chord_bounds["R"], "x", 7.4, "Right filigree <-> lower chord")
    verify_overlap(left_bounds, lower_chord_bounds["L"], "y", 4.0, "Left filigree <-> lower chord")
    verify_overlap(right_bounds, lower_chord_bounds["R"], "y", 4.0, "Right filigree <-> lower chord")
    verify_overlap(left_bounds, lower_chord_bounds["L"], "z", 0.18, "Left filigree <-> lower chord")
    verify_overlap(right_bounds, lower_chord_bounds["R"], "z", 0.18, "Right filigree <-> lower chord")
    verify_span(REPLACEMENT_NAMES[0], "x", 7.5)
    verify_span(REPLACEMENT_NAMES[1], "x", 7.5)
    verify_span(REPLACEMENT_NAMES[0], "y", 4.2)
    verify_span(REPLACEMENT_NAMES[1], "y", 4.2)
    verify_span(REPLACEMENT_NAMES[0], "z", 0.7)
    verify_span(REPLACEMENT_NAMES[1], "z", 0.7)
    audit_transforms(REPLACEMENT_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
