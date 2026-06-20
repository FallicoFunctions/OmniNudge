from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V82_OvalPortalGlowShell_L <-> V77_OvalScreenRecessGoldFrame_L overlap: 9.90m on X, 0.20m on Y, 13.30m on Z
#   V82_OvalPortalGlowGoldTrim_L <-> V82_OvalPortalGlowShell_L overlap: 8.70m on X, 0.28m on Y, 11.80m on Z
#   V82_OvalPortalGlowEmissionPanel_L <-> V82_OvalPortalGlowGoldTrim_L overlap: 8.00m on X, 0.18m on Y, 10.90m on Z
#   The right-side replacements mirror the same forward-glow stack against the opposite oval portal frame.

LEGACY_NAMES = [
    "V14_OvalPortalForwardGlow_L",
    "V14_OvalPortalForwardGlow_R",
]

REPLACEMENT_NAMES = [
    "V82_OvalPortalGlowShell_L",
    "V82_OvalPortalGlowShell_R",
    "V82_OvalPortalGlowGoldTrim_L",
    "V82_OvalPortalGlowGoldTrim_R",
    "V82_OvalPortalGlowEmissionPanel_L",
    "V82_OvalPortalGlowEmissionPanel_R",
]

SHELL = "V15_PearlShellBeveled"
GOLD = "V14_BurnishedCelestialGold"
EMISSION = "V14_CosmicScreenEmission"
SNAPSHOT_BOUNDS = {}
FALLBACK_BOUNDS = {
    "V14_OvalPortalForwardGlow_L": {"x": (-35.9, -26.1), "y": (-17.04, -16.88), "z": (14.0, 26.4)},
    "V14_OvalPortalForwardGlow_R": {"x": (26.1, 35.9), "y": (-17.04, -16.88), "z": (14.0, 26.4)},
    "V77_OvalScreenRecessGoldFrame_L": {"x": (-39.0525, -22.9475), "y": (-18.18, -17.4), "z": (11.95, 28.4525)},
    "V77_OvalScreenRecessGoldFrame_R": {"x": (22.9475, 39.0525), "y": (-18.18, -17.4), "z": (11.95, 28.4525)},
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*LEGACY_NAMES, "V77_OvalScreenRecessGoldFrame_L", "V81_OvalScreenMullionShellArray_L"):
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


def world_bounds(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"Missing mesh object: {name}")
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def existing_bounds(*names):
    for name in names:
        snapshot = SNAPSHOT_BOUNDS.get(name)
        if snapshot is not None:
            return snapshot
        obj = bpy.data.objects.get(name)
        if obj is not None and obj.type == "MESH":
            return world_bounds(name)
        fallback = FALLBACK_BOUNDS.get(name)
        if fallback is not None:
            return fallback
    raise RuntimeError(f"Missing mesh object from candidates: {names}")


