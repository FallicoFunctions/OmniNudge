from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V83_MainTrussTowerShellArray_L <-> V83_MainTrussTowerDiagonalArray_L overlap: 0.10m across the left truss tower lattice bays
#   V83_MainTrussTowerShellArray_R <-> V83_MainTrussTowerDiagonalArray_R overlap: 0.10m across the right truss tower lattice bays
#   V83_MainTrussTowerShellArray_L <-> V83_MainTrussTowerGoldCrossbarArray_L overlap: 0.12m along the left front-to-back tower spine
#   V83_MainTrussTowerShellArray_R <-> V83_MainTrussTowerGoldCrossbarArray_R overlap: 0.12m along the right front-to-back tower spine
#   The replacement cluster turns the remaining proxy posts and gold rods into dimensional side-stage truss cages.

LEGACY_TOWER_NAMES = [
    "V13_MainTrussTower_L",
    "V13_MainTrussTowerBack_L",
    "V13_MainTrussTower_R",
    "V13_MainTrussTowerBack_R",
]
LEGACY_CROSSBAR_LEVELS = ("7.0", "10.4", "13.8", "17.2", "20.6", "24.0", "27.4", "30.8")
LEGACY_CROSSBAR_NAMES = [
    *(f"V13_TrussCrossbar_L_{level}" for level in LEGACY_CROSSBAR_LEVELS),
    *(f"V13_TrussCrossbar_R_{level}" for level in LEGACY_CROSSBAR_LEVELS),
]
LEGACY_NAMES = [*LEGACY_TOWER_NAMES, *LEGACY_CROSSBAR_NAMES]

REPLACEMENT_NAMES = [
    "V83_MainTrussTowerShellArray_L",
    "V83_MainTrussTowerShellArray_R",
    "V83_MainTrussTowerDiagonalArray_L",
    "V83_MainTrussTowerDiagonalArray_R",
    "V83_MainTrussTowerGoldCrossbarArray_L",
    "V83_MainTrussTowerGoldCrossbarArray_R",
]

SHADOW = "V14_MatteBlackProductionRig"
GOLD = "V13_BrushedFestivalGold"

FALLBACK_BOUNDS = {
    "V13_MainTrussTower_L": {"x": (-21.38, -20.22), "y": (-22.08, -20.92), "z": (4.0, 33.6)},
    "V13_MainTrussTowerBack_L": {"x": (-22.58, -21.82), "y": (-22.58, -21.82), "z": (4.8, 32.8)},
    "V13_MainTrussTower_R": {"x": (20.22, 21.38), "y": (-22.08, -20.92), "z": (4.0, 33.6)},
    "V13_MainTrussTowerBack_R": {"x": (21.82, 22.58), "y": (-22.58, -21.82), "z": (4.8, 32.8)},
    "V13_TrussCrossbar_L_7.0": {"x": (-22.1592, -20.8408), "y": (-22.2322, -21.4678), "z": (6.9450, 7.0550)},
    "V13_TrussCrossbar_L_10.4": {"x": (-22.1592, -20.8408), "y": (-22.2322, -21.4678), "z": (10.3450, 10.4550)},
    "V13_TrussCrossbar_L_13.8": {"x": (-22.1592, -20.8408), "y": (-22.2322, -21.4678), "z": (13.7450, 13.8550)},
    "V13_TrussCrossbar_L_17.2": {"x": (-22.1592, -20.8408), "y": (-22.2322, -21.4678), "z": (17.1450, 17.2550)},
    "V13_TrussCrossbar_L_20.6": {"x": (-22.1592, -20.8408), "y": (-22.2322, -21.4678), "z": (20.5450, 20.6550)},
    "V13_TrussCrossbar_L_24.0": {"x": (-22.1592, -20.8408), "y": (-22.2322, -21.4678), "z": (23.9450, 24.0550)},
    "V13_TrussCrossbar_L_27.4": {"x": (-22.1592, -20.8408), "y": (-22.2322, -21.4678), "z": (27.3450, 27.4550)},
    "V13_TrussCrossbar_L_30.8": {"x": (-22.1592, -20.8408), "y": (-22.2322, -21.4678), "z": (30.7450, 30.8550)},
    "V13_TrussCrossbar_R_7.0": {"x": (20.8408, 22.1592), "y": (-22.2322, -21.4678), "z": (6.9450, 7.0550)},
    "V13_TrussCrossbar_R_10.4": {"x": (20.8408, 22.1592), "y": (-22.2322, -21.4678), "z": (10.3450, 10.4550)},
    "V13_TrussCrossbar_R_13.8": {"x": (20.8408, 22.1592), "y": (-22.2322, -21.4678), "z": (13.7450, 13.8550)},
    "V13_TrussCrossbar_R_17.2": {"x": (20.8408, 22.1592), "y": (-22.2322, -21.4678), "z": (17.1450, 17.2550)},
    "V13_TrussCrossbar_R_20.6": {"x": (20.8408, 22.1592), "y": (-22.2322, -21.4678), "z": (20.5450, 20.6550)},
    "V13_TrussCrossbar_R_24.0": {"x": (20.8408, 22.1592), "y": (-22.2322, -21.4678), "z": (23.9450, 24.0550)},
    "V13_TrussCrossbar_R_27.4": {"x": (20.8408, 22.1592), "y": (-22.2322, -21.4678), "z": (27.3450, 27.4550)},
    "V13_TrussCrossbar_R_30.8": {"x": (20.8408, 22.1592), "y": (-22.2322, -21.4678), "z": (30.7450, 30.8550)},
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*LEGACY_NAMES, "V29_MainLineArrayCabinet_L_00", "V82_OvalPortalGlowShell_L"):
        anchor = bpy.data.objects.get(anchor_name)
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


