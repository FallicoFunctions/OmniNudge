from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V101_VipBalustradeLowerChordArray_L upper crown <-> V21_Merged_V20_VipBalustradeFiligree lower lace:
#     >=0.03m Z overlap so the replacement chords read seated into the existing VIP filigree.
#   V101_VipBalustradeLowerChordArray_R upper crown <-> V21_Merged_V20_VipBalustradeFiligree lower lace:
#     >=0.03m Z overlap so the replacement chords read seated into the existing VIP filigree.
#   Each stacked chord run <-> neighboring VIP run on Y:
#     preserve the three-level cadence at y ~= -7.80 / -5.80 / -3.80 with >=1.85m separation.

LEGACY_NAMES = [
    "V20_VipBalustradeLowerChord_L_0",
    "V20_VipBalustradeLowerChord_L_1",
    "V20_VipBalustradeLowerChord_L_2",
    "V20_VipBalustradeLowerChord_R_0",
    "V20_VipBalustradeLowerChord_R_1",
    "V20_VipBalustradeLowerChord_R_2",
]
REPLACEMENT_NAMES = [
    "V101_VipBalustradeLowerChordArray_L",
    "V101_VipBalustradeLowerChordArray_R",
]

VIP_FILIGREE = "V21_Merged_V20_VipBalustradeFiligree"
GOLD = "V20_ChasedGoldFiligree"

FALLBACK_LAYOUT = {
    "L": {
        "x": (-30.64, -22.96),
        "y_centers": [-7.8, -5.8, -3.8],
    },
    "R": {
        "x": (22.96, 30.64),
        "y_centers": [-7.8, -5.8, -3.8],
    },
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for name in [LEGACY_NAMES[0], REPLACEMENT_NAMES[0], VIP_FILIGREE]:
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


def chord_profile(center_y, phase):
    z_floor = 3.93 + 0.015 * phase
    z_shoulder = 4.00 + 0.025 * phase
    z_mid = 4.08 + 0.03 * phase
    z_cap = 4.17 + 0.018 * phase
    half_depth = 0.072 + 0.008 * phase
    inner = half_depth * 0.62

    return [
        (center_y - half_depth, z_floor + 0.03),
        (center_y - inner, z_floor),
        (center_y + inner, z_floor),
        (center_y + half_depth, z_floor + 0.03),
        (center_y + half_depth * 1.12, z_shoulder),
        (center_y + half_depth * 0.9, z_mid),
        (center_y + inner * 0.22, z_cap),
        (center_y - inner * 0.22, z_cap),
        (center_y - half_depth * 0.9, z_mid),
        (center_y - half_depth * 1.12, z_shoulder),
    ]


def chord_component_loops(x_bounds, center_y):
    loops = []
    stations = station_series(x_bounds[0], x_bounds[1], 4)
    for index, station_x in enumerate(stations):
        phase = math.sin((index / (len(stations) - 1)) * math.pi)
        loops.append((station_x, chord_profile(center_y, phase)))
    return loops


def capture_layout():
    if bpy.data.objects.get(LEGACY_NAMES[0]) is None:
        return FALLBACK_LAYOUT

    layout = {"L": {"x": None, "y_centers": []}, "R": {"x": None, "y_centers": []}}
    for name in LEGACY_NAMES:
        bounds = world_bounds(name)
        side = "L" if "_L_" in name else "R"
        x_bounds = (bounds["x"][0] - 0.04, bounds["x"][1] + 0.04)
        layout[side]["x"] = x_bounds
        layout[side]["y_centers"].append(midpoint(bounds, "y"))

    for side in ("L", "R"):
        layout[side]["y_centers"].sort()
    return layout


def main():
    ensure_object_mode()
    collection = resolve_collection()
    layout = capture_layout()
    filigree_bounds = world_bounds(VIP_FILIGREE)

    delete_existing(REPLACEMENT_NAMES)
    delete_existing(LEGACY_NAMES)

    replacements = []
    for side, node_name in (("L", REPLACEMENT_NAMES[0]), ("R", REPLACEMENT_NAMES[1])):
        side_layout = layout[side]
        component_loops = [
            chord_component_loops(side_layout["x"], center_y) for center_y in side_layout["y_centers"]
        ]
        replacements.append(
            build_loft_object(
                node_name,
                GOLD,
                collection,
                component_loops,
                bevel_width=0.012,
            )
        )

    left_bounds = log_bounds(REPLACEMENT_NAMES[0])
    right_bounds = log_bounds(REPLACEMENT_NAMES[1])

    verify_overlap(filigree_bounds, left_bounds, "z", 0.03, "VIP filigree <-> left lower chord array")
    verify_overlap(filigree_bounds, right_bounds, "z", 0.03, "VIP filigree <-> right lower chord array")
    verify_span(REPLACEMENT_NAMES[0], "x", 7.5)
    verify_span(REPLACEMENT_NAMES[1], "x", 7.5)
    verify_span(REPLACEMENT_NAMES[0], "y", 4.0)
    verify_span(REPLACEMENT_NAMES[1], "y", 4.0)
    audit_transforms(REPLACEMENT_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
