from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V92 service case bank overlaps the matching V13 stack footprint with >=0.10m on X/Y and >=0.20m on Z
#   each V92 bank is built from three disconnected road-case bodies to avoid reverting to one proxy cube silhouette
#   each V92 topper overlaps the matching V13 gold top footprint with >=0.12m on X/Y and >=0.10m on Z
#   each V92 topper sits forward of its bank by >=0.20m on Y while staying centered to the same service stack bay

LEGACY_NAMES = [
    "V13_ServiceCaseStack_L",
    "V13_ServiceCaseStack_R",
    "V13_ServiceCaseStackTop_L",
    "V13_ServiceCaseStackTop_R",
]

REPLACEMENT_NAMES = [
    "V92_ServiceCaseBank_L",
    "V92_ServiceCaseBank_R",
    "V92_ServiceCaseTopper_L",
    "V92_ServiceCaseTopper_R",
]

BLACK = "V13_BlackStageRigging"
GOLD = "V13_BrushedFestivalGold"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V13_ServiceCaseStack_L")
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


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
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


def chamfered_rect_points(center_x, center_y, half_x, half_y, chamfer):
    chamfer = min(chamfer, half_x * 0.6, half_y * 0.6)
    x0 = center_x - half_x
    x1 = center_x + half_x
    y0 = center_y - half_y
    y1 = center_y + half_y
    return [
        (x0 + chamfer, y0),
        (x1 - chamfer, y0),
        (x1, y0 + chamfer),
        (x1, y1 - chamfer),
        (x1 - chamfer, y1),
        (x0 + chamfer, y1),
        (x0, y1 - chamfer),
        (x0, y0 + chamfer),
    ]


def service_topper_profile(center_x, z_base, width, depth_bias=0.0):
    half = width * 0.5
    return [
        (center_x - half, z_base + 0.02),
        (center_x - half * 0.82, z_base - 0.05),
        (center_x - half * 0.60, z_base - 0.08),
        (center_x - half * 0.28, z_base + 0.24 + depth_bias),
        (center_x, z_base + 0.34 + depth_bias * 0.5),
        (center_x + half * 0.28, z_base + 0.24 + depth_bias),
        (center_x + half * 0.60, z_base - 0.08),
        (center_x + half * 0.82, z_base - 0.05),
        (center_x + half, z_base + 0.02),
        (center_x, z_base + 0.27 + depth_bias * 0.3),
    ]


def add_loft_stack_z(bm, loops):
    rings = []
    for z_value, points in loops:
        rings.append([bm.verts.new((x, y, z_value)) for x, y in points])

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


def finalize(obj, bevel_width=0.03, bevel_segments=1, *, unwrap=False):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    if unwrap:
        auto_uv_project(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_mesh_object(name, material_name, collection, build_fn, *, bevel_width=0.03, bevel_segments=1, unwrap=False):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    build_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments, unwrap=unwrap)
    return obj


def bank_spec(side):
    stack = proxy_bounds(f"V13_ServiceCaseStack_{side}")
    topper = proxy_bounds(f"V13_ServiceCaseStackTop_{side}")
    center_x = midpoint(stack, "x")
    center_y = midpoint(stack, "y")
    return {
        "stack": stack,
        "topper": topper,
        "center_x": center_x,
        "center_y": center_y,
        "bank_y_half": (stack["y"][1] - stack["y"][0]) * 0.5 + 0.04,
        "bank_z0": stack["z"][0] - 0.02,
        "bank_z1": stack["z"][1] + 0.02,
        "topper_center_y": midpoint(topper, "y"),
        "topper_y_half": (topper["y"][1] - topper["y"][0]) * 0.5 + 0.06,
        "topper_z0": topper["z"][0] - 0.02,
        "topper_z1": topper["z"][1] + 0.04,
    }


def build_case_component(bm, center_x, center_y, half_x, half_y, z0, z1, *, front_bias=0.0, lid_lift=0.0):
    mid_z = z0 + (z1 - z0) * 0.48
    shoulder_z = z1 - 0.14
    crown_z = z1
    base = chamfered_rect_points(center_x, center_y, half_x, half_y, 0.09)
    toe = chamfered_rect_points(center_x, center_y - 0.03, half_x * 0.98, half_y * 0.98, 0.08)
    body = chamfered_rect_points(center_x, center_y + front_bias * 0.08, half_x * 0.97, half_y * 0.96, 0.10)
    shoulder = chamfered_rect_points(center_x, center_y + front_bias * 0.15, half_x * 0.91, half_y * 0.91, 0.08)
    crown = chamfered_rect_points(center_x, center_y + front_bias * 0.20, half_x * 0.86, half_y * 0.86, 0.07)
    add_loft_stack_z(
        bm,
        [
            (z0, base),
            (z0 + 0.08, toe),
            (shoulder_z, shoulder),
            (crown_z + lid_lift, crown),
        ],
    )