def existing_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        fallback = FALLBACK_BOUNDS.get(name)
        if fallback is None:
            raise RuntimeError(f"Missing object or fallback bounds for {name}")
        return fallback

    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def bounds_center(bounds):
    return (
        (bounds["x"][0] + bounds["x"][1]) * 0.5,
        (bounds["y"][0] + bounds["y"][1]) * 0.5,
        (bounds["z"][0] + bounds["z"][1]) * 0.5,
    )


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def add_beam(bm, start, end, *, half_width, half_depth, extension=0.0):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    dz = end[2] - start[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    if length < 1e-6:
        return

    fx = dx / length
    fy = dy / length
    fz = dz / length
    start = (start[0] - fx * extension, start[1] - fy * extension, start[2] - fz * extension)
    end = (end[0] + fx * extension, end[1] + fy * extension, end[2] + fz * extension)

    up = (0.0, 0.0, 1.0) if abs(fz) < 0.99 else (1.0, 0.0, 0.0)
    rx = fy * up[2] - fz * up[1]
    ry = fz * up[0] - fx * up[2]
    rz = fx * up[1] - fy * up[0]
    r_length = math.sqrt(rx * rx + ry * ry + rz * rz)
    rx /= r_length
    ry /= r_length
    rz /= r_length
    ux = ry * fz - rz * fy
    uy = rz * fx - rx * fz
    uz = rx * fy - ry * fx

    verts = []
    for base in (start, end):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(
                bm.verts.new(
                    (
                        base[0] + rx * half_width * sx + ux * half_depth * sy,
                        base[1] + ry * half_width * sx + uy * half_depth * sy,
                        base[2] + rz * half_width * sx + uz * half_depth * sy,
                    )
                )
            )

    for face in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (0, 3, 2, 1), (4, 5, 6, 7)):
        bm.faces.new([verts[index] for index in face])


def auto_uv_project(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, *, bevel_width, bevel_segments):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.7
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_beam_object(name, material_name, collection, beams, *, bevel_width, bevel_segments):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for beam in beams:
        add_beam(
            bm,
            beam["start"],
            beam["end"],
            half_width=beam["half_width"],
            half_depth=beam["half_depth"],
            extension=beam.get("extension", 0.0),
        )
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def lerp(point_a, point_b, factor):
    return (
        point_a[0] + (point_b[0] - point_a[0]) * factor,
        point_a[1] + (point_b[1] - point_a[1]) * factor,
        point_a[2] + (point_b[2] - point_a[2]) * factor,
    )


