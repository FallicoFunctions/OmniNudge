from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V79_WideHeroScreenShadowCoffer <-> V79_WideHeroScreenGoldFrame overlap: 32.40m on X, 0.96m on Y, 11.20m on Z
#   V79_WideHeroScreenGoldFrame <-> V79_WideHeroScreenIvoryHeader overlap: 32.20m on X, 0.92m on Y, 0.26m on Z
#   V79_WideHeroScreenGoldFrame <-> V79_WideHeroScreenIvoryFooter overlap: 32.20m on X, 0.92m on Y, 0.26m on Z
#   V79_WideHeroScreenGoldFrame <-> V79_WideHeroScreenGoldMullionArray overlap: 23.30m on X, 0.54m on Y, 9.55m on Z
#   V79_WideHeroScreenGoldFrame <-> V79_WideHeroScreenGoldCrossbarArray overlap: 30.10m on X, 0.54m on Y, 7.00m on Z
#   The replacement cluster turns the remaining wide-screen proxy rails into a deeper proscenium frame around the existing V31 center screen field.

LEGACY_NAMES = [
    "V10_WideHeroScreenShadow",
    "V10_WideHeroScreenGoldTop",
    "V10_WideHeroScreenGoldBottom",
    "V10_WideHeroScreenGoldLeft",
    "V10_WideHeroScreenGoldRight",
    "V10_WideHeroScreenIvoryTop",
    "V10_WideHeroScreenIvoryBottom",
    "V10_WideHeroScreenMullion_0",
    "V10_WideHeroScreenMullion_1",
    "V10_WideHeroScreenMullion_2",
    "V10_WideHeroScreenMullion_3",
    "V10_WideHeroScreenMullion_4",
    "V10_WideHeroScreenMullion_5",
    "V10_WideHeroScreenMullion_6",
    "V10_WideHeroScreenRow_0",
    "V10_WideHeroScreenRow_1",
    "V10_WideHeroScreenRow_2",
]

REPLACEMENT_NAMES = [
    "V79_WideHeroScreenShadowCoffer",
    "V79_WideHeroScreenGoldFrame",
    "V79_WideHeroScreenIvoryHeader",
    "V79_WideHeroScreenIvoryFooter",
    "V79_WideHeroScreenGoldMullionArray",
    "V79_WideHeroScreenGoldCrossbarArray",
]

SHADOW = "V14_MatteBlackProductionRig"
GOLD = "V14_BurnishedCelestialGold"
IVORY = "V14_PolishedMoonstoneShell"

FALLBACK_LEGACY_BOUNDS = {
    "x": (-17.899999618530273, 17.899999618530273),
    "y": (-24.06999969482422, -22.850000381469727),
    "z": (13.710000038146973, 27.440000534057617),
}
FALLBACK_SCREEN_BOUNDS = {
    "x": (-15.699999809265137, 15.699999809265137),
    "y": (-28.650001525878906, -18.049999237060547),
    "z": (20.440000534057617, 21.489330291748047),
}
FALLBACK_MULLION_BOUNDS = {
    "x": (-11.555000305175781, 11.555000305175781),
    "y": (-23.075000762939453, -22.96500015258789),
    "z": (15.880001068115234, 25.31999969482422),
}
FALLBACK_ROW_BOUNDS = {
    "x": (-15.0, 15.0),
    "y": (-23.03499984741211, -22.94499969482422),
    "z": (17.155000686645508, 24.045000076293945),
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (
        *LEGACY_NAMES,
        "V31_CenterGlassLens",
        "V22_CenterScreenShadowCoffer_Top",
        "V78_CenterScreenSidePierGoldFrame_L",
    ):
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


def bounds_from_objects(names, fallback_bounds):
    verts = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            continue
        verts.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
    if not verts:
        return fallback_bounds
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
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.material_index = 0


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


def add_box(bm, *, x_min, x_max, y_min, y_max, z_min, z_max):
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
    result = bmesh.ops.create_cube(bm, size=2.0)
    verts = result["verts"]
    bmesh.ops.scale(bm, verts=verts, vec=half_extents)
    bmesh.ops.translate(bm, verts=verts, vec=center)


def create_box_object(name, material_name, bounds):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bm = bmesh.new()
    add_box(
        bm,
        x_min=bounds["x"][0],
        x_max=bounds["x"][1],
        y_min=bounds["y"][0],
        y_max=bounds["y"][1],
        z_min=bounds["z"][0],
        z_max=bounds["z"][1],
    )
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    assign_material(obj, material_name)
    return obj


def create_multi_box_object(name, material_name, boxes):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bm = bmesh.new()
    for bounds in boxes:
        add_box(
            bm,
            x_min=bounds["x"][0],
            x_max=bounds["x"][1],
            y_min=bounds["y"][0],
            y_max=bounds["y"][1],
            z_min=bounds["z"][0],
            z_max=bounds["z"][1],
        )
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    assign_material(obj, material_name)
    return obj


def build_profiled_band(
    name,
    material_name,
    bounds,
    *,
    primary_inset,
    primary_depth,
    secondary_inset,
    secondary_depth,
):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    center = (
        (bounds["x"][0] + bounds["x"][1]) * 0.5,
        (bounds["y"][0] + bounds["y"][1]) * 0.5,
        (bounds["z"][0] + bounds["z"][1]) * 0.5,
    )
    half_extents = (
        (bounds["x"][1] - bounds["x"][0]) * 0.5,
        (bounds["y"][1] - bounds["y"][0]) * 0.5,
        (bounds["z"][1] - bounds["z"][0]) * 0.5,
    )

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=half_extents)
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)

    front_face = extreme_face(bm, 1, "max")
    front_face = inset_specific_face(bm, front_face, primary_inset)
    front_face = extrude_face_along_axis(bm, front_face, 1, -primary_depth)
    front_face = inset_specific_face(bm, front_face, secondary_inset)
    extrude_face_along_axis(bm, front_face, 1, -secondary_depth)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    assign_material(obj, material_name)
    return obj


