#!/usr/bin/env python3
"""Build the first swappable OmniRave avatar outfit from the admitted reference.

Connection map (all dimensions are metres in Blender Z-up space):
- face shell overlaps the base skull by 0.010-0.018 and hair embeds 0.012 into the scalp.
- shirt overlaps the torso by 0.012; curved bomber panels overlap the back shell by 0.020-0.035.
- multi-ring sleeves overlap the shoulder/front panels by 0.020 and each cuff by 0.018.
- multi-ring trouser shells overlap the waist/adjacent leg shell by 0.018; pockets embed 0.008.
- boot cuffs overlap trouser hems by 0.025; soles overlap uppers by 0.015.
- zipper, piping, embroidery, laces, and trim embed 0.004-0.008 into their host garments.
- necklaces and waist chains sit 0.008-0.015 proud of the shirt/trousers for clean highlights.

The base male and female rigs stay separate from the luxury meshes. That boundary is
intentional: hair, tops, jackets, bottoms, footwear, and accessories can be swapped by
the editor without replacing the shared body/rig contract.
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
BLEND_PATH = ROOT / "assets-src/avatars/body-bases/avatar.blend"
RENDER_PATH = ROOT / ".img2threejs/luxury-festival/render/blender-luxury-male.png"
PREFIX = "AvatarLuxury_male_"
FRONT_Y = -1.0
HEAD_RAISE = 0.045
HEAD_Z_SCALE = 0.865
HEAD_PIVOT_Z = 1.580
PASS20_WARP_VERSION = 20
PASS20_Z_TABLE = (
    (0.0000, 0.0000),
    (0.0803, 0.0803),
    (0.4837, 0.4837),
    (0.8768, 0.9732),
    (0.9211, 1.0100),
    (1.0857, 1.1400),
    (1.2709, 1.3050),
    (1.4510, 1.4510),
    (1.5333, 1.5333),
    (1.7500, 1.7500),
)

# Author-space facial cross-sections.  The sixth value controls the cheek-to-temple
# roll; build_face adds HEAD_RAISE after every landmark has been registered.
FACIAL_ENVELOPE_ROWS = (
    (1.510, .040, -.060, -.008, .036, 2.00),
    (1.526, .052, -.073, -.010, .047, 2.25),
    (1.546, .070, -.085, -.008, .060, 3.20),
    (1.568, .080, -.096, -.005, .071, 2.90),
    (1.598, .089, -.105, -.002, .084, 2.55),
    (1.628, .095, -.109,  .001, .096, 2.45),
    (1.658, .094, -.105,  .003, .102, 2.35),
    (1.690, .090, -.095,  .005, .100, 2.30),
    (1.720, .084, -.085,  .007, .090, 2.20),
    (1.740, .073, -.072,  .008, .077, 2.10),
    (1.750, .061, -.060,  .008, .064, 2.00),
)

NOSE_PROFILE = (
    (1.688, .0035, .0090), (1.672, .0070, .0095),
    (1.654, .0120, .0100), (1.636, .0175, .0105),
    (1.620, .0225, .0115), (1.608, .0270, .0130),
    (1.600, .0300, .0160), (1.594, .0285, .0190),
    (1.588, .0240, .0210), (1.584, .0170, .0220),
)


def clear_previous() -> None:
    owned_data = set()
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREFIX) or obj.name.startswith("LuxuryReview_"):
            if getattr(obj, "data", None) is not None:
                owned_data.add(obj.data)
            bpy.data.objects.remove(obj, do_unlink=True)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for data in list(datablocks):
            if data in owned_data and data.users == 0:
                datablocks.remove(data)


def material(name: str, color, roughness: float, metallic: float = 0.0,
             coat: float = 0.0, emission=None) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    mat.metallic = metallic
    mat.roughness = roughness
    node = mat.node_tree.nodes.get("Principled BSDF")
    if node:
        node.inputs["Base Color"].default_value = color
        node.inputs["Metallic"].default_value = metallic
        node.inputs["Roughness"].default_value = roughness
        if "Coat Weight" in node.inputs:
            node.inputs["Coat Weight"].default_value = coat
            node.inputs["Coat Roughness"].default_value = max(0.08, roughness * 0.65)
        elif "Clearcoat" in node.inputs:
            node.inputs["Clearcoat"].default_value = coat
        if emission and "Emission Color" in node.inputs:
            node.inputs["Emission Color"].default_value = emission
            node.inputs["Emission Strength"].default_value = 0.25
    return mat


def set_material(obj, mat) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in getattr(obj.data, "polygons", []):
        poly.use_smooth = True


def apply_scale(obj) -> None:
    bpy.context.view_layer.objects.active = obj
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def compress_head_height(obj) -> None:
    """Compress one head-owned object in world Z while preserving X/Y landmarks."""
    obj.location.z = HEAD_PIVOT_Z + (obj.location.z - HEAD_PIVOT_Z) * HEAD_Z_SCALE
    obj.scale.z *= HEAD_Z_SCALE
    apply_scale(obj)


def compressed_head_z(z: float) -> float:
    return HEAD_PIVOT_Z + (z - HEAD_PIVOT_Z) * HEAD_Z_SCALE


def _piecewise_map(value: float, controls) -> float:
    if value <= controls[0][0]:
        return controls[0][1] + value - controls[0][0]
    for (source_a, target_a), (source_b, target_b) in zip(controls, controls[1:]):
        if value <= source_b:
            factor = (value - source_a) / (source_b - source_a)
            return target_a + (target_b - target_a) * factor
    return controls[-1][1] + value - controls[-1][0]


def pass20_body_z(z: float) -> float:
    """Pass-20 leg extension/torso compression map; head and feet remain fixed."""
    return _piecewise_map(z, PASS20_Z_TABLE)


def pass20_body_x_scale(z: float) -> float:
    """Narrow hips/limbs progressively while leaving feet and head untouched."""
    controls = (
        (0.2700, 1.000),
        (0.4837, 0.910),
        (0.8768, 0.910),
        (1.2709, 0.865),
        (1.4480, 0.865),
        (1.4510, 1.000),
    )
    if z <= controls[0][0]:
        return 1.0
    if z >= controls[-1][0]:
        return 1.0
    return _piecewise_map(z, controls)


def apply_pass20_body_silhouette_warp(rig, body) -> None:
    """Apply the independently reviewed proportion warp once to the shared male base.

    The luxury build owns this male avatar, but the editor still depends on the shared
    armature/node contract.  Changing rest landmarks and the bound body together keeps
    garment weights animation-safe and avoids post-parent object scaling.
    """
    if int(rig.get("luxuryBodySilhouetteWarp", 0)) == PASS20_WARP_VERSION:
        return

    hip_z = float(rig.data.bones["thigh.L"].head_local.z)
    target_hip_z = PASS20_Z_TABLE[3][1]
    if abs(hip_z - target_hip_z) < 0.004:
        rig["luxuryBodySilhouetteWarp"] = PASS20_WARP_VERSION
        body["luxuryBodySilhouetteWarp"] = PASS20_WARP_VERSION
        return
    if abs(hip_z - PASS20_Z_TABLE[3][0]) > 0.015:
        raise RuntimeError(f"unexpected male rest rig before pass-20 warp: hip_z={hip_z:.4f}")

    for vertex in body.data.vertices:
        source_z = float(vertex.co.z)
        vertex.co.x *= pass20_body_x_scale(source_z)
        vertex.co.z = pass20_body_z(source_z)
    body.data.update()

    bpy.context.view_layer.objects.active = rig
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in rig.data.edit_bones:
        for endpoint_name in ("head", "tail"):
            point = getattr(bone, endpoint_name).copy()
            source_z = float(point.z)
            point.x *= pass20_body_x_scale(source_z)
            point.z = pass20_body_z(source_z)
            setattr(bone, endpoint_name, point)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    bpy.context.view_layer.update()

    rig["luxuryBodySilhouetteWarp"] = PASS20_WARP_VERSION
    rig["luxuryBodySilhouetteHipRaise"] = round(target_hip_z - PASS20_Z_TABLE[3][0], 4)
    body["luxuryBodySilhouetteWarp"] = PASS20_WARP_VERSION


def recess_base_male_face(body) -> None:
    """Keep shared base-head features behind the authored luxury face shell.

    The operation is a clamp, so repeated generator runs are idempotent.  It
    only affects the concealed central male head; the rig, neck, rear skull,
    female body, and visible luxury face retain their authored coordinates.
    """
    changed = 0
    for vertex in body.data.vertices:
        point = vertex.co
        if 1.53 <= point.z <= 1.73 and abs(point.x) <= .115 and point.y < -.055:
            point.y = -.055
            changed += 1
    body["luxury_face_recess_vertex_count"] = changed
    body.data.update()


def bevel(obj, width=0.006, segments=3) -> None:
    mod = obj.modifiers.new("LuxuryRoundedEdges", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def box(name, location, dimensions, mat, bevel_width=0.006, rotation=(0, 0, 0)):
    # Blender cube size=2; scaling therefore uses half extents, then applies immediately.
    bpy.ops.mesh.primitive_cube_add(size=2, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = Vector(dimensions) * 0.5
    apply_scale(obj)
    if bevel_width:
        bevel(obj, min(bevel_width, min(dimensions) * 0.22), 3)
    set_material(obj, mat)
    return obj


def tapered_panel(name, x_inner_top, x_outer_top, x_inner_bottom, x_outer_bottom,
                  z_top, z_bottom, y_front, y_back, mat, bevel_width=0.018):
    """Rounded trapezoid prism for fitted garment panels; avoids box-like torso slabs."""
    verts = [
        (x_inner_top, y_front, z_top), (x_outer_top, y_front, z_top),
        (x_outer_bottom, y_front, z_bottom), (x_inner_bottom, y_front, z_bottom),
        (x_inner_top, y_back, z_top), (x_outer_top, y_back, z_top),
        (x_outer_bottom, y_back, z_bottom), (x_inner_bottom, y_back, z_bottom),
    ]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, bevel_width, 5)
    set_material(obj, mat)
    return obj


def ellipsoid(name, location, dimensions, mat, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = Vector(dimensions) * 0.5
    apply_scale(obj)
    set_material(obj, mat)
    return obj


def _lerp_rows(z, rows, value_start=1):
    """Linearly sample ordered facial control rows without extrapolating."""
    ordered = sorted(rows, key=lambda row: row[0])
    if z <= ordered[0][0]:
        return tuple(ordered[0][value_start:])
    if z >= ordered[-1][0]:
        return tuple(ordered[-1][value_start:])
    for lower, upper in zip(ordered, ordered[1:]):
        if lower[0] <= z <= upper[0]:
            t = (z - lower[0]) / (upper[0] - lower[0])
            return tuple(lower[index] * (1 - t) + upper[index] * t
                         for index in range(value_start, len(lower)))
    raise RuntimeError(f"facial row sampling failed at z={z:.4f}")


def _gaussian(x, z, cx, cz, sx, sz):
    return math.exp(-((x - cx) / sx) ** 2 - ((z - cz) / sz) ** 2)


def _smoothstep(edge0, edge1, value):
    t = max(0.0, min(1.0, (value - edge0) / max(edge1 - edge0, 1e-9)))
    return t * t * (3.0 - 2.0 * t)


def perioral_components(x, z):
    """Hard-bounded closed-lip masks for geometry and vertex colour.

    The seam spans exactly 56 mm.  Unlike the former broad Gaussians, every
    mask reaches zero at the authored vermilion border, preventing colour or
    recession from bleeding into the moustache and chin planes.
    """
    half_width = .028
    if abs(x) > half_width:
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    u = x / half_width
    shape = max(0.0, 1.0 - u * u)
    seam_z = 1.5738 - .0008 * u * u
    cupid = .00022 * shape * (
        math.exp(-((x - .0018) / .0010) ** 2)
        + math.exp(-((x + .0018) / .0010) ** 2)
        - 1.30 * math.exp(-(x / .0010) ** 2)
    )
    upper_height = .0058 * shape ** .55 + cupid
    lower_height = .0090 * shape ** .58

    upper_relief = 0.0
    lower_relief = 0.0
    upper_color = 0.0
    lower_color = 0.0
    if upper_height > 1e-6 and seam_z <= z <= seam_z + upper_height:
        t = (z - seam_z) / upper_height
        upper_relief = .0048 * shape ** .30 * max(0.0, math.sin(math.pi * t)) ** .72
        edge_distance = min(z - seam_z, seam_z + upper_height - z,
                            half_width - abs(x))
        upper_color = _smoothstep(0.0, .00045, max(0.0, edge_distance))
    if lower_height > 1e-6 and seam_z - lower_height <= z <= seam_z:
        t = (seam_z - z) / lower_height
        lower_relief = .0054 * shape ** .28 * max(0.0, math.sin(math.pi * t)) ** .72
        edge_distance = min(seam_z - z, z - (seam_z - lower_height),
                            half_width - abs(x))
        lower_color = _smoothstep(0.0, .00045, max(0.0, edge_distance))
    seam_delta = abs(z - seam_z)
    seam_color = shape ** .25 * (
        1.0 - _smoothstep(.00025, .00065, seam_delta)) if seam_delta <= .00065 else 0.0
    seam_recess = .0016 * shape ** .25 * math.exp(-((z - seam_z) / .00045) ** 2)
    return upper_relief, lower_relief, seam_recess, upper_color, lower_color, seam_color


def _nose_projection(z):
    """Return continuous bridge/tip projection and lateral sigma at one Z."""
    rows = sorted(NOSE_PROFILE, reverse=True)
    if z >= rows[0][0] or z <= rows[-1][0]:
        if z < 1.578 or z > 1.695:
            return 0.0, rows[-1][2]
    for upper, lower in zip(rows, rows[1:]):
        if lower[0] <= z <= upper[0]:
            t = (upper[0] - z) / (upper[0] - lower[0])
            amplitude = upper[1] * (1 - t) + lower[1] * t
            sigma = upper[2] * (1 - t) + lower[2] * t
            return amplitude, sigma
    if z > rows[0][0]:
        return rows[0][1], rows[0][2]
    # Taper the columella into the philtrum instead of carrying the last
    # bridge sample across the lip rows.
    fade = max(0.0, min(1.0, (z - 1.578) / (rows[-1][0] - 1.578)))
    return rows[-1][1] * fade, rows[-1][2]


def facial_surface_components(x, z):
    """Evaluate the continuous front facial plane and its material masks."""
    half_width, front_mid_y, side_y, _rear_y, roll_exponent = _lerp_rows(
        z, FACIAL_ENVELOPE_ROWS)
    u = min(1.0, abs(x) / max(half_width, 1e-6))
    smooth_u = u * u * (3.0 - 2.0 * u)
    y = front_mid_y + (side_y - front_mid_y) * smooth_u ** roll_exponent
    front_weight = max(0.0, 1.0 - u * u) ** 1.5

    # Angular facial planes stay on the same shell: high cheekbones and chin
    # project forward, while the temporal and orbital planes recede.
    y -= front_weight * (
        .0038 * _gaussian(x, z, -.053, 1.628, .031, .024)
        + .0038 * _gaussian(x, z, .053, 1.628, .031, .024)
        + .0018 * _gaussian(x, z, -.036, 1.640, .026, .012)
        + .0018 * _gaussian(x, z, .036, 1.640, .026, .012)
        + .0030 * _gaussian(x, z, -.034, 1.680, .028, .011)
        + .0030 * _gaussian(x, z, .034, 1.680, .028, .011)
        + .0025 * _gaussian(x, z, 0.0, 1.535, .024, .014)
    )
    y += front_weight * (
        .0022 * _gaussian(x, z, -.032, 1.668, .027, .010)
        + .0022 * _gaussian(x, z, .032, 1.668, .027, .010)
        + .0020 * _gaussian(x, z, -.082, 1.648, .018, .030)
        + .0020 * _gaussian(x, z, .082, 1.648, .018, .030)
    )

    amplitude, sigma_x = _nose_projection(z)
    y -= front_weight * amplitude * math.exp(-(x / sigma_x) ** 2)
    alar = (_gaussian(x, z, -.012, 1.592, .007, .007)
            + _gaussian(x, z, .012, 1.592, .007, .007))
    nostril = (_gaussian(x, z, -.009, 1.591, .0042, .0038)
               + _gaussian(x, z, .009, 1.591, .0042, .0038))
    y -= front_weight * .0035 * alar
    y += front_weight * .0024 * nostril
    # A measured 12.7 mm philtrum terminates at the central Cupid notch.
    philtrum_window = (_smoothstep(1.5793, 1.5810, z)
                       * (1.0 - _smoothstep(1.5905, 1.5920, z)))
    y += front_weight * .0010 * math.exp(-(x / .0035) ** 2) * philtrum_window

    upper_relief, lower_relief, seam_recess, upper_color, lower_color, seam_color = \
        perioral_components(x, z)
    y -= front_weight * (upper_relief + lower_relief)
    y += front_weight * seam_recess
    return y, upper_color, lower_color, nostril, seam_color


def ocular_surface_y(x, z):
    """Evaluate the exact authored face surface for eye/lid attachment warping."""
    return facial_surface_components(x, z)[0]


def almond_insert(name, side, centre, width, height, depth, mat, segments=24):
    """Closed, pointed almond lens facing the avatar's front (-Y).

    The front face sits at ``centre.y - depth / 2``.  A mirrored four-degree
    lift keeps each outer corner slightly higher without using negative scale.
    """
    cx, cy, cz = centre
    slope = math.tan(math.radians(4.0))
    perimeter = []
    for index in range(segments):
        angle = math.tau * index / segments
        local_x = width * 0.5 * math.cos(angle)
        # A sub-linear sine exponent keeps the mid-height full while both
        # corners converge to a clean point.
        sine = math.sin(angle)
        local_z = height * 0.5 * math.copysign(abs(sine) ** 0.72, sine)
        x = cx + local_x
        z = cz + local_z + slope * side * local_x
        perimeter.append((x, z, ocular_surface_y(x, z)))
    # The rim stays just behind the local skin and the closed back remains
    # embedded.  This follows the temple roll instead of projecting a flat
    # eye card beyond the silhouette.
    verts = [(x, surface_y + 0.0002, z) for x, z, surface_y in perimeter]
    verts += [(x, surface_y + depth + 0.0002, z) for x, z, surface_y in perimeter]
    centre_surface = ocular_surface_y(cx, cz)
    front_centre = len(verts)
    verts.append((cx, centre_surface - .0012, cz))
    back_centre = len(verts)
    verts.append((cx, centre_surface + depth + .0002, cz))
    faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((front_centre, index, nxt))
        faces.append((back_centre, segments + nxt, segments + index))
        faces.append((index, nxt, segments + nxt, segments + index))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    obj["ocular_width"] = width
    obj["ocular_height"] = height
    obj["ocular_outer_lift_degrees"] = 4.0
    obj["ocular_ipd_center_x"] = cx
    return obj


def ocular_lid_ribbon(name, side, upper, centre, mat, segments=20):
    """Registered lid ribbon for the authored 42-by-12 mm eye aperture."""
    cx, cy, cz = centre
    slope = math.tan(math.radians(4.0))
    verts = []
    for back_offset in (0.0, 0.0010):
        for edge in (0, 1):
            for index in range(segments + 1):
                u = -1.0 + 2.0 * index / segments
                arch = max(0.0, 1.0 - u * u) ** 0.72
                local_x = 0.021 * u
                if upper:
                    local_z = (0.00375 if edge == 0 else 0.00770) * arch
                    surface_offset = -0.0013 if edge == 0 else 0.0006
                else:
                    local_z = (-0.00625 if edge == 0 else -0.00850) * arch
                    surface_offset = 0.0025 if edge == 0 else 0.0006
                x = cx + local_x
                z = cz + local_z + slope * side * local_x
                verts.append((x, ocular_surface_y(x, z) + surface_offset + back_offset, z))
    row = segments + 1
    layer = row * 2
    faces = []
    for index in range(segments):
        # Front ribbon, back ribbon, and both long embedded edges.
        faces.append((index, index + 1, row + index + 1, row + index))
        faces.append((layer + index, layer + row + index,
                      layer + row + index + 1, layer + index + 1))
        faces.append((index, layer + index, layer + index + 1, index + 1))
        faces.append((row + index, row + index + 1,
                      layer + row + index + 1, layer + row + index))
    # Leave the point-like corner ends open; both terminate inside the facial
    # shell, while omitting end caps avoids a visible side-facing rectangle.
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    obj["editorProxyFor"] = PREFIX + "skin_face_shell"
    obj["sclera_overlap"] = 0.00125 if upper else 0.00070
    obj["lid_recession"] = 0.0 if upper else 0.0025
    obj["connected_component_count"] = 1
    return obj


def lofted_volume(name, rings, mat, sides=32):
    """Continuous organic shell from elliptical cross-sections.

    Each ring is ``(z, radius_x, radius_y, centre_y[, superellipse_n])``.
    A superellipse exponent above two gives the lower face defined mandibular
    corners without layering disconnected toy-like spheres.
    """
    verts = []
    for ring in rings:
        z, radius_x, radius_y, centre_y = ring[:4]
        exponent = ring[4] if len(ring) > 4 else 2.0
        power = 2.0 / exponent
        for index in range(sides):
            angle = math.tau * index / sides
            cosine, sine = math.cos(angle), math.sin(angle)
            verts.append((radius_x * math.copysign(abs(cosine) ** power, cosine),
                          centre_y + radius_y * math.copysign(abs(sine) ** power, sine), z))
    faces = []
    ring_count = len(rings)
    for ring_index in range(ring_count - 1):
        start = ring_index * sides
        nxt_start = (ring_index + 1) * sides
        for index in range(sides):
            nxt = (index + 1) % sides
            faces.append((start + index, start + nxt, nxt_start + nxt, nxt_start + index))
    faces.append(tuple(reversed(range(sides))))
    last = (ring_count - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    return obj


def integrated_face_volume(name, rings, mats, sides=96):
    """One continuous facial surface with sockets, nose, philtrum, and lips.

    The eye polygons are omitted to form true apertures.  Recessed almond
    inserts and embedded skin lids are built separately by ``build_face``;
    only the lip tint and inset nostril regions remain on this skin shell.
    """
    controls = sorted(rings, key=lambda ring: ring[0])
    forced_rows = {
        1.510, 1.526, 1.546, 1.568, 1.569, 1.572, 1.574, 1.576,
        1.579, 1.582, 1.584, 1.588, 1.592, 1.596, 1.600, 1.604,
        1.612, 1.628, 1.651, 1.654, 1.657, 1.660, 1.663, 1.666,
        1.678, 1.690, 1.720, 1.740, 1.750,
    }
    forced_rows.update(round(1.558 + index * .003, 3)
                       for index in range(round((1.690 - 1.558) / .003) + 1))
    forced_rows.update(round(1.560 + index * .001, 3) for index in range(31))
    forced_rows.update(round(1.649 + index * .001, 3) for index in range(19))
    forced_rows.update((1.5648, 1.5693, 1.5730, 1.5738, 1.5746, 1.5793, 1.5798))
    sampled_z = {round(controls[0][0] + index * 0.005, 3)
                 for index in range(round((controls[-1][0] - controls[0][0]) / 0.005) + 1)}
    sampled_z.update(round(control[0], 3) for control in controls)
    sampled_z.update(forced_rows)
    sampled_z = sorted(z for z in sampled_z if controls[0][0] <= z <= controls[-1][0])

    def envelope_at(z):
        for index in range(len(controls) - 1):
            lower, upper = controls[index], controls[index + 1]
            if lower[0] <= z <= upper[0]:
                t = (z - lower[0]) / (upper[0] - lower[0])
                return tuple(lower[field] * (1 - t) + upper[field] * t
                             for field in range(1, len(lower)))
        return tuple(controls[-1][1:])

    front_columns = 161
    rear_segments = 32
    row_width = front_columns + rear_segments - 1
    verts = []
    for z in sampled_z:
        half_width, _front_mid_y, side_y, rear_y, _roll_exponent = envelope_at(z)
        for column in range(front_columns):
            x = -half_width + 2.0 * half_width * column / (front_columns - 1)
            y = facial_surface_components(x, z)[0]
            verts.append((x, y, z))
        for segment in range(1, rear_segments):
            phi = math.pi * segment / rear_segments
            x = half_width * math.cos(phi)
            y = side_y + (rear_y - side_y) * math.sin(phi)
            verts.append((x, y, z))

    faces = []
    aperture_removed = {-1: 0, 1: 0}
    for ring_index in range(len(sampled_z) - 1):
        start = ring_index * row_width
        nxt_start = start + row_width
        for index in range(row_width):
            nxt = (index + 1) % row_width
            candidate = (start + index, start + nxt, nxt_start + nxt, nxt_start + index)
            # Only front-grid quads can become ocular apertures.  The dense
            # feature rows and columns keep the boundary smooth enough for the
            # overlapping lid ribbons to hide its tessellation.
            removed = False
            if index < front_columns - 1:
                centre = sum((Vector(verts[vertex]) for vertex in candidate), Vector((0, 0, 0))) / 4
                for side in (-1, 1):
                    local_x = centre.x - 0.032 * side
                    eye_z = 1.657 + math.tan(math.radians(4.0)) * side * local_x
                    aperture = (local_x / 0.0210) ** 2 + ((centre.z - eye_z) / 0.0065) ** 2
                    if aperture <= 1.0:
                        aperture_removed[side] += 1
                        removed = True
                        break
            if not removed:
                faces.append(candidate)
    faces.append(tuple(reversed(range(row_width))))
    final = (len(sampled_z) - 1) * row_width
    faces.append(tuple(final + index for index in range(row_width)))

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mats["face"])
    colors = mesh.color_attributes.new(name="FaceColor", type="BYTE_COLOR", domain="CORNER")
    region_counts = {"lips": 0, "nostril": 0}
    for poly in mesh.polygons:
        poly.use_smooth = True
        for loop_index in poly.loop_indices:
            point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if point.y > -.080:
                colors.data[loop_index].color = (1, 1, 1, 1)
                continue
            _surface, upper_lip, lower_lip, nostril, seam_weight = facial_surface_components(point.x, point.z)
            nostril_weight = max(0.0, min(1.0, (nostril - .45) / .55))
            if upper_lip >= lower_lip:
                lip_weight = upper_lip
                lip_multiplier = (.74, .48, .46)
            else:
                lip_weight = lower_lip
                lip_multiplier = (.68, .40, .42)
            multiplier = [1.0 - lip_weight * (1.0 - value) for value in lip_multiplier]
            seam_multiplier = (.42, .20, .20)
            multiplier = [value * (1.0 - seam_weight) + seam_value * seam_weight
                          for value, seam_value in zip(multiplier, seam_multiplier)]
            multiplier = [value * (1.0 - .82 * nostril_weight) for value in multiplier]
            colors.data[loop_index].color = (*multiplier, 1.0)
            if lip_weight > .10:
                region_counts["lips"] += 1
            if nostril_weight > .10:
                region_counts["nostril"] += 1

    if any(count == 0 for count in region_counts.values()):
        raise RuntimeError(f"integrated facial material region missing: {region_counts}")
    for region, count in region_counts.items():
        obj[f"integrated_{region}_polygons"] = count
    obj["eye_aperture_left_faces_removed"] = aperture_removed[1]
    obj["eye_aperture_right_faces_removed"] = aperture_removed[-1]
    obj["ocular_ipd"] = 0.064
    obj["ocular_aperture_width"] = 0.042
    obj["ocular_aperture_height"] = 0.013
    obj["ocular_outer_lift_degrees"] = 4.0
    obj["mouth_seam_width"] = 0.056
    obj["upper_lip_height"] = 0.00553
    obj["lower_lip_height"] = 0.0090
    obj["upper_lip_projection"] = 0.0048
    obj["lower_lip_projection"] = 0.0054
    obj["lip_projection_max"] = 0.0054
    obj["philtrum_length"] = 0.01267
    obj["cupid_notch_width"] = 0.0036
    obj["cupid_notch_depth"] = 0.00048
    obj["mouth_corner_drop"] = 0.0008
    return obj


def curved_front_panel(name, side, rings, mat, width_segments=10):
    """Closed, curved bomber half with multiple vertical and lateral samples.

    Each ring is ``(z, inner_x, outer_x, front_inner_y, front_outer_y,
    back_inner_y, back_outer_y, outer_drop)``. ``inner_x`` and ``outer_x`` are positive
    distances from the centre opening; ``side`` mirrors positions without a
    negative object scale, so exported winding remains stable.
    """
    if side not in (-1, 1) or len(rings) < 2:
        raise ValueError(f"invalid curved front panel: {name}")
    row_width = width_segments + 1
    verts = []
    for ring in rings:
        if len(ring) == 8:
            z, inner_x, outer_x, front_inner, front_outer, back_inner, back_outer, outer_drop = ring
        elif len(ring) == 7:
            z, inner_x, outer_x, front_inner, front_outer, back_inner, back_outer = ring
            outer_drop = 0.0
        else:
            raise ValueError(f"invalid front-panel ring in {name}: {ring}")
        row = []
        for index in range(row_width):
            radial_t = index / width_segments
            distance = inner_x + (outer_x - inner_x) * radial_t
            x = distance * side
            curve = math.sin(math.pi * radial_t)
            front_y = front_inner + (front_outer - front_inner) * radial_t - 0.014 * curve
            back_y = back_inner + (back_outer - back_inner) * radial_t + 0.006 * curve
            z_vertex = z - outer_drop * radial_t ** 1.4
            row.append((x, front_y, back_y, z_vertex))
        row.sort(key=lambda point: point[0])
        verts.extend((x, front_y, z_vertex) for x, front_y, _, z_vertex in row)
        verts.extend((x, back_y, z_vertex) for x, _, back_y, z_vertex in row)

    faces = []
    ring_stride = row_width * 2
    for ring_index in range(len(rings) - 1):
        current = ring_index * ring_stride
        nxt_ring = current + ring_stride
        for index in range(width_segments):
            front_a, front_b = current + index, current + index + 1
            front_d, front_c = nxt_ring + index, nxt_ring + index + 1
            back_a, back_b = current + row_width + index, current + row_width + index + 1
            back_d, back_c = nxt_ring + row_width + index, nxt_ring + row_width + index + 1
            faces.append((front_a, front_d, front_c, front_b))
            faces.append((back_a, back_b, back_c, back_d))
        faces.append((current, current + row_width, nxt_ring + row_width, nxt_ring))
        last = width_segments
        faces.append((current + last, nxt_ring + last,
                      nxt_ring + row_width + last, current + row_width + last))
    first, last = 0, (len(rings) - 1) * ring_stride
    faces.append(tuple(range(first, first + row_width)) + tuple(reversed(range(first + row_width, first + ring_stride))))
    faces.append(tuple(reversed(range(last, last + row_width))) + tuple(range(last + row_width, last + ring_stride)))

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.004, 2)
    set_material(obj, mat)
    obj["authored_ring_count"] = len(rings)
    obj["shoulder_outer_drop"] = float(rings[0][-1]) if len(rings[0]) == 8 else 0.0
    return obj


def rounded_open_bomber_shell(name, rings, mat, samples=36, thickness=.008,
                              front_lip_y=-.100, rig=None):
    """One rounded, closed-thickness bomber torso with an authored front opening.

    Rings are ``(z, half_x, half_depth, centre_y, front_gap_half_x, side_drop)``.
    The cross-section starts at the right opening lip, travels around the back,
    and ends at the left lip, so there is no separate rear slab or doubled front.
    """
    if len(rings) < 2 or samples < 12:
        raise ValueError(f"invalid rounded bomber shell: {name}")
    verts = []
    cross_sections = []
    for z, half_x, half_depth, centre_y, gap_half_x, side_drop in rings:
        outer_delta = math.asin(min(.98, gap_half_x / half_x))
        inner_half_x = half_x - thickness
        inner_half_depth = half_depth - thickness
        inner_gap = max(.004, gap_half_x - thickness * .5)
        inner_delta = math.asin(min(.98, inner_gap / inner_half_x))
        outer = []
        inner = []
        for index in range(samples):
            t = index / (samples - 1)
            outer_angle = (-math.pi / 2 + outer_delta) + (math.tau - 2 * outer_delta) * t
            inner_angle = (-math.pi / 2 + inner_delta) + (math.tau - 2 * inner_delta) * t
            outer_x = half_x * math.cos(outer_angle)
            inner_x = inner_half_x * math.cos(inner_angle)
            edge_t = max(0.0, min(1.0, (abs(outer_x) - .080) / max(.001, half_x - .080)))
            drop = side_drop * _smoothstep(0.0, 1.0, edge_t)
            outer_y = centre_y + half_depth * math.sin(outer_angle)
            inner_y = centre_y + inner_half_depth * math.sin(inner_angle)
            # Only the three samples nearest each opening lip project forward.
            # The rounded core therefore keeps its authored 190 mm chest depth,
            # while a narrow integrated flange meets the retained inner shirt.
            lip_distance = min(index, samples - 1 - index)
            lip_weight = (1.0, .62, .24)[lip_distance] if lip_distance < 3 else 0.0
            outer_y += (front_lip_y - outer_y) * lip_weight
            inner_lip_y = front_lip_y + thickness
            inner_y += (inner_lip_y - inner_y) * lip_weight
            outer.append((outer_x, outer_y, z - drop))
            inner.append((inner_x, inner_y, z - drop))
        start = len(verts)
        verts.extend(outer)
        verts.extend(inner)
        cross_sections.append((start, start + samples))

    faces = []
    for ring_index in range(len(rings) - 1):
        outer, inner = cross_sections[ring_index]
        next_outer, next_inner = cross_sections[ring_index + 1]
        for index in range(samples - 1):
            nxt = index + 1
            faces.append((outer + index, outer + nxt, next_outer + nxt, next_outer + index))
            faces.append((inner + index, next_inner + index, next_inner + nxt, inner + nxt))
        # Close both vertical front-opening lips through the shell thickness.
        faces.append((outer, next_outer, next_inner, inner))
        last = samples - 1
        faces.append((outer + last, inner + last, next_inner + last, next_outer + last))

    # Bridge outer and inner surfaces at neckline and hem.
    for ring_index, reverse in ((0, True), (len(rings) - 1, False)):
        outer, inner = cross_sections[ring_index]
        for index in range(samples - 1):
            quad = (outer + index, inner + index, inner + index + 1, outer + index + 1)
            faces.append(tuple(reversed(quad)) if reverse else quad)

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    obj["authored_ring_count"] = len(rings)
    obj["cross_section_samples"] = samples
    obj["connected_component_count"] = 1
    obj["shell_thickness"] = thickness
    obj["chest_depth"] = max(2 * ring[2] for ring in rings)
    obj["coreChestDepth"] = max(2 * ring[2] for ring in rings)
    obj["hem_span"] = 2 * rings[-1][1]
    obj["front_lip_y"] = front_lip_y
    obj["frontOpeningTop"] = 2 * rings[0][4]
    obj["frontOpeningHem"] = 2 * rings[-1][4]
    obj["front_opening"] = True
    if rig is not None:
        if len(rings) == 9:
            # Torso trim, zippers, hem, and collars are chest-owned editor
            # parts.  Keeping the shell in that same deformation frame avoids
            # the posed shear that made pass21 read as floating panels.
            ring_weights = tuple((1.0, 0.0, 0.0) for _ in rings)
        else:
            ring_weights = tuple((1.0, 0.0, 0.0) for _ in rings)
        groups = [obj.vertex_groups.new(name=bone) for bone in ("chest", "spine", "hips")]
        ring_stride = samples * 2
        for ring_index, weights in enumerate(ring_weights):
            indices = list(range(ring_index * ring_stride, (ring_index + 1) * ring_stride))
            for group, weight in zip(groups, weights):
                if weight:
                    group.add(indices, weight, "REPLACE")
        world = obj.matrix_world.copy()
        obj.parent = rig
        obj.parent_type = "OBJECT"
        obj.matrix_world = world
        modifier = obj.modifiers.new("LuxuryBomberArmature", "ARMATURE")
        modifier.object = rig
        modifier.use_deform_preserve_volume = True
        obj["weight_contract"] = "chest-spine-hips"
    return obj


def open_ellipse_path(half_x, half_depth, centre_y, gap_half_x, z, samples=40):
    """Sample a U-shaped ellipse from right front lip around the back to left lip."""
    delta = math.asin(min(.98, gap_half_x / half_x))
    return [
        (half_x * math.cos((-math.pi / 2 + delta) +
                           (math.tau - 2 * delta) * index / (samples - 1)),
         centre_y + half_depth * math.sin((-math.pi / 2 + delta) +
                                           (math.tau - 2 * delta) * index / (samples - 1)),
         z)
        for index in range(samples)
    ]


def elliptical_cuff_band(name, centre, half_x, half_y, z_bottom, z_top, mat, sides=32):
    """Closed elliptical sleeve band aligned to the near-vertical forearm axis."""
    cx, cy = centre
    verts = []
    for z in (z_bottom, z_top):
        for index in range(sides):
            angle = math.tau * index / sides
            verts.append((cx + half_x * math.cos(angle),
                          cy + half_y * math.sin(angle), z))
    faces = []
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((index, nxt, sides + nxt, sides + index))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(sides + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, .002, 2)
    set_material(obj, mat)
    obj["cuff_diameter_across"] = half_x * 2
    obj["cuff_diameter_depth"] = half_y * 2
    obj["cuff_axial_length"] = z_top - z_bottom
    return obj


def elliptical_double_strip(name, centre, half_x, half_y, z_values, radius, mat,
                            samples=32):
    """Two circumferential accent strips stored under one stable editor node."""
    curve_data = bpy.data.curves.new(name + "_Curve", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 1
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 3
    cx, cy = centre
    for z in z_values:
        spline = curve_data.splines.new("POLY")
        spline.points.add(samples - 1)
        for index, point in enumerate(spline.points):
            angle = math.tau * index / samples
            point.co = (cx + half_x * math.cos(angle),
                        cy + half_y * math.sin(angle), z, 1.0)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    obj["strip_count"] = len(z_values)
    return obj


def curved_back_panel(name, rings, mat, width_segments=16):
    """Rear bomber shell that wraps around the torso instead of reading as a box."""
    row_width = width_segments + 1
    verts = []
    for ring in rings:
        if len(ring) == 7:
            z, half_width, front_center, front_edge, back_center, back_edge, outer_drop = ring
        elif len(ring) == 6:
            z, half_width, front_center, front_edge, back_center, back_edge = ring
            outer_drop = 0.0
        else:
            raise ValueError(f"invalid back-panel ring in {name}: {ring}")
        for index in range(row_width):
            t = index / width_segments
            x = -half_width + 2.0 * half_width * t
            edge_weight = abs(2.0 * t - 1.0) ** 1.65
            front_y = front_center + (front_edge - front_center) * edge_weight
            back_y = back_center + (back_edge - back_center) * edge_weight
            verts.append((x, front_y, z - outer_drop * abs(2.0 * t - 1.0) ** 1.4))
        for index in range(row_width):
            t = index / width_segments
            x = -half_width + 2.0 * half_width * t
            edge_weight = abs(2.0 * t - 1.0) ** 1.65
            back_y = back_center + (back_edge - back_center) * edge_weight
            verts.append((x, back_y, z - outer_drop * abs(2.0 * t - 1.0) ** 1.4))

    faces = []
    ring_stride = row_width * 2
    for ring_index in range(len(rings) - 1):
        current = ring_index * ring_stride
        nxt_ring = current + ring_stride
        for index in range(width_segments):
            faces.append((current + index, nxt_ring + index, nxt_ring + index + 1, current + index + 1))
            faces.append((current + row_width + index, current + row_width + index + 1,
                          nxt_ring + row_width + index + 1, nxt_ring + row_width + index))
        faces.append((current, current + row_width, nxt_ring + row_width, nxt_ring))
        last = width_segments
        faces.append((current + last, nxt_ring + last,
                      nxt_ring + row_width + last, current + row_width + last))
    first, last = 0, (len(rings) - 1) * ring_stride
    faces.append(tuple(range(first, first + row_width)) + tuple(reversed(range(first + row_width, first + ring_stride))))
    faces.append(tuple(reversed(range(last, last + row_width))) + tuple(range(last + row_width, last + ring_stride)))

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.004, 2)
    set_material(obj, mat)
    obj["authored_ring_count"] = len(rings)
    obj["shoulder_outer_drop"] = float(rings[0][-1]) if len(rings[0]) == 7 else 0.0
    obj["hem_chest_width_ratio"] = float(rings[-1][1] / rings[2][1])
    return obj


def skinned_sleeve_shell(name, side, rings, mat, rig, sides=24):
    """One gathered bomber sleeve with normalized shoulder/upper-arm/forearm weights."""
    if side not in (-1, 1) or len(rings) not in (9, 11):
        raise ValueError(f"invalid continuous sleeve contract: {name}")
    centres = [Vector(ring[0]) for ring in rings]
    verts = []
    for ring_index, (_, radius_across, radius_depth, fold_amp, phase) in enumerate(rings):
        centre = centres[ring_index]
        if ring_index == 0:
            tangent = (centres[1] - centres[0]).normalized()
        elif ring_index == len(rings) - 1:
            tangent = (centres[-1] - centres[-2]).normalized()
        else:
            tangent = (centres[ring_index + 1] - centres[ring_index - 1]).normalized()
        helper = Vector((0, 1, 0)) if abs(tangent.y) < 0.92 else Vector((1, 0, 0))
        across = tangent.cross(helper).normalized()
        depth = across.cross(tangent).normalized()
        for side_index in range(sides):
            angle = math.tau * side_index / sides
            radial = fold_amp * (0.55 + 0.45 * math.cos(3.0 * angle + phase))
            y_gather = 0.35 * fold_amp * math.sin(2.0 * angle + phase)
            point = (centre
                     + across * math.cos(angle) * (radius_across + radial)
                     + depth * math.sin(angle) * (radius_depth + radial))
            point.y += y_gather
            verts.append(point)
    faces = []
    for ring_index in range(len(rings) - 1):
        start = ring_index * sides
        nxt_start = start + sides
        for side_index in range(sides):
            nxt = (side_index + 1) % sides
            faces.append((start + side_index, start + nxt, nxt_start + nxt, nxt_start + side_index))
    faces.append(tuple(reversed(range(sides))))
    final = (len(rings) - 1) * sides
    faces.append(tuple(final + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)

    suffix = "L" if side > 0 else "R"
    group_names = (f"shoulder.{suffix}", f"upperarm.{suffix}", f"forearm.{suffix}")
    groups = [obj.vertex_groups.new(name=group_name) for group_name in group_names]
    ring_weights = ((
        (0.25, 0.75, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0),
        (0.0, 1.0, 0.0), (0.0, 0.85, 0.15), (0.0, 0.55, 0.45),
        (0.0, 0.20, 0.80), (0.0, 0.0, 1.0), (0.0, 0.0, 1.0),
    ) if len(rings) == 9 else (
        (0.65, 0.35, 0.0), (0.35, 0.65, 0.0), (0.10, 0.90, 0.0),
        (0.0, 1.0, 0.0), (0.0, 0.90, 0.10), (0.0, 0.60, 0.40),
        (0.0, 0.35, 0.65), (0.0, 0.15, 0.85), (0.0, 0.0, 1.0),
        (0.0, 0.0, 1.0), (0.0, 0.0, 1.0),
    ))
    for ring_index, weights in enumerate(ring_weights):
        indices = list(range(ring_index * sides, (ring_index + 1) * sides))
        for group, weight in zip(groups, weights):
            if weight > 0:
                group.add(indices, weight, "REPLACE")
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "OBJECT"
    obj.matrix_world = world
    modifier = obj.modifiers.new("LuxurySleeveArmature", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    obj["authored_ring_count"] = len(rings)
    obj["circumferential_sides"] = sides
    obj["connected_component_count"] = 1
    obj["weight_contract"] = "shoulder-upperarm-forearm"
    obj["root_cap_outer_x"] = abs(float(rings[0][0][0])) + rings[0][1] + rings[0][3]
    obj["root_cap_protrusion"] = obj["root_cap_outer_x"] - .21017
    # The root two rings form the shoulder cap and are audited by anatomical
    # protrusion.  Mid-upper-arm diameter is measured below that cap.
    obj["upper_diameter_max"] = max(2.0 * (ring[1] + ring[3]) for ring in rings[3:6])
    obj["terminal_diameter"] = 2.0 * (rings[-1][1] + rings[-1][3])
    obj["max_fold_amplitude"] = max(ring[3] for ring in rings)
    obj["terminal_ring_z"] = rings[-1][0][2]
    return obj


def tailored_pelvis_shell(name, rings, mat, sides=36):
    """Closed trouser pelvis with a lowered front/rear inseam saddle at the crotch."""
    if len(rings) < 5:
        raise ValueError(f"tailored pelvis needs at least five rings: {name}")
    verts = []
    for z, radius_x, radius_y, centre_y, saddle_depth in rings:
        for index in range(sides):
            angle = math.tau * index / sides
            x = math.cos(angle) * radius_x
            y = centre_y + math.sin(angle) * radius_y
            centre_weight = max(0.0, 1.0 - abs(x) / (radius_x * 0.72)) ** 2
            verts.append((x, y, z - saddle_depth * centre_weight))
    faces = []
    for ring_index in range(len(rings) - 1):
        start = ring_index * sides
        nxt_start = start + sides
        for side_index in range(sides):
            nxt = (side_index + 1) % sides
            faces.append((start + side_index, start + nxt, nxt_start + nxt, nxt_start + side_index))
    faces.append(tuple(reversed(range(sides))))
    final = (len(rings) - 1) * sides
    faces.append(tuple(final + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.003, 2)
    set_material(obj, mat)
    obj["authored_ring_count"] = len(rings)
    obj["inseam_saddle_depth"] = float(rings[-1][-1])
    return obj


def skinned_trouser_shell(name, side, rings, mat, rig, sides=18):
    """One continuous jogger leg with gathered folds and blended thigh/shin weights."""
    if side not in (-1, 1) or len(rings) != 12:
        raise ValueError(f"invalid continuous trouser contract: {name}")
    centres = [Vector(ring[0]) for ring in rings]
    verts = []
    for ring_index, (_, radius_across, radius_depth, fold_amp, phase) in enumerate(rings):
        centre = centres[ring_index]
        if ring_index == 0:
            tangent = (centres[1] - centres[0]).normalized()
        elif ring_index == len(rings) - 1:
            tangent = (centres[-1] - centres[-2]).normalized()
        else:
            tangent = (centres[ring_index + 1] - centres[ring_index - 1]).normalized()
        helper = Vector((0, 1, 0)) if abs(tangent.y) < 0.92 else Vector((1, 0, 0))
        across = tangent.cross(helper).normalized()
        depth = across.cross(tangent).normalized()
        for side_index in range(sides):
            angle = math.tau * side_index / sides
            radial = fold_amp * (0.55 + 0.45 * math.cos(3.0 * angle + phase))
            y_gather = 0.35 * fold_amp * math.sin(2.0 * angle + phase)
            z_gather = 0.45 * fold_amp * math.sin(3.0 * angle + phase) if 5 <= ring_index <= 10 else 0.0
            point = (centre
                     + across * math.cos(angle) * (radius_across + radial)
                     + depth * math.sin(angle) * (radius_depth + radial))
            point.y += y_gather
            point.z += z_gather
            verts.append(point)
    faces = []
    for ring_index in range(len(rings) - 1):
        start = ring_index * sides
        nxt_start = start + sides
        for side_index in range(sides):
            nxt = (side_index + 1) % sides
            faces.append((start + side_index, start + nxt, nxt_start + nxt, nxt_start + side_index))
    faces.append(tuple(reversed(range(sides))))
    final = (len(rings) - 1) * sides
    faces.append(tuple(final + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)

    suffix = "L" if side > 0 else "R"
    groups = [
        obj.vertex_groups.new(name="hips"),
        obj.vertex_groups.new(name=f"thigh.{suffix}"),
        obj.vertex_groups.new(name=f"shin.{suffix}"),
    ]
    ring_weights = (
        (0.30, 0.70, 0.0), (0.10, 0.90, 0.0),
        (0.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 1.0, 0.0),
        (0.0, 0.90, 0.10), (0.0, 0.65, 0.35), (0.0, 0.35, 0.65),
        (0.0, 0.08, 0.92), (0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 0.0, 1.0),
    )
    for ring_index, weights in enumerate(ring_weights):
        indices = list(range(ring_index * sides, (ring_index + 1) * sides))
        for group, weight in zip(groups, weights):
            if weight > 0:
                group.add(indices, weight, "REPLACE")
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "OBJECT"
    obj.matrix_world = world
    modifier = obj.modifiers.new("LuxuryTrouserArmature", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    obj["authored_ring_count"] = len(rings)
    obj["circumferential_sides"] = sides
    obj["connected_component_count"] = 1
    obj["knee_blend_length"] = float(rings[5][0][2] - rings[7][0][2])
    obj["max_fold_amplitude"] = max(float(ring[3]) for ring in rings)
    return obj


def wrapped_cargo_panel(name, side, centre, width, height, projection, mat, columns=6, rows=6):
    """Closed pocket/flap patch wrapped around the outer-front thigh quadrant."""
    normal = Vector((0.76 * side, -0.65, 0)).normalized()
    tangent = Vector((0.65 * side, 0.76, 0)).normalized()
    centre = Vector(centre)
    verts = []
    for layer in (0, 1):
        for row in range(rows):
            v = (row / (rows - 1) - 0.5) * height
            for column in range(columns):
                u_norm = column / (columns - 1) * 2.0 - 1.0
                u = u_norm * width * 0.5
                wrap = 0.007 * u_norm * u_norm
                bulge = projection * (0.34 + 0.66 * (1.0 - u_norm * u_norm) *
                                      math.sin(math.pi * row / (rows - 1)))
                depth = 0.0015 if layer == 0 else bulge
                verts.append(centre + tangent * u + Vector((0, 0, v)) + normal * (depth - wrap))
    layer_stride = rows * columns
    faces = []
    for layer in (0, 1):
        base = layer * layer_stride
        reverse = layer == 0
        for row in range(rows - 1):
            for column in range(columns - 1):
                indices = (base + row * columns + column,
                           base + row * columns + column + 1,
                           base + (row + 1) * columns + column + 1,
                           base + (row + 1) * columns + column)
                faces.append(tuple(reversed(indices)) if reverse else indices)
    for row, columns_range in ((0, range(columns - 1)), (rows - 1, range(columns - 1))):
        for column in columns_range:
            a = row * columns + column
            b = a + 1
            faces.append((a, layer_stride + a, layer_stride + b, b))
    for column in (0, columns - 1):
        for row in range(rows - 1):
            a = row * columns + column
            b = (row + 1) * columns + column
            faces.append((a, b, layer_stride + b, layer_stride + a))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.002, 2)
    set_material(obj, mat)
    obj["wrapped_projection"] = projection
    obj["surface_columns"] = columns
    obj["surface_rows"] = rows
    return obj


def longitudinal_shoe_shell(name, centre_x, sections, mat, perimeter_sides=16, bevel_width=0.0):
    """Rounded longitudinal footwear loft with independent width, floor and crown per section."""
    if len(sections) < 4 or perimeter_sides < 12:
        raise ValueError(f"invalid footwear loft: {name}")
    verts = []
    exponent = 3.4
    for y, half_width, bottom_z, top_z in sections:
        centre_z = (bottom_z + top_z) * 0.5
        half_height = (top_z - bottom_z) * 0.5
        for index in range(perimeter_sides):
            angle = math.tau * index / perimeter_sides
            cos_value, sin_value = math.cos(angle), math.sin(angle)
            x_local = math.copysign(abs(cos_value) ** (2.0 / exponent), cos_value) * half_width
            z_local = math.copysign(abs(sin_value) ** (2.0 / exponent), sin_value) * half_height
            verts.append((centre_x + x_local, y, centre_z + z_local))
    faces = []
    for section_index in range(len(sections) - 1):
        start = section_index * perimeter_sides
        nxt_start = start + perimeter_sides
        for side_index in range(perimeter_sides):
            nxt = (side_index + 1) % perimeter_sides
            faces.append((start + side_index, start + nxt, nxt_start + nxt, nxt_start + side_index))
    faces.append(tuple(reversed(range(perimeter_sides))))
    final = (len(sections) - 1) * perimeter_sides
    faces.append(tuple(final + index for index in range(perimeter_sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    if bevel_width:
        bevel(obj, bevel_width, 2)
    set_material(obj, mat)
    obj["longitudinal_sections"] = len(sections)
    obj["authored_length"] = abs(float(sections[-1][0] - sections[0][0]))
    obj["authored_width"] = max(float(section[1]) for section in sections) * 2.0
    obj["authored_min_z"] = min(float(section[2]) for section in sections)
    obj["authored_max_z"] = max(float(section[3]) for section in sections)
    return obj


def open_padded_collar(name, centre_x, rings, wall, mat, sides=24):
    """Open, padded high-top collar with separate outer and inner walls."""
    verts = []
    for y, z, radius_x, front_depth, back_depth in rings:
        for inner in (False, True):
            inset = wall if inner else 0.0
            rx = radius_x - inset
            front = front_depth - inset
            back = back_depth - inset
            for index in range(sides):
                angle = math.tau * index / sides
                sin_value = math.sin(angle)
                depth = front if sin_value < 0 else back
                verts.append((centre_x + math.cos(angle) * rx, y + sin_value * depth, z))
    faces = []
    ring_stride = sides * 2
    for ring_index in range(len(rings) - 1):
        current = ring_index * ring_stride
        nxt_ring = current + ring_stride
        for side_index in range(sides):
            nxt = (side_index + 1) % sides
            faces.append((current + side_index, current + nxt,
                          nxt_ring + nxt, nxt_ring + side_index))
            inner = current + sides
            nxt_inner = nxt_ring + sides
            faces.append((inner + side_index, nxt_inner + side_index,
                          nxt_inner + nxt, inner + nxt))
    for ring_index in (0, len(rings) - 1):
        base = ring_index * ring_stride
        for side_index in range(sides):
            nxt = (side_index + 1) % sides
            faces.append((base + side_index, base + sides + side_index,
                          base + sides + nxt, base + nxt))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel(obj, 0.0035, 2)
    set_material(obj, mat)
    obj["collar_ring_count"] = len(rings)
    obj["collar_wall"] = wall
    obj["collar_open_top"] = True
    return obj


def lofted_limb_shell(name, rings, mat, sides=18):
    """Continuous garment limb with wrinkle-bearing intermediate cross-sections.

    Each ring is ``((x, y, z), radius_across, radius_depth)``. Cross-sections
    stay perpendicular to the sampled centreline, avoiding rotated cylinders.
    """
    if len(rings) < 3:
        raise ValueError(f"garment limb needs at least three rings: {name}")
    centres = [Vector(ring[0]) for ring in rings]
    verts = []
    for index, (centre, radius_across, radius_depth) in enumerate(
            (centres[i], rings[i][1], rings[i][2]) for i in range(len(rings))):
        if index == 0:
            tangent = (centres[1] - centres[0]).normalized()
        elif index == len(centres) - 1:
            tangent = (centres[-1] - centres[-2]).normalized()
        else:
            tangent = (centres[index + 1] - centres[index - 1]).normalized()
        helper = Vector((0, 1, 0)) if abs(tangent.y) < 0.92 else Vector((1, 0, 0))
        across = tangent.cross(helper).normalized()
        depth = across.cross(tangent).normalized()
        for side_index in range(sides):
            angle = math.tau * side_index / sides
            verts.append(centre + across * math.cos(angle) * radius_across
                         + depth * math.sin(angle) * radius_depth)
    faces = []
    for ring_index in range(len(rings) - 1):
        start = ring_index * sides
        nxt_start = start + sides
        for side_index in range(sides):
            nxt = (side_index + 1) % sides
            faces.append((start + side_index, start + nxt, nxt_start + nxt, nxt_start + side_index))
    faces.append(tuple(reversed(range(sides))))
    final = (len(rings) - 1) * sides
    faces.append(tuple(final + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, min(ring[1] for ring in rings) * 0.035, 2)
    set_material(obj, mat)
    return obj


def tapered_lock(name, points, radii, mat, sides=10, thickness_ratio=0.46):
    """Build one continuous, flattened and tapered hair ribbon along a curved guide."""
    if len(points) != len(radii) or len(points) < 2:
        raise ValueError(f"invalid tapered hair guide: {name}")
    path = [Vector(point) for point in points]
    verts = []
    for index, (centre, radius) in enumerate(zip(path, radii)):
        if index == 0:
            tangent = (path[1] - path[0]).normalized()
        elif index == len(path) - 1:
            tangent = (path[-1] - path[-2]).normalized()
        else:
            tangent = (path[index + 1] - path[index - 1]).normalized()
        helper = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((0, 1, 0))
        side = tangent.cross(helper).normalized()
        up = side.cross(tangent).normalized()
        for ring_index in range(sides):
            angle = math.tau * ring_index / sides
            verts.append(centre + side * math.cos(angle) * radius
                         + up * math.sin(angle) * radius * thickness_ratio)
    faces = []
    for path_index in range(len(path) - 1):
        start = path_index * sides
        nxt_start = (path_index + 1) * sides
        for ring_index in range(sides):
            nxt = (ring_index + 1) % sides
            faces.append((start + ring_index, start + nxt, nxt_start + nxt, nxt_start + ring_index))
    faces.append(tuple(reversed(range(sides))))
    last = (len(path) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    subdivision = obj.modifiers.new("LuxuryHairGuideSmooth", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    obj.select_set(False)
    set_material(obj, mat)
    return obj


def nose_wedge(name, mat):
    """Integrated bridge/tip wedge, embedded into the face shell at its back."""
    verts = [
        (-0.010, -0.112, 1.662), (0.010, -0.112, 1.662),
        (-0.013, -0.134, 1.616), (0.013, -0.134, 1.616),
        (-0.018, -0.145, 1.594), (0.018, -0.145, 1.594),
        (0.0, -0.151, 1.602),
    ]
    faces = [
        (0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 6),
        (0, 2, 4, 6), (1, 6, 5, 3), (0, 6, 1),
    ]
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.003, 2)
    set_material(obj, mat)
    return obj


def nose_profile(name, sections, mat):
    """Closed bridge-to-tip volume with a continuous embedded rear seam."""
    verts = []
    for z, half_width, front_y, back_y in sections:
        verts.extend(((-half_width, front_y, z), (half_width, front_y, z),
                      (half_width, back_y, z), (-half_width, back_y, z)))
    faces = []
    for section_index in range(len(sections) - 1):
        start = section_index * 4
        nxt = start + 4
        faces.extend(((start, nxt, nxt + 1, start + 1),
                      (start + 1, nxt + 1, nxt + 2, start + 2),
                      (start + 2, nxt + 2, nxt + 3, start + 3),
                      (start + 3, nxt + 3, nxt, start)))
    faces.extend(((0, 3, 2, 1), tuple(range(len(verts) - 4, len(verts)))))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.0025, 3)
    set_material(obj, mat)
    return obj


def almond_eye(name, side, mat):
    """Small closed almond lens; the outer corner is subtly lifted."""
    if side not in (-1, 1):
        raise ValueError(f"invalid eye side: {side}")
    outline = [
        (0.021 * side, -0.128, 1.653),
        (0.043 * side, -0.131, 1.660),
        (0.067 * side, -0.126, 1.657),
        (0.043 * side, -0.131, 1.648),
    ]
    back = [(x, -0.115, z) for x, _, z in outline]
    verts = outline + back
    faces = [(0, 1, 2, 3), (4, 7, 6, 5)]
    for index in range(4):
        nxt = (index + 1) % 4
        faces.append((index, nxt, 4 + nxt, 4 + index))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.0012, 2)
    set_material(obj, mat)
    return obj


def lip_ribbon(name, outer, seam, mat):
    """Shallow closed lip surface, avoiding the inflated look of a tube curve."""
    if len(outer) != len(seam) or len(outer) < 3:
        raise ValueError(f"invalid lip contour: {name}")
    outline = list(outer) + list(reversed(seam))
    back = [(x, y + 0.004, z) for x, y, z in outline]
    verts = outline + back
    count = len(outline)
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.0008, 2)
    set_material(obj, mat)
    return obj


def beam(name, start, end, width, depth, mat, bevel_width=0.003):
    """Create a rectangular bmesh beam directly between endpoints—no Euler cylinder rotation."""
    a, b = Vector(start), Vector(end)
    direction = b - a
    if direction.length < 1e-6:
        raise ValueError(f"zero-length beam: {name}")
    tangent = direction.normalized()
    helper = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((0, 1, 0))
    side = tangent.cross(helper).normalized() * width * 0.5
    up = side.cross(tangent).normalized() * depth * 0.5
    verts = [a + sx * side + sy * up for a in (a, b) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if bevel_width:
        bevel(obj, min(bevel_width, width * 0.28, depth * 0.28), 2)
    set_material(obj, mat)
    return obj


def ribbon_strip(name, points, width, depth, mat):
    """Closed tangent-aligned ribbon whose shallow depth follows the garment surface."""
    path = [Vector(point) for point in points]
    if len(path) < 3:
        raise ValueError(f"ribbon needs at least three points: {name}")
    front_normal = Vector((0, -1, 0))
    verts = []
    for index, centre in enumerate(path):
        if index == 0:
            tangent = (path[1] - path[0]).normalized()
        elif index == len(path) - 1:
            tangent = (path[-1] - path[-2]).normalized()
        else:
            tangent = (path[index + 1] - path[index - 1]).normalized()
        width_axis = tangent.cross(front_normal)
        if width_axis.length < 1e-6:
            width_axis = Vector((1, 0, 0))
        else:
            width_axis.normalize()
        half_width = width_axis * width * 0.5
        half_depth = front_normal * depth * 0.5
        verts.extend((
            centre - half_width + half_depth,
            centre + half_width + half_depth,
            centre + half_width - half_depth,
            centre - half_width - half_depth,
        ))
    faces = []
    for index in range(len(path) - 1):
        start = index * 4
        nxt = start + 4
        faces.extend((
            (start, nxt, nxt + 1, start + 1),
            (start + 1, nxt + 1, nxt + 2, start + 2),
            (start + 2, nxt + 2, nxt + 3, start + 3),
            (start + 3, nxt + 3, nxt, start),
        ))
    faces.extend(((0, 1, 2, 3), tuple(reversed(range((len(path) - 1) * 4, len(path) * 4)))))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    obj["authored_path_points"] = len(path)
    chord = path[-1] - path[0]
    obj["curve_deviation"] = max(
        ((point - path[0]) - chord * ((point - path[0]).dot(chord) / chord.length_squared)).length
        for point in path[1:-1]
    )
    return obj


def tapered_beam(name, start, end, radius_start, radius_end, mat, sides=12):
    """Capped tapered bmesh beam for garment limbs, boots, and hair masses."""
    a, b = Vector(start), Vector(end)
    tangent = (b - a).normalized()
    helper = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((0, 1, 0))
    side = tangent.cross(helper).normalized()
    up = side.cross(tangent).normalized()
    verts = []
    for center, radius in ((a, radius_start), (b, radius_end)):
        for index in range(sides):
            angle = math.tau * index / sides
            verts.append(center + (side * math.cos(angle) + up * math.sin(angle)) * radius)
    faces = []
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((index, nxt, sides + nxt, sides + index))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(sides, sides * 2)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, min(radius_start, radius_end) * 0.12, 3)
    set_material(obj, mat)
    return obj


def tube_curve(name, points, radius, mat, cyclic=False, resolution=2):
    curve_data = bpy.data.curves.new(name + "_Curve", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = resolution
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    return obj


def torus(name, location, major_radius, minor_radius, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius, minor_radius=minor_radius,
        major_segments=20, minor_segments=8, location=location, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    apply_scale(obj)
    set_material(obj, mat)
    return obj


def bone_parent(obj, rig, bone_name: str) -> None:
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    # Preserve authored world transform after setting the bone parent. Assigning a
    # hand-built inverse while leaving matrix_basis untouched double-applies the bone
    # offset and is the classic source of exploded garment assemblies.
    obj.matrix_world = world


def apply_reference_pose(rig):
    """Apply a reversible editor/review pose without changing the neutral bind skeleton."""
    pose_bones = rig.pose.bones
    pose_snapshot = {
        pose_bone.name: (pose_bone.matrix_basis.copy(), pose_bone.rotation_mode)
        for pose_bone in pose_bones
    }
    for pose_bone in pose_bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.location = (0, 0, 0)
        pose_bone.rotation_euler = (0, 0, 0)
        pose_bone.scale = (1, 1, 1)

    # Reference-facing turn: local Y follows these near-vertical bone axes, so it is yaw.
    pose_bones["chest"].rotation_euler.y = math.radians(-8)
    pose_bones["chest"].rotation_euler.z = math.radians(-3)
    pose_bones["neck"].rotation_euler.y = math.radians(-4)
    pose_bones["head"].rotation_euler.y = math.radians(-8)

    # Restrained planted contrapposto keeps the sole spacing stable while the
    # torso and hip tilts break the former mirrored stance.
    pose_bones["hips"].location.x = 0.035
    pose_bones["hips"].rotation_euler.z = math.radians(4.0)
    for name, rotation in {
        "thigh.L": (0, 0, -0.5), "shin.L": (0, 0, 0), "foot.L": (0, 0, 0),
        "thigh.R": (-4, 0, 2.5), "shin.R": (8, 0, -1), "foot.R": (-4, 0, 0),
    }.items():
        pose_bones[name].rotation_euler = tuple(math.radians(value) for value in rotation)
    bpy.context.view_layer.update()

    # All following controls and constraints are review-only and are removed
    # before the neutral blend is saved or exported.
    controls = []
    constraints = []

    # The chest turn makes the posed shoulders asymmetric in world space, so
    # the reach-safe review controls are solved per side rather than mirrored
    # guesses.  Each wrist remains near 85% of the 0.43454 m arm-chain reach.
    arm_pose = {
        "L": {
            "wrist": (.190, -.040, 1.035),
            "pole": (.322256, .065619, 1.122189),
            "pole_angle": 3.132866,
            "insert": (.280, .020, .879),
        },
        "R": {
            "wrist": (-.190, -.020, 1.035),
            "pole": (-.317884, .110185, 1.126425),
            "pole_angle": .008727,
            "insert": (-.280, .040, .879),
        },
    }

    for suffix, sign in (("L", 1), ("R", -1)):
        solved = arm_pose[suffix]
        target = bpy.data.objects.new(f"LuxuryReview_arm_target_{suffix}", None)
        # Keep the wrist inside ninety percent of the two-bone arm reach.  The
        # unusually long authored hand supplies the remaining pocket depth;
        # forcing the wrist itself to the trouser opening makes both elbows
        # fold across the chest.
        target.location = solved["wrist"]
        target.empty_display_type = "SPHERE"
        target.empty_display_size = 0.018
        target["pocket_mouth_x"] = .160 * sign
        target["wrist_lateral_offset"] = .030
        target["max_chain_reach_fraction"] = .90
        bpy.context.collection.objects.link(target)
        pole = bpy.data.objects.new(f"LuxuryReview_arm_pole_{suffix}", None)
        pole.location = solved["pole"]
        pole.empty_display_type = "PLAIN_AXES"
        pole.empty_display_size = 0.05
        pole["elbow_abduction_target_degrees"] = 14.0
        bpy.context.collection.objects.link(pole)
        constraint = pose_bones[f"forearm.{suffix}"].constraints.new("IK")
        constraint.name = f"LuxuryReferencePose_arm_{suffix}"
        constraint.target = target
        constraint.pole_target = pole
        constraint.chain_count = 2
        constraint.use_tail = True
        constraint.use_stretch = False
        constraint.pole_angle = solved["pole_angle"]
        # Aim the long hand down, inward, and behind the trouser front.  Only
        # the short dorsal wedge above the waistband should remain exposed.
        insert = bpy.data.objects.new(f"LuxuryReview_hand_insert_{suffix}", None)
        insert.location = solved["insert"]
        insert.empty_display_type = "CUBE"
        insert.empty_display_size = .014
        insert["hand_insert_fraction"] = .80
        bpy.context.collection.objects.link(insert)
        hand_constraint = pose_bones[f"hand.{suffix}"].constraints.new("DAMPED_TRACK")
        hand_constraint.name = f"LuxuryReferencePose_hand_{suffix}"
        hand_constraint.target = insert
        hand_constraint.track_axis = "TRACK_Y"
        # The authored stylized hand chain is 274 mm long.  Compress only its
        # review-pose longitudinal axis so the pocket leaves a realistic
        # 45–60 mm dorsal wedge; cleanup restores the exact neutral matrix.
        pose_bones[f"hand.{suffix}"].scale.y = .20
        controls.extend((target, pole, insert))
        constraints.append((pose_bones[f"forearm.{suffix}"], constraint))
        constraints.append((pose_bones[f"hand.{suffix}"], hand_constraint))
    bpy.context.view_layer.update()
    for suffix in ("L", "R"):
        upper = pose_bones[f"upperarm.{suffix}"]
        forearm = pose_bones[f"forearm.{suffix}"]
        shoulder, elbow, wrist = upper.head.copy(), forearm.head.copy(), forearm.tail.copy()
        elbow_flex = 180.0 - math.degrees((shoulder - elbow).angle(wrist - elbow))
        abduction = math.degrees((elbow - shoulder).angle(Vector((0, 0, -1))))
        print(f"LUXURY_REFERENCE_ARM side={suffix} elbowFlex={elbow_flex:.2f} "
              f"abduction={abduction:.2f} wrist={tuple(round(v, 4) for v in wrist)}")
    return controls, constraints, pose_snapshot


def clear_reference_pose(rig, pose_state) -> None:
    controls, constraints, pose_snapshot = pose_state
    for pose_bone, constraint in constraints:
        pose_bone.constraints.remove(constraint)
    for control in controls:
        bpy.data.objects.remove(control, do_unlink=True)
    for pose_bone in rig.pose.bones:
        matrix_basis, rotation_mode = pose_snapshot[pose_bone.name]
        pose_bone.rotation_mode = rotation_mode
        pose_bone.matrix_basis = matrix_basis
    bpy.context.view_layer.update()


def build_face(rig, mats, owned):
    head_owned = []
    def face_anchor(name):
        anchor = bpy.data.objects.new(name, None)
        anchor.empty_display_type = "PLAIN_AXES"
        anchor.empty_display_size = .003
        anchor["editorProxyFor"] = PREFIX + "skin_face_shell"
        bpy.context.collection.objects.link(anchor)
        return anchor

    # The front half is a feature-aligned grid rather than an ellipse, so the
    # ocular and perioral planes remain broad enough for integrated anatomy.
    # Envelope rows are (z, half width, front mid Y, side Y, rear Y).
    face = integrated_face_volume(PREFIX + "skin_face_shell", FACIAL_ENVELOPE_ROWS, mats, 112)
    head_owned.append(face)
    for side in (-1, 1):
        ear = ellipsoid(PREFIX + f"skin_ear_{side:+d}", (0.102 * side, -0.001, 1.623), (0.028, 0.046, 0.064), mats["skin"], 24, 16)
        # Pass 17 keeps the accepted 64 mm IPD while making the ocular
        # assembly truly bilateral.  Both irises sit on their eye centres;
        # the prior global X offset made the pupils read as floating points.
        eye_x = 0.032 * side
        gaze_x = eye_x
        gaze_surface = ocular_surface_y(gaze_x, 1.657)
        eye = almond_insert(PREFIX + f"accent_eye_{side:+d}", side,
                            (eye_x, gaze_surface, 1.657),
                            0.042, 0.0130, 0.0035, mats["eye"], 40)
        iris = ellipsoid(PREFIX + f"accent_iris_{side:+d}",
                         (gaze_x, gaze_surface - 0.00140, 1.657),
                         (0.0105, 0.0014, 0.0100), mats["iris"], 28, 18)
        pupil = ellipsoid(PREFIX + f"accent_pupil_{side:+d}",
                          (gaze_x, gaze_surface - 0.00170, 1.657),
                          (0.0045, 0.0009, 0.0045), mats["pupil"], 24, 14)
        # Registered skin ribbons replace the former non-rendering lid
        # placeholders.  Their inner edges overlap the sclera while their
        # outer edges disappear into the socket, so the opening reads as an
        # almond instead of a glowing horizontal card.
        upper_lid = ocular_lid_ribbon(PREFIX + f"skin_upper_lid_{side:+d}", side, True,
                                      (eye_x, gaze_surface, 1.657), mats["skin"], 20)
        lower_lid = ocular_lid_ribbon(PREFIX + f"skin_lower_lid_{side:+d}", side, False,
                                      (eye_x, gaze_surface, 1.657), mats["skin"], 20)

        # A seven-section tapered brow supplies the 40 mm reference arc.
        # Cross-sections are deliberately shallow in Y and taller in Z, which
        # keeps the hair embedded in the forehead without the old blocky tube.
        brow_points = []
        for u in (-1.0, -0.5, 0.0, 0.5, 1.0):
            x = eye_x + side * .020 * u
            aperture_u = (.020 / .021) * u
            upper_z = (1.657
                       + .006 * max(0.0, 1.0 - aperture_u * aperture_u) ** .72
                       + math.tan(math.radians(4.0)) * side * (x - eye_x))
            z = upper_z + .0115 + .0010 * (1.0 - u * u)
            brow_points.append((x, ocular_surface_y(x, z) - .0012, z))
        brow = tapered_lock(PREFIX + f"hair_brow_{side:+d}", brow_points,
                            (.0011, .0017, .0020, .0016, .0006),
                            mats["hair"], sides=8, thickness_ratio=.55)
        brow["authored_span"] = 0.040
        brow["tapered_brow"] = True
        brow["lid_clearance"] = 0.0115
        head_owned += [ear, eye, iris, pupil, upper_lid, lower_lid, brow]

    # Preserve public editor node names as non-rendering anchors.  Their visible
    # relief and colour are now authored directly on skin_face_shell.
    head_owned += [face_anchor(PREFIX + name) for name in (
        "accent_upper_lip", "accent_lower_lip", "accent_mouth_seam",
        "accent_nostril_-1", "accent_nostril_+1",
    )]

    # A dedicated tapered overlay supplies the visible neck between the open collar
    # and the raised jaw. It remains on the neck bone, while every facial landmark
    # and hair object moves together on the head bone.
    neck = lofted_volume(PREFIX + "skin_neck_shell", [
        (1.430, 0.064, 0.060, -0.002, 2.0),
        (1.455, 0.060, 0.057, -0.003, 2.0),
        (1.495, 0.054, 0.052, -0.004, 2.0),
        (1.535, 0.049, 0.048, -0.006, 2.0),
        (1.580, 0.044, 0.045, -0.008, 2.0),
    ], mats["skin"], 32)
    bone_parent(neck, rig, "neck")
    owned.append(neck)
    for side in (-1, 1):
        scm = tube_curve(PREFIX + f"skin_neck_scm_{side:+d}", [
            (0.033 * side, -0.049, 1.522), (0.037 * side, -0.050, 1.480),
            (0.046 * side, -0.043, 1.438),
        ], 0.0022, mats["skin"])
        bone_parent(scm, rig, "neck")
        owned.append(scm)
    for obj in head_owned:
        obj.location.z += HEAD_RAISE
    bpy.context.view_layer.update()
    for obj in head_owned:
        bone_parent(obj, rig, "head")
    owned += head_owned


def build_hair(rig, mats):
    owned = []
    cap_location = (0.004, 0.018, 1.718)
    cap_dimensions = (0.226, 0.184, 0.136)
    cap = ellipsoid(PREFIX + "hair_swept_cap", cap_location, cap_dimensions, mats["hair"], 40, 28)
    owned.append(cap)
    half = tuple(value * .5 for value in cap_dimensions)

    def embedded_root(x, y, q=.875):
        planar = ((x - cap_location[0]) / half[0]) ** 2 + ((y - cap_location[1]) / half[1]) ** 2
        if planar >= q * q:
            raise RuntimeError(f"hair root outside cap support x={x:.3f} y={y:.3f}")
        z = cap_location[2] + half[2] * math.sqrt(q * q - planar)
        return (x, y, z)

    # Side-parted crown families: every endpoint, rise and depth differs, producing broad
    # interlocking S-waves instead of the previous evenly spaced rope crest.
    crown_specs = [
        (( .084,-.020),(-.072,-.055),.080,.052), (( .070,-.038),(-.102,-.062),.084,.056),
        (( .052,-.052),(-.132,-.058),.086,.058), (( .030,-.058),(-.151,-.046),.083,.054),
        (( .006,-.056),(-.156,-.026),.078,.050), ((-.020,-.046),(-.148,-.002),.073,.045),
        (( .076, .002),(-.058,-.020),.076,.048), (( .050, .026),(-.087, .004),.073,.044),
        (( .018, .046),(-.103, .028),.068,.038), ((-.022, .054),(-.116, .058),.060,.030),
        (( .086, .026),( .095, .082),.048,-.006), ((-.074, .038),(-.106, .088),.046,-.010),
    ]
    primary_guides = []
    for index, ((root_x, root_y), (end_x, end_y), rise, end_rise) in enumerate(crown_specs):
        root = embedded_root(root_x, root_y)
        mid_x, mid_y = (root_x + end_x) * .5, (root_y + end_y) * .5
        points = (
            root,
            (root_x + .006, root_y - .012, root[2] + rise * .28),
            (root_x - .018, root_y - .027, root[2] + rise * .68),
            (mid_x + (.010 if index % 2 == 0 else -.006), mid_y - .030, root[2] + rise),
            (end_x + .024, end_y - .014, root[2] + rise * .88),
            (end_x, end_y, root[2] + end_rise),
        )
        primary_guides.append(points)

    fringe_specs = [
        (( .072,-.045),(-.052,-.107),-.030), (( .052,-.052),(-.082,-.112),-.036),
        (( .028,-.056),(-.108,-.101),-.025), (( .004,-.056),(-.128,-.082),-.012),
    ]
    for index, ((root_x, root_y), (end_x, end_y), end_drop) in enumerate(fringe_specs):
        root = embedded_root(root_x, root_y, .940)
        points = (
            root,
            (root_x + .004, root_y - .016, root[2] + .028),
            (root_x - .018, root_y - .033, root[2] + .048),
            ((root_x + end_x) * .5, (root_y + end_y) * .5 - .025, root[2] + .036),
            (end_x + .024, end_y - .012, root[2] + .006),
            (end_x, end_y, root[2] + end_drop),
        )
        primary_guides.append(points)

    for index, points in enumerate(primary_guides):
        root_radius = (.018 if index >= 12 else .022) + .003 * ((index * 5) % 4) / 3
        radii = (root_radius, root_radius * 1.14, root_radius * 1.08,
                 root_radius * .88, root_radius * .56, .004)
        owned.append(tapered_lock(PREFIX + f"hair_quiff_lock_{index:02d}", points, radii,
                                  mats["hair"], sides=12, thickness_ratio=.78 + .05 * (index % 3)))

    # Twenty-four smaller locks braid between the primary masses and break up repeated edges.
    for index in range(24):
        source = primary_guides[index % len(primary_guides)]
        offset = (index // len(primary_guides) + 1) * (.003 if index % 2 == 0 else -.003)
        points = []
        for point_index, point in enumerate(source):
            t = point_index / (len(source) - 1)
            wave = math.sin(math.pi * t) * (.004 + .001 * (index % 3))
            points.append((point[0] + offset + wave * (-1 if index % 3 == 0 else 1),
                           point[1] + offset * .7, point[2] - .004 + wave * .35))
        radii = (.0060, .0068, .0060, .0047, .0031, .0018)
        owned.append(tapered_lock(PREFIX + f"hair_secondary_lock_{index:02d}", points, radii,
                                  mats["hair"], sides=8, thickness_ratio=.62))

    for obj in owned:
        obj.location.z += HEAD_RAISE
        compress_head_height(obj)
    bpy.context.view_layer.update()
    for obj in owned:
        bone_parent(obj, rig, "head")
    # Preserve all five legacy quiff node handles beyond the sixteen visible primaries.
    for index in range(16, 21):
        proxy = bpy.data.objects.new(PREFIX + f"hair_quiff_lock_{index:02d}", None)
        proxy["editorProxyFor"] = PREFIX + f"hair_quiff_lock_{index % 16:02d}"
        proxy.empty_display_type = "PLAIN_AXES"
        proxy.empty_display_size = .005
        bpy.context.collection.objects.link(proxy)
        bone_parent(proxy, rig, "head")
        owned.append(proxy)
    return owned


def build_hair_layered(rig, mats):
    """Asymmetric side-parted swept hair with support, contour and silhouette layers."""
    owned = []
    centre = Vector((.003, .022, 1.724))
    radii = Vector((.116, .101, .079))
    azimuth_samples = 36
    elevation_bands = 9

    def angle_delta(a, b):
        return (a - b + math.pi) % math.tau - math.pi

    def cap_point(a, e, q):
        part = .045 * math.exp(-(angle_delta(a, math.radians(-52)) ** 2) / (2 * .10 ** 2)) * \
            math.exp(-((e - math.radians(30)) ** 2) / (2 * .55 ** 2))
        smooth = max(0.0, min(1.0, (e - math.radians(20)) / math.radians(62)))
        smooth = smooth * smooth * (3.0 - 2.0 * smooth)
        return Vector((
            centre.x + q * (1.0 - part) * radii.x * math.cos(e) * math.cos(a) - .004 * smooth,
            centre.y + q * (1.0 - part) * radii.y * math.cos(e) * math.sin(a),
            centre.z + q * radii.z * math.sin(e),
        ))

    cap_verts = []
    for band in range(elevation_bands):
        for azimuth in range(azimuth_samples):
            a = math.tau * azimuth / azimuth_samples
            e_min = math.radians(-22 - 16 * ((math.sin(a) + 1) * .5))
            e = e_min + (math.radians(82) - e_min) * band / (elevation_bands - 1)
            cap_verts.append(cap_point(a, e, 1.0))
    pole_index = len(cap_verts)
    cap_verts.append((centre.x - .004, centre.y, centre.z + radii.z))
    inner_start = len(cap_verts)
    for azimuth in range(azimuth_samples):
        a = math.tau * azimuth / azimuth_samples
        e_min = math.radians(-22 - 16 * ((math.sin(a) + 1) * .5))
        cap_verts.append(cap_point(a, e_min, .76))
    cap_faces = []
    for band in range(elevation_bands - 1):
        start = band * azimuth_samples
        nxt_start = start + azimuth_samples
        for azimuth in range(azimuth_samples):
            nxt = (azimuth + 1) % azimuth_samples
            cap_faces.append((start + azimuth, start + nxt, nxt_start + nxt, nxt_start + azimuth))
    top_start = (elevation_bands - 1) * azimuth_samples
    for azimuth in range(azimuth_samples):
        nxt = (azimuth + 1) % azimuth_samples
        cap_faces.append((top_start + azimuth, top_start + nxt, pole_index))
        cap_faces.append((azimuth, inner_start + azimuth, inner_start + nxt, nxt))
    cap_faces.append(tuple(reversed(range(inner_start, inner_start + azimuth_samples))))
    cap_mesh = bpy.data.meshes.new(PREFIX + "hair_swept_cap_Mesh")
    cap_mesh.from_pydata(cap_verts, [], cap_faces)
    cap_mesh.validate(verbose=True)
    cap_mesh.update()
    cap = bpy.data.objects.new(PREFIX + "hair_swept_cap", cap_mesh)
    bpy.context.collection.objects.link(cap)
    for polygon in cap_mesh.polygons:
        polygon.use_smooth = True
    set_material(cap, mats["hair"])
    cap["primaryLockCount"] = 14
    cap["secondaryLockCount"] = 26
    cap["sidePartAzimuthDeg"] = -52
    owned.append(cap)

    primary_rows = [
        (-62,6,.070,.025,.058,.019,.50),(-73,9,.076,.028,.064,.020,.52),
        (-84,12,.082,.030,.069,.021,.54),(-95,14,.087,.031,.073,.021,.56),
        (-106,15,.090,.032,.075,.0205,.55),(-117,14,.087,.030,.071,.020,.53),
        (-128,11,.081,.027,.064,.019,.50),(-139,7,.071,.023,.055,.018,.48),
        (-28,40,.075,.018,.058,.018,.48),(5,55,.073,.015,.060,.018,.47),
        (38,63,.068,.012,.052,.017,.46),(72,50,.060,.008,.045,.016,.45),
        (-151,4,.048,.010,.038,.016,.44),(-174,0,.038,.006,.027,.014,.42),
    ]
    primary_jitter = (0,.004,-.003,.006,-.005,.002,-.006,.004,.003,-.004,.005,-.002,.003,-.003)
    primary_factors = (1.00, 1.18, 1.15, .92, .62, .36)
    primary_points = []
    for index, (a_deg, e_deg, sweep, forward, lift, root_radius, thickness) in enumerate(primary_rows):
        root = cap_point(math.radians(a_deg), math.radians(e_deg), .875)
        displacements = (
            (0,0,0),(-.10*sweep,-.35*forward,.22*lift),(-.32*sweep,-.75*forward,.62*lift),
            (-.62*sweep,-1.00*forward,1.00*lift),(-.86*sweep,-.55*forward,.88*lift),
            (-1.00*sweep,.10*forward,.62*lift),
        )
        weights = (0,.2,.6,1,.6,0)
        points = tuple((root.x + dx, root.y + dy + weights[i] * primary_jitter[index], root.z + dz)
                       for i, (dx, dy, dz) in enumerate(displacements))
        lock = tapered_lock(PREFIX + f"hair_quiff_lock_{index:02d}", points,
                            tuple(root_radius * factor for factor in primary_factors),
                            mats["hair"], sides=12, thickness_ratio=thickness)
        lock["lockLayer"] = "primary"
        lock["guideIndex"] = index
        owned.append(lock)
        primary_points.append(points)

    secondary_rows = [
        (-70,-4,-.052,-.018,.006,.034,.013,.42),(-84,0,-.058,-.020,.008,.038,.014,.44),
        (-98,4,-.060,-.021,.009,.041,.014,.44),(-112,5,-.058,-.020,.008,.040,.0135,.43),
        (-126,2,-.052,-.018,.006,.035,.013,.42),(-140,-3,-.045,-.015,.004,.030,.012,.40),
        (-62,-8,-.045,-.018,-.018,.020,.012,.40),(-76,-5,-.050,-.020,-.012,.022,.0125,.41),
        (-90,-3,-.054,-.021,-.006,.024,.013,.42),(-104,-1,-.052,-.020,0,.025,.0125,.41),
        (-25,28,-.052,-.010,.010,.030,.0125,.42),(10,38,-.056,-.006,.012,.032,.013,.43),
        (45,46,-.054,-.002,.010,.030,.0125,.42),(80,40,-.047,.004,.006,.026,.012,.40),
        (115,28,-.038,.010,-.004,.020,.0115,.39),(145,15,-.032,.014,-.010,.016,.011,.38),
        (-38,-10,.030,.024,-.020,.012,.0115,.39),(-22,0,.034,.026,-.018,.013,.012,.40),
        (-6,10,.036,.027,-.015,.014,.012,.40),(10,18,.032,.026,-.012,.014,.0115,.39),
        (-150,-12,-.030,.025,-.025,.010,.011,.38),(-165,-8,-.027,.029,-.026,.009,.0105,.38),
        (178,-3,-.020,.032,-.024,.008,.0105,.38),(145,-12,-.016,.032,-.022,.008,.011,.38),
        (175,3,-.010,.036,-.018,.010,.0115,.39),(-165,12,-.020,.034,-.014,.012,.0115,.39),
    ]
    time_samples = (0,.24,.50,.76,1.0)
    secondary_factors = (1,1.10,.95,.66,.42)
    for index, (a_deg,e_deg,dx,dy,dz,height,root_radius,thickness) in enumerate(secondary_rows):
        root = cap_point(math.radians(a_deg), math.radians(e_deg), .86)
        jitter = .0015 * math.sin(index * 2.17)
        points = tuple((
            root.x + t * dx,
            root.y + t * dy + jitter * math.sin(math.tau * t),
            root.z + t * dz + height * math.sin(math.pi * t),
        ) for t in time_samples)
        name = (PREFIX + f"hair_quiff_lock_{index + 14:02d}") if index < 7 else \
            (PREFIX + f"hair_secondary_lock_{index:02d}")
        lock = tapered_lock(name, points, tuple(root_radius * factor for factor in secondary_factors),
                            mats["hair"], sides=8, thickness_ratio=thickness)
        lock["lockLayer"] = "secondary"
        lock["guideIndex"] = index
        owned.append(lock)

    # Three broad bridge waves close the crown into one continuous swept mass while
    # leaving only the intended narrow character-right part valley visible.
    for index, (a_deg, y_offset, lift) in enumerate(((-36, -.004, .074), (-48, .004, .080), (-58, .012, .070))):
        root = cap_point(math.radians(a_deg), math.radians(24 + index * 5), .87)
        points = (
            root,
            (root.x + .010, root.y - .014 + y_offset, root.z + .020),
            (root.x - .018, root.y - .032 + y_offset, root.z + lift * .68),
            (root.x - .060, root.y - .040 + y_offset, root.z + lift),
            (root.x - .112, root.y - .027 + y_offset, root.z + lift * .88),
            (root.x - .158, root.y - .004 + y_offset, root.z + lift * .58),
        )
        lock = tapered_lock(PREFIX + f"hair_bridge_lock_{index:02d}", points,
                            (.018,.022,.022,.019,.013,.005), mats["hair"],
                            sides=12, thickness_ratio=.58)
        lock["lockLayer"] = "primary-bridge"
        lock["guideIndex"] = index
        owned.append(lock)

    for obj in owned:
        obj.location.z += HEAD_RAISE
        compress_head_height(obj)
    bpy.context.view_layer.update()
    for obj in owned:
        bone_parent(obj, rig, "head")
    return owned


def build_shirt_and_bomber(rig, mats):
    owned = []
    torso_owned = []
    # Deep-V inner shirt: back/side shell plus two open front panels.
    owned.append(box(PREFIX + "top_black_back", (0, 0.005, 1.275), (0.2771, 0.165, 0.400), mats["black"], 0.025))
    for side in (-1, 1):
        panel = box(PREFIX + f"top_open_panel_{side:+d}", (0.0732 * side, -0.086, 1.275), (0.1155, 0.018, 0.400), mats["black"], 0.006)
        panel.rotation_euler.y = math.radians(-9 * side)
        apply_scale(panel)
        owned.append(panel)
        collar = beam(PREFIX + f"top_collar_{side:+d}", (0.0138 * side, -0.174, 1.43), (0.1081 * side, -0.168, 1.35), 0.0398, 0.015, mats["black"], 0.004)
        owned.append(collar)

    # A single U-shaped, closed-thickness loft replaces the former front-panel/back-slab
    # assembly.  It carries the same public jacket slot while reading as one bomber volume.
    jacket_back = rounded_open_bomber_shell(PREFIX + "jacket_back", [
        (1.515, .1450, .0860, -.005, .030, .000),
        (1.490, .1550, .0920, -.005, .030, .025),
        (1.445, .1580, .0950, -.005, .031, .020),
        (1.390, .1900, .0950, -.005, .031, .010),
        (1.330, .1980, .0950, -.005, .032, .000),
        (1.270, .2020, .0940, -.003, .032, .000),
        (1.205, .2050, .0930, -.001, .033, .000),
        (1.140, .2090, .0930,  .001, .034, .000),
        (1.080, .2125, .0925,  .002, .035, .000),
    ], mats["pearl"], samples=36, thickness=.008, rig=rig)
    owned.append(jacket_back)
    torso_owned.append(jacket_back)
    for side in (-1, 1):
        panel = bpy.data.objects.new(PREFIX + f"jacket_front_panel_{side:+d}", None)
        panel["editorProxyFor"] = jacket_back.name
        panel["authored_ring_count"] = 9
        panel.empty_display_type = "PLAIN_AXES"
        panel.empty_display_size = .01
        bpy.context.collection.objects.link(panel)
        owned.append(panel)
        torso_owned.append(panel)
        sleeve = skinned_sleeve_shell(PREFIX + f"jacket_upper_sleeve_{side:+d}", side, [
            ((.169 * side, -.0037, 1.455), .0600, .0775, .004, .2),
            ((.169 * side, -.0037, 1.420), .0580, .0775, .004, .8),
            ((.169 * side, -.0024, 1.375), .0560, .0750, .002, 1.4),
            ((.168 * side, -.0010, 1.330), .0520, .0715, .003, 2.0),
            ((.171 * side,  .0005, 1.275), .0500, .0675, .004, 2.6),
            ((.177 * side,  .0023, 1.215), .0480, .0625, .006, 3.2),
            ((.180 * side,  .0031, 1.170), .0460, .0600, .004, 3.8),
            ((.185 * side,  .0046, 1.125), .0430, .0565, .003, 4.4),
            ((.188 * side,  .0056, 1.085), .0410, .0540, .003, 5.0),
            ((.191 * side,  .0066, 1.045), .0390, .0510, .003, 5.6),
            ((.192 * side,  .0076, 1.018), .0370, .0490, .003, 6.2),
        ], mats["pearl"], rig, 28)
        lower_proxy = bpy.data.objects.new(PREFIX + f"jacket_lower_sleeve_{side:+d}", None)
        lower_proxy["editorProxyFor"] = sleeve.name
        lower_proxy.empty_display_type = "PLAIN_AXES"
        lower_proxy.empty_display_size = 0.01
        bpy.context.collection.objects.link(lower_proxy)
        owned.extend((sleeve, lower_proxy))
        # Black-gold cuff ribbing and gold open-front zipper tape.
        cuff_centre = (.190 * side, .008)
        cuff = elliptical_cuff_band(PREFIX + f"jacket_cuff_black_{side:+d}",
                                    cuff_centre, .040, .049, .996, 1.024,
                                    mats["black"], 32)
        cuff_gold = elliptical_double_strip(PREFIX + f"accent_cuff_gold_{side:+d}",
                                             cuff_centre, .0405, .0495,
                                             (1.002, 1.014), .0037, mats["gold"], 32)
        zipper = ribbon_strip(PREFIX + f"accent_zipper_{side:+d}", [
            (.030 * side, -.103, 1.485), (.031 * side, -.103, 1.440),
            (.031 * side, -.103, 1.385), (.032 * side, -.103, 1.325),
            (.032 * side, -.102, 1.260), (.033 * side, -.102, 1.190),
            (.035 * side, -.101, 1.105),
        ], 0.008, 0.0025, mats["gold"])
        owned.extend((cuff, cuff_gold, zipper))
        torso_owned.append(zipper)
        # Sleeve pocket and ornamental linework.
        sleeve_pocket = box(PREFIX + f"jacket_sleeve_pocket_{side:+d}", (0.2240 * side, -0.062, 1.285), (0.0138, 0.065, 0.14), mats["black"], 0.004)
        owned.append(sleeve_pocket)
        embroidery = tube_curve(PREFIX + f"accent_sleeve_embroidery_{side:+d}", [
            (0.2206 * side, -0.101, 1.39), (0.2327 * side, -0.105, 1.315), (0.2206 * side, -0.104, 1.245)
        ], 0.004, mats["gold"])
        owned.append(embroidery)
        # Rig .L is +X and .R is -X; bind by world side rather than screen label.
        upper_bone = "upperarm.R" if side < 0 else "upperarm.L"
        forearm_bone = "forearm.R" if side < 0 else "forearm.L"
        bone_parent(sleeve_pocket, rig, upper_bone)
        bone_parent(embroidery, rig, upper_bone)
        bone_parent(lower_proxy, rig, forearm_bone)
        bone_parent(cuff, rig, forearm_bone)
        bone_parent(cuff_gold, rig, forearm_bone)
    waist = rounded_open_bomber_shell(PREFIX + "jacket_waist_ribbing", [
        (1.092, .2125, .0925,  .002, .035, 0.0),
        (1.068, .2125, .0925,  .002, .035, 0.0),
    ], mats["black"], samples=36, thickness=.007, front_lip_y=-.098)
    owned.append(waist)
    torso_owned.append(waist)
    for name_z, path_z in ((1.068, 1.072), (1.092, 1.088)):
        accent = tube_curve(PREFIX + f"accent_waist_gold_{name_z:.3f}",
                            open_ellipse_path(.2125, .0925, .002, .035, path_z, 40),
                            .0037, mats["gold"], cyclic=False, resolution=1)
        owned.append(accent)
        torso_owned.append(accent)
    for obj in owned:
        if obj.parent is None:
            bone_parent(obj, rig, "chest")
    return owned


def build_trousers(rig, mats):
    owned = []
    waist = tailored_pelvis_shell(PREFIX + "bottoms_waist", [
        (1.100, .1600, .1220, -.0060, .000),
        (1.070, .1690, .1280, -.0055, .000),
        (1.040, .1795, .1335, -.0045, .000),
        (1.010, .1764, .1338, -.0020, .002),
        (.995, .1702, .1297, .0005, .004),
        (.984, .1620, .1201, .0000, .006),
    ], mats["black"], 36)
    owned.append(waist)
    bone_parent(waist, rig, "hips")
    for side, thigh_bone, shin_bone in ((-1, "thigh.R", "shin.R"), (1, "thigh.L", "shin.L")):
        upper = skinned_trouser_shell(PREFIX + f"bottoms_upper_{side:+d}", side, [
            ((.08263 * side, -.002, 1.030), .10410, .1258, .0015, .2),
            ((.08345 * side, -.007, .940), .10975, .1329, .0020, .9),
            ((.08390 * side, -.006, .850), .10920, .1320, .0025, 1.5),
            ((.08427 * side, -.004, .760), .10574, .1285, .0022, 2.1),
            ((.08345 * side, .001, .670), .10092, .1223, .0024, 2.8),
            ((.08263 * side, .000, .584), .09555, .1160, .0060, 3.4),
            ((.08263 * side, -.002, .534), .09100, .1100, .0090, 4.0),
            ((.08299 * side, .003, .484), .08873, .1080, .0070, 4.7),
            ((.08500 * side, -.003, .400), .08509, .1035, .0080, 5.3),
            ((.08700 * side, .002, .315), .07462, .0910, .0100, 5.9),
            ((.08900 * side, -.002, .235), .06552, .0800, .0140, .4),
            ((.09080 * side, .000, .165), .05824, .0710, .0090, 1.2),
        ], mats["black"], rig, 24)
        lower_proxy = bpy.data.objects.new(PREFIX + f"bottoms_lower_{side:+d}", None)
        lower_proxy["editorProxyFor"] = upper.name
        lower_proxy.empty_display_type = "PLAIN_AXES"
        lower_proxy.empty_display_size = 0.01
        bpy.context.collection.objects.link(lower_proxy)
        pocket = wrapped_cargo_panel(PREFIX + f"bottoms_cargo_pocket_{side:+d}", side,
                                     (.1583 * side, -.092, .755), .0819, .158, .021, mats["black"])
        flap = wrapped_cargo_panel(PREFIX + f"accent_cargo_flap_{side:+d}", side,
                                   (.1602 * side, -.094, .835), .0855, .046, .014, mats["gold"])
        piping = tube_curve(PREFIX + f"accent_trouser_piping_{side:+d}", [
            (.1838 * side, -.020, pass20_body_z(.875)), (.1884 * side, -.018, pass20_body_z(.730)),
            (.1765 * side, -.015, pass20_body_z(.585)), (.1647 * side, -.012, pass20_body_z(.455)),
            (.1583 * side, -.010, pass20_body_z(.320)), (.1438 * side, -.008, pass20_body_z(.170)),
        ], 0.0035, mats["gold"])
        cuff = torus(PREFIX + f"bottoms_ankle_cuff_{side:+d}", (0.0908 * side, 0, 0.16), 0.0642, 0.0141, mats["black"], (math.pi / 2, 0, 0))
        owned += [upper, lower_proxy, pocket, flap, piping, cuff]
        bone_parent(lower_proxy, rig, shin_bone)
        bone_parent(pocket, rig, thigh_bone)
        bone_parent(flap, rig, thigh_bone)
        bone_parent(piping, rig, thigh_bone)
        bone_parent(cuff, rig, shin_bone)
    return owned


def build_high_tops(rig, mats):
    owned = []
    for side, foot_bone in ((-1, "foot.R"), (1, "foot.L")):
        x = 0.0908 * side
        sole = longitudinal_shoe_shell(PREFIX + f"shoes_sole_{side:+d}", x, [
            (.085, .050, .003, .043), (.050, .055, .001, .045),
            (.010, .052, .000, .045), (-.030, .049, .000, .045),
            (-.080, .056, .000, .044), (-.125, .0575, .002, .043),
            (-.165, .052, .006, .040), (-.195, .036, .014, .036),
        ], mats["rubber"], 16, .003)
        midsole = longitudinal_shoe_shell(PREFIX + f"shoes_midsole_{side:+d}", x, [
            (.082, .047, .017, .048), (.045, .052, .016, .051),
            (.000, .049, .016, .052), (-.045, .047, .016, .052),
            (-.090, .053, .016, .050), (-.135, .054, .018, .048),
            (-.172, .047, .021, .044), (-.191, .031, .025, .038),
        ], mats["white"], 16, .004)
        upper = longitudinal_shoe_shell(PREFIX + f"shoes_upper_{side:+d}", x, [
            (.070, .046, .041, .142), (.035, .050, .042, .150),
            (-.005, .047, .043, .157), (-.045, .044, .044, .158),
            (-.085, .052, .044, .151), (-.128, .055, .045, .139),
            (-.168, .034, .047, .112),
        ], mats["white"], 16, .006)
        toe = longitudinal_shoe_shell(PREFIX + f"shoes_toe_panel_{side:+d}", x, [
            (-.102, .052, .088, .139), (-.135, .050, .085, .151),
            (-.166, .035, .083, .140), (-.193, .012, .085, .112),
        ], mats["white"], 16, .004)
        cuff = open_padded_collar(PREFIX + f"shoes_padded_cuff_{side:+d}", x, [
            (.052, .112, .050, .052, .047), (.046, .142, .054, .055, .050),
            (.036, .172, .056, .058, .052), (.022, .202, .055, .057, .051),
            (.004, .230, .052, .053, .048), (-.016, .252, .047, .044, .042),
        ], .005, mats["white"], 24)
        tongue = beam(PREFIX + f"shoes_tongue_{side:+d}",
                      (x, -.108, .112), (x, -.045, .252), .074, .010, mats["white"], .005)
        heel_counter = ellipsoid(PREFIX + f"shoes_heel_counter_{side:+d}",
                                 (x, .072, .135), (.102, .030, .145), mats["white"], 24, 18)
        heel_gold = ellipsoid(PREFIX + f"accent_shoe_gold_quarter_{side:+d}",
                              (x + .054 * side, .002, .151), (.009, .105, .105), mats["gold"], 20, 14)
        tongue_gold = box(PREFIX + f"accent_shoe_tongue_badge_{side:+d}",
                          (x, -.101, .221), (.042, .010, .050), mats["gold"], .005)
        owned += [sole, midsole, upper, cuff, toe, tongue, heel_counter, heel_gold, tongue_gold]
        # Grounded tread strips replace the prior stacked front bars.
        for index in range(5):
            y = -.155 + index * .050
            owned.append(beam(PREFIX + f"shoes_sole_band_{side:+d}_{index:02d}",
                              (x - .045, y, .008), (x + .045, y, .008),
                              .007, .004, mats["black"], .001))
        # Eight recessed eyelet pairs and two crossing lace runs per row.
        for index in range(8):
            y = -.105 + index * .018
            z = .142 + index * .013
            for eye_side in (-1, 1):
                eyelet = torus(PREFIX + f"accent_shoe_eyelet_{side:+d}_{index:02d}_{eye_side:+d}",
                               (x + .034 * eye_side, y, z), .0042, .0012,
                               mats["gold"], (math.pi / 2, 0, 0))
                owned.append(eyelet)
            owned.append(beam(PREFIX + f"shoes_lace_{side:+d}_{index:02d}",
                              (x - .033, y - .001, z), (x + .033, y + .010, z + .006),
                              .0042, .0032, mats["white"], .001))
            owned.append(beam(PREFIX + f"shoes_lace_cross_{side:+d}_{index:02d}",
                              (x + .033, y - .001, z), (x - .033, y + .010, z + .006),
                              .0042, .0032, mats["white"], .001))
        for obj in owned:
            if obj.parent is None and obj.name.endswith(f"{side:+d}"):
                bone_parent(obj, rig, foot_bone)
        # Parent every just-created shoe-prefix object for this side, including indexed detail.
        for obj in owned:
            if obj.parent is None and f"_{side:+d}_" in obj.name:
                bone_parent(obj, rig, foot_bone)
    return owned


def build_accessories(rig, mats):
    owned = []
    # Three necklace drops with a small pendant.
    for index, drop in enumerate((1.39, 1.34, 1.28)):
        points = [(-0.105, -0.192, 1.48 - index * 0.012), (-0.07, -0.213, drop + 0.035),
                  (0, -0.225, drop), (0.07, -0.213, drop + 0.035), (0.105, -0.192, 1.48 - index * 0.012)]
        owned.append(tube_curve(PREFIX + f"accent_necklace_{index:02d}", points, 0.0032, mats["gold"]))
    owned.append(tapered_beam(PREFIX + "accent_necklace_pendant", (0, -0.228, 1.28), (0, -0.23, 1.235), 0.008, 0.003, mats["gold"], 8))
    # Two waist chain catenaries and a long asymmetric black/gold strap.
    for index, (x0, x1, depth) in enumerate(((-0.1653, 0.0945, pass20_body_z(0.73)), (-0.1102, 0.1732, pass20_body_z(0.68)))):
        points = [(x0, -0.14, pass20_body_z(0.88)), ((x0 + x1) * 0.5, -0.17, depth), (x1, -0.14, pass20_body_z(0.86))]
        owned.append(tube_curve(PREFIX + f"accent_waist_chain_{index:02d}", points, 0.0045, mats["gold"]))
        for link in range(11):
            t = link / 10
            x = x0 * (1 - t) + x1 * t
            z = (pass20_body_z(0.88) * (1 - t) + pass20_body_z(0.86) * t) - math.sin(math.pi * t) * (0.14 + index * 0.04)
            owned.append(torus(PREFIX + f"accent_chain_link_{index:02d}_{link:02d}",
                               (x, -0.17, z), 0.009, 0.0022, mats["gold"], (math.pi / 2, 0, (link % 2) * math.pi / 2)))
    owned.append(beam(PREFIX + "bottoms_hanging_black_strap", (0.1653, -0.10, pass20_body_z(0.85)), (0.1850, -0.08, pass20_body_z(0.43)), 0.0252, 0.008, mats["black"], 0.003))
    owned.append(beam(PREFIX + "accent_hanging_gold_strap", (0.1613, -0.115, pass20_body_z(0.84)), (0.1771, -0.11, pass20_body_z(0.50)), 0.0079, 0.006, mats["gold"], 0.002))
    hoop = torus(PREFIX + "accent_ear_hoop", (0.119, -0.025, 1.625 + HEAD_RAISE), 0.022, 0.003, mats["gold"], (math.pi / 2, 0, 0))
    owned.append(hoop)
    for obj in owned[:4]:
        bone_parent(obj, rig, "chest")
    for obj in owned[4:-1]:
        bone_parent(obj, rig, "hips")
    bone_parent(owned[-1], rig, "head")
    return owned


def setup_render(owned):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 1152
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.004, 0.006, 0.012)

    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.hide_render = not (obj.name == "AvatarBody_male" or obj.name.startswith(PREFIX))
    female = bpy.data.objects.get("AvatarBody_female")
    if female:
        female.hide_render = True

    target = Vector((0, 0, 0.92))
    cam_data = bpy.data.cameras.new("LuxuryReview_Camera")
    cam_data.lens = 68
    cam = bpy.data.objects.new("LuxuryReview_Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = Vector((2.45, -5.1, 1.2))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    for name, kind, energy, color, location, size in (
        ("Key", "AREA", 1050, (1.0, 0.82, 0.65), (-2.6, -3.6, 3.6), 3.0),
        ("Fill", "AREA", 480, (0.54, 0.72, 1.0), (2.6, -2.3, 2.2), 2.4),
        ("Rim", "AREA", 900, (0.12, 0.78, 1.0), (2.2, 1.2, 2.8), 1.8),
    ):
        data = bpy.data.lights.new("LuxuryReview_" + name, kind)
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        lamp = bpy.data.objects.new("LuxuryReview_" + name, data)
        bpy.context.collection.objects.link(lamp)
        lamp.location = location
        lamp.rotation_euler = (target - lamp.location).to_track_quat("-Z", "Y").to_euler()

    floor_mat = material("AvatarLuxuryFloor", (0.018, 0.022, 0.032, 1), 0.24, 0.0, 0.35)
    floor = box("LuxuryReview_Floor", (0, 0, -0.025), (5.0, 5.0, 0.05), floor_mat, 0)
    floor.hide_render = False
    owned.append(floor)
    return cam, target


def audit(owned) -> None:
    meshes = [obj for obj in owned if obj.type == "MESH"]
    if len(meshes) < 70:
        raise RuntimeError(f"luxury avatar detail audit failed: only {len(meshes)} mesh objects")
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, point.x), min(mins.y, point.y), min(mins.z, point.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, point.x), max(maxs.y, point.y), max(maxs.z, point.z)
    size = maxs - mins
    if not (1.72 <= maxs.z <= 1.95 and mins.z >= -0.03 and size.x < 1.1 and size.y < 0.9):
        raise RuntimeError(f"luxury avatar bounds unexpected: min={tuple(mins)} max={tuple(maxs)}")
    required_tokens = ("hair_", "jacket_", "top_", "bottoms_", "shoes_", "accent_")
    missing = [token for token in required_tokens if not any(token in obj.name for obj in meshes)]
    if missing:
        raise RuntimeError(f"missing swappable groups: {missing}")
    dirty_scale = [obj.name for obj in meshes if any(abs(value - 1.0) > 1e-4 for value in obj.scale)]
    if dirty_scale:
        raise RuntimeError(f"unapplied mesh scales: {dirty_scale[:8]}")

    def world_bounds(name):
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"missing overlap audit object: {name}")
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        return {
            "x": (min(point.x for point in points), max(point.x for point in points)),
            "y": (min(point.y for point in points), max(point.y for point in points)),
            "z": (min(point.z for point in points), max(point.z for point in points)),
        }

    def require_overlap(name_a, name_b, axis, minimum):
        a = world_bounds(name_a)[axis]
        b = world_bounds(name_b)[axis]
        amount = min(a[1], b[1]) - max(a[0], b[0])
        if amount < minimum:
            raise RuntimeError(f"joint gap {name_a} <-> {name_b} on {axis}: {amount:.4f}m")
        print(f"LUXURY_AVATAR_OVERLAP {name_a} <-> {name_b} axis={axis} amount={amount:.4f}m")

    require_overlap(PREFIX + "skin_face_shell", PREFIX + "hair_swept_cap", "z", 0.010)
    for side in (-1, 1):
        require_overlap(PREFIX + "skin_face_shell", PREFIX + f"skin_ear_{side:+d}", "x", 0.006)
    require_overlap(PREFIX + "skin_neck_shell", PREFIX + "skin_face_shell", "z", 0.020)
    require_overlap(PREFIX + "skin_neck_shell", PREFIX + "jacket_back", "z", 0.020)
    require_overlap(PREFIX + "jacket_back", PREFIX + "jacket_upper_sleeve_+1", "x", 0.018)
    require_overlap(PREFIX + "jacket_upper_sleeve_+1", PREFIX + "jacket_cuff_black_+1", "z", 0.005)
    require_overlap(PREFIX + "bottoms_waist", PREFIX + "bottoms_upper_+1", "z", 0.050)
    require_overlap(PREFIX + "bottoms_upper_+1", PREFIX + "bottoms_ankle_cuff_+1", "z", 0.010)
    require_overlap(PREFIX + "bottoms_ankle_cuff_+1", PREFIX + "shoes_padded_cuff_+1", "z", 0.010)
    face_bounds = world_bounds(PREFIX + "skin_face_shell")
    neck_bounds = world_bounds(PREFIX + "skin_neck_shell")
    face_width = face_bounds["x"][1] - face_bounds["x"][0]
    neck_width = neck_bounds["x"][1] - neck_bounds["x"][0]
    if not 0.189 <= face_width <= 0.195:
        raise RuntimeError(f"face width out of contract: {face_width:.4f}m")
    if not (1.554 <= face_bounds["z"][0] <= 1.556 and 1.794 <= face_bounds["z"][1] <= 1.796):
        raise RuntimeError(f"face height out of contract: {face_bounds['z']}")
    if neck_width > 0.1285:
        raise RuntimeError(f"neck width out of contract: {neck_width:.4f}m")
    face_obj = bpy.data.objects[PREFIX + "skin_face_shell"]
    if len(face_obj.data.materials) != 1 or face_obj.data.color_attributes.get("FaceColor") is None:
        raise RuntimeError("integrated face must use one skin material plus FaceColor")
    for region in ("lips", "nostril"):
        if int(face_obj.get(f"integrated_{region}_polygons", 0)) <= 0:
            raise RuntimeError(f"integrated facial region empty: {region}")
    perioral_contract = {
        "mouth_seam_width": (.052, .058),
        "upper_lip_height": (.005, .006),
        "lower_lip_height": (.008, .010),
        "lip_projection_max": (.004, .006),
        "philtrum_length": (.012, .014),
        "cupid_notch_width": (.003, .004),
        "mouth_corner_drop": (0.0, .001),
    }
    for key, (minimum, maximum) in perioral_contract.items():
        value = float(face_obj.get(key, -1))
        if not minimum <= value <= maximum:
            raise RuntimeError(f"perioral contract failed: {key}={value:.4f}m")
    if abs(float(face_obj.get("ocular_ipd", 0)) - .064) > .0002:
        raise RuntimeError("ocular IPD metadata is not 64 mm")
    if (abs(float(face_obj.get("ocular_aperture_width", 0)) - .042) > .001 or
            abs(float(face_obj.get("ocular_aperture_height", 0)) - .013) > .001 or
            not 3.0 <= float(face_obj.get("ocular_outer_lift_degrees", 0)) <= 5.0):
        raise RuntimeError("ocular aperture metadata failed")
    removed_left = int(face_obj.get("eye_aperture_left_faces_removed", 0))
    removed_right = int(face_obj.get("eye_aperture_right_faces_removed", 0))
    if removed_left != removed_right:
        raise RuntimeError(f"asymmetric face aperture topology: {removed_left} != {removed_right}")
    eye_centres = {}
    for side, label in ((-1, "right"), (1, "left")):
        if int(face_obj.get(f"eye_aperture_{label}_faces_removed", 0)) < 8:
            raise RuntimeError(f"{label} eye aperture was not cut from face shell")
        eye_bounds = world_bounds(PREFIX + f"accent_eye_{side:+d}")
        iris_bounds = world_bounds(PREFIX + f"accent_iris_{side:+d}")
        pupil_bounds = world_bounds(PREFIX + f"accent_pupil_{side:+d}")
        upper_lid = bpy.data.objects.get(PREFIX + f"skin_upper_lid_{side:+d}")
        lower_lid = bpy.data.objects.get(PREFIX + f"skin_lower_lid_{side:+d}")
        brow = bpy.data.objects.get(PREFIX + f"hair_brow_{side:+d}")
        if (upper_lid is None or lower_lid is None or upper_lid.type != "MESH" or
                lower_lid.type != "MESH"):
            raise RuntimeError(f"{label} registered lid meshes missing")
        if not (0.0010 <= float(upper_lid.get("sclera_overlap", 0)) <= .0020 and
                0.0020 <= float(lower_lid.get("lid_recession", 0)) <= .0030):
            raise RuntimeError(f"{label} lid overlap/recession failed")
        if brow is None or brow.type != "MESH" or not brow.get("tapered_brow"):
            raise RuntimeError(f"{label} tapered brow missing")
        eye_width = eye_bounds["x"][1] - eye_bounds["x"][0]
        eye_height = eye_bounds["z"][1] - eye_bounds["z"][0]
        iris_width = iris_bounds["x"][1] - iris_bounds["x"][0]
        pupil_width = pupil_bounds["x"][1] - pupil_bounds["x"][0]
        eye_centre_x = (eye_bounds["x"][0] + eye_bounds["x"][1]) * .5
        iris_centre = ((iris_bounds["x"][0] + iris_bounds["x"][1]) * .5,
                       (iris_bounds["z"][0] + iris_bounds["z"][1]) * .5)
        pupil_centre = ((pupil_bounds["x"][0] + pupil_bounds["x"][1]) * .5,
                        (pupil_bounds["z"][0] + pupil_bounds["z"][1]) * .5)
        eye_centres[side] = eye_centre_x
        if not (0.040 <= eye_width <= 0.044 and 0.010 <= eye_height <= 0.016):
            raise RuntimeError(f"{label} eye dimensions out of contract: {eye_width:.4f}x{eye_height:.4f}m")
        if not 0.009 <= iris_width <= 0.011:
            raise RuntimeError(f"{label} iris width out of contract: {iris_width:.4f}m")
        if not 0.004 <= pupil_width <= 0.005:
            raise RuntimeError(f"{label} pupil width out of contract: {pupil_width:.4f}m")
        if (abs(iris_centre[0] - pupil_centre[0]) > .0002 or
                abs(iris_centre[1] - pupil_centre[1]) > .0002):
            raise RuntimeError(f"{label} iris/pupil are not concentric")
        brow_bounds = world_bounds(PREFIX + f"hair_brow_{side:+d}")
        brow_width = brow_bounds["x"][1] - brow_bounds["x"][0]
        if not .038 <= brow_width <= .042:
            raise RuntimeError(f"{label} brow width out of contract: {brow_width:.4f}m")
    if (abs((eye_centres[1] - eye_centres[-1]) - .064) > .0002 or
            abs(eye_centres[1] + eye_centres[-1]) > .000001):
        raise RuntimeError(f"eye centres are not mirrored at 64 mm IPD: {eye_centres}")

    def authored_ring_width(z):
        xs = [vertex.co.x for vertex in face_obj.data.vertices if abs(vertex.co.z - z) < 1e-5]
        if not xs:
            raise RuntimeError(f"face ring missing at z={z:.3f}")
        return max(xs) - min(xs)

    for label, z, low, high in (
        ("chin", 1.510, 0.075, 0.085),
        ("jaw", 1.546, 0.135, 0.145),
        ("cheek", 1.628, 0.185, 0.195),
    ):
        width = authored_ring_width(z)
        if not low <= width <= high:
            raise RuntimeError(f"{label} width out of contract: {width:.4f}m")

    jacket_back = bpy.data.objects[PREFIX + "jacket_back"]
    if (int(jacket_back.get("authored_ring_count", 0)) != 9 or
            int(jacket_back.get("cross_section_samples", 0)) != 36 or
            int(jacket_back.get("connected_component_count", 0)) != 1):
        raise RuntimeError("rounded bomber shell topology contract failed")
    if (not .007 <= float(jacket_back.get("shell_thickness", 0)) <= .009 or
            not .180 <= float(jacket_back.get("coreChestDepth", 0)) <= .203 or
            not .406 <= float(jacket_back.get("hem_span", 0)) <= .443 or
            not .058 <= float(jacket_back.get("frontOpeningTop", 0)) <= .062 or
            not .068 <= float(jacket_back.get("frontOpeningHem", 0)) <= .072):
        raise RuntimeError("rounded bomber shell proportion contract failed")
    shell_modifiers = [modifier for modifier in jacket_back.modifiers if modifier.type == "ARMATURE"]
    if len(shell_modifiers) != 1 or not shell_modifiers[0].use_deform_preserve_volume:
        raise RuntimeError("rounded bomber shell armature contract failed")
    if {group.name for group in jacket_back.vertex_groups} != {"chest", "spine", "hips"}:
        raise RuntimeError("rounded bomber shell vertex-group contract failed")
    for vertex in jacket_back.data.vertices:
        if abs(sum(weight.weight for weight in vertex.groups) - 1.0) > 1e-4:
            raise RuntimeError(f"rounded bomber shell weights failed: vertex={vertex.index}")
    for side in (-1, 1):
        panel = bpy.data.objects[PREFIX + f"jacket_front_panel_{side:+d}"]
        sleeve = bpy.data.objects[PREFIX + f"jacket_upper_sleeve_{side:+d}"]
        proxy = bpy.data.objects.get(PREFIX + f"jacket_lower_sleeve_{side:+d}")
        zipper = bpy.data.objects[PREFIX + f"accent_zipper_{side:+d}"]
        if (panel.type != "EMPTY" or panel.get("editorProxyFor") != jacket_back.name or
                int(panel.get("authored_ring_count", 0)) != 9):
            raise RuntimeError(f"bomber front editor proxy failed: side={side:+d}")
        if len(sleeve.data.vertices) != 11 * 28 or int(sleeve.get("connected_component_count", 0)) != 1:
            raise RuntimeError(f"continuous sleeve topology failed: side={side:+d}")
        if (not .020 <= float(sleeve.get("root_cap_protrusion", 0)) <= .025 or
                not .095 <= float(sleeve.get("upper_diameter_max", 0)) <= .110 or
                not .070 <= float(sleeve.get("terminal_diameter", 0)) <= .080 or
                not .002 <= float(sleeve.get("max_fold_amplitude", 0)) <= .006 or
                abs(float(sleeve.get("terminal_ring_z", 0)) - 1.018) > .001):
            raise RuntimeError(f"continuous sleeve silhouette contract failed: side={side:+d}")
        armature_modifiers = [modifier for modifier in sleeve.modifiers if modifier.type == "ARMATURE"]
        if len(armature_modifiers) != 1 or not armature_modifiers[0].use_deform_preserve_volume:
            raise RuntimeError(f"continuous sleeve armature contract failed: side={side:+d}")
        if proxy is None or proxy.type != "EMPTY" or proxy.get("editorProxyFor") != sleeve.name:
            raise RuntimeError(f"lower-sleeve editor proxy missing: side={side:+d}")
        suffix = "L" if side > 0 else "R"
        expected_groups = {f"shoulder.{suffix}", f"upperarm.{suffix}", f"forearm.{suffix}"}
        if {group.name for group in sleeve.vertex_groups} != expected_groups:
            raise RuntimeError(f"continuous sleeve groups failed: side={side:+d}")
        for vertex in sleeve.data.vertices:
            total = sum(weight.weight for weight in vertex.groups)
            if abs(total - 1.0) > 1e-4:
                raise RuntimeError(f"continuous sleeve weights failed: side={side:+d} vertex={vertex.index}")
        if int(zipper.get("authored_path_points", 0)) != 7 or float(zipper.get("curve_deviation", 0)) < 0.001:
            raise RuntimeError(f"curved zipper contract failed: side={side:+d}")
        cuff = bpy.data.objects[PREFIX + f"jacket_cuff_black_{side:+d}"]
        if (not .075 <= float(cuff.get("cuff_diameter_across", 0)) <= .085 or
                not .096 <= float(cuff.get("cuff_diameter_depth", 0)) <= .102 or
                not .024 <= float(cuff.get("cuff_axial_length", 0)) <= .032):
            raise RuntimeError(f"bomber cuff contract failed: side={side:+d}")
    pelvis = bpy.data.objects[PREFIX + "bottoms_waist"]
    if int(pelvis.get("authored_ring_count", 0)) != 6 or not 0.005 <= float(pelvis.get("inseam_saddle_depth", 0)) <= 0.007:
        raise RuntimeError("tailored trouser pelvis contract failed")
    for side in (-1, 1):
        leg = bpy.data.objects[PREFIX + f"bottoms_upper_{side:+d}"]
        proxy = bpy.data.objects.get(PREFIX + f"bottoms_lower_{side:+d}")
        pocket = bpy.data.objects[PREFIX + f"bottoms_cargo_pocket_{side:+d}"]
        if len(leg.data.vertices) != 12 * 24 or int(leg.get("connected_component_count", 0)) != 1:
            raise RuntimeError(f"continuous trouser topology failed: side={side:+d}")
        armature_modifiers = [modifier for modifier in leg.modifiers if modifier.type == "ARMATURE"]
        if len(armature_modifiers) != 1 or not armature_modifiers[0].use_deform_preserve_volume:
            raise RuntimeError(f"continuous trouser armature contract failed: side={side:+d}")
        if proxy is None or proxy.type != "EMPTY" or proxy.get("editorProxyFor") != leg.name:
            raise RuntimeError(f"lower-trouser editor proxy missing: side={side:+d}")
        suffix = "L" if side > 0 else "R"
        expected_groups = {"hips", f"thigh.{suffix}", f"shin.{suffix}"}
        if {group.name for group in leg.vertex_groups} != expected_groups:
            raise RuntimeError(f"continuous trouser groups failed: side={side:+d}")
        for vertex in leg.data.vertices:
            total = sum(weight.weight for weight in vertex.groups)
            if abs(total - 1.0) > 1e-4:
                raise RuntimeError(f"continuous trouser weights failed: side={side:+d} vertex={vertex.index}")
        if not 0.090 <= float(leg.get("knee_blend_length", 0)) <= 0.110:
            raise RuntimeError(f"continuous trouser knee blend failed: side={side:+d}")
        if not 0.005 <= float(leg.get("max_fold_amplitude", 0)) <= 0.014:
            raise RuntimeError(f"continuous trouser folds failed: side={side:+d}")
        if not 0.018 <= float(pocket.get("wrapped_projection", 0)) <= 0.025:
            raise RuntimeError(f"wrapped cargo pocket failed: side={side:+d}")
    hair_bounds = world_bounds(PREFIX + "hair_swept_cap")
    visual_head_unit = face_bounds["z"][1] - face_bounds["z"][0]
    figure_head_units = (maxs.z - max(0.0, mins.z)) / visual_head_unit
    jacket_width = world_bounds(PREFIX + "jacket_upper_sleeve_+1")["x"][1] - \
        world_bounds(PREFIX + "jacket_upper_sleeve_-1")["x"][0]
    trouser_width = world_bounds(PREFIX + "bottoms_upper_+1")["x"][1] - \
        world_bounds(PREFIX + "bottoms_upper_-1")["x"][0]
    shoe_width = world_bounds(PREFIX + "shoes_sole_+1")["x"][1] - \
        world_bounds(PREFIX + "shoes_sole_+1")["x"][0]
    sole_height = world_bounds(PREFIX + "shoes_sole_+1")["z"][1] - \
        world_bounds(PREFIX + "shoes_sole_+1")["z"][0]
    standing_height = hair_bounds["z"][1] - max(0.0, mins.z)
    jacket_ratio = jacket_width / standing_height
    pelvis_width = world_bounds(PREFIX + "bottoms_waist")["x"][1] - world_bounds(PREFIX + "bottoms_waist")["x"][0]
    pelvis_ratio = pelvis_width / standing_height
    crotch_ratio = 0.978 / standing_height
    if not 0.455 <= jacket_width <= 0.480 or not 0.245 <= jacket_ratio <= 0.265:
        raise RuntimeError(f"jacket shoulder envelope out of contract: {jacket_width:.4f}m")
    if not 0.35 <= trouser_width <= 0.405:
        raise RuntimeError(f"trouser envelope out of contract: {trouser_width:.4f}m")
    if not 0.18 <= pelvis_ratio <= 0.20 or not 0.52 <= crotch_ratio <= 0.54:
        raise RuntimeError(f"pass-20 pelvis contract failed: width={pelvis_ratio:.4f}H crotch={crotch_ratio:.4f}H")
    if not 0.88 <= (0.3200 / pelvis_width) <= 0.90:
        raise RuntimeError(f"pass-20 waist/hip ratio failed: {0.3200 / pelvis_width:.4f}")
    if not 0.110 <= shoe_width <= 0.118 or not 0.040 <= sole_height <= 0.050:
        raise RuntimeError(f"shoe proportion out of contract: {shoe_width:.4f}x{sole_height:.4f}m")
    for side in (-1, 1):
        sole = bpy.data.objects[PREFIX + f"shoes_sole_{side:+d}"]
        upper = bpy.data.objects[PREFIX + f"shoes_upper_{side:+d}"]
        cuff = bpy.data.objects[PREFIX + f"shoes_padded_cuff_{side:+d}"]
        toe = bpy.data.objects[PREFIX + f"shoes_toe_panel_{side:+d}"]
        if int(sole.get("longitudinal_sections", 0)) != 8 or not 0.270 <= float(sole.get("authored_length", 0)) <= 0.290:
            raise RuntimeError(f"profiled footwear sole failed: side={side:+d}")
        if int(upper.get("longitudinal_sections", 0)) != 7 or int(toe.get("longitudinal_sections", 0)) != 4:
            raise RuntimeError(f"footwear upper/toe topology failed: side={side:+d}")
        if int(cuff.get("collar_ring_count", 0)) != 6 or not cuff.get("collar_open_top"):
            raise RuntimeError(f"open footwear collar failed: side={side:+d}")
        if world_bounds(PREFIX + f"shoes_padded_cuff_{side:+d}")["z"][1] < 0.245:
            raise RuntimeError(f"high-top collar too low: side={side:+d}")
        eyelets = [obj for obj in owned if f"accent_shoe_eyelet_{side:+d}_" in obj.name]
        laces = [obj for obj in owned if f"shoes_lace_{side:+d}_" in obj.name or
                 f"shoes_lace_cross_{side:+d}_" in obj.name]
        if len(eyelets) != 16 or len(laces) != 16:
            raise RuntimeError(f"high-top lace contract failed: side={side:+d} eyelets={len(eyelets)} laces={len(laces)}")
    if hair_bounds["z"][1] > 1.845:
        raise RuntimeError(f"compressed hair exceeds contract: {hair_bounds['z'][1]:.4f}m")
    if not 7.5 <= figure_head_units <= 7.8:
        raise RuntimeError(f"figure head-unit ratio out of contract: {figure_head_units:.3f}")
    print(f"LUXURY_AVATAR_AUDIT meshes={len(meshes)} bounds_min={tuple(round(v, 4) for v in mins)} "
          f"bounds_max={tuple(round(v, 4) for v in maxs)} swappable_groups=6 overlap_contract=pass")


def main() -> None:
    clear_previous()
    rig = bpy.data.objects.get("AvatarRig_male")
    body = bpy.data.objects.get("AvatarBody_male")
    if rig is None or body is None:
        raise RuntimeError("AvatarRig_male and AvatarBody_male are required; generate the shared body bases first")
    apply_pass20_body_silhouette_warp(rig, body)
    recess_base_male_face(body)

    mats = {
        "skin": material("AvatarLuxurySkin", (0.55, 0.32, 0.21, 1), 0.5, 0.0, 0.08),
        "face": material("AvatarLuxurySkinFace", (0.55, 0.32, 0.21, 1), 0.5, 0.0, 0.08),
        "hair": material("AvatarLuxuryHair", (0.035, 0.022, 0.017, 1), 0.58, 0.0, 0.02),
        "pearl": material("AvatarLuxuryPearlSatin", (0.88, 0.84, 0.72, 1), 0.2, 0.12, 0.72),
        "black": material("AvatarLuxuryBlackCloth", (0.012, 0.014, 0.019, 1), 0.28, 0.05, 0.28),
        "gold": material("AvatarLuxuryGold", (0.78, 0.48, 0.12, 1), 0.18, 0.95, 0.55),
        "white": material("AvatarLuxuryWhiteLeather", (0.90, 0.86, 0.76, 1), 0.26, 0.06, 0.38),
        "rubber": material("AvatarLuxurySoleRubber", (0.72, 0.68, 0.60, 1), 0.58, 0.0),
        "eye": material("AvatarLuxuryEyeWhite", (0.42, 0.38, 0.33, 1), 0.42, 0.0, 0.18),
        "iris": material("AvatarLuxuryIris", (0.12, 0.045, 0.015, 1), 0.32, 0.0, 0.25),
        "pupil": material("AvatarLuxuryPupil", (0.003, 0.002, 0.0015, 1), 0.25, 0.0, 0.35),
        "lips": material("AvatarLuxuryLips", (0.30, 0.07, 0.05, 1), 0.62, 0.0, 0.02),
    }

    # A single skin primitive carries smooth COLOR_0 multipliers for lips and
    # nostrils.  This keeps the features integrated and lets Babylon recolour
    # the skin base while preserving the authored local contrast.
    face_mat = mats["face"]
    face_nodes = face_mat.node_tree.nodes
    face_links = face_mat.node_tree.links
    for node_name in ("LuxuryFaceColor", "LuxuryFaceMultiply"):
        stale = face_nodes.get(node_name)
        if stale:
            face_nodes.remove(stale)
    vertex_color = face_nodes.new("ShaderNodeVertexColor")
    vertex_color.name = "LuxuryFaceColor"
    vertex_color.layer_name = "FaceColor"
    multiply = face_nodes.new("ShaderNodeMixRGB")
    multiply.name = "LuxuryFaceMultiply"
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1.0
    multiply.inputs[1].default_value = (0.55, 0.32, 0.21, 1)
    face_links.new(vertex_color.outputs["Color"], multiply.inputs[2])
    face_links.new(multiply.outputs["Color"], face_nodes["Principled BSDF"].inputs["Base Color"])

    # Reuse the shared body's material slots, but shift visible skin toward the admitted reference.
    for slot in body.material_slots:
        if slot.material and "skin" in slot.material.name.lower():
            slot.material = mats["skin"]

    owned = []
    face_owned = []
    build_face(rig, mats, face_owned)
    owned += face_owned
    owned += build_hair_layered(rig, mats)
    owned += build_shirt_and_bomber(rig, mats)
    owned += build_trousers(rig, mats)
    owned += build_high_tops(rig, mats)
    owned += build_accessories(rig, mats)
    audit(owned)

    if "--render" in sys.argv:
        pose_state = apply_reference_pose(rig)
        try:
            cam, target = setup_render(owned)
            RENDER_PATH.parent.mkdir(parents=True, exist_ok=True)
            views = {
                "three-quarter": (Vector((1.84, -3.84, 1.2)), RENDER_PATH),
                "front": (Vector((0, -3.99, 1.12)), RENDER_PATH.with_name("blender-luxury-male-front.png")),
                "side": (Vector((3.68, -0.26, 1.12)), RENDER_PATH.with_name("blender-luxury-male-side.png")),
            }
            for view, (location, output) in views.items():
                cam.location = location
                cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
                bpy.context.scene.render.filepath = str(output)
                bpy.ops.render.render(write_still=True)
                print(f"LUXURY_AVATAR_RENDER view={view} path={output}")
        finally:
            clear_reference_pose(rig, pose_state)
    if "--write" in sys.argv:
        target = bpy.data.filepath or str(BLEND_PATH)
        bpy.ops.wm.save_as_mainfile(filepath=target)
        print(f"LUXURY_AVATAR_WRITTEN {target}")


if __name__ == "__main__":
    main()
