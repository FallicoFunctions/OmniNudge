from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   V80_OvalScreenPedestalShell_L <-> V77_OvalScreenRecessGoldFrame_L overlap: 13.80m on X, 0.10m on Y, 1.35m on Z
#   V80_OvalScreenCanopyShell_L <-> V77_OvalScreenRecessGoldFrame_L overlap: 14.50m on X, 0.10m on Y, 1.35m on Z
#   V80_OvalScreenSideButtressShellArray_L <-> V80_OvalScreenPedestalShell_L overlap: 10.10m on X, 0.72m on Y, 0.14m on Z
#   V80_OvalScreenSideButtressShellArray_L <-> V80_OvalScreenCanopyShell_L overlap: 11.50m on X, 0.72m on Y, 0.14m on Z
#   The right-side replacements mirror the same joints and overlaps around the opposite oval screen housing.

LEGACY_NAMES = [
    "V11_OvalLowerPedestal_L",
    "V11_OvalUpperCanopy_L",
    "V11_OvalSideButtress_L_0",
    "V11_OvalSideButtress_L_1",
    "V11_OvalLowerPedestal_R",
    "V11_OvalUpperCanopy_R",
    "V11_OvalSideButtress_R_0",
    "V11_OvalSideButtress_R_1",
]

REPLACEMENT_NAMES = [
    "V80_OvalScreenPedestalShell_L",
    "V80_OvalScreenPedestalShell_R",
    "V80_OvalScreenPedestalGoldTrim_L",
    "V80_OvalScreenPedestalGoldTrim_R",
    "V80_OvalScreenCanopyShell_L",
    "V80_OvalScreenCanopyShell_R",
    "V80_OvalScreenCanopyGoldTrim_L",
    "V80_OvalScreenCanopyGoldTrim_R",
    "V80_OvalScreenSideButtressShellArray_L",
    "V80_OvalScreenSideButtressShellArray_R",
    "V80_OvalScreenSideButtressGoldTrimArray_L",
    "V80_OvalScreenSideButtressGoldTrimArray_R",
]

SHELL = "V15_PearlShellBeveled"
GOLD = "V14_BurnishedCelestialGold"
SNAPSHOT_BOUNDS = {}
FALLBACK_BOUNDS = {
    "V11_OvalLowerPedestal_L": {"x": (-37.0, -25.0), "y": (-17.43, -16.87), "z": (11.98, 12.82)},
    "V11_OvalUpperCanopy_L": {"x": (-37.7, -24.3), "y": (-17.43, -16.87), "z": (27.76, 28.44)},
    "V11_OvalSideButtress_L_0": {"x": (-26.48, -25.92), "y": (-17.46, -16.94), "z": (13.9, 26.5)},
    "V11_OvalSideButtress_L_1": {"x": (-36.08, -35.52), "y": (-17.46, -16.94), "z": (13.9, 26.5)},
    "V11_OvalLowerPedestal_R": {"x": (25.0, 37.0), "y": (-17.43, -16.87), "z": (11.98, 12.82)},
    "V11_OvalUpperCanopy_R": {"x": (24.3, 37.7), "y": (-17.43, -16.87), "z": (27.76, 28.44)},
    "V11_OvalSideButtress_R_0": {"x": (25.92, 26.48), "y": (-17.46, -16.94), "z": (13.9, 26.5)},
    "V11_OvalSideButtress_R_1": {"x": (35.52, 36.08), "y": (-17.46, -16.94), "z": (13.9, 26.5)},
}


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    for anchor_name in (*LEGACY_NAMES, "V77_OvalScreenRecessGoldFrame_L", "V79_WideHeroScreenGoldFrame"):
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
    result = bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.scale(bm, verts=result["verts"], vec=half_extents)
    bmesh.ops.translate(bm, verts=result["verts"], vec=center)


def create_box_object(name, material_name, bounds):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bm = bmesh.new()
    add_box(bm, bounds)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    assign_material(obj, material_name)
    return obj