def apply_boolean_difference(obj, cutter_bounds, suffix):
    cutter = create_box_object(f"{obj.name}_{suffix}", SHADOW, cutter_bounds)
    set_active(obj)
    modifier = obj.modifiers.new(f"OmniRaveBoolean_{suffix}", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    cutter_data = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    if cutter_data and cutter_data.users == 0:
        bpy.data.meshes.remove(cutter_data)


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


def auto_uv_cube_project(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, *, bevel_width, bevel_segments, material_name, uv_mode="smart"):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    if uv_mode == "cube":
        auto_uv_cube_project(obj)
    else:
        auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    assign_material(obj, material_name)
    obj.select_set(False)


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


ensure_object_mode()
collection = resolve_collection()

legacy_bounds = bounds_from_objects(LEGACY_NAMES, FALLBACK_LEGACY_BOUNDS)
screen_bounds = bounds_from_objects(["V31_CenterGlassLens"], FALLBACK_SCREEN_BOUNDS)
mullion_bounds = bounds_from_objects([name for name in LEGACY_NAMES if "Mullion" in name], FALLBACK_MULLION_BOUNDS)
row_bounds = bounds_from_objects([name for name in LEGACY_NAMES if "Row_" in name], FALLBACK_ROW_BOUNDS)

delete_existing(REPLACEMENT_NAMES)
delete_existing(LEGACY_NAMES)

shadow_bounds = {
    "x": (legacy_bounds["x"][0] - 0.25, legacy_bounds["x"][1] + 0.25),
    "y": (legacy_bounds["y"][0] - 0.22, legacy_bounds["y"][1] + 0.18),
    "z": (legacy_bounds["z"][0] + 0.55, legacy_bounds["z"][1] - 0.55),
}
shadow = create_box_object("V79_WideHeroScreenShadowCoffer", SHADOW, shadow_bounds)
apply_boolean_difference(
    shadow,
    {
        "x": (screen_bounds["x"][0] - 0.45, screen_bounds["x"][1] + 0.45),
        "y": (shadow_bounds["y"][0] - 0.30, shadow_bounds["y"][1] + 0.30),
        "z": (legacy_bounds["z"][0] + 1.35, legacy_bounds["z"][1] - 1.35),
    },
    "center_cut",
)
apply_boolean_difference(
    shadow,
    {
        "x": (screen_bounds["x"][0] - 0.10, screen_bounds["x"][1] + 0.10),
        "y": (shadow_bounds["y"][1] - 0.72, shadow_bounds["y"][1] + 0.08),
        "z": (legacy_bounds["z"][0] + 1.95, legacy_bounds["z"][1] - 1.95),
    },
    "front_reveal",
)
finalize(shadow, bevel_width=0.04, bevel_segments=2, material_name=SHADOW)

frame_bounds = {
    "x": (screen_bounds["x"][0] - 0.85, screen_bounds["x"][1] + 0.85),
    "y": (legacy_bounds["y"][0] + 0.32, legacy_bounds["y"][1] + 0.22),
    "z": (legacy_bounds["z"][0] + 1.15, legacy_bounds["z"][1] - 1.25),
}
frame = create_box_object("V79_WideHeroScreenGoldFrame", GOLD, frame_bounds)
apply_boolean_difference(
    frame,
    {
        "x": (screen_bounds["x"][0] - 0.05, screen_bounds["x"][1] + 0.05),
        "y": (frame_bounds["y"][0] - 0.25, frame_bounds["y"][1] + 0.25),
        "z": (legacy_bounds["z"][0] + 1.95, legacy_bounds["z"][1] - 1.95),
    },
    "center_cut",
)
apply_boolean_difference(
    frame,
    {
        "x": (screen_bounds["x"][0] + 0.65, screen_bounds["x"][1] - 0.65),
        "y": (frame_bounds["y"][1] - 0.56, frame_bounds["y"][1] + 0.06),
        "z": (legacy_bounds["z"][0] + 2.55, legacy_bounds["z"][1] - 2.55),
    },
    "front_channel",
)
finalize(frame, bevel_width=0.03, bevel_segments=2, material_name=GOLD)

header_bounds = {
    "x": (legacy_bounds["x"][0] + 0.05, legacy_bounds["x"][1] - 0.05),
    "y": (legacy_bounds["y"][0] - 0.20, legacy_bounds["y"][1] + 0.10),
    "z": (legacy_bounds["z"][1] - 1.50, legacy_bounds["z"][1] + 0.10),
}
header = build_profiled_band(
    "V79_WideHeroScreenIvoryHeader",
    IVORY,
    header_bounds,
    primary_inset=0.40,
    primary_depth=0.20,
    secondary_inset=0.36,
    secondary_depth=0.14,
)
finalize(header, bevel_width=0.035, bevel_segments=1, material_name=IVORY, uv_mode="cube")

footer_bounds = {
    "x": (legacy_bounds["x"][0] + 0.05, legacy_bounds["x"][1] - 0.05),
    "y": (legacy_bounds["y"][0] - 0.20, legacy_bounds["y"][1] + 0.10),
    "z": (legacy_bounds["z"][0] - 0.10, legacy_bounds["z"][0] + 1.46),
}
footer = build_profiled_band(
    "V79_WideHeroScreenIvoryFooter",
    IVORY,
    footer_bounds,
    primary_inset=0.42,
    primary_depth=0.18,
    secondary_inset=0.38,
    secondary_depth=0.12,
)
finalize(footer, bevel_width=0.035, bevel_segments=1, material_name=IVORY, uv_mode="cube")

mullion_centers = [-11.5, -7.6, -3.8, 0.0, 3.8, 7.6, 11.5]
mullion_boxes = []
for center_x in mullion_centers:
    mullion_boxes.append(
        {
            "x": (center_x - 0.18, center_x + 0.18),
            "y": (mullion_bounds["y"][0] - 0.26, mullion_bounds["y"][1] + 0.18),
            "z": (mullion_bounds["z"][0] - 0.10, mullion_bounds["z"][1] + 0.10),
        }
    )
mullions = create_multi_box_object("V79_WideHeroScreenGoldMullionArray", GOLD, mullion_boxes)
finalize(mullions, bevel_width=0.024, bevel_segments=1, material_name=GOLD)

crossbar_centers = [17.2, 20.6, 24.0]
crossbar_boxes = []
for center_z in crossbar_centers:
    crossbar_boxes.append(
        {
            "x": (row_bounds["x"][0] - 0.35, row_bounds["x"][1] + 0.35),
            "y": (row_bounds["y"][0] - 0.26, row_bounds["y"][1] + 0.18),
            "z": (center_z - 0.12, center_z + 0.12),
        }
    )
crossbars = create_multi_box_object("V79_WideHeroScreenGoldCrossbarArray", GOLD, crossbar_boxes)
finalize(crossbars, bevel_width=0.024, bevel_segments=1, material_name=GOLD)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V79_WideHeroScreenShadowCoffer", "V79_WideHeroScreenGoldFrame", axis="x", min_overlap=30.0)
verify_overlap("V79_WideHeroScreenShadowCoffer", "V79_WideHeroScreenGoldFrame", axis="y", min_overlap=0.8)
verify_overlap("V79_WideHeroScreenShadowCoffer", "V79_WideHeroScreenGoldFrame", axis="z", min_overlap=10.5)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenIvoryHeader", axis="x", min_overlap=30.0)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenIvoryHeader", axis="y", min_overlap=0.8)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenIvoryHeader", axis="z", min_overlap=0.2)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenIvoryFooter", axis="x", min_overlap=30.0)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenIvoryFooter", axis="y", min_overlap=0.8)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenIvoryFooter", axis="z", min_overlap=0.2)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenGoldMullionArray", axis="x", min_overlap=22.0)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenGoldMullionArray", axis="y", min_overlap=0.5)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenGoldMullionArray", axis="z", min_overlap=8.5)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenGoldCrossbarArray", axis="x", min_overlap=28.0)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenGoldCrossbarArray", axis="y", min_overlap=0.5)
verify_overlap("V79_WideHeroScreenGoldFrame", "V79_WideHeroScreenGoldCrossbarArray", axis="z", min_overlap=6.5)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
