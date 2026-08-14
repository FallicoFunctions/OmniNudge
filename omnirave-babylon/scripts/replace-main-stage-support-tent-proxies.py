from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V91 support tent frame post rises from the V13 base footprint with >=0.02m ground overlap
#   each V91 frame beam overlaps the canopy spring line by >=0.05m on Z
#   each V91 canopy shell covers the full V13 roof footprint with >=0.12m overhang on X and Y
#   each V91 gold crest sits inside the canopy crown with >=0.05m Z overlap and spans the tent ridge

LEGACY_NAMES = [
    "V13_SupportTentBase_L",
    "V13_SupportTentBase_R",
    "V13_SupportTentRoof_L",
    "V13_SupportTentRoof_R",
]

REPLACEMENT_NAMES = [
    "V91_SupportTentFrame_L",
    "V91_SupportTentFrame_R",
    "V91_SupportTentCanopy_L",
    "V91_SupportTentCanopy_R",
    "V91_SupportTentCrest_L",
    "V91_SupportTentCrest_R",
]

PEARL = "V15_PearlShellBeveled"
GOLD = "V13_BrushedFestivalGold"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V13_SupportTentBase_L")
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
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def proxy_bounds(name):
    obj = bpy.data.objects[name]
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
        "x": (obj.location.x - half_x, obj.location.x + half_x),
        "y": (obj.location.y - half_y, obj.location.y + half_y),
        "z": (obj.location.z - half_z, obj.location.z + half_z),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def add_box_component(bm, bounds):
    x0, x1 = bounds["x"]
    y0, y1 = bounds["y"]
    z0, z1 = bounds["z"]
    verts = [
        bm.verts.new((x0, y0, z0)),
        bm.verts.new((x1, y0, z0)),
        bm.verts.new((x1, y1, z0)),
        bm.verts.new((x0, y1, z0)),
        bm.verts.new((x0, y0, z1)),
        bm.verts.new((x1, y0, z1)),
        bm.verts.new((x1, y1, z1)),
        bm.verts.new((x0, y1, z1)),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    for face in faces:
        bm.faces.new([verts[index] for index in face])


def add_loft_stack_y(bm, loops):
    rings = []
    for y_value, points in loops:
        rings.append([bm.verts.new((x, y_value, z)) for x, z in points])

    for left_ring, right_ring in zip(rings, rings[1:]):
        count = len(left_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    left_ring[index],
                    left_ring[next_index],
                    right_ring[next_index],
                    right_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


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


def finalize(obj, bevel_width=0.05, bevel_segments=2):
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


def build_mesh_object(name, material_name, collection, build_fn, *, bevel_width=0.05, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    build_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def tent_spec(side):
    base_bounds = proxy_bounds(f"V13_SupportTentBase_{side}")
    roof_bounds = proxy_bounds(f"V13_SupportTentRoof_{side}")
    center_x = midpoint(base_bounds, "x")
    center_y = midpoint(base_bounds, "y")
    frame_x_half = (base_bounds["x"][1] - base_bounds["x"][0]) * 0.5 - 0.34
    frame_y_half = (base_bounds["y"][1] - base_bounds["y"][0]) * 0.5 - 0.30
    canopy_x_half = (roof_bounds["x"][1] - roof_bounds["x"][0]) * 0.5 + 0.18
    canopy_y_half = (roof_bounds["y"][1] - roof_bounds["y"][0]) * 0.5 + 0.12

    return {
        "base": base_bounds,
        "roof": roof_bounds,
        "center_x": center_x,
        "center_y": center_y,
        "frame_x_half": frame_x_half,
        "frame_y_half": frame_y_half,
        "canopy_x_half": canopy_x_half,
        "canopy_y_half": canopy_y_half,
        "frame_bottom": base_bounds["z"][0] - 0.02,
        "frame_top": base_bounds["z"][1] + 0.34,
        "beam_bottom": roof_bounds["z"][0] - 0.12,
        "beam_top": roof_bounds["z"][0] + 0.18,
        "canopy_low": roof_bounds["z"][0] - 0.10,
        "canopy_mid": roof_bounds["z"][1] + 0.02,
        "canopy_peak": roof_bounds["z"][1] + 0.48,
        "crest_base": roof_bounds["z"][1] + 0.34,
        "crest_peak": roof_bounds["z"][1] + 0.66,
    }


def frame_components(spec):
    cx = spec["center_x"]
    cy = spec["center_y"]
    post_half = 0.18
    beam_half = 0.16
    post_z0 = spec["frame_bottom"]
    post_z1 = spec["frame_top"]
    beam_z0 = spec["beam_bottom"]
    beam_z1 = spec["beam_top"]
    x_half = spec["frame_x_half"]
    y_half = spec["frame_y_half"]

    corners = [
        (cx - x_half, cy - y_half),
        (cx + x_half, cy - y_half),
        (cx + x_half, cy + y_half),
        (cx - x_half, cy + y_half),
    ]

    components = []
    for px, py in corners:
        components.append(
            {
                "x": (px - post_half, px + post_half),
                "y": (py - post_half, py + post_half),
                "z": (post_z0, post_z1),
            }
        )

    components.extend(
        [
            {
                "x": (cx - x_half + 0.24, cx + x_half - 0.24),
                "y": (cy - y_half - beam_half, cy - y_half + beam_half),
                "z": (beam_z0, beam_z1),
            },
            {
                "x": (cx - x_half + 0.24, cx + x_half - 0.24),
                "y": (cy + y_half - beam_half, cy + y_half + beam_half),
                "z": (beam_z0, beam_z1),
            },
            {
                "x": (cx - x_half - beam_half, cx - x_half + beam_half),
                "y": (cy - y_half + 0.24, cy + y_half - 0.24),
                "z": (beam_z0, beam_z1),
            },
            {
                "x": (cx + x_half - beam_half, cx + x_half + beam_half),
                "y": (cy - y_half + 0.24, cy + y_half - 0.24),
                "z": (beam_z0, beam_z1),
            },
        ]
    )
    return components


def canopy_profile(x_half, z_floor, z_peak, flutter=0.0):
    rise = z_peak - z_floor
    return [
        (-x_half, z_floor + rise * 0.18),
        (-x_half * 0.92, z_floor + rise * 0.36 + flutter * 0.05),
        (-x_half * 0.76, z_floor + rise * 0.62 + flutter * 0.03),
        (-x_half * 0.54, z_floor + rise * 0.82),
        (-x_half * 0.22, z_peak - 0.06),
        (0.0, z_peak + 0.04 + flutter * 0.02),
        (x_half * 0.22, z_peak - 0.06),
        (x_half * 0.54, z_floor + rise * 0.82),
        (x_half * 0.76, z_floor + rise * 0.62 - flutter * 0.03),
        (x_half * 0.92, z_floor + rise * 0.36 - flutter * 0.05),
        (x_half, z_floor + rise * 0.18),
        (x_half * 0.72, z_floor + rise * 0.06),
        (x_half * 0.28, z_floor - 0.06),
        (0.0, z_floor - 0.10),
        (-x_half * 0.28, z_floor - 0.06),
        (-x_half * 0.72, z_floor + rise * 0.06),
    ]


def canopy_loops(spec):
    cx = spec["center_x"]
    cy = spec["center_y"]
    y_half = spec["canopy_y_half"]
    x_half = spec["canopy_x_half"]
    z_floor = spec["canopy_low"]
    z_mid = spec["canopy_mid"]
    z_peak = spec["canopy_peak"]

    def offset(points):
        return [(cx + x_value, z_value) for x_value, z_value in points]

    return [
        (cy - y_half, offset(canopy_profile(x_half * 0.96, z_floor + 0.04, z_mid - 0.10, flutter=1.0))),
        (cy - y_half * 0.52, offset(canopy_profile(x_half, z_floor, z_peak - 0.10, flutter=0.5))),
        (cy, offset(canopy_profile(x_half * 1.02, z_floor - 0.02, z_peak, flutter=0.0))),
        (cy + y_half * 0.52, offset(canopy_profile(x_half, z_floor, z_peak - 0.10, flutter=-0.5))),
        (cy + y_half, offset(canopy_profile(x_half * 0.96, z_floor + 0.04, z_mid - 0.10, flutter=-1.0))),
    ]


def crest_loops(spec):
    cx = spec["center_x"]
    cy = spec["center_y"]
    ridge_half = spec["frame_x_half"] * 0.62
    z_base = spec["crest_base"]
    z_peak = spec["crest_peak"]
    profile = [
        (cx - ridge_half, z_base + 0.02),
        (cx - ridge_half * 0.90, z_base + 0.08),
        (cx - ridge_half * 0.82, z_base + 0.15),
        (cx - ridge_half * 0.74, z_base + 0.18),
        (cx - ridge_half * 0.58, z_peak - 0.10),
        (cx - ridge_half * 0.42, z_peak - 0.04),
        (cx - ridge_half * 0.28, z_peak + 0.04),
        (cx - ridge_half * 0.14, z_peak + 0.08),
        (cx, z_peak + 0.12),
        (cx + ridge_half * 0.14, z_peak + 0.08),
        (cx + ridge_half * 0.28, z_peak + 0.04),
        (cx + ridge_half * 0.42, z_peak - 0.04),
        (cx + ridge_half * 0.58, z_peak - 0.10),
        (cx + ridge_half * 0.74, z_base + 0.18),
        (cx + ridge_half * 0.82, z_base + 0.15),
        (cx + ridge_half * 0.90, z_base + 0.08),
        (cx + ridge_half, z_base + 0.02),
        (cx + ridge_half * 0.88, z_base - 0.02),
        (cx + ridge_half * 0.70, z_base - 0.06),
        (cx + ridge_half * 0.40, z_base - 0.08),
        (cx, z_base - 0.10),
        (cx - ridge_half * 0.40, z_base - 0.08),
        (cx - ridge_half * 0.70, z_base - 0.06),
        (cx - ridge_half * 0.88, z_base - 0.02),
    ]
    return [
        (cy - 0.28, profile),
        (cy - 0.14, [(x, z + (0.015 if index % 2 == 0 else -0.01)) for index, (x, z) in enumerate(profile)]),
        (cy, [(x, z + (0.025 if index % 3 == 0 else -0.005)) for index, (x, z) in enumerate(profile)]),
        (cy + 0.14, [(x, z + (0.015 if index % 2 == 1 else -0.01)) for index, (x, z) in enumerate(profile)]),
        (cy + 0.28, profile),
    ]


def build_frame(spec, name, collection):
    def build_fn(bm):
        for component in frame_components(spec):
            add_box_component(bm, component)

    return build_mesh_object(name, PEARL, collection, build_fn, bevel_width=0.035, bevel_segments=1)


def build_canopy(spec, name, collection):
    def build_fn(bm):
        add_loft_stack_y(bm, canopy_loops(spec))

    return build_mesh_object(name, PEARL, collection, build_fn, bevel_width=0.04, bevel_segments=1)


def build_crest(spec, name, collection):
    def build_fn(bm):
        add_loft_stack_y(bm, crest_loops(spec))

    return build_mesh_object(name, GOLD, collection, build_fn, bevel_width=0.03, bevel_segments=1)


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_span(name, axis, minimum):
    bounds = world_bounds(name)
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{name} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


def verify_overlap(name_a, name_b, axis, minimum):
    bounds_a = proxy_bounds(name_a) if name_a.startswith("V13_") else world_bounds(name_a)
    bounds_b = proxy_bounds(name_b) if name_b.startswith("V13_") else world_bounds(name_b)
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{name_a} <-> {name_b} [{axis.upper()}] overlap={overlap:.3f}")
    if overlap < minimum:
        raise RuntimeError(f"{name_a} overlap with {name_b} on {axis} below minimum {minimum:.3f}: {overlap:.3f}")


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
hide_legacy(LEGACY_NAMES)

for side in ("L", "R"):
    spec = tent_spec(side)
    frame_name = f"V91_SupportTentFrame_{side}"
    canopy_name = f"V91_SupportTentCanopy_{side}"
    crest_name = f"V91_SupportTentCrest_{side}"

    build_frame(spec, frame_name, collection)
    build_canopy(spec, canopy_name, collection)
    build_crest(spec, crest_name, collection)

    log_bounds(frame_name)
    log_bounds(canopy_name)
    log_bounds(crest_name)
    verify_span(frame_name, "x", 8.0)
    verify_span(frame_name, "y", 5.6)
    verify_span(frame_name, "z", 2.3)
    verify_span(canopy_name, "x", 9.1)
    verify_span(canopy_name, "y", 6.5)
    verify_span(canopy_name, "z", 0.95)
    verify_span(crest_name, "x", 4.2)
    verify_span(crest_name, "y", 0.35)
    verify_span(crest_name, "z", 0.28)
    verify_overlap(canopy_name, f"V13_SupportTentRoof_{side}", "z", 0.05)
    verify_overlap(frame_name, f"V13_SupportTentBase_{side}", "z", 0.20)
    verify_overlap(crest_name, canopy_name, "z", 0.05)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V91_SUPPORT_TENT_REPLACEMENT_COMPLETE replacements=6")
