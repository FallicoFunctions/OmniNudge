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
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parent.parent
BLEND_PATH = ROOT / "assets-src/avatars/body-bases/avatar.blend"
RENDER_PATH = ROOT / ".img2threejs/luxury-festival/render/blender-luxury-male.png"
REFERENCE_PATH = ROOT / ".img2threejs/luxury-festival-final/reference-front-v1.png"
POCKET_REFERENCE_PATH = ROOT / ".img2threejs/luxury-festival-final/reference-front-pocket-v2.png"
TURNAROUND_PATH = ROOT / ".img2threejs/luxury-festival-final/reference-turnaround-v1.png"
TURNAROUND_CUTOUT_PATH = ROOT / ".img2threejs/luxury-festival-final/reference-turnaround-cutout-v1.png"
PREFIX = "AvatarLuxury_male_"
FRONT_Y = -1.0
HEAD_RAISE = 0.085
HEAD_Z_SCALE = 0.766
HEAD_X_SCALE = 0.815
HEAD_PIVOT_Z = 1.580
PASS20_WARP_VERSION = 20
FINAL_SILHOUETTE_PASS_VERSION = 24


def env_float(name: str, default: float) -> float:
    """Allow deterministic review-camera sweeps without changing avatar geometry."""
    raw = os.environ.get(name)
    return default if raw is None else float(raw)
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
    # z, half-width, front plane, side plane, occiput, cheek roll exponent.
    # These 25 primary rings are the headSurfaceContract in author space;
    # HEAD_RAISE registers the finished 240 mm chin-to-crown span to the rig.
    (1.510, .040, -.058, -.006, .026, 2.00),
    (1.520, .047, -.066, -.008, .032, 2.15),
    (1.530, .057, -.075, -.009, .039, 2.45),
    (1.540, .066, -.082, -.009, .045, 2.85),
    (1.550, .071, -.087, -.008, .049, 3.05),
    (1.560, .076, -.091, -.007, .052, 3.00),
    (1.570, .081, -.096, -.005, .055, 2.90),
    (1.580, .085, -.099, -.003, .058, 2.78),
    (1.590, .089, -.102, -.001, .061, 2.65),
    (1.600, .092, -.104,  .001, .064, 2.55),
    (1.610, .094, -.105,  .002, .066, 2.48),
    (1.620, .095, -.105,  .003, .068, 2.42),
    (1.630, .095, -.104,  .004, .069, 2.38),
    (1.640, .095, -.102,  .005, .070, 2.34),
    (1.650, .094, -.100,  .006, .071, 2.30),
    (1.660, .093, -.097,  .007, .072, 2.27),
    (1.670, .092, -.094,  .008, .073, 2.24),
    (1.680, .091, -.091,  .009, .073, 2.21),
    (1.690, .090, -.088,  .010, .072, 2.18),
    (1.700, .089, -.084,  .011, .070, 2.15),
    (1.710, .088, -.080,  .012, .067, 2.12),
    (1.720, .086, -.075,  .012, .063, 2.08),
    (1.730, .082, -.070,  .011, .058, 2.05),
    (1.740, .074, -.064,  .010, .050, 2.02),
    (1.750, .061, -.057,  .008, .038, 2.00),
)