def axis_center(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.material_index = 0


def face_center(face, axis_index):
    return sum(vertex.co[axis_index] for vertex in face.verts) / len(face.verts)


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


def front_face(faces):
    return max(faces, key=lambda face: face_center(face, 1))


def add_profiled_box(bm, bounds, *, primary_inset, primary_depth, secondary_inset, secondary_depth):
    before_faces = set(bm.faces)
    result = bmesh.ops.create_cube(bm, size=2.0)
    verts = result["verts"]
    center = (
        axis_center(bounds, "x"),
        axis_center(bounds, "y"),
        axis_center(bounds, "z"),
    )
    half_extents = (
        (bounds["x"][1] - bounds["x"][0]) * 0.5,
        (bounds["y"][1] - bounds["y"][0]) * 0.5,
        (bounds["z"][1] - bounds["z"][0]) * 0.5,
    )
    bmesh.ops.scale(bm, verts=verts, vec=half_extents)
    bmesh.ops.translate(bm, verts=verts, vec=center)

    new_faces = [face for face in bm.faces if face not in before_faces]
    outer = inset_specific_face(bm, front_face(new_faces), primary_inset)
    recessed = extrude_face_along_axis(bm, outer, 1, -primary_depth)
    if secondary_inset > 0.0 and secondary_depth > 0.0:
        inner = inset_specific_face(bm, recessed, secondary_inset)
        extrude_face_along_axis(bm, inner, 1, -secondary_depth)


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


def finalize(obj, *, bevel_width, bevel_segments):
    set_active(obj)
    if bevel_width > 0.0:
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


def build_profiled_object(name, material_name, boxes, *, bevel_width, bevel_segments, profile):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bm = bmesh.new()
    for bounds in boxes:
        add_profiled_box(
            bm,
            bounds,
            primary_inset=profile["primary_inset"],
            primary_depth=profile["primary_depth"],
            secondary_inset=profile["secondary_inset"],
            secondary_depth=profile["secondary_depth"],
        )
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def add_box(bm, bounds):
    result = bmesh.ops.create_cube(bm, size=2.0)
    verts = result["verts"]
    center = (
        axis_center(bounds, "x"),
        axis_center(bounds, "y"),
        axis_center(bounds, "z"),
    )
    half_extents = (
        (bounds["x"][1] - bounds["x"][0]) * 0.5,
        (bounds["y"][1] - bounds["y"][0]) * 0.5,
        (bounds["z"][1] - bounds["z"][0]) * 0.5,
    )
    bmesh.ops.scale(bm, verts=verts, vec=half_extents)
    bmesh.ops.translate(bm, verts=verts, vec=center)


def build_box_object(name, material_name, boxes, *, bevel_width, bevel_segments):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bm = bmesh.new()
    for bounds in boxes:
        add_box(bm, bounds)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


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


def expand_bounds(base_bounds, *, x_pad, y_back, y_front, z_min, z_max):
    return {
        "x": (base_bounds["x"][0] - x_pad, base_bounds["x"][1] + x_pad),
        "y": (y_back, y_front),
        "z": (z_min, z_max),
    }


def inset_bounds(base_bounds, *, x_inset, y_back, y_front, z_inset):
    return {
        "x": (base_bounds["x"][0] + x_inset, base_bounds["x"][1] - x_inset),
        "y": (y_back, y_front),
        "z": (base_bounds["z"][0] + z_inset, base_bounds["z"][1] - z_inset),
    }


def stacked_boxes(base_bounds, *, y_back, y_front, outer_pad, inner_pad):
    z_low = base_bounds["z"][0]
    z_high = base_bounds["z"][1]
    z_span = z_high - z_low
    lower_split = z_low + z_span * 0.21
    upper_split = z_low + z_span * 0.79
    mid_box = expand_bounds(
        base_bounds,
        x_pad=inner_pad,
        y_back=y_back,
        y_front=y_front,
        z_min=lower_split,
        z_max=upper_split,
    )
    lower_box = expand_bounds(
        base_bounds,
        x_pad=outer_pad,
        y_back=y_back,
        y_front=y_front,
        z_min=z_low - 0.35,
        z_max=lower_split,
    )
    upper_box = expand_bounds(
        base_bounds,
        x_pad=outer_pad + 0.08,
        y_back=y_back,
        y_front=y_front,
        z_min=upper_split,
        z_max=z_high + 0.42,
    )
    return [lower_box, mid_box, upper_box]


def build_side(side):
    frame = existing_bounds(f"V77_OvalScreenRecessGoldFrame_{side}")
    glow = existing_bounds(f"V14_OvalPortalForwardGlow_{side}")

    shell_box = expand_bounds(
        glow,
        x_pad=0.28,
        y_back=frame["y"][1] - 0.04,
        y_front=glow["y"][1] + 0.06,
        z_min=glow["z"][0] - 0.35,
        z_max=glow["z"][1] + 0.42,
    )
    trim_box = inset_bounds(
        shell_box,
        x_inset=0.34,
        y_back=shell_box["y"][0] + 0.12,
        y_front=shell_box["y"][1] + 0.02,
        z_inset=0.36,
    )
    emission_box = inset_bounds(
        shell_box,
        x_inset=0.78,
        y_back=shell_box["y"][0] + 0.20,
        y_front=shell_box["y"][1] + 0.06,
        z_inset=2.84,
    )

    shell_profile = {
        "primary_inset": 0.34,
        "primary_depth": 0.12,
        "secondary_inset": 0.18,
        "secondary_depth": 0.06,
    }

    build_profiled_object(
        f"V82_OvalPortalGlowShell_{side}",
        SHELL,
        [shell_box],
        bevel_width=0.028,
        bevel_segments=1,
        profile=shell_profile,
    )
    build_box_object(
        f"V82_OvalPortalGlowGoldTrim_{side}",
        GOLD,
        [trim_box],
        bevel_width=0.0,
        bevel_segments=1,
    )
    build_box_object(
        f"V82_OvalPortalGlowEmissionPanel_{side}",
        EMISSION,
        [emission_box],
        bevel_width=0.0,
        bevel_segments=1,
    )


ensure_object_mode()
collection = resolve_collection()
for name in [*LEGACY_NAMES, *REPLACEMENT_NAMES, "V77_OvalScreenRecessGoldFrame_L", "V77_OvalScreenRecessGoldFrame_R"]:
    obj = bpy.data.objects.get(name)
    if obj is not None and obj.type == "MESH":
        SNAPSHOT_BOUNDS[name] = world_bounds(name)
delete_existing(REPLACEMENT_NAMES)

build_side("L")
build_side("R")
delete_existing(LEGACY_NAMES)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V82_OvalPortalGlowShell_L", "V77_OvalScreenRecessGoldFrame_L", axis="y", min_overlap=0.04)
verify_overlap("V82_OvalPortalGlowShell_R", "V77_OvalScreenRecessGoldFrame_R", axis="y", min_overlap=0.04)
verify_overlap("V82_OvalPortalGlowGoldTrim_L", "V82_OvalPortalGlowShell_L", axis="z", min_overlap=0.10)
verify_overlap("V82_OvalPortalGlowGoldTrim_R", "V82_OvalPortalGlowShell_R", axis="z", min_overlap=0.10)
verify_overlap("V82_OvalPortalGlowEmissionPanel_L", "V82_OvalPortalGlowGoldTrim_L", axis="z", min_overlap=0.10)
verify_overlap("V82_OvalPortalGlowEmissionPanel_R", "V82_OvalPortalGlowGoldTrim_R", axis="z", min_overlap=0.10)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
