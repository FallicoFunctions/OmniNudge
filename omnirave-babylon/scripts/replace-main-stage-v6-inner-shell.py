from __future__ import annotations

import bmesh
import bpy
from mathutils import Vector


# Connection Map:
#   V25_HeroPortalOuterOgive_[L/R] <-> V50_InnerPortalPylon_[L/R]       overlap: 0.80m on Y
#   V50_InnerPortalPylon_[L/R]     <-> V50_InnerPortalGoldReveal_[L/R]  overlap: nested face set
#   V50_InnerPortalGoldReveal_[L/R] <-> V50_InnerPortalCyanInset_[L/R]  overlap: nested face set
#   V24_ProsceniumFlyingButtress_[L/R] <-> V50_InnerShellCascade_[L/R]  overlap: 0.80m on X/Y silhouette
#   V50_InnerShellCascade_[L/R]    <-> V50_OuterSweepSpire_[L/R]        overlap: staged outer shell continuation

LEGACY_NAMES = [
    "V6_ProscShell_L",
    "V6_ProscShell_R",
    "V6_ProscShellBack_L",
    "V6_ProscShellBack_R",
    "V6_SweepAnchor_L",
    "V6_SweepAnchor_R",
    "V6_PortalWall_L",
    "V6_PortalWall_R",
]

PEARL = "V16_PearlArchitecturalShell"
GOLD = "V20_ChasedGoldFiligree"
def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V25_HeroPortalOuterOgive_L")
    if anchor is None or not anchor.users_collection:
        return bpy.context.scene.collection
    return anchor.users_collection[0]


def offset_profile(center_x, profile):
    return [(center_x + x, z) for x, z in profile]


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


def finalize(obj, bevel_width=0.16, bevel_segments=4, subsurf_levels=1):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72

    bpy.ops.object.modifier_apply(modifier=bevel.name)
    if subsurf_levels > 0:
        subsurf = obj.modifiers.new("OmniRaveSubsurf", "SUBSURF")
        subsurf.levels = subsurf_levels
        subsurf.render_levels = subsurf_levels
        bpy.ops.object.modifier_apply(modifier=subsurf.name)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_profile_object(name, material_name, collection, components, bevel_width=0.16, bevel_segments=4, subsurf_levels=1):
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
        subsurf_levels=subsurf_levels,
    )
    return obj


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