NOSE_PROFILE = (
    # The bridge grows continuously from the brow and reaches a measured
    # 27.5 mm facial-plane projection at the supratip before turning under.
    (1.690, .00263636, .0090), (1.680, .00527273, .0092),
    (1.670, .00843636, .0095), (1.660, .01212727, .0098),
    (1.650, .01581818, .0102), (1.640, .01950909, .0108),
    (1.630, .02267273, .0115), (1.620, .02530909, .0125),
    (1.610, .02794545, .0138), (1.602, .02900000, .0150),
    (1.596, .02741818, .0165), (1.590, .02267273, .0180),
    (1.584, .01581818, .0190),
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


def add_fabric_bump(mat, scale: float, strength: float) -> None:
    """Add deterministic micro-weave response without external texture assets."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node_name in ("LuxuryFabricCoords", "LuxuryFabricNoise", "LuxuryFabricBump"):
        stale = nodes.get(node_name)
        if stale:
            nodes.remove(stale)
    coords = nodes.new("ShaderNodeTexCoord")
    coords.name = "LuxuryFabricCoords"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "LuxuryFabricNoise"
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = .65
    bump_node = nodes.new("ShaderNodeBump")
    bump_node.name = "LuxuryFabricBump"
    bump_node.inputs["Strength"].default_value = strength
    bump_node.inputs["Distance"].default_value = .004
    links.new(coords.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump_node.inputs["Height"])
    links.new(bump_node.outputs["Normal"], nodes["Principled BSDF"].inputs["Normal"])


def configure_portrait_material(mat, node_name: str) -> None:
    """Bind the generated orthographic plate to a UV-owned swappable material."""
    if not REFERENCE_PATH.exists():
        return
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    portrait = nodes.get(node_name) or nodes.new("ShaderNodeTexImage")
    portrait.name = node_name
    portrait.image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
    portrait.interpolation = "Linear"
    portrait.extension = "EXTEND"
    links.new(portrait.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])


def configure_inner_seam_material(mat, node_name: str) -> None:
    """Blend the pants portrait into a dark inward-seam swatch by vertex colour."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    portrait = nodes.get(node_name) or nodes.new("ShaderNodeTexImage")
    portrait.name = node_name
    if REFERENCE_PATH.exists():
        portrait.image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
    portrait.interpolation = "Linear"
    portrait.extension = "EXTEND"
    fade = nodes.get("LuxuryInnerSeamFade") or nodes.new("ShaderNodeVertexColor")
    fade.name = "LuxuryInnerSeamFade"
    fade.layer_name = "InnerSeamFade"
    invert = nodes.get("LuxuryInnerSeamFadeInvert") or nodes.new("ShaderNodeMath")
    invert.name = "LuxuryInnerSeamFadeInvert"
    invert.operation = "SUBTRACT"
    invert.inputs[0].default_value = 1.0
    mix = nodes.get("LuxuryInnerSeamBlend") or nodes.new("ShaderNodeMixRGB")
    mix.name = "LuxuryInnerSeamBlend"
    mix.blend_type = "MIX"
    mix.inputs[2].default_value = (0.012, 0.014, 0.019, 1.0)
    base_color = nodes["Principled BSDF"].inputs["Base Color"]
    for link in list(base_color.links):
        links.remove(link)
    links.new(fade.outputs["Color"], invert.inputs[1])
    links.new(invert.outputs[0], mix.inputs[0])
    links.new(portrait.outputs["Color"], mix.inputs[1])
    links.new(mix.outputs["Color"], base_color)


def configure_lower_inner_seam_material(mat, node_name: str) -> None:
    """Fade matte inner-leg cloth back into the trouser portrait over 6 mm."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    portrait = nodes.get(node_name) or nodes.new("ShaderNodeTexImage")
    portrait.name = node_name
    if REFERENCE_PATH.exists():
        portrait.image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
    portrait.interpolation = "Linear"
    portrait.extension = "EXTEND"
    fade = nodes.get("LuxuryLowerInnerSeamFade") or nodes.new("ShaderNodeVertexColor")
    fade.name = "LuxuryLowerInnerSeamFade"
    fade.layer_name = "LowerInnerSeamFade"
    mix = nodes.get("LuxuryLowerInnerSeamBlend") or nodes.new("ShaderNodeMixRGB")
    mix.name = "LuxuryLowerInnerSeamBlend"
    mix.blend_type = "MIX"
    mix.inputs[1].default_value = (0.010, 0.012, 0.016, 1.0)
    base_color = nodes["Principled BSDF"].inputs["Base Color"]
    for link in list(base_color.links):
        links.remove(link)
    links.new(fade.outputs["Color"], mix.inputs[0])
    links.new(portrait.outputs["Color"], mix.inputs[2])
    links.new(mix.outputs["Color"], base_color)


def configure_turnaround_material(mat, node_name: str) -> None:
    """Bind the generated multi-view plate for side-facing polygons."""
    image_path = TURNAROUND_CUTOUT_PATH if TURNAROUND_CUTOUT_PATH.exists() else TURNAROUND_PATH
    if not image_path.exists():
        return
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    portrait = nodes.get(node_name) or nodes.new("ShaderNodeTexImage")
    portrait.name = node_name
    portrait.image = bpy.data.images.load(str(image_path), check_existing=True)
    portrait.interpolation = "Linear"
    portrait.extension = "EXTEND"
    links.new(portrait.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    links.new(portrait.outputs["Alpha"], nodes["Principled BSDF"].inputs["Alpha"])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED"


def set_material(obj, mat) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in getattr(obj.data, "polygons", []):
        poly.use_smooth = True


def project_front_uv(obj, x_bounds, z_bounds, u_bounds, v_bounds) -> None:
    """Project a measured front-reference rectangle onto an authored mesh."""
    if obj.type != "MESH":
        return
    uv_layer = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
    x0, x1 = x_bounds
    z0, z1 = z_bounds
    u0, u1 = u_bounds
    v0, v1 = v_bounds
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            point = obj.matrix_world @ obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            tx = max(0.0, min(1.0, (point.x - x0) / (x1 - x0)))
            tz = max(0.0, min(1.0, (point.z - z0) / (z1 - z0)))
            uv_layer.data[loop_index].uv = (u0 + tx * (u1 - u0), v0 + tz * (v1 - v0))


def assign_side_portrait(obj, side_mat, y_bounds=(-.225, .130),
                         z_bounds=(0.0, 1.855),
                         u_bounds=(.307, .428), v_bounds=(.037, .964),
                         normal_threshold=.55) -> None:
    """Map the turnaround's left-facing side view only onto lateral polygons.

    UVs are loop-owned, so front and side polygons can share vertices without
    dragging the hero projection around the silhouette.
    """
    if obj.type != "MESH":
        return
    uv_layer = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
    side_index = len(obj.data.materials)
    obj.data.materials.append(side_mat)
    y0, y1 = y_bounds
    z0, z1 = z_bounds
    u0, u1 = u_bounds
    v0, v1 = v_bounds
    for polygon in obj.data.polygons:
        if abs(polygon.normal.x) < normal_threshold:
            continue
        polygon.material_index = side_index
        mirror = polygon.normal.x < 0.0
        for loop_index in polygon.loop_indices:
            point = obj.matrix_world @ obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            ty = max(0.0, min(1.0, (point.y - y0) / (y1 - y0)))
            tz = max(0.0, min(1.0, (point.z - z0) / (z1 - z0)))
            if mirror:
                ty = 1.0 - ty
            uv_layer.data[loop_index].uv = (u0 + ty * (u1 - u0), v0 + tz * (v1 - v0))


def apply_scale(obj) -> None:
    bpy.context.view_layer.objects.active = obj
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def widen_silhouette_x(obj, factor: float) -> None:
    """Expand an authored garment envelope about the avatar midline."""
    obj.scale.x *= factor
    apply_scale(obj)


def widen_about_x(obj, centre_x: float, factor: float) -> None:
    """Widen mesh vertices about a local world-space centre without moving the slot."""
    local_centre_x = centre_x - float(obj.location.x)
    for vertex in obj.data.vertices:
        vertex.co.x = local_centre_x + (vertex.co.x - local_centre_x) * factor
    obj.data.update()


def puff_sleeve_silhouette(obj) -> None:
    """Bow the sleeve through the elbow while preserving shoulder and cuff joins."""
    side = 1.0 if sum(vertex.co.x for vertex in obj.data.vertices) >= 0.0 else -1.0
    for vertex in obj.data.vertices:
        z = float(vertex.co.z)
        envelope = max(0.0, math.sin(math.pi * min(1.0, max(0.0, (z - 1.035) / .430))))
        centre_x = side * (.179 + .045 * max(0.0, min(1.0, (1.480 - z) / .462)))
        vertex.co.x = centre_x + (vertex.co.x - centre_x) * (1.0 + .015 * envelope)
    obj.data.update()


def taper_jogger_leg(obj, side: int) -> None:
    """Taper calf cloth around its authored leg centre without closing stance."""
    for vertex in obj.data.vertices:
        z = float(vertex.co.z)
        centre_x = .093 * side
        # Preserve the hip join, then narrow progressively toward the ankle.
        t = max(0.0, min(1.0, (.70 - z) / .55))
        factor = .96 * (1.0 - t) + .74 * t
        local_x = vertex.co.x - centre_x
        vertex.co.x = centre_x + local_x * factor
    obj.data.update()


def compress_head_height(obj) -> None:
    """Compress one head-owned object in world Z while preserving X/Y landmarks."""
    obj.location.z = HEAD_PIVOT_Z + (obj.location.z - HEAD_PIVOT_Z) * HEAD_Z_SCALE
    obj.scale.z *= HEAD_Z_SCALE
    apply_scale(obj)


def fit_head_width(obj) -> None:
    """Narrow the authored head assembly around the sagittal plane."""
    obj.location.x *= HEAD_X_SCALE
    obj.scale.x *= HEAD_X_SCALE
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


def apply_pass37_knee_raise(rig, body) -> None:
    """Lift the knee line to the measured 0.69 subject row while preserving feet and hips."""
    version = 37
    if int(rig.get("luxuryKneeLineWarp", 0)) == version:
        return
    controls = ((0.0, 0.0), (.0803, .0803), (.4837, .5600), (1.0100, 1.0100), (1.7500, 1.7500))
    for vertex in body.data.vertices:
        vertex.co.z = _piecewise_map(float(vertex.co.z), controls)
    body.data.update()
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in rig.data.edit_bones:
        for endpoint_name in ("head", "tail"):
            point = getattr(bone, endpoint_name).copy()
            point.z = _piecewise_map(float(point.z), controls)
            setattr(bone, endpoint_name, point)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    bpy.context.view_layer.update()
    rig["luxuryKneeLineWarp"] = version
    body["luxuryKneeLineWarp"] = version


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


def fit_base_arms_under_luxury_sleeves(body) -> None:
    """Reduce only the concealed male arm surface so it cannot pierce the bomber.

    The hands and wrist wedges stay untouched below the cuff.  This is the
    garment-fitting equivalent of a hidden body morph: it preserves the shared
    rig and skin weights while keeping the visible shell continuous in motion.
    """
    changed = 0
    for vertex in body.data.vertices:
        point = vertex.co
        if 1.035 <= point.z <= 1.475 and abs(point.x) >= .115:
            centre_x = math.copysign(.185, point.x)
            point.x = centre_x + (point.x - centre_x) * .36
            point.y *= .52
            changed += 1
    body["luxury_sleeve_fit_vertex_count"] = changed
    body["luxury_sleeve_fit_version"] = FINAL_SILHOUETTE_PASS_VERSION
    body.data.update()


def fit_base_legs_under_luxury_trousers(body) -> None:
    """Hide the shared base legs inside the swappable jogger shell."""
    changed = 0
    for vertex in body.data.vertices:
        point = vertex.co
        if .205 <= point.z <= 1.015 and abs(point.x) >= .030:
            centre_x = math.copysign(.092, point.x)
            point.x = centre_x + (point.x - centre_x) * .42
            point.y *= .48
            changed += 1
    body["luxury_trouser_fit_vertex_count"] = changed
    body["luxury_trouser_fit_version"] = FINAL_SILHOUETTE_PASS_VERSION
    body.data.update()


def fit_base_hands_under_luxury_hands(body) -> None:
    """Collapse the exaggerated shared fingers inside the authored hand shells."""
    changed = 0
    hand_groups = {
        body.vertex_groups[name].index: side
        for name, side in (("hand.L", 1), ("hand.R", -1))
        if body.vertex_groups.get(name) is not None
    }
    for vertex in body.data.vertices:
        point = vertex.co
        weighted_side = next((hand_groups[group.group] for group in vertex.groups
                              if group.group in hand_groups and group.weight > .10), None)
        if weighted_side is not None or (.70 <= point.z <= 1.03 and abs(point.x) >= .145):
            side = weighted_side if weighted_side is not None else (1 if point.x >= 0 else -1)
            wrist_x = .184 * side
            point.x = wrist_x
            point.y = .004
            point.z = 1.005
            changed += 1
    body["luxury_hand_fit_vertex_count"] = changed
    body["luxury_hand_fit_version"] = FINAL_SILHOUETTE_PASS_VERSION
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


def add_render_subdivision(obj, levels=1) -> None:
    """Round authored garment rings at render time without changing slot topology."""
    modifier = obj.modifiers.new("LuxuryGarmentSubdivision", "SUBSURF")
    modifier.subdivision_type = "CATMULL_CLARK"
    modifier.levels = levels
    modifier.render_levels = levels
    modifier.show_only_control_edges = True
    # Deform the subdivided surface, rather than subdividing a posed result.
    while obj.modifiers.find(modifier.name) > 0:
        index = obj.modifiers.find(modifier.name)
        obj.modifiers.move(index, index - 1)


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


def concave_v_shirt_shell(name, outline, front_y, back_y, mat,
                          thickness=.008, bevel_width=.004, front_center_y=None):
    """One closed concave V-front prism from an ordered X/Z outline."""
    if len(outline) < 5 or not front_y < back_y:
        raise ValueError(f"invalid V-shirt shell contract: {name}")
    count = len(outline)
    max_x = max(abs(x) for x, _ in outline)
    if front_center_y is None:
        front_center_y = front_y
    verts = [
        (x, front_y + (front_center_y - front_y) *
         (1.0 - (abs(x) / max_x) ** 2), z)
        for x, z in outline
    ]
    verts += [(x, back_y, z) for x, z in outline]
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, bevel_width, 3)
    set_material(obj, mat)
    obj["connected_component_count"] = 1
    obj["concave_v_front"] = True
    obj["shell_thickness"] = thickness
    obj["front_y"] = front_y
    obj["front_center_y"] = front_center_y
    obj["back_y"] = back_y
    return obj


def curved_saddle_bridge(name, rings, mat, width_segments=10):
    """Closed shallow ring bridge spanning the trouser front opening.

    Rings are ``(z, half_width, front_y, back_y)``. The centerline retains the
    authored front/back values while the two surfaces bow oppositely toward
    their lateral edges, producing a shallow saddle instead of a flat plate.
    """
    if len(rings) < 4 or width_segments < 4:
        raise ValueError(f"invalid saddle bridge contract: {name}")
    row_width = width_segments + 1
    verts = []
    for z, half_width, front_y, back_y in rings:
        for side_index in range(row_width):
            t = -1.0 + 2.0 * side_index / width_segments
            edge_weight = abs(t) ** 1.7
            x = half_width * t
            front = front_y + .0035 * edge_weight
            verts.append((x, front, z))
        for side_index in range(row_width):
            t = -1.0 + 2.0 * side_index / width_segments
            edge_weight = abs(t) ** 1.7
            x = half_width * t
            back = back_y - .0025 * edge_weight
            verts.append((x, back, z))

    faces = []
    ring_stride = row_width * 2
    for ring_index in range(len(rings) - 1):
        current = ring_index * ring_stride
        nxt_ring = current + ring_stride
        for side_index in range(width_segments):
            faces.append((current + side_index, nxt_ring + side_index,
                          nxt_ring + side_index + 1, current + side_index + 1))
            faces.append((current + row_width + side_index,
                          current + row_width + side_index + 1,
                          nxt_ring + row_width + side_index + 1,
                          nxt_ring + row_width + side_index))
        faces.append((current, current + row_width, nxt_ring + row_width, nxt_ring))
        last = width_segments
        faces.append((current + last, nxt_ring + last,
                      nxt_ring + row_width + last, current + row_width + last))
    first, last = 0, (len(rings) - 1) * ring_stride
    faces.append(tuple(range(first, first + row_width)) +
                 tuple(reversed(range(first + row_width, first + ring_stride))))
    faces.append(tuple(reversed(range(last, last + row_width))) +
                 tuple(range(last + row_width, last + ring_stride)))

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    seam_fade = mesh.color_attributes.new(
        name="InnerSeamFade", type="BYTE_COLOR", domain="CORNER")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            ring_index = vertex_index // ring_stride
            half_width = float(rings[ring_index][1])
            edge_start = max(0.0, half_width - .006)
            fade = _smoothstep(edge_start, half_width,
                               abs(mesh.vertices[vertex_index].co.x))
            seam_fade.data[loop_index].color = (fade, fade, fade, 1.0)
    # Author the ring-indexed fade before applying bevel; the modifier creates
    # additional vertices and interpolates the corner attribute onto them.
    bevel(obj, .0015, 2)
    obj["authored_ring_count"] = len(rings)
    obj["bridge_width_segments"] = width_segments
    obj["connected_component_count"] = 1
    obj["saddle_profile_version"] = 1
    obj["lateral_edge_fade_width_m"] = .006
    obj["saddle_ring_z"] = tuple(float(ring[0]) for ring in rings)
    obj["saddle_ring_half_width"] = tuple(float(ring[1]) for ring in rings)
    obj["saddle_ring_front_y"] = tuple(float(ring[2]) for ring in rings)
    obj["saddle_ring_back_y"] = tuple(float(ring[3]) for ring in rings)
    obj["inner_seam_fade_contract"] = "last 6mm at each lateral edge"
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
    half_width = .026
    if abs(x) > half_width:
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    u = x / half_width
    shape = max(0.0, 1.0 - u * u)
    seam_z = 1.5738 - .0010 * u * u
    cupid = .00022 * shape * (
        math.exp(-((x - .0018) / .0010) ** 2)
        + math.exp(-((x + .0018) / .0010) ** 2)
        - 1.30 * math.exp(-(x / .0010) ** 2)
    )
    upper_height = .0048 * shape ** .55 + cupid
    lower_height = .0075 * shape ** .58

    upper_relief = 0.0
    lower_relief = 0.0
    upper_color = 0.0
    lower_color = 0.0
    if upper_height > 1e-6 and seam_z <= z <= seam_z + upper_height:
        t = (z - seam_z) / upper_height
        upper_relief = .0058 * shape ** .30 * max(0.0, math.sin(math.pi * t)) ** .72
        edge_distance = min(z - seam_z, seam_z + upper_height - z,
                            half_width - abs(x))
        upper_color = _smoothstep(0.0, .00045, max(0.0, edge_distance))
    if lower_height > 1e-6 and seam_z - lower_height <= z <= seam_z:
        t = (seam_z - z) / lower_height
        lower_relief = .0060 * shape ** .28 * max(0.0, math.sin(math.pi * t)) ** .72
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

    # Sculpt one readable facial envelope instead of layering visible skin
    # primitives onto a mask.  Negative Y is outward: malar/chin/brow forms
    # project, while the eye sockets, temples and nasolabial transitions
    # recede continuously into the same surface.
    y -= front_weight * (
        .0070 * _gaussian(x, z, -.050, 1.626, .031, .025)
        + .0070 * _gaussian(x, z,  .050, 1.626, .031, .025)
        + .0030 * _gaussian(x, z, -.037, 1.640, .026, .015)
        + .0030 * _gaussian(x, z,  .037, 1.640, .026, .015)
        + .0032 * _gaussian(x, z, -.034, 1.681, .029, .012)
        + .0032 * _gaussian(x, z,  .034, 1.681, .029, .012)
        + .0055 * _gaussian(x, z, 0.0, 1.532, .026, .017)
    )
    y += front_weight * (
        .0068 * _gaussian(x, z, -.032, 1.657, .024, .012)
        + .0068 * _gaussian(x, z,  .032, 1.657, .024, .012)
        + .0050 * _gaussian(x, z, -.080, 1.660, .019, .033)
        + .0050 * _gaussian(x, z,  .080, 1.660, .019, .033)
        + .0022 * _gaussian(x, z, -.025, 1.595, .015, .023)
        + .0022 * _gaussian(x, z,  .025, 1.595, .015, .023)
    )

    # Integrated lid folds surround the true apertures.  Their broad, shallow
    # relief removes the detached-ribbon seam while retaining a crisp 33x10 mm
    # opening for the eyeball insert.
    for side in (-1, 1):
        eye_x = .032 * side
        local_x = x - eye_x
        eye_z = 1.657 + math.tan(math.radians(5.0)) * side * local_x
        radial = (local_x / .0190) ** 2 + ((z - eye_z) / .0080) ** 2
        inner = (local_x / .0170) ** 2 + ((z - eye_z) / .00533) ** 2
        rim = max(0.0, 1.0 - radial) ** 1.8 * min(1.0, max(0.0, inner - .72) / .28)
        y -= front_weight * .0022 * rim

    amplitude, sigma_x = _nose_projection(z)
    y -= front_weight * amplitude * math.exp(-(x / sigma_x) ** 2)
    alar = (_gaussian(x, z, -.012, 1.592, .007, .007)
            + _gaussian(x, z, .012, 1.592, .007, .007))
    nostril = (_gaussian(x, z, -.009, 1.591, .0042, .0038)
               + _gaussian(x, z, .009, 1.591, .0042, .0038))
    y -= front_weight * .0045 * alar
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
    slope = math.tan(math.radians(5.0))
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
    obj["ocular_outer_lift_degrees"] = 5.0
    obj["ocular_ipd_center_x"] = cx
    return obj


def ocular_lid_ribbon(name, side, upper, centre, mat, segments=20):
    """Registered lid ribbon for the measured 33-by-10 mm eye aperture."""
    cx, cy, cz = centre
    slope = math.tan(math.radians(5.0))
    verts = []
    for back_offset in (0.0, 0.0010):
        for edge in (0, 1):
            for index in range(segments + 1):
                u = -1.0 + 2.0 * index / segments
                arch = max(0.0, 1.0 - u * u) ** 0.72
                local_x = 0.0165 * u
                if upper:
                    local_z = (0.0029 if edge == 0 else 0.0061) * arch
                    surface_offset = -0.0013 if edge == 0 else 0.0006
                else:
                    local_z = (-0.0048 if edge == 0 else -0.0066) * arch
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


def lofted_volume(name, rings, mat, sides=32, cap_bottom=True, cap_top=True):
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
    if cap_bottom:
        faces.append(tuple(reversed(range(sides))))
    last = (ring_count - 1) * sides
    if cap_top:
        faces.append(tuple(last + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    return obj


def integrated_face_volume(name, rings, mats, sides=96):
    """One continuous head surface with sockets, nose, lips, jaw and ears.

    The eye polygons are omitted to form true apertures.  Recessed almond
    inserts are the only separate ocular geometry; lid relief and the ear
    silhouette are integrated into this single connected skin shell.
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
        # The 61 mm ear height is authored as a side-only continuation of the
        # head ring.  A high-order lateral falloff keeps its 30 mm width from
        # inflating the cheek/front plane.
        # The hero reference exposes one slim ear, not two circular side
        # paddles. Keep the ear part of the connected head but reduce its
        # lateral extension so the portrait cheek and hair own the silhouette.
        for column in range(front_columns):
            u = -1.0 + 2.0 * column / (front_columns - 1)
            ear_denominator = .0185
            ear_vertical = max(0.0, 1.0 - ((z - 1.623) / ear_denominator) ** 2) ** .75
            ear_extension = .0142 * ear_vertical
            x = half_width * u + math.copysign(ear_extension * abs(u) ** 24, u)
            y = facial_surface_components(x, z)[0]
            # Helix/concha relief remains subtle in the hero view and merges
            # into the temple and mandibular planes without a floating seam.
            y += .0025 * ear_vertical * abs(u) ** 22
            verts.append((x, y, z))
        for segment in range(1, rear_segments):
            phi = math.pi * segment / rear_segments
            lateral = math.cos(phi)
            ear_denominator = .0185
            ear_vertical = max(0.0, 1.0 - ((z - 1.623) / ear_denominator) ** 2) ** .75
            ear_extension = .0142 * ear_vertical
            x = half_width * lateral + math.copysign(
                ear_extension * abs(lateral) ** 24, lateral)
            y = side_y + (rear_y - side_y) * math.sin(phi)
            y += .0025 * ear_vertical * abs(lateral) ** 22
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
                    eye_z = 1.657 + math.tan(math.radians(5.0)) * side * local_x
                    aperture = (local_x / 0.0170) ** 2 + ((centre.z - eye_z) / 0.0080) ** 2
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
    # Project the admitted portrait crop onto the actual facial surface. Rear
    # and deep side vertices sample a stable cheek tone; the hero-facing grid
    # receives the measured face rectangle from the 1024x1536 reference.
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if point.y <= -.035:
                u = .44336 + ((point.x + .095) / .190) * (.55469 - .44336)
                v = .85807 + ((point.z - 1.510) / .240) * (.94076 - .85807)
            else:
                u, v = .499, .895
            uv_layer.data[loop_index].uv = (max(0.0, min(1.0, u)),
                                            max(0.0, min(1.0, v)))
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
    obj["ocular_aperture_width"] = 0.034
    obj["ocular_aperture_height"] = 0.016
    obj["ocular_outer_lift_degrees"] = 5.0
    obj["primary_vertical_ring_count"] = len(FACIAL_ENVELOPE_ROWS)
    obj["skin_connected_component_count"] = 1
    obj["bizygomatic_width"] = .190
    obj["cranial_width"] = .176
    obj["front_to_occiput_depth"] = .188
    obj["jaw_width"] = .142
    obj["chin_width"] = .080
    obj["integrated_ear_height"] = .061
    obj["integrated_ear_width"] = .030
    obj["nose_projection"] = max(row[1] for row in NOSE_PROFILE)
    obj["mouth_seam_width"] = 0.052
    obj["upper_lip_height"] = 0.0048
    obj["lower_lip_height"] = 0.0075
    obj["upper_lip_projection"] = 0.0058
    obj["lower_lip_projection"] = 0.0060
    obj["lip_projection_max"] = 0.0060
    obj["philtrum_length"] = 0.01267
    obj["cupid_notch_width"] = 0.0036
    obj["cupid_notch_depth"] = 0.00048
    obj["mouth_corner_drop"] = 0.0010
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
            if "jacket_back" in name:
                wrinkle = .0040 * math.sin(5.0 * outer_angle + z * 31.0)
                wrinkle *= .35 + .65 * math.sin(math.pi * index / (samples - 1)) ** 2
                outer_x *= 1.0 + wrinkle / max(.08, half_x)
                inner_x *= 1.0 + wrinkle / max(.08, inner_half_x)
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
        # Preserve the authored ring topology for weights, then smooth the
        # evaluated cloth surface after deformation.  This removes the peaked
        # shoulder armor read without flattening the open-front construction.
        subdivision = obj.modifiers.new("LuxuryBomberSurface", "SUBSURF")
        subdivision.subdivision_type = "CATMULL_CLARK"
        subdivision.levels = 1
        subdivision.render_levels = 1
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
    """Open elliptical sleeve band aligned to the near-vertical forearm axis."""
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
    obj["sleeve_profile_version"] = 2
    obj["shoulder_cap_depth_max"] = max(ring[2] for ring in rings[:3])
    obj["elbow_peak_ring_index"] = 5
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
    if side not in (-1, 1) or len(rings) != 14:
        raise ValueError(f"invalid continuous trouser contract: {name}")
    centres = [Vector(ring[0]) for ring in rings]
    # Cargo-jogger cadence: generous thigh, articulated knee, a small calf
    # recovery, then gathered cloth over the high-top.  Only radial envelope
    # changes; ring centres, joints, and skinning remain untouched.
    radial_profile = (1.10, 1.10, 1.08, 1.05, 1.02, .99, .96,
                      .95, .97, 1.00, 1.03, 1.04, 1.05, 1.07)
    verts = []
    for ring_index, (_, radius_across, radius_depth, fold_amp, phase) in enumerate(rings):
        radius_across *= radial_profile[ring_index]
        radius_depth *= radial_profile[ring_index]
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
        (0.0, 0.95, 0.05), (0.0, 0.82, 0.18), (0.0, 0.62, 0.38),
        (0.0, 0.38, 0.62), (0.0, 0.15, 0.85),
        (0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 0.0, 1.0),
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
    obj["knee_blend_length"] = float(rings[6][0][2] - rings[9][0][2])
    obj["max_fold_amplitude"] = max(float(ring[3]) for ring in rings)
    obj["trouser_radial_profile_version"] = 2
    obj["upper_thigh_radial_scale"] = radial_profile[1]
    obj["knee_radial_scale"] = radial_profile[7]
    obj["upper_calf_radial_scale"] = radial_profile[10]
    obj["ankle_radial_scale"] = radial_profile[-1]
    return obj


def skinned_palm_wedge(name, side, mat, rig, sides=20):
    """Closed wrist-to-palm shell with a soft forearm/hand deformation blend.

    The previous review pose compressed a long bone-parented mitt to twelve
    percent of its rest length.  That produced a useful front silhouette but
    was not animation-safe.  This shorter shell is authored on the hand rest
    axis and crosses the wrist with explicit forearm/hand weights instead.
    """
    if side not in (-1, 1):
        raise ValueError(f"invalid palm side: {name}")
    suffix = "L" if side > 0 else "R"
    hand_bone = rig.data.bones[f"hand.{suffix}"]
    origin = Vector(hand_bone.head_local)
    axis = (Vector(hand_bone.tail_local) - origin).normalized()
    # Keep the broad dimension aligned laterally and derive a stable depth
    # direction from the rest axis.  The sign makes ring winding consistent.
    across = Vector((side, 0.0, 0.0))
    across = (across - axis * across.dot(axis)).normalized()
    depth = axis.cross(across).normalized()
    if depth.y < 0.0:
        depth.negate()

    profile = (
        (.004, .020, .015), (.016, .026, .018),
        (.035, .031, .020), (.055, .028, .018),
        (.072, .019, .012), (.085, .008, .006),
    )
    verts = []
    for distance, radius_across, radius_depth in profile:
        centre = origin + axis * distance
        for side_index in range(sides):
            angle = math.tau * side_index / sides
            verts.append(centre
                         + across * math.cos(angle) * radius_across
                         + depth * math.sin(angle) * radius_depth)
    faces = []
    for ring_index in range(len(profile) - 1):
        start = ring_index * sides
        nxt_start = start + sides
        for side_index in range(sides):
            nxt = (side_index + 1) % sides
            faces.append((start + side_index, start + nxt,
                          nxt_start + nxt, nxt_start + side_index))
    faces.append(tuple(reversed(range(sides))))
    final = (len(profile) - 1) * sides
    faces.append(tuple(final + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)

    forearm = obj.vertex_groups.new(name=f"forearm.{suffix}")
    hand = obj.vertex_groups.new(name=f"hand.{suffix}")
    ring_weights = ((.82, .18), (.45, .55), (.15, .85),
                    (0.0, 1.0), (0.0, 1.0), (0.0, 1.0))
    for ring_index, weights in enumerate(ring_weights):
        indices = list(range(ring_index * sides, (ring_index + 1) * sides))
        for group, weight in zip((forearm, hand), weights):
            if weight > 0.0:
                group.add(indices, weight, "REPLACE")
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "OBJECT"
    obj.matrix_world = world
    modifier = obj.modifiers.new("LuxuryPalmArmature", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    obj["authored_ring_count"] = len(profile)
    obj["circumferential_sides"] = sides
    obj["connected_component_count"] = 1
    obj["weight_contract"] = "forearm-hand"
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
    """Build one continuous, broad hair ribbon along a curved guide.

    The old implementation rebuilt a circular frame independently at every
    guide point.  Curved locks consequently twisted and caught tube-like
    highlights.  A transported four-corner frame keeps each lock flat and
    visually joins neighbouring guides into the swept reference hairstyle.
    ``sides`` remains in the public signature because brows and editor tooling
    call this factory directly, but the authored section is deliberately a
    ribbon prism rather than an elliptical tube.
    """
    if len(points) != len(radii) or len(points) < 2:
        raise ValueError(f"invalid tapered hair guide: {name}")
    path = [Vector(point) for point in points]

    tangents = []
    for index in range(len(path)):
        if index == 0:
            tangent = path[1] - path[0]
        elif index == len(path) - 1:
            tangent = path[-1] - path[-2]
        else:
            tangent = path[index + 1] - path[index - 1]
        if tangent.length < 1e-8:
            raise ValueError(f"degenerate tapered hair guide: {name} point={index}")
        tangents.append(tangent.normalized())

    # Parallel transport the width vector by projecting the previous frame
    # onto each new tangent plane.  This prevents the 90-degree flips produced
    # by choosing a fresh helper axis on every ring.
    front_normal = Vector((0, -1, 0))
    depth_axis = front_normal - tangents[0] * front_normal.dot(tangents[0])
    if depth_axis.length < 1e-6:
        depth_axis = Vector((0, 0, 1))
    depth_axis.normalize()
    frames = []
    for tangent in tangents:
        transported = depth_axis - tangent * depth_axis.dot(tangent)
        if transported.length < 1e-6:
            fallback = Vector((0, -1, 0)) if abs(tangent.y) < 0.92 else Vector((0, 0, 1))
            transported = fallback - tangent * fallback.dot(tangent)
        depth_axis = transported.normalized()
        width_axis = tangent.cross(depth_axis).normalized()
        frames.append((width_axis.copy(), depth_axis))

    verts = []
    for centre, radius, (width_axis, depth_axis) in zip(path, radii, frames):
        half_width = max(float(radius), 0.00025)
        half_depth = max(half_width * thickness_ratio, half_width * 0.18)
        verts.extend((
            centre - width_axis * half_width + depth_axis * half_depth,
            centre + width_axis * half_width + depth_axis * half_depth,
            centre + width_axis * half_width - depth_axis * half_depth,
            centre - width_axis * half_width - depth_axis * half_depth,
        ))
    faces = []
    for path_index in range(len(path) - 1):
        start = path_index * 4
        nxt_start = (path_index + 1) * 4
        for corner in range(4):
            nxt = (corner + 1) % 4
            faces.append((start + corner, start + nxt, nxt_start + nxt, nxt_start + corner))
    faces.append((3, 2, 1, 0))
    last = (len(path) - 1) * 4
    faces.append((last, last + 1, last + 2, last + 3))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, min(float(radius) for radius in radii) * 0.18, 2)
    subdivision = obj.modifiers.new("LuxuryRibbonFlow", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    obj.select_set(False)
    set_material(obj, mat)
    obj["sectionProfile"] = "transported-ribbon"
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
    rig_location_snapshot = rig.location.copy()
    rig_rotation_snapshot = rig.rotation_euler.copy()
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

    front_locked = os.environ.get("LUXURY_REVIEW_POCKET_FRONT") == "1"
    review_x_offset = 0.0
    review_z_offset = -.012 if front_locked else 0.0
    rig.location.x += review_x_offset
    rig.location.z += review_z_offset
    review_world_yaw = math.radians(7.0)
    review_world_matrix = Matrix.Rotation(review_world_yaw, 4, "Y")
    rig.rotation_euler.y += review_world_yaw

    def rotate_review_control(control):
        if review_world_yaw:
            control.location = rig.location + review_world_matrix @ (control.location - rig.location)
    # The frontal pocket review preserves the measured projection while still
    # exercising the pocket pose. The normal hero review keeps the authored
    # three-quarter turn for depth inspection.
    if not front_locked:
        pose_bones["chest"].rotation_euler.y = math.radians(-8)
        pose_bones["chest"].rotation_euler.z = math.radians(-3)
        pose_bones["neck"].rotation_euler.y = math.radians(-7)
        pose_bones["head"].rotation_euler.y = math.radians(-16)
    else:
        # The admitted portrait is a restrained three-quarter stance. A small
        # turn keeps the front texture legible while revealing enough cheek,
        # jaw and jacket depth to avoid a flat paper-doll read.
        pose_bones["chest"].rotation_euler.y = math.radians(-10.0)
        pose_bones["chest"].rotation_euler.z = math.radians(-1.0)
        # The portrait texture already contains the reference's three-quarter
        # facial turn. Keep the supporting geometry nearly frontal so a second
        # seven-degree yaw does not expose the untextured skull beside the
        # portrait shell or split the likeness down the nose.
        pose_bones["neck"].rotation_euler.y = math.radians(-6.0)
        pose_bones["head"].rotation_euler.x = math.radians(7.0)
        pose_bones["head"].rotation_euler.y = math.radians(12.0)
        pose_bones["head"].rotation_euler.z = math.radians(8.0)

    # Restrained planted contrapposto keeps the sole spacing stable while the
    # torso and hip tilts break the former mirrored stance.
    pose_bones["hips"].location.x = 0.012 if front_locked else 0.040
    if front_locked:
        pose_bones["hips"].location.z = 0.000
    # On this rig local Z maps to screen-plane roll. Counter the chest with a
    # restrained two-degree pelvis tilt while retaining a planted silhouette.
    pose_bones["hips"].rotation_euler.z = math.radians(7.0 if front_locked else 5.0)
    for name, rotation in {
        "thigh.L": (0, 0, -3.0), "shin.L": (0, 0, 1.0), "foot.L": (0, 0, 8.0),
        "thigh.R": (-6, 0, 5.0), "shin.R": (10, 0, -2.0), "foot.R": (-4, 0, -3.0),
    }.items():
        if front_locked:
            front_rotation = {
                "thigh.L": (0, 0, -2.0), "shin.L": (0, 0, 0), "foot.L": (0, 0, 9.0),
                "thigh.R": (0, 0, 7.0), "shin.R": (4.0, 0, 0), "foot.R": (0, 0, 5.0),
            }[name]
            pose_bones[name].rotation_euler = tuple(math.radians(value) for value in front_rotation)
        else:
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
            "wrist": (.195, -.065, 1.085),
            "pole": (.440, .250, 1.145),
            "pole_angle": 3.132866,
            "insert": (.174, -.055, .872),
        },
        "R": {
            "wrist": (-.195, -.053, 1.081),
            "pole": (-.440, .550, 1.142),
            "pole_angle": .008727,
            "insert": (-.172, -.050, .872),
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
        target.location.x += review_x_offset
        target.location.z += review_z_offset
        rotate_review_control(target)
        target.empty_display_type = "SPHERE"
        target.empty_display_size = 0.018
        target["pocket_mouth_x"] = .160 * sign
        target["wrist_lateral_offset"] = .030
        target["max_chain_reach_fraction"] = .90
        bpy.context.collection.objects.link(target)
        pole = bpy.data.objects.new(f"LuxuryReview_arm_pole_{suffix}", None)
        pole.location = solved["pole"]
        pole.location.x += review_x_offset
        pole.location.z += review_z_offset
        rotate_review_control(pole)
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
        insert.location.x += review_x_offset
        insert.location.z += review_z_offset
        rotate_review_control(insert)
        insert.empty_display_type = "CUBE"
        insert.empty_display_size = .014
        insert["hand_insert_fraction"] = .80
        bpy.context.collection.objects.link(insert)
        hand_constraint = pose_bones[f"hand.{suffix}"].constraints.new("DAMPED_TRACK")
        hand_constraint.name = f"LuxuryReferencePose_hand_{suffix}"
        hand_constraint.target = insert
        hand_constraint.track_axis = "TRACK_Y"
        # Compress the visible portrait hand along its bone in this authored
        # pocket pose. The neutral pose matrix is restored after review.
        pose_bones[f"hand.{suffix}"].scale = (.32, .50, .32)
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
    return controls, constraints, pose_snapshot, rig_location_snapshot, rig_rotation_snapshot


def apply_front_apose(rig):
    """Reversible shallow A-pose matching the generated orthographic plate."""
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
    bpy.context.view_layer.update()

    controls = []
    constraints = []
    for suffix, sign in (("L", 1), ("R", -1)):
        target = bpy.data.objects.new(f"LuxuryReview_apose_target_{suffix}", None)
        target.location = (.300 * sign, -.012, .975)
        target.empty_display_type = "SPHERE"
        target.empty_display_size = .014
        bpy.context.collection.objects.link(target)
        pole = bpy.data.objects.new(f"LuxuryReview_apose_pole_{suffix}", None)
        pole.location = (.650 * sign, .180, 1.180)
        pole.empty_display_type = "PLAIN_AXES"
        pole.empty_display_size = .035
        bpy.context.collection.objects.link(pole)
        constraint = pose_bones[f"forearm.{suffix}"].constraints.new("IK")
        constraint.name = f"LuxuryFrontApose_arm_{suffix}"
        constraint.target = target
        constraint.pole_target = pole
        constraint.chain_count = 2
        constraint.use_tail = True
        constraint.use_stretch = False
        constraint.pole_angle = math.pi if suffix == "L" else 0.0
        controls.extend((target, pole))
        constraints.append((pose_bones[f"forearm.{suffix}"], constraint))
    bpy.context.view_layer.update()
    return controls, constraints, pose_snapshot


def clear_reference_pose(rig, pose_state) -> None:
    controls, constraints, pose_snapshot, *object_state = pose_state
    for pose_bone, constraint in constraints:
        pose_bone.constraints.remove(constraint)
    for control in controls:
        bpy.data.objects.remove(control, do_unlink=True)
    for pose_bone in rig.pose.bones:
        matrix_basis, rotation_mode = pose_snapshot[pose_bone.name]
        pose_bone.rotation_mode = rotation_mode
        pose_bone.matrix_basis = matrix_basis
    if object_state:
        rig.location = object_state[0]
    if len(object_state) > 1:
        rig.rotation_euler = object_state[1]
    bpy.context.view_layer.update()


def build_face_portrait_shell(name, mat, columns=28, rows=36):
    """Dense curved portrait layer registered to the authored facial surface."""
    controls = sorted(FACIAL_ENVELOPE_ROWS, key=lambda ring: ring[0])

    def smooth_front(z, x, half_width):
        lower, upper = controls[0], controls[-1]
        for candidate_lower, candidate_upper in zip(controls, controls[1:]):
            if candidate_lower[0] <= z <= candidate_upper[0]:
                lower, upper = candidate_lower, candidate_upper
                break
        mix = 0.0 if upper[0] == lower[0] else (z - lower[0]) / (upper[0] - lower[0])
        front_y = lower[2] * (1 - mix) + upper[2] * mix
        side_y = lower[3] * (1 - mix) + upper[3] * mix
        lateral = min(1.0, abs(x) / max(.001, half_width))
        base = front_y + (side_y - front_y) * lateral ** 2.2 - .012 * (1.0 - lateral ** 2)
        # Landmark-scale relief gives the portrait a real profile: projected
        # colour supplies likeness while these measured lobes supply nose,
        # cheek, lip and chin depth under moving light.
        nose = .034 * math.exp(-((x / .018) ** 2 + ((z - 1.610) / .034) ** 2))
        cheek = .018 * (
            math.exp(-(((x - .036) / .026) ** 2 + ((z - 1.615) / .035) ** 2)) +
            math.exp(-(((x + .036) / .026) ** 2 + ((z - 1.615) / .035) ** 2)))
        lips = .012 * math.exp(-((x / .027) ** 2 + ((z - 1.565) / .015) ** 2))
        chin = .013 * math.exp(-((x / .032) ** 2 + ((z - 1.530) / .024) ** 2))
        return base - nose - cheek - lips - chin

    verts = []
    for row in range(rows):
        tz = row / (rows - 1)
        z = 1.510 + tz * .240
        # The source has a broad mandibular/zygomatic read. The earlier shell
        # compressed the portrait into a narrow mask even though the skull and
        # ears were correctly spaced.
        half_width = 1.08 * (.055 + .020 * math.sin(math.pi * tz) ** .65)
        for column in range(columns):
            tx = column / (columns - 1)
            x = -half_width + 2.0 * half_width * tx
            y = smooth_front(z, x, half_width)
            verts.append((x, y, z))
    faces = []
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            b = a + 1
            c = a + columns + 1
            d = a + columns
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    portrait_blend = mesh.color_attributes.new(
        name="PortraitBlend", type="BYTE_COLOR", domain="CORNER")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            row = vertex_index // columns
            column = vertex_index % columns
            tx = column / (columns - 1)
            tz = row / (rows - 1)
            uv_layer.data[loop_index].uv = (
                .44336 + tx * (.54800 - .44336),
                .85807 + tz * (.94076 - .85807),
            )
            edge_x = min(tx, 1.0 - tx)
            # Feather only the lateral paper-mask edges. Keeping the full
            # vertical range preserves the chin-to-neck join and lets the hair
            # naturally cover the upper boundary.
            lateral_mask = _smoothstep(0.0, .18, edge_x)
            feather_strength = _smoothstep(.15, .45, tz)
            mask = lateral_mask * (1.0 - feather_strength * (1.0 - lateral_mask))
            portrait_blend.data[loop_index].color = (mask, mask, mask, 1.0)
    obj["portraitShell"] = True
    obj["editorProxyFor"] = PREFIX + "skin_face_shell"
    return obj


def build_face_side_portrait_shell(name, side, mat, columns=30, rows=36):
    """Curved side-owned portrait layer from the generated turnaround sheet."""
    controls = sorted(FACIAL_ENVELOPE_ROWS, key=lambda ring: ring[0])
    verts = []
    for row in range(rows):
        tz = row / (rows - 1)
        z = 1.510 + tz * .240
        half_width = _lerp_rows(z, controls, 1)[0] * 1.015
        # Human profile envelope in author space: chin/lips/nose/forehead.
        front = (-.086 -
                 .025 * math.exp(-((z - 1.565) / .030) ** 2) -
                 .043 * math.exp(-((z - 1.610) / .034) ** 2) -
                 .012 * math.exp(-((z - 1.690) / .050) ** 2))
        back = .068 - .010 * abs(2.0 * tz - 1.0)
        for column in range(columns):
            ty = column / (columns - 1)
            y = front * (1.0 - ty) + back * ty
            wrap = math.sin(math.pi * ty * .5) ** .72
            x = side * half_width * wrap
            verts.append((x, y, z))
    faces = []
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            b = a + 1
            c = a + columns + 1
            d = a + columns
            faces.append((a, b, c, d) if side > 0 else (a, d, c, b))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=True)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, mat)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            row = vertex_index // columns
            column = vertex_index % columns
            ty = column / (columns - 1)
            if side < 0:
                ty = 1.0 - ty
            tz = row / (rows - 1)
            uv_layer.data[loop_index].uv = (
                .332 + ty * (.415 - .332),
                .840 + tz * (.946 - .840),
            )
    obj["portraitSideShell"] = True
    obj["editorProxyFor"] = PREFIX + "skin_face_shell"
    return obj


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
    for vertex in face.data.vertices:
        if vertex.co.z < 1.650:
            jaw_weight = max(0.0, min(1.0, (1.650 - vertex.co.z) / .140))
            vertex.co.x *= 1.0 + .10 * jaw_weight
            vertex.co.x *= 1.0 - .08 * jaw_weight
        if 1.620 < vertex.co.z < 1.700:
            cheek_weight = 1.0 - abs(vertex.co.z - 1.660) / .040
            vertex.co.x *= 1.0 - .04 * max(0.0, cheek_weight)
        if vertex.co.z < 1.657:
            vertex.co.z = 1.657 + (vertex.co.z - 1.657) * .964
        vertex.co.x *= .94
        vertex.co.x *= .95
        vertex.co.x *= .995
        vertex.co.x *= .980
        if vertex.co.x < 0.0:
            vertex.co.y += .006
        elif vertex.co.x > 0.0:
            vertex.co.x *= .85
    face.data.update()
    face["likeness_x_scale"] = .94525
    face["integrated_ear_tip_x_scale"] = .94525
    face["support_lateral_scale"] = .980
    # The dedicated curved portrait shell owns the frontal likeness. Give the
    # supporting skull and ears a stable skin material so turning the head does
    # not smear the cyan-lit edge of the source image across the temples.
    face.data.materials.append(mats["face_support"])
    for polygon in face.data.polygons:
        polygon.material_index = 1
    face.hide_render = True
    head_owned.append(face)
    face_portrait = build_face_portrait_shell(PREFIX + "skin_face_portrait", mats["face_portrait"])
    for vertex in face_portrait.data.vertices:
        vertex.co.y *= 1.20
        vertex.co.x *= 1.1300000
        if vertex.co.z > 1.650:
            portrait_temple_weight = max(0.0, min(1.0, (vertex.co.z - 1.650) / .070))
            vertex.co.x *= 1.0 - .015 * portrait_temple_weight
        if vertex.co.z < 1.650:
            portrait_jaw_weight = max(0.0, min(1.0, (1.650 - vertex.co.z) / .100))
            vertex.co.x *= 1.0 - .12 * portrait_jaw_weight
        if vertex.co.z < 1.680:
            portrait_cheek_weight = max(0.0, min(1.0, (1.680 - vertex.co.z) / .060))
            vertex.co.x *= 1.0 - .03 * portrait_cheek_weight
        if 1.620 < vertex.co.z < 1.700:
            portrait_lower_cheek_weight = 1.0 - abs(vertex.co.z - 1.660) / .040
            vertex.co.x *= 1.0 - .065 * max(0.0, portrait_lower_cheek_weight)
        if vertex.co.z < 1.610:
            vertex.co.z = 1.610 + (vertex.co.z - 1.610) * .900000
        if vertex.co.z < 1.657:
            vertex.co.z = 1.657 + (vertex.co.z - 1.657) * .8500
        vertex.co.z = 1.657 + (vertex.co.z - 1.657) * 1.10
        if vertex.co.x > 0.0:
            vertex.co.x *= 1.0 + 0.08 * _smoothstep(0.050, 0.095, vertex.co.x)
    face_portrait.data.update()
    portrait_blend = face_portrait.data.color_attributes.get("PortraitBlend")
    if portrait_blend is not None:
        for polygon in face_portrait.data.polygons:
            for loop_index in polygon.loop_indices:
                vertex = face_portrait.data.vertices[
                    face_portrait.data.loops[loop_index].vertex_index
                ]
                ocular_opening = min(
                    ((vertex.co.x - 0.032 * side) / 0.0190) ** 2
                    + ((vertex.co.z - (
                        1.657 + math.tan(math.radians(5.0)) * side
                        * (vertex.co.x - 0.032 * side)
                    )) / 0.0090) ** 2
                    for side in (-1, 1)
                )
                mouth_opening = (
                    (vertex.co.x / 0.030) ** 2
                    + ((vertex.co.z - 1.565) / 0.0045) ** 2
                )
                if mouth_opening <= 1.0:
                    portrait_blend.data[loop_index].color = (0.0, 0.0, 0.0, 1.0)
    face_portrait["likeness_x_scale"] = 1.1300000
    face_portrait["likeness_z_scale"] = 1.10
    face_portrait["likeness_forward_scale"] = 1.20
    head_owned.append(face_portrait)
    for side in (-1, 1):
        ear = face_anchor(PREFIX + f"skin_ear_{side:+d}")
        ear["integrated_skin_region"] = "ear"
        ear["authored_height"] = .061
        ear["authored_width"] = .030
        # Pass 17 keeps the accepted 64 mm IPD while making the ocular
        # assembly truly bilateral.  Both irises sit on their eye centres;
        # the prior global X offset made the pupils read as floating points.
        eye_x = 0.032 * side
        gaze_x = eye_x
        gaze_surface = ocular_surface_y(gaze_x, 1.657)
        eye = almond_insert(PREFIX + f"accent_eye_{side:+d}", side,
                            (eye_x, gaze_surface, 1.657),
                            0.0330, 0.0085, 0.0035, mats["eye"], 40)
        iris = ellipsoid(PREFIX + f"accent_iris_{side:+d}",
                         (gaze_x, gaze_surface - 0.00140, 1.657),
                         (0.0110, 0.0014, 0.0112), mats["iris"], 28, 18)
        pupil = ellipsoid(PREFIX + f"accent_pupil_{side:+d}",
                          (gaze_x, gaze_surface - 0.00170, 1.657),
                          (0.0050, 0.0009, 0.0050), mats["pupil"], 24, 14)
        eye.hide_render = False
        iris.hide_render = False
        pupil.hide_render = False
        for ocular_layer in (eye, iris, pupil):
            ocular_layer.location.y -= 0.0205
        # Lid relief now belongs to skin_face_shell. Preserve these public
        # names as non-rendering editor anchors for existing customization UI.
        upper_lid = face_anchor(PREFIX + f"skin_upper_lid_{side:+d}")
        lower_lid = face_anchor(PREFIX + f"skin_lower_lid_{side:+d}")
        upper_lid["integrated_skin_region"] = "upper_lid"
        lower_lid["integrated_skin_region"] = "lower_lid"
        upper_lid["sclera_overlap"] = .00125
        lower_lid["lid_recession"] = .0025

        # A seven-section tapered brow supplies the 40 mm reference arc.
        # Cross-sections are deliberately shallow in Y and taller in Z, which
        # keeps the hair embedded in the forehead without the old blocky tube.
        brow_points = []
        for u in (-1.0, -0.5, 0.0, 0.5, 1.0):
            x = eye_x + side * .020 * u
            aperture_u = (.0165 / .0165) * u
            upper_z = (1.657
                       + .0047 * max(0.0, 1.0 - aperture_u * aperture_u) ** .72
                       + math.tan(math.radians(5.0)) * side * (x - eye_x))
            z = upper_z + .0095 + .0010 * (1.0 - u * u)
            brow_points.append((x, ocular_surface_y(x, z) - .0012, z))
        brow = tapered_lock(PREFIX + f"hair_brow_{side:+d}", brow_points,
                            (.001298, .002006, .002360, .001888, .000708),
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
        # Narrow buried continuation maintains watertight collar contact while
        # the full visible neck begins 12 mm higher for the portrait silhouette.
        (1.555, 0.02500, 0.018000,  0.004, 2.0),
        (1.566, 0.02850000000, 0.023625,  0.002, 2.0),
        (1.580, 0.02844557254, 0.023844,  0.000, 2.0),
        (1.605, 0.024500000, 0.0260, -0.018, 2.0),
    ], mats["skin"], 32, cap_bottom=False, cap_top=True)
    neck.hide_render = True
    neck["open_buried_base"] = True
    neck["lower_taper_version"] = 1
    neck["shortened_profile_version"] = 2
    for polygon in neck.data.polygons:
        polygon.use_smooth = True
    neck["smooth_shaded"] = True
    add_render_subdivision(neck)
    neck["subdivision_blend_version"] = 1
    # Keep the visible neck matte and stable beneath the portrait face shell.
    project_front_uv(neck, (-.060, .060), (1.530, 1.605),
                     (.450, .550), (.815, .872))
    set_material(neck, mats["neck_skin"])
    bone_parent(neck, rig, "neck")
    owned.append(neck)
    for side in (-1, 1):
        scm = tube_curve(PREFIX + f"skin_neck_scm_{side:+d}", [
            (0.033 * side, -0.049, 1.610), (0.037 * side, -0.050, 1.570),
            (0.046 * side, -0.043, 1.532),
        ], 0.0022, mats["skin"])
        scm.hide_render = True
        bone_parent(scm, rig, "neck")
        owned.append(scm)
    for obj in head_owned:
        obj.location.z += HEAD_RAISE
        compress_head_height(obj)
        if not any(token in obj.name for token in (
                "accent_eye_", "accent_iris_", "accent_pupil_", "hair_brow_")):
            fit_head_width(obj)
            if "skin_face_portrait" in obj.name:
                obj.scale.x *= 1.15
                apply_scale(obj)
    bpy.context.view_layer.update()
    for obj in head_owned:
        bone_parent(obj, rig, "head")
    owned += head_owned


