from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V77_OvalScreenRecessGoldFrame_L <-> V77_OvalScreenRecessShadowPocket_L overlap: 0.28m on Y through the left oval-screen housing
#   V77_OvalScreenRecessGoldFrame_R <-> V77_OvalScreenRecessShadowPocket_R overlap: 0.28m on Y through the right oval-screen housing
#   Each replacement housing spans the full retired V11 dark-recess plane with real depth, a framed reveal, and a nested shadow pocket.

LEGACY_NAMES = [
    "V11_OvalScreenDarkRecess_L",
    "V11_OvalScreenDarkRecess_R",
]

REPLACEMENT_NAMES = [
    "V77_OvalScreenRecessGoldFrame_L",
    "V77_OvalScreenRecessGoldFrame_R",
    "V77_OvalScreenRecessShadowPocket_L",
    "V77_OvalScreenRecessShadowPocket_R",
]

GOLD = "V14_BurnishedCelestialGold"
SHADOW = "V14_MatteBlackProductionRig"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*LEGACY_NAMES, "V76_SideScreenAnchorGoldSpine_L", "V17_CenterScreenMullionRib_0"):
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


def proxy_snapshot(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"Missing proxy object: {name}")

    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
        "center": (
            sum(vertex.x for vertex in verts) / len(verts),
            sum(vertex.y for vertex in verts) / len(verts),
            sum(vertex.z for vertex in verts) / len(verts),
        ),
    }


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def front_face_for(bm):
    return max(bm.faces, key=lambda face: sum(vertex.co.y for vertex in face.verts) / len(face.verts))


def face_center_y(face):
    return sum(vertex.co.y for vertex in face.verts) / len(face.verts)


def inset_front_region(bm, thickness):
    front = front_face_for(bm)
    return inset_specific_face(bm, front, thickness)


def inset_specific_face(bm, face, thickness):
    target_y = face_center_y(face)
    result = bmesh.ops.inset_region(
        bm,
        faces=[face],
        thickness=thickness,
        depth=0.0,
        use_even_offset=True,
    )
    faces = list(result.get("faces", []))
    if not faces:
        faces = [candidate for candidate in bm.faces if abs(face_center_y(candidate) - target_y) < 1e-5]
    if not faces:
        raise RuntimeError("Inset did not produce replacement faces")
    return min(faces, key=lambda candidate: candidate.calc_area())


def extrude_face_inward(bm, face, depth):
    result = bmesh.ops.extrude_face_region(bm, geom=[face])
    verts = [elem for elem in result["geom"] if isinstance(elem, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=verts, vec=(0.0, -depth, 0.0))
    target_y = face_center_y(face) - depth
    candidates = [candidate for candidate in bm.faces if abs(face_center_y(candidate) - target_y) < 1e-5]
    if not candidates:
        raise RuntimeError("Extrude did not produce recessed face")
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
    bevel.profile = 0.7
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_recessed_box(
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
    outer_inset,
    outer_depth,
    inner_inset,
    inner_depth,
    bevel_width,
    bevel_segments,
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

    inset_face = inset_front_region(bm, outer_inset)
    recessed_face = extrude_face_inward(bm, inset_face, outer_depth)
    inset_face = inset_specific_face(bm, recessed_face, inner_inset)
    extrude_face_inward(bm, inset_face, inner_depth)

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


def verify_overlap(name_a, name_b, axis="y", min_overlap=0.005):
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
    y_plane = snapshot["y"][0]
    z_min, z_max = snapshot["z"]

    gold = build_recessed_box(
        name=f"V77_OvalScreenRecessGoldFrame_{side}",
        collection=collection,
        material_name=GOLD,
        x_min=x_min - 0.65,
        x_max=x_max + 0.65,
        y_min=y_plane - 0.56,
        y_max=y_plane + 0.22,
        z_min=z_min - 0.45,
        z_max=z_max + 0.45,
        outer_inset=0.64,
        outer_depth=0.20,
        inner_inset=0.34,
        inner_depth=0.18,
        bevel_width=0.028,
        bevel_segments=2,
    )
    shadow = build_recessed_box(
        name=f"V77_OvalScreenRecessShadowPocket_{side}",
        collection=collection,
        material_name=SHADOW,
        x_min=x_min - 0.08,
        x_max=x_max + 0.08,
        y_min=y_plane - 0.88,
        y_max=y_plane + 0.06,
        z_min=z_min - 0.10,
        z_max=z_max + 0.10,
        outer_inset=0.52,
        outer_depth=0.26,
        inner_inset=0.30,
        inner_depth=0.24,
        bevel_width=0.018,
        bevel_segments=2,
    )
    return gold, shadow


ensure_object_mode()
collection = resolve_collection()

left_snapshot = proxy_snapshot("V11_OvalScreenDarkRecess_L")
right_snapshot = proxy_snapshot("V11_OvalScreenDarkRecess_R")

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

build_pair(left_snapshot, "L")
build_pair(right_snapshot, "R")

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V77_OvalScreenRecessGoldFrame_L", "V77_OvalScreenRecessShadowPocket_L", axis="y", min_overlap=0.28)
verify_overlap("V77_OvalScreenRecessGoldFrame_R", "V77_OvalScreenRecessShadowPocket_R", axis="y", min_overlap=0.28)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
