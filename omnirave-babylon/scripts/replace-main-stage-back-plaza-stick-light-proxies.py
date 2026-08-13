from __future__ import annotations

import bmesh
import bpy


LEGACY_NAMES = [
    "V7_PlazaLightMast_L_0",
    "V7_PlazaLightMast_L_1",
    "V7_PlazaLightMast_L_2",
    "V7_PlazaLightMast_R_0",
    "V7_PlazaLightMast_R_1",
    "V7_PlazaLightMast_R_2",
    "V7_PlazaLightHead_L_0",
    "V7_PlazaLightHead_L_1",
    "V7_PlazaLightHead_L_2",
    "V7_PlazaLightHead_R_0",
    "V7_PlazaLightHead_R_1",
    "V7_PlazaLightHead_R_2",
]

REPLACEMENT_NAMES = [
    "V59_BackPlazaLanternStemCluster_L",
    "V59_BackPlazaLanternStemCluster_R",
    "V59_BackPlazaLanternGoldCage_L",
    "V59_BackPlazaLanternGoldCage_R",
    "V59_BackPlazaLanternWarmCore_L",
    "V59_BackPlazaLanternWarmCore_R",
    "V59_BackPlazaLanternHaloRim_L",
    "V59_BackPlazaLanternHaloRim_R",
]

STEM = "V16_MatteBlackStageHardware"
GOLD = "V19_ArrivalBrushedGold"
CORE = "V13_WarmPracticalLight"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V7_PlazaLightMast_L_1")
    if anchor is None or not anchor.users_collection:
        return bpy.context.scene.collection
    return anchor.users_collection[0]


def delete_existing(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)


def hide_legacy(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        obj.hide_render = True
        obj.hide_viewport = True


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_basis @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def add_prism_component(bm, points, y_min, y_max):
    base = [bm.verts.new((x, y_min, z)) for x, z in points]
    top = [bm.verts.new((x, y_max, z)) for x, z in points]
    bm.faces.new(base)
    bm.faces.new(list(reversed(top)))
    count = len(points)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([base[index], base[next_index], top[next_index], top[index]])


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def ensure_uvs(obj):
    set_active(obj)
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def triangulate_mesh(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()


def finalize(obj, bevel_width=0.03, bevel_segments=2, needs_uvs=False, needs_tangents=False):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if needs_uvs:
        ensure_uvs(obj)
    if needs_tangents:
        triangulate_mesh(obj)
    obj.select_set(False)


def build_profile_object(
    name,
    material_name,
    collection,
    components,
    bevel_width=0.03,
    bevel_segments=2,
    needs_uvs=False,
    needs_tangents=False,
):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_prism_component(
            bm,
            component["points"],
            component["y_min"],
            component["y_max"],
        )

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(
        obj,
        bevel_width=bevel_width,
        bevel_segments=bevel_segments,
        needs_uvs=needs_uvs,
        needs_tangents=needs_tangents,
    )
    return obj


def offset_profile(center_x, profile):
    return [(center_x + x, z) for x, z in profile]


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_overlap(name_a, name_b, axis="z", min_overlap=0.01):
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


def mast_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.16, z_floor - 0.04),
        (-width * 0.48, z_floor),
        (-width * 0.82, z_floor + rise * 0.08),
        (-width, z_floor + rise * 0.24),
        (-width * 0.90, z_floor + rise * 0.52),
        (-width * 0.66, z_floor + rise * 0.78),
        (-width * 0.28, z_peak - 0.02),
        (0.0, z_peak + 0.06),
        (width * 0.28, z_peak - 0.02),
        (width * 0.66, z_floor + rise * 0.78),
        (width * 0.90, z_floor + rise * 0.52),
        (width, z_floor + rise * 0.24),
        (width * 0.82, z_floor + rise * 0.08),
        (width * 0.48, z_floor),
        (width * 0.16, z_floor - 0.04),
        (0.0, z_floor - 0.08),
    ]


def cage_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.14, z_floor - 0.03),
        (-width * 0.40, z_floor + rise * 0.02),
        (-width * 0.78, z_floor + rise * 0.18),
        (-width, z_floor + rise * 0.44),
        (-width * 0.88, z_floor + rise * 0.76),
        (-width * 0.42, z_peak - 0.02),
        (0.0, z_peak + 0.08),
        (width * 0.42, z_peak - 0.02),
        (width * 0.88, z_floor + rise * 0.76),
        (width, z_floor + rise * 0.44),
        (width * 0.78, z_floor + rise * 0.18),
        (width * 0.40, z_floor + rise * 0.02),
        (width * 0.14, z_floor - 0.03),
        (0.0, z_floor - 0.06),
    ]