def build_hair(rig, mats):
    owned = []
    cap_location = (0.004, 0.018, 1.718)
    cap_dimensions = (0.226, 0.184, 0.148)
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
        if any(token in obj.name for token in ("hair_quiff_lock_", "hair_secondary_lock_", "hair_bridge_lock_")):
            obj.hide_render = True
        if obj.type == "MESH" and obj.name.startswith(PREFIX + "hair_") and "brow" not in obj.name:
            project_front_uv(obj, (-.130, .130), (1.650, 1.815),
                             (.41797, .56543), (.91211, .96615))
            if not obj.data.materials or obj.data.materials[0] != mats["hair_highlight"]:
                set_material(obj, mats["hair_portrait"])
                obj.data.materials.append(mats["hair"])
                for polygon in obj.data.polygons:
                    if polygon.normal.y < .45:
                        polygon.material_index = 1
        obj.location.z += HEAD_RAISE
        compress_head_height(obj)
        fit_head_width(obj)
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
    radii = Vector((.112, .101, .087))
    azimuth_samples = 36
    elevation_bands = 9

    def angle_delta(a, b):
        return (a - b + math.pi) % math.tau - math.pi

    def cap_point(a, e, q):
        # Keep the side part a narrow 8–14 mm valley.  The former 45 mm radial
        # collapse exposed a bald, skin-coloured patch across the crown.
        part = .020 * math.exp(-(angle_delta(a, math.radians(-52)) ** 2) / (2 * .065 ** 2)) * \
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
            e_min = math.radians(-10 - 4 * ((math.sin(a) + 1) * .5))
            e = e_min + (math.radians(82) - e_min) * band / (elevation_bands - 1)
            cap_verts.append(cap_point(a, e, 1.0))
    pole_index = len(cap_verts)
    cap_verts.append((centre.x - .004, centre.y, centre.z + radii.z))
    inner_start = len(cap_verts)
    for azimuth in range(azimuth_samples):
        a = math.tau * azimuth / azimuth_samples
        e_min = math.radians(-10 - 4 * ((math.sin(a) + 1) * .5))
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
    for vertex in cap.data.vertices:
        vertex.co.x = centre.x + (vertex.co.x - centre.x) * 1.05
        vertex.co.y = centre.y + (vertex.co.y - centre.y) * 1.05
        vertex.co.z = centre.z + (vertex.co.z - centre.z) * 1.04
        vertex.co.z -= .005
    cap.data.update()
    cap["solid_support_scale"] = "1.05,1.05,1.04"
    owned.append(cap)

    # Dense hidden support beneath the ribbons.  It sits behind the facial
    # plane, supplies the measured 40–55 mm temple overhang, and prevents
    # lighting from exposing scalp-sized holes between deliberately tapered
    # locks.  The public swappable cap remains the canonical editor handle.
    underlay = ellipsoid(PREFIX + "hair_swept_underlay",
                         (-.025, .030, 1.739), (.182, .178, .162),
                         mats["hair"], 48, 28)
    underlay.scale = (1.05, 1.05, 1.04)
    apply_scale(underlay)
    underlay["editorProxyFor"] = PREFIX + "hair_swept_cap"
    underlay["hiddenScalpSupport"] = True
    underlay["solid_support_scale"] = "1.05,1.05,1.04"
    owned.append(underlay)

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
    primary_factors = (1.00, 1.05, .90, .68, .38, .10)
    visible_primary_masses = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}
    mass_factors = (1.00, 1.05, .92, .74, .50, .28)
    primary_points = []
    for index, (a_deg, e_deg, sweep, forward, lift, root_radius, thickness) in enumerate(primary_rows):
        root = cap_point(math.radians(a_deg), math.radians(e_deg), .875)
        mass = index in visible_primary_masses
        sweep_scale = 1.05 if mass else 1.0
        forward_scale = .82 if mass else 1.0
        if index == 1:
            forward_scale *= 1.10
        elif index == 3:
            forward_scale *= 1.3267
        elif index == 5:
            forward_scale *= .94
        elif index == 7:
            forward_scale *= 1.00
        lift_scale = .80 if mass else 1.0
        displacements = (
            (0,0,0),
            (-.10*sweep*sweep_scale,-.35*forward*forward_scale,.18*lift*lift_scale),
            (-.32*sweep*sweep_scale,-.72*forward*forward_scale,.52*lift*lift_scale),
            (-.62*sweep*sweep_scale,-.92*forward*forward_scale,.85*lift*lift_scale),
            (-.86*sweep*sweep_scale,-.48*forward*forward_scale,.62*lift*lift_scale),
            (-1.00*sweep*sweep_scale,.10*forward*forward_scale,.16*lift*lift_scale),
        )
        weights = (0,.2,.6,1,.6,0)
        points = tuple((root.x + dx, root.y + dy + weights[i] * primary_jitter[index], root.z + dz)
                       for i, (dx, dy, dz) in enumerate(displacements))
        ribbon_half_width = root_radius * (.44 if mass else .35) * (1.10 if mass else 1.0)
        if index == 1:
            ribbon_half_width *= 1.06
        elif index == 3:
            ribbon_half_width *= 1.06
        elif index == 5:
            ribbon_half_width *= 1.06
        elif index == 7:
            ribbon_half_width *= 1.00
        elif index == 8:
            ribbon_half_width *= 1.08
        elif index == 9:
            ribbon_half_width *= 1.08
        elif index == 10:
            ribbon_half_width *= 1.08
        elif index == 11:
            ribbon_half_width *= 1.08
        elif index == 12:
            ribbon_half_width *= 1.08
        lock_factors = mass_factors if mass else primary_factors
        lock_thickness = .24 if mass else thickness
        lock = tapered_lock(PREFIX + f"hair_quiff_lock_{index:02d}", points,
                            tuple(ribbon_half_width * factor for factor in lock_factors),
                            mats["hair"], sides=12, thickness_ratio=lock_thickness)
        lock["lockLayer"] = "primary"
        lock["guideIndex"] = index
        if index in (1, 4, 5, 8, 10):
            set_material(lock, mats["hair_highlight"])
        owned.append(lock)
        primary_points.append(points)

    # Fine curved strand highlights break the remaining ribbon edges into a
    # swept, layered hairstyle while retaining the cap as a watertight slot.
    for guide_index, guide in enumerate(primary_points[:12]):
        for strand_index, offset in enumerate((-.0032, .0032)):
            strand_points = [
                (point[0] + offset, point[1] - .0025, point[2] + .0015 * math.sin(math.pi * i / (len(guide) - 1)))
                for i, point in enumerate(guide)
            ]
            strand_mat = mats["hair_highlight"] if (guide_index + strand_index) % 4 == 0 else mats["hair"]
            strand = tube_curve(PREFIX + f"hair_fine_strand_{guide_index:02d}_{strand_index:02d}",
                                strand_points, .00155, strand_mat, cyclic=False, resolution=3)
            strand["lockLayer"] = "fine-strand"
            owned.append(strand)

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
    secondary_factors = (1.0, .92, .70, .42, .12)
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
        ribbon_half_width = root_radius * (.34 if index < 7 else (.32 if index in (7, 8, 9, 10, 11) else .30))
        lock = tapered_lock(name, points, tuple(ribbon_half_width * factor for factor in secondary_factors),
                            mats["hair"], sides=8, thickness_ratio=thickness)
        lock["lockLayer"] = "secondary"
        lock["guideIndex"] = index
        owned.append(lock)

    # Three broad bridge waves close the crown into one continuous swept mass while
    # leaving only the intended narrow character-right part valley visible.
    for index, (a_deg, y_offset, lift) in enumerate(((-36, -.004, .045), (-48, .004, .048), (-58, .012, .043))):
        root = cap_point(math.radians(a_deg), math.radians(24 + index * 5), .87)
        points = (
            root,
            (root.x + .010, root.y - .014 + y_offset, root.z + .020),
            (root.x - .018, root.y - .032 + y_offset, root.z + lift * .45),
            (root.x - .060, root.y - .040 + y_offset, root.z + lift),
            (root.x - .112, root.y - .027 + y_offset, root.z + lift * .56),
            (root.x - .158, root.y - .004 + y_offset, root.z + lift * .18),
        )
        lock = tapered_lock(PREFIX + f"hair_bridge_lock_{index:02d}", points,
                            (.0065,.007,.0065,.005,.003,.0008), mats["hair"],
                            sides=12, thickness_ratio=.58)
        lock["lockLayer"] = "primary-bridge"
        lock["guideIndex"] = index
        owned.append(lock)

    # Three hero-facing fringe sweeps produce the reference's lifted wave that
    # resolves into a soft temple tip rather than a straight horizontal shelf.
    fringe_guides = (
        ((.062,-.040,1.754),(.048,-.062,1.779),(.014,-.086,1.798),(-.030,-.101,1.790),(-.084,-.108,1.748),(-.115,-.102,1.700)),
        ((.046,-.046,1.758),(.026,-.070,1.785),(-.010,-.094,1.804),(-.052,-.108,1.786),(-.098,-.112,1.744),(-.120,-.102,1.694)),
        ((.026,-.048,1.756),(.006,-.072,1.781),(-.030,-.096,1.795),(-.068,-.108,1.774),(-.106,-.108,1.738),(-.122,-.096,1.700)),
    )
    for index, points in enumerate(fringe_guides):
        lock = tapered_lock(PREFIX + f"hair_fringe_lock_{index:02d}", points,
                            (.0105,.0125,.011,.008,.004,.0010), mats["hair"],
                            sides=10, thickness_ratio=.34)
        lock["lockLayer"] = "fringe"
        lock["guideIndex"] = index
        owned.append(lock)

    for obj in owned:
        # The orthographic portrait already contains the broad swept locks.
        # Keep true 3D cap depth and fringe strands, but suppress the old
        # rope-like masses that doubled the hairstyle over the projection.
        if "hair_quiff_lock_" in obj.name:
            obj.hide_render = True
        elif "hair_bridge_lock_" in obj.name:
            obj.hide_render = True
        elif "hair_fine_strand_" in obj.name:
            obj.hide_render = True
        if obj.type == "MESH" and obj.name.startswith(PREFIX + "hair_") and "brow" not in obj.name:
            project_front_uv(obj, (-.130, .130), (1.650, 1.815),
                             (.41797, .56543), (.87600, .96615))
            if not obj.data.materials or obj.data.materials[0] != mats["hair_highlight"]:
                set_material(obj, mats["hair_portrait"])
        obj.location.z += HEAD_RAISE
        compress_head_height(obj)
        fit_head_width(obj)
    cap_material = mats["hair_portrait"].copy()
    cap_material.name = "AvatarLuxuryHairSweptCapPortrait"
    cap_bsdf = cap_material.node_tree.nodes.get("Principled BSDF")
    if cap_bsdf is not None:
        cap_bsdf.inputs["Roughness"].default_value = .30
        if "Coat Weight" in cap_bsdf.inputs:
            cap_bsdf.inputs["Coat Weight"].default_value = .08
        elif "Clearcoat" in cap_bsdf.inputs:
            cap_bsdf.inputs["Clearcoat"].default_value = .08
    set_material(cap, cap_material)
    cap.scale.x *= 1.16
    apply_scale(cap)
    cap.location.y += .030
    cap.hide_render = False
    bpy.context.view_layer.update()
    for obj in owned:
        bone_parent(obj, rig, "head")
    return owned