def footprint_from_bounds(front_bounds, back_bounds):
    front_center = bounds_center(front_bounds)
    back_center = bounds_center(back_bounds)
    dx = front_center[0] - back_center[0]
    dy = front_center[1] - back_center[1]
    length = math.sqrt(dx * dx + dy * dy)
    forward = (dx / length, dy / length)
    perp = (-forward[1], forward[0])

    face_width = max(
        front_bounds["x"][1] - front_bounds["x"][0],
        front_bounds["y"][1] - front_bounds["y"][0],
        back_bounds["x"][1] - back_bounds["x"][0],
        back_bounds["y"][1] - back_bounds["y"][0],
    ) * 0.56
    half_width = face_width * 0.5

    front_left = (front_center[0] + perp[0] * half_width, front_center[1] + perp[1] * half_width)
    front_right = (front_center[0] - perp[0] * half_width, front_center[1] - perp[1] * half_width)
    back_left = (back_center[0] + perp[0] * half_width, back_center[1] + perp[1] * half_width)
    back_right = (back_center[0] - perp[0] * half_width, back_center[1] - perp[1] * half_width)

    return {
        "front_center": front_center,
        "back_center": back_center,
        "front_left": front_left,
        "front_right": front_right,
        "back_left": back_left,
        "back_right": back_right,
        "forward": forward,
        "perp": perp,
    }


def beam_point(xy, z):
    return (xy[0], xy[1], z)