def core_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.12, z_floor - 0.02),
        (-width * 0.34, z_floor + rise * 0.04),
        (-width * 0.68, z_floor + rise * 0.24),
        (-width, z_floor + rise * 0.50),
        (-width * 0.62, z_peak - 0.02),
        (-width * 0.16, z_peak + 0.04),
        (0.0, z_peak + 0.08),
        (width * 0.16, z_peak + 0.04),
        (width * 0.62, z_peak - 0.02),
        (width, z_floor + rise * 0.50),
        (width * 0.68, z_floor + rise * 0.24),
        (width * 0.34, z_floor + rise * 0.04),
        (width * 0.12, z_floor - 0.02),
        (0.0, z_floor - 0.04),
    ]


def halo_profile(width, z_floor, z_peak):
    rise = z_peak - z_floor
    return [
        (-width * 0.10, z_floor - 0.02),
        (-width * 0.32, z_floor + rise * 0.02),
        (-width * 0.78, z_floor + rise * 0.26),
        (-width, z_floor + rise * 0.56),
        (-width * 0.54, z_peak - 0.02),
        (0.0, z_peak + 0.06),
        (width * 0.54, z_peak - 0.02),
        (width, z_floor + rise * 0.56),
        (width * 0.78, z_floor + rise * 0.26),
        (width * 0.32, z_floor + rise * 0.02),
        (width * 0.10, z_floor - 0.02),
        (0.0, z_floor - 0.04),
    ]


def build_side(side, collection):
    suffix = side
    mast_names = [f"V7_PlazaLightMast_{suffix}_{index}" for index in range(3)]
    head_names = [f"V7_PlazaLightHead_{suffix}_{index}" for index in range(3)]
    mast_bounds = [world_bounds(name) for name in mast_names]
    head_bounds = [world_bounds(name) for name in head_names]
    center_sign = -1 if suffix == "L" else 1
    inward_direction = -center_sign

    stem_components = []
    gold_components = []
    core_components = []
    halo_components = []

    for index, bounds in enumerate(mast_bounds):
        center_x = (bounds["x"][0] + bounds["x"][1]) * 0.5
        y_min = bounds["y"][0] + 0.05
        y_max = bounds["y"][1] - 0.05
        head = head_bounds[index]
        head_center_x = (head["x"][0] + head["x"][1]) * 0.5 + inward_direction * 0.18

        stem_components.append(
            {
                "points": offset_profile(center_x, mast_profile(0.34, 0.06, 10.64)),
                "y_min": y_min,
                "y_max": y_max,
            }
        )
        gold_components.append(
            {
                "points": offset_profile(head_center_x, cage_profile(1.02, 8.52, 11.04)),
                "y_min": y_min + 0.14,
                "y_max": y_max - 0.14,
            }
        )
        core_components.append(
            {
                "points": offset_profile(head_center_x, core_profile(0.54, 8.92, 10.52)),
                "y_min": y_min + 0.18,
                "y_max": y_max - 0.18,
            }
        )
        halo_components.append(
            {
                "points": offset_profile(head_center_x + inward_direction * 0.04, halo_profile(0.78, 9.22, 11.18)),
                "y_min": y_min + 0.08,
                "y_max": y_max - 0.08,
            }
        )

    build_profile_object(
        f"V59_BackPlazaLanternStemCluster_{suffix}",
        STEM,
        collection,
        stem_components,
        bevel_width=0.03,
        bevel_segments=2,
        needs_uvs=True,
        needs_tangents=True,
    )
    build_profile_object(
        f"V59_BackPlazaLanternGoldCage_{suffix}",
        GOLD,
        collection,
        gold_components,
        bevel_width=0.035,
        bevel_segments=2,
    )
    build_profile_object(
        f"V59_BackPlazaLanternWarmCore_{suffix}",
        CORE,
        collection,
        core_components,
        bevel_width=0.025,
        bevel_segments=2,
    )
    build_profile_object(
        f"V59_BackPlazaLanternHaloRim_{suffix}",
        GOLD,
        collection,
        halo_components,
        bevel_width=0.025,
        bevel_segments=2,
    )


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

build_side("L", collection)
build_side("R", collection)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V59_BackPlazaLanternStemCluster_L", "V59_BackPlazaLanternGoldCage_L", axis="z", min_overlap=1.8)
verify_overlap("V59_BackPlazaLanternStemCluster_R", "V59_BackPlazaLanternGoldCage_R", axis="z", min_overlap=1.8)
verify_overlap("V59_BackPlazaLanternGoldCage_L", "V59_BackPlazaLanternWarmCore_L", axis="z", min_overlap=1.2)
verify_overlap("V59_BackPlazaLanternGoldCage_R", "V59_BackPlazaLanternWarmCore_R", axis="z", min_overlap=1.2)
verify_overlap("V59_BackPlazaLanternGoldCage_L", "V59_BackPlazaLanternHaloRim_L", axis="z", min_overlap=1.4)
verify_overlap("V59_BackPlazaLanternGoldCage_R", "V59_BackPlazaLanternHaloRim_R", axis="z", min_overlap=1.4)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V59_BACK_PLAZA_LANTERN_REPLACEMENT_COMPLETE replacements=8")