def build_shirt_and_bomber(rig, mats):
    owned = []
    torso_owned = []
    chest_insert = bpy.data.objects.new(PREFIX + "skin_chest_insert", None)
    chest_insert.empty_display_type = "PLAIN_AXES"
    chest_insert.empty_display_size = .006
    bpy.context.collection.objects.link(chest_insert)
    chest_insert["editorProxyFor"] = PREFIX + "top_black_back"
    chest_insert["swappable_body_region"] = "chest"
    owned.append(chest_insert)
    torso_owned.append(chest_insert)
    chest_skin_shell = lofted_volume(PREFIX + "skin_chest_insert_shell", [
        (1.4925, .005, .009, -.080, 2.0),
        (1.4450, .010, .009, -.080, 2.0),
        (1.3975, .007, .009, -.080, 2.0),
    ], mats["skin"], 24)
    chest_skin_shell["editorProxyFor"] = chest_insert.name
    chest_skin_shell["swappable_body_region"] = "chest"
    chest_skin_shell["behind_v_shell"] = True
    owned.append(chest_skin_shell)
    torso_owned.append(chest_skin_shell)
    # Deep-V inner shirt: back/side shell plus two open front panels.
    shirt_back = box(PREFIX + "top_black_back", (0, 0.045, 1.300), (0.2300, 0.110, 0.350), mats["black"], 0.040)
    project_front_uv(shirt_back, (-.245, .245), (1.035, 1.585),
                     (.336, .660), (.567, .839))
    set_material(shirt_back, mats["shirt_black"])
    for vertex in shirt_back.data.vertices:
        world_z = shirt_back.location.z + vertex.co.z
        t = max(0.0, min(1.0, (world_z - 1.125) / .350))
        vertex.co.x *= .65 + .35 * t
    shirt_back.data.update()
    shirt_back.hide_render = True
    owned.append(shirt_back)
    shirt_shell = rounded_open_bomber_shell(PREFIX + "top_black_v_shell", [
        (1.49, .075, .045, -.055, .060, 0),
        (1.40, .130, .055, -.050, .065, 0),
        (1.20, .145, .050, -.045, .125, 0),
        (1.14, .140, .045, -.040, .120, 0),
    ], mats["shirt_portrait"], thickness=.006, front_lip_y=-.110,
       samples=36, rig=rig)
    shirt_shell.hide_render = False
    project_front_uv(shirt_shell, (-.14, .14), (1.14, 1.49),
                     (.375, .625), (.550, .820))
    shirt_shell["editorProxyFor"] = shirt_back.name
    shirt_shell["swappable_body_region"] = "chest"
    owned.append(shirt_shell)
    torso_owned.append(shirt_shell)
    for side in (-1, 1):
        panel = bpy.data.objects.new(PREFIX + f"top_open_panel_{side:+d}", None)
        panel["editorProxyFor"] = PREFIX + "top_black_back"
        panel.empty_display_type = "PLAIN_AXES"
        panel.empty_display_size = .006
        bpy.context.collection.objects.link(panel)
        owned.append(panel)
        inner_collar = beam(PREFIX + f"top_inner_collar_{side:+d}",
                            (.038 * side, -.132, 1.525),
                            (.092 * side, -.145, 1.405),
                            .026, .012, mats["black"], .003)
        inner_collar.hide_render = True
        inner_collar["editorProxyFor"] = PREFIX + "jacket_bomber_collar_u"
        owned.append(inner_collar)

    collar_base = open_ellipse_path(.102, .074, -.005, .065, 1.505, 48)
    collar_path = [
        (point[0], point[1], 1.505 + .040 * math.sin(math.pi * index / (len(collar_base) - 1)))
        for index, point in enumerate(collar_base)
    ]
    collar_strip = ribbon_strip(PREFIX + "jacket_bomber_collar_u",
                                collar_path, .018, .010, mats["black"])
    collar_strip["editorSlot"] = "jacket-collar"
    collar_strip["swappable_body_region"] = "jacket-collar"
    collar_strip["authored_path_points"] = 48
    collar_strip["collarHeight"] = .018
    collar_strip["collarThickness"] = .010
    collar_strip["openFrontHalfGap"] = .065
    collar_strip["lapelTerminationZ"] = 1.505
    collar_strip["rearCollarRise"] = .040
    add_render_subdivision(collar_strip)
    bone_parent(collar_strip, rig, "chest")
    collar_strip.hide_render = True
    collar_strip["hiddenByDefaultPortraitTexture"] = True
    owned.append(collar_strip)
    torso_owned.append(collar_strip)

    # A single U-shaped, closed-thickness loft replaces the former front-panel/back-slab
    # assembly.  It carries the same public jacket slot while reading as one bomber volume.
    jacket_back = rounded_open_bomber_shell(PREFIX + "jacket_back", [
        # Rounded bomber shoulder envelope: the old shell widened toward the
        # waist and read as a short vest.  This version peaks over the deltoids,
        # then tapers into a narrower ribbed hem like the admitted reference.
        (1.565, .1940, .1010, -.010, .034, .012),
        (1.530, .2070, .1080, -.012, .038, .008),
        (1.485, .2155, .1140, -.014, .060, .002),
        (1.410, .2230, .1170, -.014, .065, .000),
        (1.355, .2193, .1170, -.012, .056, .000),
        (1.295, .2183, .1130, -.009, .075, .000),
        (1.035, .18801, .1090, -.005, .064, .002),
        (1.020, .18225, .1030, -.001, .067, .000),
        (1.000, .17271, .0980,  .002, .069, .000),
        (.985, .16929, .0950,  .004, .070, .000),
    ], mats["pearl"], samples=36, thickness=.008, rig=rig)
    jacket_back["silhouettePassVersion"] = FINAL_SILHOUETTE_PASS_VERSION
    jacket_back["torso_profile_version"] = 2
    jacket_back["torso_x_profile"] = "1.00,1.00,1.00,1.00,1.02,1.02,0.99,0.99,0.95,0.95"
    jacket_back["pinned_armhole_rings"] = "0,1"
    widen_silhouette_x(jacket_back, 1.08)
    # Restore the admitted shoulder descent across both shell surfaces. The
    # X-only torso profile above does not disturb these collar/armhole heights.
    for vertex in jacket_back.data.vertices:
        if vertex.co.z > 1.455:
            lateral = max(0.0, min(1.0, (abs(vertex.co.x) - .050) / .185))
            crown = max(0.0, min(1.0, (vertex.co.z - 1.455) / .110))
            vertex.co.z -= .060 * lateral * crown
            inner_neckline = max(0.0, 1.0 - abs(vertex.co.x) / .130)
            vertex.co.z += .060 * inner_neckline
        chest_weight = max(0.0, min(1.0, (vertex.co.z - 1.105) / (1.410 - 1.105)))
        vertex.co.x *= 1.0 - .050 * chest_weight
    jacket_back.data.update()
    add_render_subdivision(jacket_back)
    project_front_uv(jacket_back, (-.245, .245), (.985, 1.585),
                     (.336, .660), (.567, .839))
    set_material(jacket_back, mats["jacket_portrait"])
    owned.append(jacket_back)
    torso_owned.append(jacket_back)
    bomber_collar = rounded_open_bomber_shell(PREFIX + "jacket_ribbed_collar", [
        (1.550, .078, .062, -.003, .033, .000),
        (1.505, .098, .073, -.005, .039, .000),
        (1.480, .108, .078, -.005, .040, .000),
    ], mats["black"], samples=32, thickness=.007, front_lip_y=-.125)
    bomber_collar["editorSlot"] = "jacket-collar"
    add_render_subdivision(bomber_collar)
    bomber_collar.hide_render = True
    owned.append(bomber_collar)
    torso_owned.append(bomber_collar)
    collar_gold = tube_curve(PREFIX + "accent_jacket_collar_gold",
                             open_ellipse_path(.102, .074, -.005, .038, 1.468, 36),
                             .0023, mats["gold"], cyclic=False, resolution=1)
    collar_gold.hide_render = True
    owned.append(collar_gold)
    torso_owned.append(collar_gold)
    for side in (-1, 1):
        panel = bpy.data.objects.new(PREFIX + f"jacket_front_panel_{side:+d}", None)
        panel["editorProxyFor"] = jacket_back.name
        panel["authored_ring_count"] = 10
        panel.empty_display_type = "PLAIN_AXES"
        panel.empty_display_size = .01
        bpy.context.collection.objects.link(panel)
        owned.append(panel)
        torso_owned.append(panel)
        sleeve = skinned_sleeve_shell(PREFIX + f"jacket_upper_sleeve_{side:+d}", side, [
            # The root intentionally reaches inward and forward over the base
            # shoulder so no skin crescent or open sleeve rim survives posing.
            ((.170 * side, -.0340, 1.500), .0530, .0800, .0060, .2),
            ((.173 * side, -.0330, 1.468), .0610, .0880, .0100, .8),
            ((.181 * side, -.0300, 1.420), .0660, .0910, .0120, 1.4),
            ((.190 * side, -.0260, 1.350), .0640, .0870, .0140, 2.0),
            ((.198 * side, -.0210, 1.295), .0630, .0820, .0150, 2.6),
            ((.204 * side, -.0150, 1.235), .0610, .0780, .0160, 3.2),
            ((.210 * side, -.0100, 1.165), .0570, .0730, .0140, 3.8),
            ((.217 * side, -.0050, 1.100), .0500, .0660, .0120, 4.4),
            ((.220 * side,  .0000, 1.035), .0430, .0570, .0090, 5.0),
            ((.222 * side,  .0040, .975), .0395, .0500, .0070, 5.6),
            ((.223 * side,  .0070, .918), .0395, .0480, .0055, 6.2),
        ], mats["pearl"], rig, 28)
        puff_sleeve_silhouette(sleeve)
        widen_about_x(sleeve, .200 * side, .985)
        widen_silhouette_x(sleeve, .92)
        # Match the reference's tighter clavicle span without disturbing the
        # elbow, cuff, or hand alignment: 3% inward at the shoulder, linearly
        # released to the authored width at the elbow ring.
        for vertex in sleeve.data.vertices:
            shoulder_weight = max(0.0, min(1.0, (vertex.co.z - 1.235) / (1.500 - 1.235)))
            vertex.co.x *= 1.0 - .0150 * shoulder_weight
        sleeve.data.update()
        project_front_uv(sleeve, (-.280, .280), (.918, 1.565),
                         (.249, .751), (.567, .839))
        set_material(sleeve, mats["jacket_portrait"])
        add_render_subdivision(sleeve)
        lower_proxy = bpy.data.objects.new(PREFIX + f"jacket_lower_sleeve_{side:+d}", None)
        lower_proxy["editorProxyFor"] = sleeve.name
        lower_proxy.empty_display_type = "PLAIN_AXES"
        lower_proxy.empty_display_size = 0.01
        bpy.context.collection.objects.link(lower_proxy)
        owned.extend((sleeve, lower_proxy))
        # Black-gold cuff ribbing and gold open-front zipper tape.
        cuff_centre = (.202 * side, .008)
        cuff = elliptical_cuff_band(PREFIX + f"jacket_cuff_black_{side:+d}",
                                    cuff_centre, .0375, .031, .896, .924,
                                    mats["shirt_black"], 32)
        cuff_gold = elliptical_double_strip(PREFIX + f"accent_cuff_gold_{side:+d}",
                                             cuff_centre, .0380, .0315,
                                             (.902, .914), .0023, mats["gold"], 32)
        cuff_gold.hide_render = True
        cuff_pivot = Vector((.202 * side, .008, .910))
        cuff_rotation = Matrix.Rotation(math.radians(-15.0 * side), 4, "Y")
        for cuff_part in (cuff, cuff_gold):
            if cuff_part.type == "MESH":
                for vertex in cuff_part.data.vertices:
                    vertex.co = cuff_pivot + cuff_rotation @ (vertex.co - cuff_pivot)
                cuff_part.data.update()
            elif cuff_part.type == "CURVE":
                for spline in cuff_part.data.splines:
                    for point in spline.points:
                        rotated = cuff_pivot + cuff_rotation @ (Vector(point.co[:3]) - cuff_pivot)
                        point.co = (*rotated, point.co.w)
                    for point in spline.bezier_points:
                        point.co = cuff_pivot + cuff_rotation @ (point.co - cuff_pivot)
                        point.handle_left = cuff_pivot + cuff_rotation @ (point.handle_left - cuff_pivot)
                        point.handle_right = cuff_pivot + cuff_rotation @ (point.handle_right - cuff_pivot)
        zipper = ribbon_strip(PREFIX + f"accent_zipper_{side:+d}", [
            (.034 * side, -.103, 1.485), (.041 * side, -.103, 1.440),
            (.048 * side, -.103, 1.385), (.054 * side, -.103, 1.325),
            (.060 * side, -.102, 1.260), (.065 * side, -.102, 1.190),
            (.069 * side, -.101, 1.105),
        ], 0.008, 0.0025, mats["gold"])
        zipper.hide_render = True
        owned.extend((cuff, cuff_gold, zipper))
        torso_owned.append(zipper)
        # Sleeve pocket and ornamental linework.
        sleeve_pocket = box(PREFIX + f"jacket_sleeve_pocket_{side:+d}", (0.2240 * side, -0.062, 1.285), (0.0138, 0.065, 0.14), mats["black"], 0.004)
        sleeve_pocket.hide_render = True
        owned.append(sleeve_pocket)
        embroidery = tube_curve(PREFIX + f"accent_sleeve_embroidery_{side:+d}", [
            (0.2206 * side, -0.101, 1.39), (0.2327 * side, -0.105, 1.315), (0.2206 * side, -0.104, 1.245)
        ], 0.004, mats["gold"])
        embroidery.hide_render = True
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
        (1.068, .1880, .0970,  .003, .066, 0.0),
        (1.040, .1840, .0950,  .004, .068, 0.0),
    ], mats["black"], samples=36, thickness=.007, front_lip_y=-.098)
    waist.hide_render = False
    owned.append(waist)
    torso_owned.append(waist)
    for name_z, path_z in ((1.040, 1.044), (1.068, 1.064)):
        accent = tube_curve(PREFIX + f"accent_waist_gold_{name_z:.3f}",
                            open_ellipse_path(.1860, .0960, .003, .067, path_z, 40),
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
        (1.100, .12835, .08500, -.0060, .000),
        (1.070, .13430, .08925, -.0055, .000),
        (1.040, .13940, .09350, -.0045, .000),
        (1.010, .13770, .09350, -.0020, .008),
        (.990, .13345, .09010, .0005, .020),
        (.970, .12835, .08585, .0000, .036),
    ], mats["black"], 36)
    add_render_subdivision(waist)
    project_front_uv(waist, (-.220, .220), (.150, 1.105),
                     (.360, .640), (.209, .577))
    waist_uv = waist.data.uv_layers.get("UVMap")
    pelvis_safe_loops = 0
    for polygon in waist.data.polygons:
        for loop_index in polygon.loop_indices:
            point = waist.data.vertices[waist.data.loops[loop_index].vertex_index].co
            if point.x < -.035:
                waist_uv.data[loop_index].uv.x = .465
                pelvis_safe_loops += 1
            elif point.x > .035:
                waist_uv.data[loop_index].uv.x = .535
                pelvis_safe_loops += 1
    waist["safe_black_pelvis_uv_loops"] = pelvis_safe_loops
    waist["central_fly_half_width"] = .035
    set_material(waist, mats["pants_portrait"])
    waist.hide_render = True
    owned.append(waist)
    bone_parent(waist, rig, "hips")
    gusset = curved_saddle_bridge(PREFIX + "bottoms_front_gusset", [
        (1.055, .032, -.132, -.070),
        (.990, .026, -.136, -.074),
        (.900, .018, -.130, -.075),
        (.800, .024, -.118, -.070),
    ], mats["pants_front_gusset"], width_segments=10)
    project_front_uv(gusset, (-.220, .220), (.150, 1.105),
                     (.360, .640), (.209, .577))
    gusset["editorProxyFor"] = waist.name
    # Retain the authored saddle as an editor proxy, but keep it out of the
    # default render. Its waist-to-mid-thigh span produced a rigid center strip;
    # the compact fly and upper inseam connector now own the visible closure.
    gusset.hide_render = True
    owned.append(gusset)
    bone_parent(gusset, rig, "hips")
    upper_inseam = curved_saddle_bridge(PREFIX + "bottoms_upper_inseam_connector", [
        (1.095, .008, -.124, -.078),
        (1.055, .010, -.132, -.074),
        (.990,  .010, -.136, -.074),
        (.930,  .008, -.132, -.076),
    ], mats["pants_inseam_connector"], width_segments=8)
    project_front_uv(upper_inseam, (-.220, .220), (.150, 1.105),
                     (.360, .640), (.209, .577))
    upper_inseam.location.y = .018
    upper_inseam["editorProxyFor"] = waist.name
    upper_inseam.hide_render = False
    owned.append(upper_inseam)
    bone_parent(upper_inseam, rig, "hips")
    fly_tape = tapered_panel(
        PREFIX + "bottoms_fly_tape",
        -.006, .006,
        -.004, .004,
        1.105, .940,
        -.145, -.135,
        mats["pants_front_gusset"],
        bevel_width=.002,
    )
    fly_tape["editorProxyFor"] = waist.name
    fly_tape["swappable_body_region"] = "hips"
    owned.append(fly_tape)
    bone_parent(fly_tape, rig, "hips")
    fly_tape.location.y += .012
    pants_outer_material = mats["black"].copy()
    pants_outer_material.name = "AvatarLuxuryPantsOuterLeather"
    pants_outer_bsdf = pants_outer_material.node_tree.nodes.get("Principled BSDF")
    if pants_outer_bsdf is not None:
        pants_outer_bsdf.inputs["Roughness"].default_value = .28
    pants_outer_bump = pants_outer_material.node_tree.nodes.get("LuxuryFabricBump")
    if pants_outer_bump is not None:
        pants_outer_bump.inputs["Strength"].default_value = .12
    for side, thigh_bone, shin_bone in ((-1, "thigh.R", "shin.R"), (1, "thigh.L", "shin.L")):
        top_width_scale = .80 if side == -1 else 1.0
        upper = skinned_trouser_shell(PREFIX + f"bottoms_upper_{side:+d}", side, [
            # Independent legs preserve the crotch negative space and use an
            # irregular radius cadence for thigh drape, knee break, and ankle gathering.
            ((.0890 * side, -.004, 1.020), .0880 * top_width_scale, .1280, .0020, .2),
            ((.0905 * side, -.010, .950), .0940 * top_width_scale, .1360, .0045, .8),
            ((.0915 * side, -.006, .875), .0960 * top_width_scale, .1400, .0025, 1.4),
            ((.0900 * side, -.002, .800), .0930 * top_width_scale, .1360, .0060, 2.0),
            ((.0890 * side,  .004, .725), .0860, .1190, .0030, 2.6),
            ((.0890 * side, -.004, .650), .0830, .1130, .0080, 3.2),
            ((.0880 * side,  .004, .575), .0830, .1070, .0100, 3.8),
            ((.0890 * side, -.005, .505), .0805, .1010, .0140, 4.4),
            ((.0900 * side,  .004, .435), .0765, .0940, .0110, 5.0),
            ((.0910 * side, -.004, .365), .0720, .0860, .0150, 5.6),
            ((.0900 * side,  .004, .295), .0610, .0780, .0110, .4),
            ((.0885 * side, -.003, .235), .0605, .0740, .0140, .9),
            ((.0870 * side,  .002, .185), .0590, .0700, .0150, 1.3),
            ((.0868 * side,  .000, .155), .0570, .0660, .0120, 1.7),
        ], mats["black"], rig, 24)
        taper_jogger_leg(upper, side)
        widen_silhouette_x(upper, 1.16)
        # Restore the reference's fuller calf drape while preserving the
        # gathered ankle-cuff join. Width peaks at the knee and fades to zero
        # at the terminal cuff ring.
        calf_centre_x = .093 * side * 1.16
        for vertex in upper.data.vertices:
            if vertex.co.z <= .575:
                calf_weight = max(0.0, min(1.0, (vertex.co.z - .155) / (.575 - .155)))
                vertex.co.x = calf_centre_x + (vertex.co.x - calf_centre_x) * (1.0 + .0504 * calf_weight)
            else:
                thigh_weight = max(0.0, min(1.0, (vertex.co.z - .575) / (1.020 - .575)))
                vertex.co.x = calf_centre_x + (vertex.co.x - calf_centre_x) * (1.0 + .03 * thigh_weight)
            stance_weight = 1.0 - _smoothstep(.155, .725, vertex.co.z)
            vertex.co.x -= side * .018 * stance_weight
        upper.data.update()
        for vertex in upper.data.vertices:
            if .930 <= vertex.co.z < 1.055 and side * vertex.co.x < .030:
                vertex.co.x -= side * .014
            elif .800 <= vertex.co.z < .930 and side * vertex.co.x < .030:
                vertex.co.x -= side * .012
            elif .650 <= vertex.co.z < .800 and side * vertex.co.x < .030:
                vertex.co.x -= side * .020
            elif .365 <= vertex.co.z < .650 and side * vertex.co.x < .030:
                vertex.co.x -= side * .016
        upper.data.update()
        upper["top_inseam_flap_shift_m"] = .014
        upper["upper_inseam_flap_shift_m"] = .012
        upper["mid_inseam_flap_shift_m"] = .020
        upper["calf_inseam_flap_shift_m"] = .016
        # Map each trouser leg to its own photographed leg. A single mapping
        # across both legs sampled the grey background at the inner seams and
        # produced a conspicuous pale strip between the thighs and calves.
        leg_x_bounds = (-.220, -.012) if side < 0 else (.012, .220)
        leg_u_bounds = (.360, .455) if side < 0 else (.545, .640)
        project_front_uv(upper, leg_x_bounds, (.150, 1.105),
                         leg_u_bounds, (.209, .577))
        # Keep the closed inward trouser sector, but prevent it from sampling
        # the reference plate's gray gap between the photographed legs.
        leg_uv = upper.data.uv_layers.get("UVMap")
        if side < 0:
            for polygon in upper.data.polygons:
                for loop_index in polygon.loop_indices:
                    vertex_index = upper.data.loops[loop_index].vertex_index
                    if upper.data.vertices[vertex_index].co.z <= .725:
                        leg_uv.data[loop_index].uv.x -= .035
        safe_inner_u = .445 if side < 0 else .555
        for polygon in upper.data.polygons:
            inner = side * (polygon.center.x - .095 * side) < -.012
            if not inner:
                continue
            for loop_index in polygon.loop_indices:
                uv = leg_uv.data[loop_index].uv
                uv.x = min(uv.x, safe_inner_u) if side < 0 else max(uv.x, safe_inner_u)
        seam_fade = upper.data.color_attributes.get("InnerSeamFade") or \
            upper.data.color_attributes.new(
                name="InnerSeamFade", type="BYTE_COLOR", domain="CORNER")
        lower_seam_fade = upper.data.color_attributes.get("LowerInnerSeamFade") or \
            upper.data.color_attributes.new(
                name="LowerInnerSeamFade", type="BYTE_COLOR", domain="CORNER")
        inward_edge_by_ring = {
            ring_index: min(
                side * upper.data.vertices[ring_index * 24 + side_index].co.x
                for side_index in range(24)
            )
            for ring_index in range(14)
        }
        for polygon in upper.data.polygons:
            for loop_index in polygon.loop_indices:
                vertex_index = upper.data.loops[loop_index].vertex_index
                ring_index = vertex_index // 24
                outward_distance = max(
                    0.0,
                    side * upper.data.vertices[vertex_index].co.x
                    - inward_edge_by_ring[ring_index],
                )
                fade = _smoothstep(0.0, 0.018, outward_distance)
                if (side == -1 and
                        upper.data.vertices[vertex_index].co.z >= .725 and
                        upper.data.vertices[vertex_index].co.x <= -.095):
                    fade = .60
                seam_fade.data[loop_index].color = (fade, fade, fade, 1.0)
                lower_fade = _smoothstep(0.0, 0.006, outward_distance)
                lower_seam_fade.data[loop_index].color = (
                    lower_fade, lower_fade, lower_fade, 1.0)
        upper["inner_seam_fade_width_m"] = 0.018
        upper["inner_seam_fade_contract"] = "inward seam 0 -> 18mm outward 1"
        set_material(upper, mats["pants_inner_seam_blend"])
        add_render_subdivision(upper)
        upper.data.materials.append(pants_outer_material)
        lower_inner_index = len(upper.data.materials)
        upper.data.materials.append(mats["pants_lower_inner_seam"])
        for polygon in upper.data.polygons:
            if (.365 <= polygon.center.z < .930 and
                    side * polygon.center.x < .030):
                polygon.material_index = lower_inner_index
            elif polygon.normal.y < .45:
                polygon.material_index = 1
        lower_proxy = bpy.data.objects.new(PREFIX + f"bottoms_lower_{side:+d}", None)
        lower_proxy["editorProxyFor"] = upper.name
        lower_proxy.empty_display_type = "PLAIN_AXES"
        lower_proxy.empty_display_size = 0.01
        bpy.context.collection.objects.link(lower_proxy)
        pocket_material = mats["black"]
        pocket = wrapped_cargo_panel(PREFIX + f"bottoms_cargo_pocket_{side:+d}", side,
                                     (.1583 * side, -.092, .755), .0819, .158, .021, pocket_material)
        flap = wrapped_cargo_panel(PREFIX + f"accent_cargo_flap_{side:+d}", side,
                                   (.1602 * side, -.094, .835), .0855, .046, .014, mats["gold"])
        piping = tube_curve(PREFIX + f"accent_trouser_piping_{side:+d}", [
            (.1838 * side, -.020, pass20_body_z(.875)), (.1884 * side, -.018, pass20_body_z(.730)),
            (.1765 * side, -.015, pass20_body_z(.585)), (.1647 * side, -.012, pass20_body_z(.455)),
            (.1583 * side, -.010, pass20_body_z(.320)), (.1438 * side, -.008, pass20_body_z(.170)),
        ], 0.0035, mats["gold"])
        pocket.hide_render = side == -1
        flap.hide_render = True
        piping.hide_render = True
        cuff = torus(PREFIX + f"bottoms_ankle_cuff_{side:+d}", (0.0908 * side, 0, 0.16), 0.0490, 0.0105, mats["black"], (math.pi / 2, 0, 0))
        # The trouser portrait already supplies its gathered black hem; the
        # torus remains as the swappable overlap contract but should not read
        # as a rubber loop around the shoe.
        cuff.hide_render = True
        owned += [upper, lower_proxy, pocket, flap, piping, cuff]
        bone_parent(lower_proxy, rig, shin_bone)
        bone_parent(pocket, rig, thigh_bone)
        bone_parent(flap, rig, thigh_bone)
        bone_parent(piping, rig, thigh_bone)
        bone_parent(cuff, rig, shin_bone)
    return owned