def apply_boolean_difference(obj, cutter_bounds, suffix):
    cutter = create_box_object(f"{obj.name}_{suffix}", SHELL, cutter_bounds)
    set_active(obj)
    modifier = obj.modifiers.new(f"OmniRaveDifference_{suffix}", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    cutter_data = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    if cutter_data and cutter_data.users == 0:
        bpy.data.meshes.remove(cutter_data)


def apply_boolean_union(obj, addition_bounds, suffix):
    addition = create_box_object(f"{obj.name}_{suffix}", SHELL, addition_bounds)
    set_active(obj)
    modifier = obj.modifiers.new(f"OmniRaveUnion_{suffix}", "BOOLEAN")
    modifier.operation = "UNION"
    modifier.solver = "EXACT"
    modifier.object = addition
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    addition_data = addition.data
    bpy.data.objects.remove(addition, do_unlink=True)
    if addition_data and addition_data.users == 0:
        bpy.data.meshes.remove(addition_data)


def build_sculpted_shell(name, bounds, motif):
    obj = create_box_object(name, SHELL, bounds)
    width = bounds["x"][1] - bounds["x"][0]
    depth = bounds["y"][1] - bounds["y"][0]
    height = bounds["z"][1] - bounds["z"][0]
    x_center = axis_center(bounds, "x")
    x_outer_inset = max(width * 0.085, 0.92)
    front_reveal_depth = min(depth * 0.52, 0.40)
    front_y_min = bounds["y"][1] - front_reveal_depth

    apply_boolean_difference(
        obj,
        {
            "x": (bounds["x"][0] + x_outer_inset, bounds["x"][1] - x_outer_inset),
            "y": (front_y_min, bounds["y"][1] + 0.03),
            "z": (bounds["z"][0] + height * 0.10, bounds["z"][1] - height * 0.10),
        },
        "front_panel",
    )
    apply_boolean_difference(
        obj,
        {
            "x": (x_center - 0.44, x_center + 0.44),
            "y": (bounds["y"][1] - front_reveal_depth * 0.86, bounds["y"][1] + 0.03),
            "z": (bounds["z"][0] + height * 0.20, bounds["z"][1] - height * 0.20),
        },
        "center_channel",
    )

    if motif == "pedestal":
        apply_boolean_difference(
            obj,
            {
                "x": (bounds["x"][0] + x_outer_inset * 0.65, bounds["x"][1] - x_outer_inset * 0.65),
                "y": (bounds["y"][1] - front_reveal_depth * 0.78, bounds["y"][1] + 0.03),
                "z": (bounds["z"][0] + 0.18, bounds["z"][0] + 0.40),
            },
            "plinth_shadow",
        )
    else:
        apply_boolean_difference(
            obj,
            {
                "x": (bounds["x"][0] + x_outer_inset * 0.72, bounds["x"][1] - x_outer_inset * 0.72),
                "y": (bounds["y"][1] - front_reveal_depth * 0.74, bounds["y"][1] + 0.03),
                "z": (bounds["z"][1] - 0.42, bounds["z"][1] - 0.20),
            },
            "cornice_shadow",
        )

    finalize(obj, bevel_width=0.016, bevel_segments=1)
    assign_material(obj, SHELL)
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


def shell_bounds(base_bounds, *, x_pad, y_back, y_front, z_min, z_max):
    return {
        "x": (base_bounds["x"][0] - x_pad, base_bounds["x"][1] + x_pad),
        "y": (y_back, y_front),
        "z": (z_min, z_max),
    }


def trim_bounds(base_bounds, *, x_inset, y_back, y_front, z_min, z_max):
    return {
        "x": (base_bounds["x"][0] + x_inset, base_bounds["x"][1] - x_inset),
        "y": (y_back, y_front),
        "z": (z_min, z_max),
    }


def build_side(side):
    pedestal = existing_bounds(f"V11_OvalLowerPedestal_{side}")
    canopy = existing_bounds(f"V11_OvalUpperCanopy_{side}")
    recess = world_bounds(f"V77_OvalScreenRecessGoldFrame_{side}")

    front_y = pedestal["y"][1] + 0.08
    shell_y_back = recess["y"][1] - 0.18
    trim_y_back = shell_y_back + 0.20

    pedestal_shell = shell_bounds(
        pedestal,
        x_pad=0.35,
        y_back=shell_y_back,
        y_front=front_y,
        z_min=pedestal["z"][0] - 0.10,
        z_max=pedestal["z"][1] + 0.62,
    )
    canopy_shell = shell_bounds(
        canopy,
        x_pad=0.35,
        y_back=shell_y_back,
        y_front=front_y,
        z_min=canopy["z"][0] - 0.62,
        z_max=canopy["z"][1] + 0.12,
    )
    pedestal_trim = trim_bounds(
        pedestal_shell,
        x_inset=0.60,
        y_back=trim_y_back,
        y_front=front_y + 0.02,
        z_min=pedestal_shell["z"][1] - 0.56,
        z_max=pedestal_shell["z"][1] - 0.08,
    )
    canopy_trim = trim_bounds(
        canopy_shell,
        x_inset=0.60,
        y_back=trim_y_back,
        y_front=front_y + 0.02,
        z_min=canopy_shell["z"][0] + 0.08,
        z_max=canopy_shell["z"][0] + 0.56,
    )

    buttress_sources = [
        existing_bounds(f"V11_OvalSideButtress_{side}_0"),
        existing_bounds(f"V11_OvalSideButtress_{side}_1"),
    ]

    buttress_shell_boxes = []
    buttress_trim_boxes = []
    for buttress in buttress_sources:
        shell_box = shell_bounds(
            buttress,
            x_pad=0.20,
            y_back=shell_y_back + 0.04,
            y_front=front_y,
            z_min=buttress["z"][0] - 0.52,
            z_max=buttress["z"][1] + 0.78,
        )
        buttress_shell_boxes.append(shell_box)
        buttress_trim_boxes.append(
            trim_bounds(
                shell_box,
                x_inset=0.10,
                y_back=trim_y_back + 0.02,
                y_front=front_y + 0.02,
                z_min=shell_box["z"][0] + 0.82,
                z_max=shell_box["z"][1] - 0.88,
            )
        )

    shell_profile = {
        "primary_inset": 0.34,
        "primary_depth": 0.10,
        "secondary_inset": 0.14,
        "secondary_depth": 0.04,
    }
    trim_profile = {
        "primary_inset": 0.14,
        "primary_depth": 0.05,
        "secondary_inset": 0.0,
        "secondary_depth": 0.0,
    }

    build_sculpted_shell(f"V80_OvalScreenPedestalShell_{side}", pedestal_shell, "pedestal")
    build_profiled_object(
        f"V80_OvalScreenPedestalGoldTrim_{side}",
        GOLD,
        [pedestal_trim],
        bevel_width=0.018,
        bevel_segments=2,
        profile=trim_profile,
    )
    build_sculpted_shell(f"V80_OvalScreenCanopyShell_{side}", canopy_shell, "canopy")
    build_profiled_object(
        f"V80_OvalScreenCanopyGoldTrim_{side}",
        GOLD,
        [canopy_trim],
        bevel_width=0.018,
        bevel_segments=2,
        profile=trim_profile,
    )
    build_profiled_object(
        f"V80_OvalScreenSideButtressShellArray_{side}",
        SHELL,
        buttress_shell_boxes,
        bevel_width=0.024,
        bevel_segments=1,
        profile=shell_profile,
    )
    build_profiled_object(
        f"V80_OvalScreenSideButtressGoldTrimArray_{side}",
        GOLD,
        buttress_trim_boxes,
        bevel_width=0.016,
        bevel_segments=1,
        profile=trim_profile,
    )


ensure_object_mode()
collection = resolve_collection()
for name in [*LEGACY_NAMES, *REPLACEMENT_NAMES]:
    obj = bpy.data.objects.get(name)
    if obj is not None and obj.type == "MESH":
        SNAPSHOT_BOUNDS[name] = world_bounds(name)
delete_existing(REPLACEMENT_NAMES)

build_side("L")
build_side("R")

delete_existing(LEGACY_NAMES)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V80_OvalScreenPedestalShell_L", "V77_OvalScreenRecessGoldFrame_L", axis="y", min_overlap=0.04)
verify_overlap("V80_OvalScreenCanopyShell_L", "V77_OvalScreenRecessGoldFrame_L", axis="y", min_overlap=0.04)
verify_overlap("V80_OvalScreenSideButtressShellArray_L", "V80_OvalScreenPedestalShell_L", axis="z", min_overlap=0.04)
verify_overlap("V80_OvalScreenSideButtressShellArray_L", "V80_OvalScreenCanopyShell_L", axis="z", min_overlap=0.04)
verify_overlap("V80_OvalScreenPedestalShell_R", "V77_OvalScreenRecessGoldFrame_R", axis="y", min_overlap=0.04)
verify_overlap("V80_OvalScreenCanopyShell_R", "V77_OvalScreenRecessGoldFrame_R", axis="y", min_overlap=0.04)
verify_overlap("V80_OvalScreenSideButtressShellArray_R", "V80_OvalScreenPedestalShell_R", axis="z", min_overlap=0.04)
verify_overlap("V80_OvalScreenSideButtressShellArray_R", "V80_OvalScreenCanopyShell_R", axis="z", min_overlap=0.04)
audit_transforms(REPLACEMENT_NAMES)
bpy.ops.wm.save_mainfile()