def build_bank(side):
    spec = bank_spec(side)
    mirror = -1.0 if side == "L" else 1.0
    x_offsets = (-0.62 * mirror, 0.66 * mirror, 0.02 * mirror)
    y_offsets = (-0.08, 0.04, 0.28)
    z_ranges = (
        (spec["bank_z0"], spec["bank_z1"] - 0.16),
        (spec["bank_z0"], spec["bank_z1"] - 0.14),
        (spec["bank_z0"] + 0.54, spec["bank_z1"]),
    )
    sizes = (
        (0.55, spec["bank_y_half"] * 0.96),
        (0.53, spec["bank_y_half"] * 0.92),
        (0.66, spec["bank_y_half"] * 0.72),
    )

    def _build(bm):
        for index, (x_offset, y_offset, z_range, size) in enumerate(zip(x_offsets, y_offsets, z_ranges, sizes)):
            build_case_component(
                bm,
                spec["center_x"] + x_offset,
                spec["center_y"] + y_offset,
                size[0],
                size[1],
                z_range[0],
                z_range[1],
                front_bias=mirror * (0.35 if index == 2 else -0.2),
                lid_lift=0.02 if index == 2 else 0.0,
            )

    return _build


def build_topper(side):
    spec = bank_spec(side)
    center_x = spec["center_x"]
    center_y = spec["topper_center_y"]
    width = spec["topper"]["x"][1] - spec["topper"]["x"][0] + 0.06
    y_half = spec["topper_y_half"]
    z_base = spec["topper_z0"]

    def _build(bm):
        loops = [
            (center_y - y_half, service_topper_profile(center_x, z_base, width * 0.99, depth_bias=-0.02)),
            (center_y - y_half * 0.30, service_topper_profile(center_x, z_base + 0.05, width * 0.96, depth_bias=0.03)),
            (center_y + y_half * 0.28, service_topper_profile(center_x, z_base + 0.05, width * 0.95, depth_bias=0.03)),
            (center_y + y_half, service_topper_profile(center_x, z_base - 0.01, width * 0.98, depth_bias=-0.02)),
        ]
        add_loft_stack_y(bm, loops)

    return _build


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
    bounds = world_bounds(name)
    span = bounds[axis][1] - bounds[axis][0]
    print(f"{name} span[{axis.upper()}]={span:.3f}")
    if span < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {span:.3f}")


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
    build_mesh_object(f"V92_ServiceCaseBank_{side}", BLACK, collection, build_bank(side))
    build_mesh_object(f"V92_ServiceCaseTopper_{side}", GOLD, collection, build_topper(side), bevel_width=0.018)

for side in ("L", "R"):
    bank_bounds = log_bounds(f"V92_ServiceCaseBank_{side}")
    topper_bounds = log_bounds(f"V92_ServiceCaseTopper_{side}")
    verify_span(f"V92_ServiceCaseBank_{side}", "x", 2.35)
    verify_span(f"V92_ServiceCaseBank_{side}", "y", 1.55)
    verify_span(f"V92_ServiceCaseTopper_{side}", "x", 2.30)
    verify_span(f"V92_ServiceCaseTopper_{side}", "y", 1.55)
    verify_overlap(bank_bounds, proxy_bounds(f"V13_ServiceCaseStack_{side}"), "x", 2.20, f"bank {side} <-> legacy stack")
    verify_overlap(bank_bounds, proxy_bounds(f"V13_ServiceCaseStack_{side}"), "z", 1.30, f"bank {side} <-> legacy stack")
    verify_overlap(topper_bounds, proxy_bounds(f"V13_ServiceCaseStackTop_{side}"), "x", 2.20, f"topper {side} <-> legacy top")
    verify_overlap(topper_bounds, proxy_bounds(f"V13_ServiceCaseStackTop_{side}"), "z", 0.20, f"topper {side} <-> legacy top")

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V92_SERVICE_CASE_STACK_REPLACEMENT_COMPLETE replacements=4")
