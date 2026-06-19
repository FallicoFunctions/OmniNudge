from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   each V97 stone component replaces one legacy wet route slab at the same centered route position
#   each V97 gold component replaces one matching ceremonial seam inset on the same route panel center
#   both V97 arrays preserve the ten original z rows so the route rhythm stays unchanged in review shots

LEGACY_NAMES = [f"V10_WetStoneRoutePanel_{index}" for index in range(10)]
REPLACEMENT_NAMES = ["V97_WetRouteStoneBandArray", "V97_WetRouteGoldSeamArray"]

STONE = "V13_WetPlazaStone"
GOLD = "V14_BurnishedCelestialGold"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V10_WetStoneRoutePanel_0")
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


def rounded_rect_points(center_x, center_z, half_x, half_z, point_count=16, pinch=0.0, taper=1.0):
    points = []
    for index in range(point_count):
        angle = 2.0 * math.pi * index / point_count
        wave = 1.0 + pinch * math.cos(angle * 4.0)
        x = center_x + math.cos(angle) * half_x * wave
        z = center_z + math.sin(angle) * half_z * taper
        points.append((x, z))
    return points


def add_loft_stack_y(bm, loops):
    rings = []
    for y_value, points in loops:
        rings.append([bm.verts.new((x, y_value, z)) for x, z in points])

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


def assign_planar_uvs(mesh, uv_scale=0.06):
    uv_layer = mesh.uv_layers.new(name="UVMap") if not mesh.uv_layers else mesh.uv_layers[0]

    for polygon in mesh.polygons:
        normal = polygon.normal
        axis_x = abs(normal.x)
        axis_y = abs(normal.y)
        axis_z = abs(normal.z)

        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if axis_y >= axis_x and axis_y >= axis_z:
                uv = (vertex.x * uv_scale + 0.5, vertex.z * uv_scale + 0.5)
            elif axis_x >= axis_z:
                uv = (vertex.z * uv_scale + 0.5, vertex.y * uv_scale + 0.5)
            else:
                uv = (vertex.x * uv_scale + 0.5, vertex.y * uv_scale + 0.5)
            uv_layer.data[loop_index].uv = uv


def finalize(obj, bevel_width=0.012, bevel_segments=1):
    set_active(obj)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bevel.profile = 0.72
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate_mesh(obj)
    assign_planar_uvs(obj.data)
    obj.data.update()
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_mesh_object(name, material_name, collection, build_fn, *, bevel_width=0.012, bevel_segments=1):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    build_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def build_stone_component(bm, bounds, variant):
    center_x = midpoint(bounds, "x")
    center_z = midpoint(bounds, "z")
    half_x = (bounds["x"][1] - bounds["x"][0]) * 0.5 + 0.12
    half_z = (bounds["z"][1] - bounds["z"][0]) * 0.5 + 0.08
    y0 = bounds["y"][0] - 0.03
    y1 = y0 + 0.045
    y2 = midpoint(bounds, "y") + 0.045
    y3 = bounds["y"][1] + 0.09
    flare = 1.0 + variant * 0.03
    outer = rounded_rect_points(center_x, center_z, half_x * 1.02, half_z * 1.04, point_count=20, pinch=0.03, taper=1.0)
    shoulder = rounded_rect_points(
        center_x,
        center_z,
        half_x * 0.965,
        half_z * 1.0,
        point_count=20,
        pinch=0.06 * flare,
        taper=1.02,
    )
    crown = rounded_rect_points(
        center_x,
        center_z,
        half_x * 0.88,
        half_z * 0.9,
        point_count=20,
        pinch=0.02,
        taper=1.0,
    )
    loops = [
        (y0, outer),
        (y1, outer),
        (y1, shoulder),
        (y2, shoulder),
        (y2, crown),
        (y3, crown),
    ]
    add_loft_stack_y(bm, loops)


def build_gold_component(bm, bounds, variant):
    center_x = midpoint(bounds, "x")
    center_z = midpoint(bounds, "z")
    half_x = (bounds["x"][1] - bounds["x"][0]) * 0.5 - 1.1
    half_z = (bounds["z"][1] - bounds["z"][0]) * 0.5 - 0.22
    center_y = midpoint(bounds, "y") - 1.215
    y0 = center_y - 0.205
    y1 = center_y + 0.205
    pinch = 0.1 + variant * 0.01

    loops = [
        (y0, rounded_rect_points(center_x, center_z, half_x * 1.0, half_z * 1.0, pinch=pinch, taper=1.0)),
        (y1 - 0.02, rounded_rect_points(center_x, center_z, half_x * 0.92, half_z * 0.96, pinch=pinch * 1.15, taper=1.02)),
        (y1, rounded_rect_points(center_x, center_z, half_x * 0.78, half_z * 0.86, pinch=0.02, taper=1.0)),
    ]
    add_loft_stack_y(bm, loops)


def build_array(kind):
    bounds_list = [proxy_bounds(name) for name in LEGACY_NAMES]

    def _build(bm):
        for index, bounds in enumerate(bounds_list):
            if kind == "stone":
                build_stone_component(bm, bounds, 1.0 + index * 0.04)
            else:
                build_gold_component(bm, bounds, 1.0 + index * 0.02)

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

# Keep the wet-stone batch unbeveled so the normal-mapped export does not pick up
# collapsed tangent bases on tiny corner triangles.
build_mesh_object("V97_WetRouteStoneBandArray", STONE, collection, build_array("stone"), bevel_width=0.0)
build_mesh_object("V97_WetRouteGoldSeamArray", GOLD, collection, build_array("gold"), bevel_width=0.01)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_span("V97_WetRouteStoneBandArray", "y", 85.0)
verify_span("V97_WetRouteGoldSeamArray", "y", 81.0)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V97_WET_ROUTE_REPLACEMENT_COMPLETE replacements=2")
