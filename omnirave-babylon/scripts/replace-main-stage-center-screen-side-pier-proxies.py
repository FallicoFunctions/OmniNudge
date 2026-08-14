from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V78_CenterScreenSidePierGoldFrame_L <-> V78_CenterScreenSidePierCyanCore_L overlap: 1.10m on X, 1.85m on Y, 14.20m on Z
#   V78_CenterScreenSidePierGoldFrame_R <-> V78_CenterScreenSidePierCyanCore_R overlap: 1.10m on X, 1.85m on Y, 14.20m on Z
#   Each replacement pier expands the retired V10 screen-side proxy into a framed vertical housing with a nested emissive core.

LEGACY_NAMES = [
    "V10_CenterScreenSidePier_L",
    "V10_CenterScreenSidePier_R",
]

REPLACEMENT_NAMES = [
    "V78_CenterScreenSidePierGoldFrame_L",
    "V78_CenterScreenSidePierGoldFrame_R",
    "V78_CenterScreenSidePierCyanCore_L",
    "V78_CenterScreenSidePierCyanCore_R",
]

GOLD = "V14_BurnishedCelestialGold"
CYAN = "V13_CelestialScreenGlass"
FALLBACK_SNAPSHOTS = {
    "V10_CenterScreenSidePier_L": {
        "x": (-18.799999237060547, -17.200000762939453),
        "y": (-25.30000114440918, -22.899999618530273),
        "z": (13.5, 28.5),
    },
    "V10_CenterScreenSidePier_R": {
        "x": (17.200000762939453, 18.799999237060547),
        "y": (-25.30000114440918, -22.899999618530273),
        "z": (13.5, 28.5),
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
    for anchor_name in (*LEGACY_NAMES, "V22_CenterScreenShadowCoffer_Left", "V17_CenterScreenMullionRib_0"):
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


def proxy_snapshot(*names):
    primary_name = names[0]
    primary_obj = bpy.data.objects.get(primary_name)
    if primary_obj is None:
        fallback = FALLBACK_SNAPSHOTS.get(primary_name)
        if fallback is not None:
            return fallback
    obj = primary_obj or next((bpy.data.objects.get(name) for name in names[1:] if bpy.data.objects.get(name) is not None), None)
    if obj is None:
        joined_names = ", ".join(names)
        raise RuntimeError(f"Missing proxy object candidates: {joined_names}")

    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def face_center(face, axis_index):
    return sum(vertex.co[axis_index] for vertex in face.verts) / len(face.verts)


def extreme_face(bm, axis_index, mode):
    selector = max if mode == "max" else min
    return selector(bm.faces, key=lambda face: face_center(face, axis_index))


def inset_specific_face(bm, face, thickness):
    axis_index = max(range(3), key=lambda index: abs(face.normal[index]))
    target_coordinate = face_center(face, axis_index)
    result = bmesh.ops.inset_region(
        bm,
        faces=[face],
        thickness=thickness,
        depth=0.0,
        use_even_offset=True,
    )
    faces = list(result.get("faces", []))
    if not faces:
        faces = [candidate for candidate in bm.faces if abs(face_center(candidate, axis_index) - target_coordinate) < 1e-5]
    if not faces:
        raise RuntimeError("Inset did not produce replacement faces")
    return min(faces, key=lambda candidate: candidate.calc_area())


def extrude_face_along_axis(bm, face, axis_index, distance):
    result = bmesh.ops.extrude_face_region(bm, geom=[face])
    verts = [element for element in result["geom"] if isinstance(element, bmesh.types.BMVert)]
    vector = [0.0, 0.0, 0.0]
    vector[axis_index] = distance
    bmesh.ops.translate(bm, verts=verts, vec=tuple(vector))
    target_coordinate = face_center(face, axis_index) + distance
    candidates = [candidate for candidate in bm.faces if abs(face_center(candidate, axis_index) - target_coordinate) < 1e-5]
    if not candidates:
        raise RuntimeError("Extrude did not produce displaced face")
    return min(candidates, key=lambda candidate: candidate.calc_area())


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
    bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, bevel_width, bevel_segments):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_profiled_box(
    *,
    name,
    collection,
    material_name,
    x_min,
    x_max,
    y_min,
    y_max,
    z_min,
    z_max,
    front_inset,
    front_depth,
    back_inset,
    back_depth,
    side_inset,
    side_depth,
    top_inset,
    top_depth,
    bevel_width,
    bevel_segments,
    outer_side,
):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    center = (
        (x_min + x_max) * 0.5,
        (y_min + y_max) * 0.5,
        (z_min + z_max) * 0.5,
    )
    half_extents = (
        (x_max - x_min) * 0.5,
        (y_max - y_min) * 0.5,
        (z_max - z_min) * 0.5,
    )

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=half_extents)
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)

    front_face = extreme_face(bm, 1, "max")
    front_face = inset_specific_face(bm, front_face, front_inset)
    front_face = extrude_face_along_axis(bm, front_face, 1, -front_depth)

    back_face = extreme_face(bm, 1, "min")
    back_face = inset_specific_face(bm, back_face, back_inset)
    extrude_face_along_axis(bm, back_face, 1, back_depth)

    side_mode = "min" if outer_side == "L" else "max"
    side_direction = 0.12 if outer_side == "L" else -0.12
    side_face = extreme_face(bm, 0, side_mode)
    side_face = inset_specific_face(bm, side_face, side_inset)
    extrude_face_along_axis(bm, side_face, 0, side_direction)

    top_face = extreme_face(bm, 2, "max")
    top_face = inset_specific_face(bm, top_face, top_inset)
    extrude_face_along_axis(bm, top_face, 2, -top_depth)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


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


