from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V95 pylon component replaces one legacy V10 pyro pylon at the same stage-edge lane center
#   each V95 nozzle component replaces one legacy V10 pyro nozzle directly above its matching pylon
#   each side keeps exactly three disconnected ceremonial pyro assemblies aligned to the original z rows

LEGACY_PYLONS = [f"V10_PyroPylon_{side}_{index}" for side in ("L", "R") for index in range(3)]
LEGACY_NOZZLES = [f"V10_PyroNozzle_{side}_{index}" for side in ("L", "R") for index in range(3)]
LEGACY_NAMES = [*LEGACY_PYLONS, *LEGACY_NOZZLES]

REPLACEMENT_NAMES = [
    "V95_PyroPylonArray_L",
    "V95_PyroPylonArray_R",
    "V95_PyroNozzleArray_L",
    "V95_PyroNozzleArray_R",
]

PEARL = "V15_PearlShellBeveled"
GOLD = "V9_CrownFiligreeGold"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V10_PyroPylon_L_0")
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


def radial_points(center_x, center_y, radius_x, radius_y, point_count=16, pinch=0.0, twist=0.0):
    points = []
    for index in range(point_count):
        angle = 2.0 * math.pi * index / point_count + twist
        wave = 1.0 + pinch * math.cos(angle * 4.0)
        points.append((center_x + math.cos(angle) * radius_x * wave, center_y + math.sin(angle) * radius_y * wave))
    return points


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


def triangulate_mesh(obj):
    set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize(obj, bevel_width=0.02, bevel_segments=1):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_mesh_object(name, material_name, collection, build_fn, *, bevel_width=0.02, bevel_segments=1):
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


def build_pylon_component(bm, bounds, variant):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    half_x = (bounds["x"][1] - bounds["x"][0]) * 0.5 + 0.12
    half_y = (bounds["y"][1] - bounds["y"][0]) * 0.5 + 0.12
    z0 = bounds["z"][0]
    z1 = bounds["z"][1] + 0.08
    cap_z = z1 - 0.52
    throat_z = z1 - 1.1
    twist = variant * 0.05

    loops = [
        (z0, radial_points(center_x, center_y, half_x * 1.18, half_y * 1.18, pinch=0.04, twist=twist)),
        (z0 + 0.22, radial_points(center_x, center_y, half_x * 1.04, half_y * 1.04, pinch=0.08, twist=twist)),
        (z0 + 0.9, radial_points(center_x, center_y, half_x * 0.88, half_y * 0.88, pinch=0.11, twist=twist * 0.8)),
        (throat_z, radial_points(center_x, center_y, half_x * 0.74, half_y * 0.74, pinch=0.14, twist=twist * 0.5)),
        (cap_z, radial_points(center_x, center_y, half_x * 1.02, half_y * 1.02, pinch=0.10, twist=twist * 0.3)),
        (z1 - 0.14, radial_points(center_x, center_y, half_x * 0.7, half_y * 0.7, pinch=0.08, twist=0.0)),
        (z1, radial_points(center_x, center_y, half_x * 0.58, half_y * 0.58, pinch=0.0, twist=0.0)),
    ]
    add_loft_stack_z(bm, loops)


def build_nozzle_component(bm, bounds, variant):
    center_x = midpoint(bounds, "x")
    center_y = midpoint(bounds, "y")
    half_x = (bounds["x"][1] - bounds["x"][0]) * 0.5 + 0.08
    half_y = (bounds["y"][1] - bounds["y"][0]) * 0.5 + 0.08
    z0 = bounds["z"][0] - 0.04
    z1 = bounds["z"][1] + 0.05
    mid_z = midpoint(bounds, "z")
    twist = variant * 0.07

    loops = [
        (z0, radial_points(center_x, center_y, half_x * 1.06, half_y * 1.06, pinch=0.12, twist=0.0)),
        (z0 + 0.08, radial_points(center_x, center_y, half_x * 1.18, half_y * 1.18, pinch=0.18, twist=twist)),
        (mid_z - 0.02, radial_points(center_x, center_y, half_x * 0.86, half_y * 0.86, pinch=0.2, twist=twist)),
        (mid_z + 0.08, radial_points(center_x, center_y, half_x * 0.64, half_y * 0.64, pinch=0.1, twist=twist * 0.5)),
        (z1 - 0.04, radial_points(center_x, center_y, half_x * 0.9, half_y * 0.9, pinch=0.16, twist=0.0)),
        (z1, radial_points(center_x, center_y, half_x * 0.48, half_y * 0.48, pinch=0.0, twist=0.0)),
    ]
    add_loft_stack_z(bm, loops)


def build_array(side, kind):
    legacy_names = [f"V10_Pyro{'Pylon' if kind == 'pylon' else 'Nozzle'}_{side}_{index}" for index in range(3)]
    bounds_list = [proxy_bounds(name) for name in legacy_names]

    def _build(bm):
        for index, bounds in enumerate(bounds_list):
            if kind == "pylon":
                build_pylon_component(bm, bounds, 1.0 + index * 0.12)
            else:
                build_nozzle_component(bm, bounds, 1.0 + index * 0.15)

    return _build


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )


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

build_mesh_object("V95_PyroPylonArray_L", PEARL, collection, build_array("L", "pylon"), bevel_width=0.018)
build_mesh_object("V95_PyroPylonArray_R", PEARL, collection, build_array("R", "pylon"), bevel_width=0.018)
build_mesh_object("V95_PyroNozzleArray_L", GOLD, collection, build_array("L", "nozzle"), bevel_width=0.014)
build_mesh_object("V95_PyroNozzleArray_R", GOLD, collection, build_array("R", "nozzle"), bevel_width=0.014)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_span("V95_PyroPylonArray_L", "y", 51.5)
verify_span("V95_PyroPylonArray_R", "y", 51.5)
verify_span("V95_PyroNozzleArray_L", "y", 51.5)
verify_span("V95_PyroNozzleArray_R", "y", 51.5)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V95_STAGE_EDGE_PYRO_REPLACEMENT_COMPLETE replacements=4")