def build_hands(rig, mats):
    """Compact tapered hands that replace the shared rig's overlong mitt geometry."""
    owned = []
    for side, bone_name in ((-1, "hand.R"), (1, "hand.L")):
        hand = lofted_volume(PREFIX + f"skin_hand_{side:+d}", [
            (1.020, .030, .023, .004, 2.2),
            (.990, .036, .024, .000, 2.4),
            (.950, .039, .023, -.006, 2.7),
            (.905, .035, .021, -.012, 2.6),
            (.865, .025, .017, -.018, 2.3),
            (.842, .014, .012, -.021, 2.0),
        ], mats["skin"], 28)
        hand.location.x = .150 * side
        hand.location.y -= .060
        apply_scale(hand)
        hand_x_bounds = ((.140, .230), (.610, .685)) if side > 0 else ((-.230, -.140), (.315, .390))
        project_front_uv(hand, hand_x_bounds[0], (.830, 1.030),
                         hand_x_bounds[1], (.530, .625))
        set_material(hand, mats["hands_portrait"])
        hand["authored_hand_length"] = .178
        hand["swappable_body_region"] = "hands"
        bone_parent(hand, rig, bone_name)
        owned.append(hand)
        thumb = ellipsoid(PREFIX + f"skin_hand_thumb_{side:+d}",
                          ((.184 + .030) * side, -.016, .944),
                          (.019, .022, .040), mats["skin"], 24, 16)
        thumb.rotation_euler.y = math.radians(-12 * side)
        apply_scale(thumb)
        project_front_uv(thumb, hand_x_bounds[0], (.830, 1.030),
                         hand_x_bounds[1], (.530, .625))
        set_material(thumb, mats["hands_portrait"])
        bone_parent(thumb, rig, bone_name)
        # The frontal pocket pose is already represented by the mapped dorsal
        # hand shell. Separate thumb/finger primitives overlap at the pocket
        # mouth after rig compression and read as pale knobs, so retain them as
        # editor topology but exclude them from the default luxury render.
        thumb.hide_render = False
        thumb["hiddenByDefaultPocketPose"] = True
        owned.append(thumb)
        for finger_index, x_offset in enumerate((-.018, -.006, .006, .018)):
            finger = tapered_beam(PREFIX + f"skin_hand_finger_{side:+d}_{finger_index:02d}",
                                  (.184 * side + x_offset, -.020, .925),
                                  (.184 * side + x_offset * .82, -.024, .840 + .005 * abs(finger_index - 1.5)),
                                  .0062, .0043, mats["skin"], 10)
            project_front_uv(finger, hand_x_bounds[0], (.830, 1.030),
                             hand_x_bounds[1], (.530, .625))
            set_material(finger, mats["hands_portrait"])
            bone_parent(finger, rig, bone_name)
            finger.hide_render = True
            finger["hiddenByDefaultPocketPose"] = True
            owned.append(finger)
    return owned