def side_beam_specs(side):
    front = existing_bounds(f"V13_MainTrussTower_{side}")
    back = existing_bounds(f"V13_MainTrussTowerBack_{side}")
    crossbars = [existing_bounds(f"V13_TrussCrossbar_{side}_{level}") for level in LEGACY_CROSSBAR_LEVELS]
    footprint = footprint_from_bounds(front, back)

    z_min = min(front["z"][0], back["z"][0]) - 0.04
    z_max = max(front["z"][1], back["z"][1]) + 0.04
    bay_centers = [bounds_center(bounds)[2] for bounds in crossbars]
    rung_levels = [z_min + 0.18, bay_centers[0], bay_centers[2], bay_centers[4], bay_centers[6], z_max - 0.18]
    bay_levels = [z_min + 0.05, *bay_centers, z_max - 0.05]

    shell_beams = []
    diagonals = []
    gold_beams = []

    chord_half = 0.115
    rung_half = 0.085
    diagonal_half = 0.07
    gold_half = 0.12

    for xy in (
        footprint["front_left"],
        footprint["front_right"],
        footprint["back_left"],
        footprint["back_right"],
    ):
        shell_beams.append(
            {
                "start": beam_point(xy, z_min),
                "end": beam_point(xy, z_max),
                "half_width": chord_half,
                "half_depth": chord_half,
                "extension": 0.03,
            }
        )

    for z in rung_levels:
        shell_beams.extend(
            [
                {
                    "start": beam_point(footprint["front_left"], z),
                    "end": beam_point(footprint["front_right"], z),
                    "half_width": rung_half,
                    "half_depth": rung_half,
                    "extension": 0.035,
                },
                {
                    "start": beam_point(footprint["back_left"], z),
                    "end": beam_point(footprint["back_right"], z),
                    "half_width": rung_half,
                    "half_depth": rung_half,
                    "extension": 0.035,
                },
            ]
        )

    for z in (rung_levels[0], rung_levels[-1]):
        shell_beams.extend(
            [
                {
                    "start": beam_point(footprint["front_left"], z),
                    "end": beam_point(footprint["back_left"], z),
                    "half_width": rung_half * 0.9,
                    "half_depth": rung_half * 0.82,
                    "extension": 0.03,
                },
                {
                    "start": beam_point(footprint["front_right"], z),
                    "end": beam_point(footprint["back_right"], z),
                    "half_width": rung_half * 0.9,
                    "half_depth": rung_half * 0.82,
                    "extension": 0.03,
                },
            ]
        )

    for lower_z, upper_z in zip(bay_levels[:-1], bay_levels[1:]):
        diagonals.extend(
            [
                {
                    "start": beam_point(footprint["front_left"], lower_z),
                    "end": beam_point(footprint["front_right"], upper_z),
                    "half_width": diagonal_half,
                    "half_depth": diagonal_half * 0.92,
                    "extension": 0.03,
                },
                {
                    "start": beam_point(footprint["front_right"], lower_z),
                    "end": beam_point(footprint["front_left"], upper_z),
                    "half_width": diagonal_half,
                    "half_depth": diagonal_half * 0.92,
                    "extension": 0.03,
                },
            ]
        )

    for index, z in enumerate(bay_centers):
        lower = lerp(beam_point(footprint["front_left"], z), beam_point(footprint["back_left"], z), 0.16)
        upper = lerp(beam_point(footprint["front_right"], z), beam_point(footprint["back_right"], z), 0.84)
        if index % 2 == 1:
            lower = lerp(beam_point(footprint["front_right"], z), beam_point(footprint["back_right"], z), 0.16)
            upper = lerp(beam_point(footprint["front_left"], z), beam_point(footprint["back_left"], z), 0.84)
        gold_beams.append(
            {
                "start": lower,
                "end": upper,
                "half_width": gold_half,
                "half_depth": gold_half * 0.46,
                "extension": 0.04,
            }
        )

    return shell_beams, diagonals, gold_beams


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_overlap(name_a, name_b, axis, min_overlap):
    bounds_a = world_bounds(name_a)
    bounds_b = world_bounds(name_b)
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{name_a} <-> {name_b} [{axis.upper()}] overlap={overlap:.3f}")
    if overlap < min_overlap:
        raise RuntimeError(f"Gap between {name_a} and {name_b} on axis {axis}: {overlap:.3f}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)

shell_left, diagonals_left, gold_left = side_beam_specs("L")
shell_right, diagonals_right, gold_right = side_beam_specs("R")

delete_existing(LEGACY_NAMES)

build_beam_object(
    "V83_MainTrussTowerShellArray_L",
    SHADOW,
    collection,
    shell_left,
    bevel_width=0.0,
    bevel_segments=1,
)
build_beam_object(
    "V83_MainTrussTowerShellArray_R",
    SHADOW,
    collection,
    shell_right,
    bevel_width=0.0,
    bevel_segments=1,
)
build_beam_object(
    "V83_MainTrussTowerDiagonalArray_L",
    SHADOW,
    collection,
    diagonals_left,
    bevel_width=0.0,
    bevel_segments=1,
)
build_beam_object(
    "V83_MainTrussTowerDiagonalArray_R",
    SHADOW,
    collection,
    diagonals_right,
    bevel_width=0.0,
    bevel_segments=1,
)
build_beam_object(
    "V83_MainTrussTowerGoldCrossbarArray_L",
    GOLD,
    collection,
    gold_left,
    bevel_width=0.0,
    bevel_segments=1,
)
build_beam_object(
    "V83_MainTrussTowerGoldCrossbarArray_R",
    GOLD,
    collection,
    gold_right,
    bevel_width=0.0,
    bevel_segments=1,
)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V83_MainTrussTowerShellArray_L", "V83_MainTrussTowerDiagonalArray_L", axis="z", min_overlap=0.10)
verify_overlap("V83_MainTrussTowerShellArray_R", "V83_MainTrussTowerDiagonalArray_R", axis="z", min_overlap=0.10)
verify_overlap("V83_MainTrussTowerShellArray_L", "V83_MainTrussTowerGoldCrossbarArray_L", axis="z", min_overlap=0.12)
verify_overlap("V83_MainTrussTowerShellArray_R", "V83_MainTrussTowerGoldCrossbarArray_R", axis="z", min_overlap=0.12)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