def build_side(center_sign, collection):
    suffix = "L" if center_sign < 0 else "R"
    center_x = 9.1 * center_sign
    pylon_profile = [
        (-1.75, 10.0),
        (-1.55, 14.0),
        (-1.30, 21.5),
        (-1.05, 28.2),
        (-0.72, 33.4),
        (-0.28, 36.1),
        (0.00, 36.9),
        (0.28, 36.1),
        (0.72, 33.4),
        (1.05, 28.2),
        (1.30, 21.5),
        (1.55, 14.0),
        (1.75, 10.0),
        (1.28, 9.4),
        (-1.28, 9.4),
    ]
    build_profile_object(
        f"V50_InnerPortalPylon_{suffix}",
        PEARL,
        collection,
        [{
            "points": offset_profile(center_x, pylon_profile),
            "y_min": -36.1,
            "y_max": -33.3,
        }],
        bevel_width=0.16,
        bevel_segments=2,
        subsurf_levels=0,
    )

    gold_profile = [
        (-0.92, 12.2),
        (-0.78, 17.4),
        (-0.56, 24.6),
        (-0.34, 31.2),
        (-0.12, 34.5),
        (0.00, 35.0),
        (0.12, 34.5),
        (0.34, 31.2),
        (0.56, 24.6),
        (0.78, 17.4),
        (0.92, 12.2),
        (0.62, 11.7),
        (-0.62, 11.7),
    ]
    build_profile_object(
        f"V50_InnerPortalGoldReveal_{suffix}",
        GOLD,
        collection,
        [{
            "points": offset_profile(center_x, gold_profile),
            "y_min": -34.15,
            "y_max": -33.55,
        }],
        bevel_width=0.07,
        bevel_segments=2,
        subsurf_levels=0,
    )

    cascade_specs = [
        {
            "center_x": 17.2 * center_sign,
            "profile": [
                (-2.35, 11.3),
                (-2.05, 16.0),
                (-1.68, 23.8),
                (-1.18, 29.7),
                (-0.60, 34.6),
                (-0.22, 36.0),
                (0.00, 36.2),
                (0.22, 36.0),
                (0.60, 34.6),
                (1.18, 29.7),
                (1.68, 23.8),
                (2.05, 16.0),
                (2.35, 11.3),
                (1.70, 10.7),
                (-1.70, 10.7),
            ],
            "y_min": -34.8,
            "y_max": -30.8,
        },
        {
            "center_x": 20.8 * center_sign,
            "profile": [
                (-2.10, 14.6),
                (-1.85, 18.3),
                (-1.40, 24.8),
                (-0.92, 29.6),
                (-0.42, 32.8),
                (0.00, 33.7),
                (0.42, 32.8),
                (0.92, 29.6),
                (1.40, 24.8),
                (1.85, 18.3),
                (2.10, 14.6),
                (1.50, 14.0),
                (-1.50, 14.0),
            ],
            "y_min": -36.2,
            "y_max": -32.3,
        },
        {
            "center_x": 24.2 * center_sign,
            "profile": [
                (-1.85, 17.0),
                (-1.62, 20.3),
                (-1.18, 25.5),
                (-0.72, 29.3),
                (-0.28, 31.1),
                (0.00, 31.6),
                (0.28, 31.1),
                (0.72, 29.3),
                (1.18, 25.5),
                (1.62, 20.3),
                (1.85, 17.0),
                (1.28, 16.5),
                (-1.28, 16.5),
            ],
            "y_min": -37.9,
            "y_max": -33.9,
        },
    ]
    build_profile_object(
        f"V50_InnerShellCascade_{suffix}",
        PEARL,
        collection,
        [{
            "points": offset_profile(spec["center_x"], spec["profile"]),
            "y_min": spec["y_min"],
            "y_max": spec["y_max"],
        } for spec in cascade_specs],
        bevel_width=0.12,
        bevel_segments=2,
        subsurf_levels=0,
    )

    spire_profile = [
        (-1.75, 24.3),
        (-1.52, 26.9),
        (-1.18, 31.4),
        (-0.64, 35.4),
        (-0.18, 36.6),
        (0.00, 36.9),
        (0.18, 36.6),
        (0.64, 35.4),
        (1.18, 31.4),
        (1.52, 26.9),
        (1.75, 24.3),
        (1.05, 23.7),
        (-1.05, 23.7),
    ]
    build_profile_object(
        f"V50_OuterSweepSpire_{suffix}",
        GOLD,
        collection,
        [{
            "points": offset_profile(31.5 * center_sign, spire_profile),
            "y_min": -30.9,
            "y_max": -26.1,
        }],
        bevel_width=0.10,
        bevel_segments=2,
        subsurf_levels=0,
    )


def audit_all(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 3) for value in obj.rotation_euler)
        scale = tuple(round(value, 3) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transforms on {name}")


ensure_object_mode()
collection = resolve_collection()
new_names = [
    "V50_InnerPortalPylon_L",
    "V50_InnerPortalPylon_R",
    "V50_InnerPortalGoldReveal_L",
    "V50_InnerPortalGoldReveal_R",
    "V50_InnerShellCascade_L",
    "V50_InnerShellCascade_R",
    "V50_OuterSweepSpire_L",
    "V50_OuterSweepSpire_R",
]
obsolete_names = [
    "V50_InnerPortalCyanInset_L",
    "V50_InnerPortalCyanInset_R",
]

delete_existing(new_names + obsolete_names)
hide_legacy(LEGACY_NAMES)
build_side(-1, collection)
build_side(1, collection)

for name in new_names:
    log_bounds(name)

verify_overlap("V50_InnerPortalPylon_L", "V50_InnerPortalGoldReveal_L", axis="z", min_overlap=20.0)
verify_overlap("V50_InnerShellCascade_L", "V50_OuterSweepSpire_L", axis="z", min_overlap=7.0)
verify_overlap("V50_InnerPortalPylon_R", "V50_InnerPortalGoldReveal_R", axis="z", min_overlap=20.0)
verify_overlap("V50_InnerShellCascade_R", "V50_OuterSweepSpire_R", axis="z", min_overlap=7.0)
audit_all(new_names)

bpy.ops.wm.save_mainfile()
print("V50_V6_PROXY_REPLACEMENT_COMPLETE replacements=8")