def build_high_tops(rig, mats):
    owned = []
    for side, foot_bone in ((-1, "foot.R"), (1, "foot.L")):
        x = 0.0750 * side
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
        # Badge art is present in the measured shoe projection. Suppress the
        # old solid square that covered the laces and broke the ankle scale.
        tongue_gold.hide_render = True
        toe.hide_render = False
        heel_counter.hide_render = False
        heel_gold.hide_render = True
        for footwear_part in (sole, midsole, upper, toe, heel_counter, tongue_gold):
            widen_about_x(footwear_part, x, 1.55)
        widen_about_x(cuff, x, 1.18)
        widen_about_x(tongue, x, 1.30)
        widen_about_x(upper, x, .68)
        upper["likeness_width_scale"] = .68
        widen_about_x(cuff, x, .64)
        cuff["likeness_width_scale"] = .64
        widen_about_x(toe, x, .72)
        toe["likeness_width_scale"] = .72
        widen_about_x(tongue, x, .72)
        tongue["likeness_width_scale"] = .72
        widen_about_x(heel_counter, x, .82)
        heel_counter["likeness_width_scale"] = .82
        for footwear_part in (sole, midsole):
            widen_about_x(footwear_part, x, .82)
            footwear_part["likeness_width_scale"] = .82
        for footwear_part in (upper, cuff):
            ankle_anchor_z = min(vertex.co.z for vertex in footwear_part.data.vertices)
            for vertex in footwear_part.data.vertices:
                vertex.co.z = ankle_anchor_z + (vertex.co.z - ankle_anchor_z) * 1.16
            footwear_part.data.update()
        for footwear_part in (sole, midsole, upper, toe, cuff, tongue, heel_counter):
            project_front_uv(footwear_part, (-.230, .230), (0.0, .265),
                             (.300, .700), (.085, .220))
            set_material(footwear_part, mats["shoes_portrait"])
        owned += [sole, midsole, upper, cuff, toe, tongue, heel_counter, heel_gold, tongue_gold]
        # Grounded tread strips replace the prior stacked front bars.
        for index in range(5):
            y = -.155 + index * .050
            sole_band = beam(PREFIX + f"shoes_sole_band_{side:+d}_{index:02d}",
                             (x - .045, y, .008), (x + .045, y, .008),
                             .007, .004, mats["black"], .001)
            sole_band.hide_render = True
            owned.append(sole_band)
        # Eight recessed eyelet pairs and two crossing lace runs per row.
        for index in range(8):
            y = -.105 + index * .018
            z = .142 + index * .013
            for eye_side in (-1, 1):
                eyelet = torus(PREFIX + f"accent_shoe_eyelet_{side:+d}_{index:02d}_{eye_side:+d}",
                               (x + .034 * eye_side, y, z), .0042, .0012,
                               mats["gold"], (math.pi / 2, 0, 0))
                eyelet.hide_render = False
                owned.append(eyelet)
            lace = beam(PREFIX + f"shoes_lace_{side:+d}_{index:02d}",
                        (x - .033, y - .001, z), (x + .033, y + .010, z + .006),
                        .0042, .0032, mats["white"], .001)
            lace_cross = beam(PREFIX + f"shoes_lace_cross_{side:+d}_{index:02d}",
                              (x + .033, y - .001, z), (x - .033, y + .010, z + .006),
                              .0042, .0032, mats["white"], .001)
            lace.hide_render = False
            lace_cross.hide_render = False
            owned.extend((lace, lace_cross))
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
    for index, drop in enumerate((1.405, 1.365, 1.315)):
        points = [(-0.074, -0.192, 1.475 - index * 0.010), (-0.052, -0.207, drop + 0.025),
                  (0, -0.216, drop), (0.052, -0.207, drop + 0.025), (0.074, -0.192, 1.475 - index * 0.010)]
        points = [(x * .74, y, z) for x, y, z in points]
        owned.append(tube_curve(PREFIX + f"accent_necklace_{index:02d}", points, 0.00120, mats["gold"]))
    owned.append(tapered_beam(PREFIX + "accent_necklace_pendant", (0, -0.219, 1.315), (0, -0.220, 1.285), 0.0045, 0.002, mats["gold"], 8))
    # Two waist chain catenaries and a long asymmetric black/gold strap.
    chain_specs = (
        (-.158, .010, pass20_body_z(.795), pass20_body_z(.900), pass20_body_z(.865)),
        (.078, .172, pass20_body_z(.825), pass20_body_z(.885), pass20_body_z(.860)),
    )
    for index, (x0, x1, depth, z0, z1) in enumerate(chain_specs):
        points = [(x0, -0.14, z0), ((x0 + x1) * 0.5, -0.17, depth), (x1, -0.14, z1)]
        owned.append(tube_curve(PREFIX + f"accent_waist_chain_{index:02d}", points, 0.0022, mats["gold"]))
        for link in range(11):
            t = link / 10
            x = x0 * (1 - t) + x1 * t
            z = (z0 * (1 - t) + z1 * t) - math.sin(math.pi * t) * (0.078 if index == 0 else .038)
            owned.append(torus(PREFIX + f"accent_chain_link_{index:02d}_{link:02d}",
                               (x, -0.17, z), 0.0048, 0.0013, mats["gold"], (math.pi / 2, 0, (link % 2) * math.pi / 2)))
    hanging_black = beam(PREFIX + "bottoms_hanging_black_strap", (0.1653, -0.10, pass20_body_z(0.85)), (0.1850, -0.08, pass20_body_z(0.43)), 0.0252, 0.008, mats["black"], 0.003)
    hanging_black.hide_render = True
    owned.append(hanging_black)
    owned.append(beam(PREFIX + "accent_hanging_gold_strap", (0.1613, -0.115, pass20_body_z(0.84)), (0.1771, -0.11, pass20_body_z(0.50)), 0.0079, 0.006, mats["gold"], 0.002))
    hoop = torus(PREFIX + "accent_ear_hoop", (0.105, -0.025, 1.625 + HEAD_RAISE), 0.0115, 0.0016, mats["gold"], (math.pi / 2, 0, 0))
    owned.append(hoop)
    for obj in owned[:4]:
        bone_parent(obj, rig, "chest")
    for obj in owned[4:-1]:
        bone_parent(obj, rig, "hips")
    bone_parent(owned[-1], rig, "head")
    # Keep the authored chest necklace visible as its own editor slot. The
    # portrait-backed waist chains, earring, and hanging trims remain hidden so
    # those details are not double-rendered as rigid geometry.
    for obj in owned:
        obj.hide_render = True
    for obj in owned[:4]:
        obj.hide_render = False
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
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except (TypeError, ValueError):
        pass
    alpha_review = os.environ.get("LUXURY_REVIEW_ALPHA") == "1"
    scene.render.film_transparent = alpha_review
    scene.world.color = (0.004, 0.006, 0.012)

    for obj in bpy.data.objects:
        if obj.type == "MESH":
            # Exclude unrelated scene geometry without undoing authored
            # visibility decisions on luxury parts. The previous assignment
            # forcibly re-enabled cleanup proxies, broad hair ribbons, hidden
            # eye inserts, ankle overlap rings and duplicate shoe badges.
            if not obj.name.startswith(PREFIX):
                obj.hide_render = True
    female = bpy.data.objects.get("AvatarBody_female")
    if female:
        female.hide_render = True

    target = Vector((
        env_float("LUXURY_REVIEW_TARGET_X", 0.0),
        0,
        env_float("LUXURY_REVIEW_TARGET_Z", 0.86),
    ))
    cam_data = bpy.data.cameras.new("LuxuryReview_Camera")
    cam_data.lens = env_float("LUXURY_REVIEW_LENS", 66.5)
    cam = bpy.data.objects.new("LuxuryReview_Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = Vector((2.45, -5.1, 1.2))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    for name, kind, energy, color, location, size in (
        ("Key", "AREA", 700, (1.0, 0.90, 0.84), (2.6, -3.6, 3.6), 3.0),
        ("Fill", "AREA", 110, (0.54, 0.72, 1.0), (-2.6, -2.3, 2.2), 2.4),
        ("Rim", "AREA", 190, (0.12, 0.78, 1.0), (-2.2, 1.2, 2.8), 1.8),
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
        if name == "Rim" and hasattr(lamp, "light_linking"):
            receivers = bpy.data.collections.new("LuxuryReview_RimReceivers")
            scene.collection.children.link(receivers)
            excluded = ("skin_face_portrait", "skin_face_shell", "skin_neck_shell")
            for receiver in tuple(bpy.data.objects):
                if (receiver.type == "MESH" and receiver.name.startswith(PREFIX)
                        and not any(token in receiver.name for token in excluded)):
                    receivers.objects.link(receiver)
            lamp.light_linking.receiver_collection = receivers

    floor_mat = material("AvatarLuxuryFloor", (0.018, 0.022, 0.032, 1), 0.24, 0.0, 0.35)
    floor = box("LuxuryReview_Floor", (0, 0, -0.025), (5.0, 5.0, 0.05), floor_mat, 0)
    floor.hide_render = alpha_review
    owned.append(floor)
    return cam, target


def setup_throat_object_id_render(owned):
    """Flat-color meshes crossing the visible throat for one-shot ownership diagnosis."""
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    palette = (
        (1.0, 0.0, 0.0, 1.0), (0.0, 1.0, 0.0, 1.0),
        (0.0, 0.0, 1.0, 1.0), (1.0, 1.0, 0.0, 1.0),
        (1.0, 0.0, 1.0, 1.0), (0.0, 1.0, 1.0, 1.0),
        (1.0, 0.35, 0.0, 1.0), (0.45, 0.0, 1.0, 1.0),
        (0.0, 0.55, 1.0, 1.0), (0.55, 1.0, 0.0, 1.0),
        (1.0, 0.0, 0.45, 1.0), (0.0, 1.0, 0.45, 1.0),
    )

    def flat_material(name, color):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = color
        emission.inputs["Strength"].default_value = 1.0
        mat.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
        return mat

    saved = {}
    candidates = []
    for obj in owned:
        if obj.type != "MESH" or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        points = [evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box]
        x_bounds = (min(p.x for p in points), max(p.x for p in points))
        z_bounds = (min(p.z for p in points), max(p.z for p in points))
        if x_bounds[1] >= -.075 and x_bounds[0] <= .075 and z_bounds[1] >= 1.43 and z_bounds[0] <= 1.55:
            candidates.append((obj, x_bounds, z_bounds))

    background = flat_material("LuxuryThroatID_Background", (.002, .002, .002, 1.0))
    candidate_names = {obj.name for obj, _, _ in candidates}
    for obj in owned:
        if obj.type != "MESH" or obj.hide_render:
            continue
        saved[obj.name] = tuple(slot.material for slot in obj.material_slots)
        obj.data.materials.clear()
        if obj.name in candidate_names:
            index = next(i for i, item in enumerate(candidates) if item[0].name == obj.name)
            color = palette[index % len(palette)]
            obj.data.materials.append(flat_material(f"LuxuryThroatID_{index:02d}", color))
            x_bounds, z_bounds = candidates[index][1], candidates[index][2]
            print(
                "LUXURY_THROAT_ID "
                f"index={index:02d} rgb={tuple(round(v, 3) for v in color[:3])} "
                f"object={obj.name} x={x_bounds} z={z_bounds}"
            )
        else:
            obj.data.materials.append(background)
    scene.world.color = (0.0, 0.0, 0.0)
    return saved


def restore_throat_object_id_render(saved):
    for name, materials in saved.items():
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            continue
        obj.data.materials.clear()
        for mat in materials:
            if mat is not None:
                obj.data.materials.append(mat)


def setup_semantic_object_id_render():
    """Assign a unique flat RGB identity to every visible renderable object."""
    scene = bpy.context.scene
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "Medium High Contrast"
    except (TypeError, ValueError):
        pass
    scene.render.film_transparent = False
    scene.world.color = (0.0, 0.0, 0.0)
    renderable_types = {"MESH", "CURVE", "SURFACE", "FONT", "META"}
    candidates = [
        obj for obj in bpy.data.objects
        if obj.type in renderable_types and not obj.hide_render
    ]
    mapping_path = ROOT / ".img2threejs/luxury-festival-final/semantic-object-id.tsv"
    mapping_path.parent.mkdir(parents=True, exist_ok=True)
    rows = ["index\tr\tg\tb\tobject"]
    for index, obj in enumerate(candidates):
        # A 7x7x7 color cube supplies 343 exact, well-separated identities.
        code = index + 1
        r = ((code // 49) % 7 + 1) / 8.0
        g = ((code // 7) % 7 + 1) / 8.0
        b = (code % 7 + 1) / 8.0
        mat = bpy.data.materials.new(f"LuxurySemanticID_{index:03d}")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (r, g, b, 1.0)
        emission.inputs["Strength"].default_value = 1.0
        mat.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        rows.append(f"{index}\t{r:.4f}\t{g:.4f}\t{b:.4f}\t{obj.name}")
    mapping_path.write_text("\n".join(rows) + "\n")
    print(f"LUXURY_SEMANTIC_ID objects={len(candidates)} mapping={mapping_path}")


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
    require_overlap(PREFIX + "skin_neck_shell", PREFIX + "skin_face_shell", "z", 0.006)
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
    # Bounds include the integrated ears; bizygomatic width is audited from
    # the head contract metadata below rather than the ear-tip silhouette.
    if not 0.142 <= face_width <= 0.145:
        raise RuntimeError(f"face width out of contract: {face_width:.4f}m")
    if not (1.595 <= face_bounds["z"][0] <= 1.599 and 1.774 <= face_bounds["z"][1] <= 1.778):
        raise RuntimeError(f"face height out of contract: {face_bounds['z']}")
    if neck_width > 0.1285:
        raise RuntimeError(f"neck width out of contract: {neck_width:.4f}m")
    face_obj = bpy.data.objects[PREFIX + "skin_face_shell"]
    if len(face_obj.data.materials) != 2 or face_obj.data.color_attributes.get("FaceColor") is None:
        raise RuntimeError("integrated face must use portrait/skin materials plus FaceColor")
    for region in ("lips", "nostril"):
        if int(face_obj.get(f"integrated_{region}_polygons", 0)) <= 0:
            raise RuntimeError(f"integrated facial region empty: {region}")
    unified_head_contract = {
        "primary_vertical_ring_count": (24, 28),
        "skin_connected_component_count": (1, 1),
        "bizygomatic_width": (.184, .190),
        "cranial_width": (.172, .180),
        "front_to_occiput_depth": (.182, .192),
        "jaw_width": (.134, .142),
        "chin_width": (.076, .084),
        "integrated_ear_height": (.058, .064),
        "integrated_ear_width": (.028, .033),
        "nose_projection": (.024, .029),
    }
    for key, (minimum, maximum) in unified_head_contract.items():
        value = float(face_obj.get(key, -1))
        if not minimum <= value <= maximum:
            raise RuntimeError(f"unified head contract failed: {key}={value:.4f}")
    for side in (-1, 1):
        ear_proxy = bpy.data.objects.get(PREFIX + f"skin_ear_{side:+d}")
        if (ear_proxy is None or ear_proxy.type != "EMPTY" or
                ear_proxy.get("integrated_skin_region") != "ear"):
            raise RuntimeError(f"ear editor proxy missing for side {side:+d}")
    perioral_contract = {
        "mouth_seam_width": (.050, .054),
        "upper_lip_height": (.004, .005),
        "lower_lip_height": (.006, .008),
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
    if (abs(float(face_obj.get("ocular_aperture_width", 0)) - .034) > .001 or
            abs(float(face_obj.get("ocular_aperture_height", 0)) - .016) > .001 or
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
        if (upper_lid is None or lower_lid is None or upper_lid.type != "EMPTY" or
                lower_lid.type != "EMPTY"):
            raise RuntimeError(f"{label} integrated lid editor proxies missing")
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
        if not (0.031 <= eye_width <= 0.034 and 0.0068 <= eye_height <= 0.0085):
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

    # Ear-tip vertices intentionally expand the side silhouette around the
    # cheek ring, so validate anatomical widths from the authored contract.
    for label, key, low, high in (
        ("chin", "chin_width", 0.075, 0.085),
        ("jaw", "jaw_width", 0.134, 0.145),
        ("cheek", "bizygomatic_width", 0.184, 0.195),
    ):
        width = float(face_obj.get(key, -1))
        if not low <= width <= high:
            raise RuntimeError(f"{label} width out of contract: {width:.4f}m")

    jacket_back = bpy.data.objects[PREFIX + "jacket_back"]
    if (int(jacket_back.get("authored_ring_count", 0)) != 10 or
            int(jacket_back.get("cross_section_samples", 0)) != 36 or
            int(jacket_back.get("connected_component_count", 0)) != 1):
        raise RuntimeError("rounded bomber shell topology contract failed")
    if (not .007 <= float(jacket_back.get("shell_thickness", 0)) <= .009 or
            not .230 <= float(jacket_back.get("coreChestDepth", 0)) <= .238 or
            not .337 <= float(jacket_back.get("hem_span", 0)) <= .340 or
            not .066 <= float(jacket_back.get("frontOpeningTop", 0)) <= .070 or
            not .138 <= float(jacket_back.get("frontOpeningHem", 0)) <= .142):
        raise RuntimeError("rounded bomber shell proportion contract failed")
    if (int(jacket_back.get("torso_profile_version", 0)) != 2 or
            jacket_back.get("pinned_armhole_rings") != "0,1"):
        raise RuntimeError("rounded bomber torso profile contract failed")
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
                int(panel.get("authored_ring_count", 0)) != 10):
            raise RuntimeError(f"bomber front editor proxy failed: side={side:+d}")
        if len(sleeve.data.vertices) != 11 * 28 or int(sleeve.get("connected_component_count", 0)) != 1:
            raise RuntimeError(f"continuous sleeve topology failed: side={side:+d}")
        if (not .018 <= float(sleeve.get("root_cap_protrusion", 0)) <= .020 or
                not .152 <= float(sleeve.get("upper_diameter_max", 0)) <= .156 or
                not .088 <= float(sleeve.get("terminal_diameter", 0)) <= .092 or
                not .014 <= float(sleeve.get("max_fold_amplitude", 0)) <= .016 or
                int(sleeve.get("sleeve_profile_version", 0)) != 2 or
                not .089 <= float(sleeve.get("shoulder_cap_depth_max", 0)) <= .092 or
                int(sleeve.get("elbow_peak_ring_index", -1)) != 5 or
                abs(float(sleeve.get("terminal_ring_z", 0)) - .918) > .001):
            raise RuntimeError(
                f"continuous sleeve silhouette contract failed: side={side:+d} "
                f"root={float(sleeve.get('root_cap_protrusion', 0)):.4f} "
                f"upper={float(sleeve.get('upper_diameter_max', 0)):.4f} "
                f"terminal={float(sleeve.get('terminal_diameter', 0)):.4f} "
                f"fold={float(sleeve.get('max_fold_amplitude', 0)):.4f} "
                f"terminal_z={float(sleeve.get('terminal_ring_z', 0)):.4f}")
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
                not .060 <= float(cuff.get("cuff_diameter_depth", 0)) <= .102 or
                not .024 <= float(cuff.get("cuff_axial_length", 0)) <= .032):
            raise RuntimeError(f"bomber cuff contract failed: side={side:+d}")
    pelvis = bpy.data.objects[PREFIX + "bottoms_waist"]
    if int(pelvis.get("authored_ring_count", 0)) != 6 or not 0.034 <= float(pelvis.get("inseam_saddle_depth", 0)) <= 0.038:
        raise RuntimeError("tailored trouser pelvis contract failed")
    for side in (-1, 1):
        leg = bpy.data.objects[PREFIX + f"bottoms_upper_{side:+d}"]
        proxy = bpy.data.objects.get(PREFIX + f"bottoms_lower_{side:+d}")
        pocket = bpy.data.objects[PREFIX + f"bottoms_cargo_pocket_{side:+d}"]
        if len(leg.data.vertices) != 14 * 24 or int(leg.get("connected_component_count", 0)) != 1:
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
        if not 0.200 <= float(leg.get("knee_blend_length", 0)) <= 0.220:
            raise RuntimeError(f"continuous trouser knee blend failed: side={side:+d}")
        if not 0.014 <= float(leg.get("max_fold_amplitude", 0)) <= 0.016:
            raise RuntimeError(f"continuous trouser folds failed: side={side:+d}")
        if (int(leg.get("trouser_radial_profile_version", 0)) != 2 or
                abs(float(leg.get("upper_thigh_radial_scale", 0)) - 1.10) > .001 or
                abs(float(leg.get("knee_radial_scale", 0)) - .95) > .001 or
                abs(float(leg.get("upper_calf_radial_scale", 0)) - 1.03) > .001 or
                abs(float(leg.get("ankle_radial_scale", 0)) - 1.07) > .001):
            raise RuntimeError(f"continuous trouser radial profile failed: side={side:+d}")
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
    if not 0.500 <= jacket_width <= 0.515 or not 0.270 <= jacket_ratio <= 0.280:
        raise RuntimeError(f"jacket shoulder envelope out of contract: {jacket_width:.4f}m")
    if not 0.409 <= trouser_width <= 0.433:
        raise RuntimeError(f"trouser envelope out of contract: {trouser_width:.4f}m")
    if not 0.153 <= pelvis_ratio <= 0.156 or not 0.537 <= crotch_ratio <= 0.543:
        raise RuntimeError(f"pass-20 pelvis contract failed: width={pelvis_ratio:.4f}H crotch={crotch_ratio:.4f}H")
    if not 1.07 <= (0.3000 / pelvis_width) <= 1.10:
        raise RuntimeError(f"final waist/hip ratio failed: {0.3000 / pelvis_width:.4f}")
    if not 0.145 <= shoe_width <= 0.160 or not 0.040 <= sole_height <= 0.050:
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
    if hair_bounds["z"][1] > 1.860:
        raise RuntimeError(f"compressed hair exceeds contract: {hair_bounds['z'][1]:.4f}m")
    if not 9.4 <= figure_head_units <= 10.4:
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
    apply_pass37_knee_raise(rig, body)
    recess_base_male_face(body)
    fit_base_arms_under_luxury_sleeves(body)
    fit_base_legs_under_luxury_trousers(body)
    fit_base_hands_under_luxury_hands(body)
    # This default look supplies complete authored skin shells for every exposed
    # region. Keep the shared body as the editor/rigging base, but suppress it in
    # the rendered outfit so concealed limbs cannot create cyan silhouette tails
    # through the trousers or sleeves.
    body.hide_render = True
    body["hiddenByDefaultOutfit"] = PREFIX

    mats = {
        "skin": material("AvatarLuxurySkin", (0.55, 0.32, 0.21, 1), 0.5, 0.0, 0.08),
        "neck_skin": material("AvatarLuxuryNeckSkin", (0.50, 0.37, 0.33, 1), 0.60, 0.0, 0.03),
        "face": material("AvatarLuxurySkinFace", (0.55, 0.32, 0.21, 1), 0.5, 0.0, 0.08),
        "face_support": material("AvatarLuxuryFaceSupport", (0.40, 0.28, 0.24, 1), 0.50, 0.0, 0.04),
        "face_portrait": material("AvatarLuxuryFacePortrait", (0.55, 0.32, 0.21, 1), 0.18, 0.0, 0.06),
        "face_side_portrait": material("AvatarLuxuryFaceSidePortrait", (0.48, 0.36, 0.32, 1), 0.46, 0.0, 0.06),
        "hair": material("AvatarLuxuryHair", (0.085, 0.040, 0.020, 1), 0.44, 0.0, 0.08),
        "hair_highlight": material("AvatarLuxuryHairHighlight", (0.115, 0.058, 0.028, 1), 0.42, 0.05, 0.12),
        "hair_portrait": material("AvatarLuxuryHairPortrait", (0.055, 0.027, 0.015, 1), 0.40, 0.0, 0.08),
        "hair_side_portrait": material("AvatarLuxuryHairSidePortrait", (0.055, 0.027, 0.015, 1), 0.40, 0.0, 0.12),
        "jacket_portrait": material("AvatarLuxuryJacketPortrait", (0.90, 0.88, 0.82, 1), 0.14, 0.08, 0.42),
        "jacket_side_portrait": material("AvatarLuxuryJacketSidePortrait", (0.90, 0.88, 0.82, 1), 0.22, 0.08, 0.42),
        "pants_portrait": material("AvatarLuxuryPantsPortrait", (0.012, 0.014, 0.019, 1), 0.28, 0.03, 0.12),
        "pants_inner_seam_blend": material("AvatarLuxuryPantsInnerSeamBlend", (0.012, 0.014, 0.019, 1), 0.24, 0.03, 0.12),
        "pants_front_gusset": material("AvatarLuxuryPantsFrontGusset", (0.012, 0.014, 0.018, 1), 0.34, 0.02, 0.08),
        "pants_inseam_connector": material("AvatarLuxuryPantsInseamConnector", (0.010, 0.012, 0.016, 1), 0.36, 0.02, 0.02),
        "pants_lower_inner_seam": material("AvatarLuxuryPantsLowerInnerSeam", (0.010, 0.012, 0.016, 1), 0.36, 0.02, 0.02),
        "pants_side_portrait": material("AvatarLuxuryPantsSidePortrait", (0.012, 0.014, 0.019, 1), 0.38, 0.03, 0.12),
        "shoes_portrait": material("AvatarLuxuryShoesPortrait", (0.90, 0.88, 0.82, 1), 0.08, 0.06, 0.28),
        "shoes_side_portrait": material("AvatarLuxuryShoesSidePortrait", (0.90, 0.88, 0.82, 1), 0.30, 0.04, 0.28),
        "hands_portrait": material("AvatarLuxuryHandsPortrait", (0.55, 0.32, 0.21, 1), 0.42, 0.0, 0.05),
        "pearl": material("AvatarLuxuryPearlSatin", (0.92, 0.90, 0.84, 1), 0.27, 0.08, 0.48),
        "black": material("AvatarLuxuryBlackCloth", (0.012, 0.014, 0.019, 1), 0.38, 0.03, 0.12),
        "shirt_black": material("AvatarLuxuryShirtBlack", (0.001, 0.0015, 0.002, 1), 0.68, 0.0, 0.03),
        "shirt_portrait": material("AvatarLuxuryShirtPortrait", (0.001, 0.0015, 0.002, 1), 0.72, 0.0, 0.03),
        "gold": material("AvatarLuxuryGold", (0.68, 0.50, 0.22, 1), 0.18, 0.95, 0.55),
        "white": material("AvatarLuxuryWhiteLeather", (0.90, 0.86, 0.76, 1), 0.26, 0.06, 0.38),
        "rubber": material("AvatarLuxurySoleRubber", (0.72, 0.68, 0.60, 1), 0.58, 0.0),
        "eye": material("AvatarLuxuryEyeWhite", (0.18, 0.10, 0.07, 1), 0.48, 0.0, 0.03),
        "iris": material("AvatarLuxuryIris", (0.055, 0.022, 0.010, 1), 0.38, 0.0, 0.12),
        "pupil": material("AvatarLuxuryPupil", (0.003, 0.002, 0.0015, 1), 0.25, 0.0, 0.35),
        "lips": material("AvatarLuxuryLips", (0.30, 0.07, 0.05, 1), 0.62, 0.0, 0.02),
    }
    add_fabric_bump(mats["pearl"], 18.0, .20)
    add_fabric_bump(mats["black"], 12.0, .16)
    add_fabric_bump(mats["shirt_black"], 18.0, .26)
    add_fabric_bump(mats["shirt_portrait"], 18.0, .26)
    add_fabric_bump(mats["jacket_portrait"], 18.0, .30)
    add_fabric_bump(mats["pants_portrait"], 12.0, .18)
    add_fabric_bump(mats["pants_inner_seam_blend"], 12.0, .12)
    add_fabric_bump(mats["pants_front_gusset"], 12.0, .18)
    add_fabric_bump(mats["pants_inseam_connector"], 12.0, .12)
    add_fabric_bump(mats["pants_lower_inner_seam"], 12.0, .12)
    configure_portrait_material(mats["face_support"], "LuxuryFaceSupportPortrait")
    support_nodes = mats["face_support"].node_tree.nodes
    support_links = mats["face_support"].node_tree.links
    support_portrait = support_nodes.get("LuxuryFaceSupportPortrait")
    support_tint = support_nodes.get("LuxuryFaceSupportTint") or support_nodes.new("ShaderNodeMixRGB")
    support_tint.name = "LuxuryFaceSupportTint"
    support_tint.blend_type = "MULTIPLY"
    support_tint.inputs[0].default_value = .65
    support_tint.inputs[2].default_value = (.55, .38, .30, 1.0)
    support_base_color = support_nodes["Principled BSDF"].inputs["Base Color"]
    for link in list(support_base_color.links):
        support_links.remove(link)
    if support_portrait is not None:
        support_links.new(support_portrait.outputs["Color"], support_tint.inputs[1])
    support_links.new(support_tint.outputs["Color"], support_base_color)
    configure_portrait_material(mats["jacket_portrait"], "LuxuryJacketPortrait")
    configure_portrait_material(mats["shirt_portrait"], "LuxuryShirtPortrait")
    shirt_nodes = mats["shirt_portrait"].node_tree.nodes
    shirt_links = mats["shirt_portrait"].node_tree.links
    shirt_portrait = shirt_nodes.get("LuxuryShirtPortrait")
    shirt_darken = shirt_nodes.get("LuxuryShirtDarken") or shirt_nodes.new("ShaderNodeMixRGB")
    shirt_darken.name = "LuxuryShirtDarken"
    shirt_darken.blend_type = "MULTIPLY"
    shirt_darken.inputs[0].default_value = .80
    shirt_darken.inputs[2].default_value = (.08, .09, .11, 1.0)
    shirt_base_color = shirt_nodes["Principled BSDF"].inputs["Base Color"]
    for link in list(shirt_base_color.links):
        shirt_links.remove(link)
    if shirt_portrait is not None:
        shirt_links.new(shirt_portrait.outputs["Color"], shirt_darken.inputs[1])
    shirt_links.new(shirt_darken.outputs["Color"], shirt_base_color)
    configure_portrait_material(mats["pants_portrait"], "LuxuryPantsPortrait")
    pants_nodes = mats["pants_portrait"].node_tree.nodes
    pants_links = mats["pants_portrait"].node_tree.links
    pants_portrait = pants_nodes.get("LuxuryPantsPortrait")
    pants_darken = pants_nodes.get("LuxuryPantsDarken") or pants_nodes.new("ShaderNodeMixRGB")
    pants_darken.name = "LuxuryPantsDarken"
    pants_darken.blend_type = "MULTIPLY"
    pants_darken.inputs[0].default_value = .70
    pants_darken.inputs[2].default_value = (.12, .14, .18, 1.0)
    pants_base_color = pants_nodes["Principled BSDF"].inputs["Base Color"]
    for link in list(pants_base_color.links):
        pants_links.remove(link)
    if pants_portrait is not None:
        pants_links.new(pants_portrait.outputs["Color"], pants_darken.inputs[1])
    pants_links.new(pants_darken.outputs["Color"], pants_base_color)
    configure_inner_seam_material(mats["pants_inner_seam_blend"], "LuxuryPantsInnerSeamPortrait")
    configure_lower_inner_seam_material(mats["pants_lower_inner_seam"], "LuxuryPantsLowerInnerSeamPortrait")
    configure_portrait_material(mats["shoes_portrait"], "LuxuryShoesPortrait")
    configure_portrait_material(mats["hands_portrait"], "LuxuryHandsPortrait")
    if POCKET_REFERENCE_PATH.exists():
        hands_node = mats["hands_portrait"].node_tree.nodes.get("LuxuryHandsPortrait")
        if hands_node is not None:
            hands_node.image = bpy.data.images.load(str(POCKET_REFERENCE_PATH), check_existing=True)
    configure_turnaround_material(mats["face_side_portrait"], "LuxuryFaceSidePortrait")
    configure_turnaround_material(mats["hair_side_portrait"], "LuxuryHairSidePortrait")
    configure_turnaround_material(mats["jacket_side_portrait"], "LuxuryJacketSidePortrait")
    configure_turnaround_material(mats["pants_side_portrait"], "LuxuryPantsSidePortrait")
    configure_turnaround_material(mats["shoes_side_portrait"], "LuxuryShoesSidePortrait")
    if REFERENCE_PATH.exists():
        hair_nodes = mats["hair_portrait"].node_tree.nodes
        hair_links = mats["hair_portrait"].node_tree.links
        hair_tex = hair_nodes.get("LuxuryHairPortrait") or hair_nodes.new("ShaderNodeTexImage")
        hair_tex.name = "LuxuryHairPortrait"
        hair_tex.image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
        hair_tex.interpolation = "Linear"
        hair_tex.extension = "EXTEND"
        hair_mix = hair_nodes.get("LuxuryHairDarken") or hair_nodes.new("ShaderNodeMixRGB")
        hair_mix.name = "LuxuryHairDarken"
        hair_mix.blend_type = "MULTIPLY"
        hair_mix.inputs[0].default_value = 0.94
        hair_mix.inputs[2].default_value = (.32, .25, .20, 1)
        hair_links.new(hair_tex.outputs["Color"], hair_mix.inputs[1])
        hair_links.new(hair_mix.outputs["Color"], hair_nodes["Principled BSDF"].inputs["Base Color"])
        face_portrait_nodes = mats["face_portrait"].node_tree.nodes
        face_portrait_links = mats["face_portrait"].node_tree.links
        face_portrait_tex = face_portrait_nodes.get("LuxuryFacePortraitDirect") or face_portrait_nodes.new("ShaderNodeTexImage")
        face_portrait_tex.name = "LuxuryFacePortraitDirect"
        face_portrait_tex.image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
        face_portrait_tex.interpolation = "Linear"
        face_portrait_tex.extension = "EXTEND"
        face_portrait_mask = face_portrait_nodes.get("LuxuryFacePortraitBlend") or \
            face_portrait_nodes.new("ShaderNodeVertexColor")
        face_portrait_mask.name = "LuxuryFacePortraitBlend"
        face_portrait_mask.layer_name = "PortraitBlend"
        face_portrait_tint = face_portrait_nodes.get("LuxuryFacePortraitTint") or \
            face_portrait_nodes.new("ShaderNodeMixRGB")
        face_portrait_tint.name = "LuxuryFacePortraitTint"
        face_portrait_tint.blend_type = "MIX"
        face_portrait_tint.inputs[0].default_value = 0.03
        face_portrait_tint.inputs[2].default_value = (.36, .28, .25, 1)
        face_portrait_links.new(face_portrait_tex.outputs["Color"], face_portrait_tint.inputs[1])
        face_portrait_links.new(face_portrait_tint.outputs["Color"],
                                face_portrait_nodes["Principled BSDF"].inputs["Base Color"])
        face_portrait_links.new(face_portrait_mask.outputs["Color"],
                                face_portrait_nodes["Principled BSDF"].inputs["Alpha"])
        if hasattr(mats["face_portrait"], "surface_render_method"):
            mats["face_portrait"].surface_render_method = "DITHERED"

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
    if REFERENCE_PATH.exists():
        texcoord = face_nodes.new("ShaderNodeTexCoord")
        texcoord.name = "LuxuryFaceTexCoord"
        portrait = face_nodes.new("ShaderNodeTexImage")
        portrait.name = "LuxuryFacePortrait"
        portrait.image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
        portrait.interpolation = "Linear"
        portrait.extension = "EXTEND"
        face_links.new(texcoord.outputs["UV"], portrait.inputs["Vector"])
        face_links.new(portrait.outputs["Color"], multiply.inputs[1])
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
    owned += build_hands(rig, mats)
    owned += build_trousers(rig, mats)
    owned += build_high_tops(rig, mats)
    owned += build_accessories(rig, mats)
    audit(owned)

    if "--render" in sys.argv:
        neutral_review = os.environ.get("LUXURY_REVIEW_NEUTRAL") == "1"
        front_apose = os.environ.get("LUXURY_REVIEW_APOSE") == "1"
        pose_state = (apply_front_apose(rig) if front_apose else
                      (None if neutral_review else apply_reference_pose(rig)))
        throat_id_state = None
        semantic_id_debug = os.environ.get("LUXURY_DEBUG_SEMANTIC_IDS") == "1"
        try:
            cam, target = setup_render(owned)
            throat_id_debug = os.environ.get("LUXURY_DEBUG_THROAT_IDS") == "1"
            if throat_id_debug:
                throat_id_state = setup_throat_object_id_render(owned)
            if semantic_id_debug:
                setup_semantic_object_id_render()
            debug_group = os.environ.get("LUXURY_DEBUG_RENDER_GROUP")
            if debug_group:
                for obj in owned:
                    if obj.type == "MESH" and debug_group not in obj.name:
                        obj.hide_render = True
            debug_exact_object = os.environ.get("LUXURY_DEBUG_EXACT_OBJECT")
            if debug_exact_object:
                for obj in owned:
                    if obj.type in {"MESH", "CURVE", "SURFACE", "FONT", "META"}:
                        obj.hide_render = obj.name != debug_exact_object
            if os.environ.get("LUXURY_DEBUG_VISIBLE_CURVES") == "1":
                for obj in owned:
                    if obj.type == "CURVE":
                        print(f"LUXURY_VISIBLE_CURVE name={obj.name} hide_render={obj.hide_render}")
            if os.environ.get("LUXURY_DEBUG_CENTER_MESH_BOUNDS") == "1":
                bpy.context.view_layer.update()
                depsgraph = bpy.context.evaluated_depsgraph_get()
                for obj in owned:
                    if obj.type != "MESH" or obj.hide_render:
                        continue
                    evaluated = obj.evaluated_get(depsgraph)
                    points = [evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box]
                    x_bounds = (min(point.x for point in points), max(point.x for point in points))
                    z_bounds = (min(point.z for point in points), max(point.z for point in points))
                    if x_bounds[0] <= 0.0 <= x_bounds[1] and z_bounds[0] < 1.55 and z_bounds[1] > .45:
                        print(
                            "LUXURY_CENTER_MESH "
                            f"name={obj.name} "
                            f"x=({x_bounds[0]:.4f},{x_bounds[1]:.4f}) "
                            f"z=({z_bounds[0]:.4f},{z_bounds[1]:.4f}) "
                            f"height={z_bounds[1] - z_bounds[0]:.4f}"
                        )
            RENDER_PATH.parent.mkdir(parents=True, exist_ok=True)
            views = {
                "three-quarter": (Vector((
                    env_float("LUXURY_REVIEW_CAMERA_X", 0.85),
                    env_float("LUXURY_REVIEW_CAMERA_Y", -3.84),
                    env_float("LUXURY_REVIEW_CAMERA_Z", 1.16),
                )), RENDER_PATH),
                "front": (Vector((0, -3.99, 1.12)), RENDER_PATH.with_name("blender-luxury-male-front.png")),
                "side": (Vector((3.68, -0.26, 1.12)), RENDER_PATH.with_name("blender-luxury-male-side.png")),
            }
            if os.environ.get("LUXURY_REVIEW_HERO_ONLY") == "1":
                views = {"three-quarter": views["three-quarter"]}
            elif os.environ.get("LUXURY_REVIEW_FRONT_ONLY") == "1":
                views = {"front": views["front"]}
            if throat_id_debug:
                views = {"front": (
                    views["front"][0],
                    RENDER_PATH.parent.parent / "luxury-festival-final" / "throat-object-id.png",
                )}
            elif semantic_id_debug:
                views = {"front": (
                    views["front"][0],
                    RENDER_PATH.parent.parent / "luxury-festival-final" / "semantic-object-id.png",
                )}
            for view, (location, output) in views.items():
                output.parent.mkdir(parents=True, exist_ok=True)
                cam.location = location
                cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
                bpy.context.scene.render.filepath = str(output)
                bpy.ops.render.render(write_still=True)
                print(f"LUXURY_AVATAR_RENDER view={view} path={output}")
        finally:
            if throat_id_state is not None:
                restore_throat_object_id_render(throat_id_state)
            if pose_state is not None:
                clear_reference_pose(rig, pose_state)
    if "--write" in sys.argv:
        target = bpy.data.filepath or str(BLEND_PATH)
        bpy.ops.wm.save_as_mainfile(filepath=target)
        print(f"LUXURY_AVATAR_WRITTEN {target}")


if __name__ == "__main__":
    main()