def verify_overlap(name_a, name_b, axis="x", min_overlap=0.005):
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


def build_pair(snapshot, side):
    x_min, x_max = snapshot["x"]
    y_min, y_max = snapshot["y"]
    z_min, z_max = snapshot["z"]

    gold = build_profiled_box(
        name=f"V78_CenterScreenSidePierGoldFrame_{side}",
        collection=collection,
        material_name=GOLD,
        x_min=x_min - 0.45,
        x_max=x_max + 0.20,
        y_min=y_min - 0.18,
        y_max=y_max + 0.24,
        z_min=z_min - 0.55,
        z_max=z_max + 0.55,
        front_inset=0.24,
        front_depth=0.18,
        back_inset=0.20,
        back_depth=0.14,
        side_inset=0.26,
        side_depth=0.12,
        top_inset=0.18,
        top_depth=0.20,
        bevel_width=0.032,
        bevel_segments=1,
        outer_side=side,
    )
    cyan = build_profiled_box(
        name=f"V78_CenterScreenSidePierCyanCore_{side}",
        collection=collection,
        material_name=CYAN,
        x_min=x_min + 0.18,
        x_max=x_max - 0.18,
        y_min=y_min + 0.30,
        y_max=y_max - 0.25,
        z_min=z_min + 0.35,
        z_max=z_max - 0.35,
        front_inset=0.14,
        front_depth=0.10,
        back_inset=0.12,
        back_depth=0.08,
        side_inset=0.16,
        side_depth=0.08,
        top_inset=0.12,
        top_depth=0.10,
        bevel_width=0.02,
        bevel_segments=1,
        outer_side=side,
    )
    return gold, cyan


ensure_object_mode()
collection = resolve_collection()

left_snapshot = proxy_snapshot("V10_CenterScreenSidePier_L", "V78_CenterScreenSidePierGoldFrame_L")
right_snapshot = proxy_snapshot("V10_CenterScreenSidePier_R", "V78_CenterScreenSidePierGoldFrame_R")

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

build_pair(left_snapshot, "L")
build_pair(right_snapshot, "R")

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V78_CenterScreenSidePierGoldFrame_L", "V78_CenterScreenSidePierCyanCore_L", axis="x", min_overlap=1.0)
verify_overlap("V78_CenterScreenSidePierGoldFrame_L", "V78_CenterScreenSidePierCyanCore_L", axis="y", min_overlap=1.7)
verify_overlap("V78_CenterScreenSidePierGoldFrame_L", "V78_CenterScreenSidePierCyanCore_L", axis="z", min_overlap=14.0)
verify_overlap("V78_CenterScreenSidePierGoldFrame_R", "V78_CenterScreenSidePierCyanCore_R", axis="x", min_overlap=1.0)
verify_overlap("V78_CenterScreenSidePierGoldFrame_R", "V78_CenterScreenSidePierCyanCore_R", axis="y", min_overlap=1.7)
verify_overlap("V78_CenterScreenSidePierGoldFrame_R", "V78_CenterScreenSidePierCyanCore_R", axis="z", min_overlap=14.0)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
