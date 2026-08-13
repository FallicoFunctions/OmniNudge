# Procedural rigged humanoid BODY BASES for the OmniRave avatar system.
#
# Builds two bodies - 'male' and 'female' - as ONE watertight skinned surface
# each, plus a standard humanoid armature, ready to replace the procedural
# capsule rig in src/player/createReviewAvatar.ts.
#
# REFERENCE HEIGHT: 1.75 m exactly (avatar_params.REFERENCE_HEIGHT). Feet sit
# at z = 0 (y = 0 after the y-up export), crown at 1.75. The runtime scales
# each avatar from this height - do not bake per-avatar height in here.
#
# HOW THE GEOMETRY IS MADE
#   avatar_params.py holds a joint GRAPH (33 named nodes, 38 edges) with an
#   elliptical cross-section radius per node, taken from real anthropometric
#   ratios (7.5 heads tall, biacromial 0.23*H male / 0.21*H female, etc.).
#   The graph is inflated by Blender's Skin modifier - which stitches the
#   limbs into the torso at the branch nodes, so the result is a single
#   continuous surface, not overlapping capsules - then smoothed with two
#   levels of Catmull-Clark subdivision.
#
#   Only ONE surface is ever inflated (from the male graph). The female body
#   is that same surface pushed through a graph-space warp onto the female
#   table (see warp_to_graph). That is deliberate: inflating the female graph
#   separately gives a different hull tessellation, whereas warping keeps the
#   two bodies VERTEX-INDEX IDENTICAL - same vertex count, same face order,
#   same UVs - which is what lets the later wardrobe pass fit one garment to
#   both bodies with a shape key instead of two separate garment meshes.
#
# IDEMPOTENCY
#   Every object this script owns is named with GENERATED_PREFIX. clear_previous()
#   deletes those objects and their orphaned mesh/armature datablocks before
#   anything is built, so re-running is a no-op on the result. Materials are
#   looked up by name and only created when missing (the venue generator idiom).
#
# Run:  blender -b assets-src/avatars/body-bases/avatar.blend \
#         --python scripts/generate-avatar-bodies.py -- --write
#   (or via scripts/export-avatar-bodies.sh, which backs the blend up first)
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from avatar_params import (  # noqa: E402
    BODIES,
    BONES,
    BRA_BAND,
    BRIEFS_BAND,
    EDGES,
    NODE_ORDER,
    REFERENCE_HEIGHT,
    ROOT_NODE,
    SKIN_BASE_COLOR,
    SKIN_MATERIAL,
    UNDERGARMENT_BASE_COLOR,
    UNDERGARMENT_MATERIAL,
    UNDERGARMENT_MAX_ABS_X,
)

GENERATED_PREFIX = "Avatar"
BODY_SUFFIXES = ("Body_male", "Body_female")
RIG_SUFFIXES = ("Rig_male", "Rig_female")
OWNED_SUFFIXES = BODY_SUFFIXES + RIG_SUFFIXES

# Two Catmull-Clark levels turn the Skin modifier's blocky hull into a smooth
# mannequin while keeping both bodies well under the 15k tri budget (a crowded
# venue may show dozens of these at once). Level 3 looks marginally rounder and
# quadruples the cost - not worth it at gameplay distance.
SUBSURF_LEVELS = 2

BLEND_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "assets-src", "avatars", "body-bases", "avatar.blend",
)


def clear_previous():
    """Remove everything this generator owns so a re-run is idempotent."""
    owned_data = set()
    for obj in list(bpy.data.objects):
        if any(obj.name.startswith(GENERATED_PREFIX + s) for s in OWNED_SUFFIXES):
            owned_data.add(obj.data)
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh in owned_data and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for armature in list(bpy.data.armatures):
        if armature in owned_data and armature.users == 0:
            bpy.data.armatures.remove(armature)
    # A blend opened from factory startup carries the default cube/camera/light;
    # they would otherwise land in the export.
    for name in ("Cube", "Camera", "Light"):
        stale = bpy.data.objects.get(name)
        if stale is not None:
            bpy.data.objects.remove(stale, do_unlink=True)


def material_with_fallback(name, base_color, roughness, metallic=0.0):
    """Venue idiom: look the material up by name, author it only if missing,
    so hand-tuning it in Blender survives a regeneration."""
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    # Workbench's MATERIAL preview shading (used by render-avatar-bodies.py)
    # reads Material.diffuse_color, NOT the Principled BSDF's Base Color input.
    # Without this the review renders come out flat grey even though the glTF
    # export (which reads the node's Base Color) is correct - keep both in sync.
    mat.diffuse_color = base_color
    mat.roughness = roughness
    mat.metallic = metallic
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def build_skin_mesh(name, nodes):
    """Inflate the joint graph into one continuous smooth surface."""
    verts = [nodes[n][0] for n in NODE_ORDER]
    index = {n: i for i, n in enumerate(NODE_ORDER)}
    edges = [(index[a], index[b]) for (a, b) in EDGES]

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    skin = obj.modifiers.new("AvatarSkin", "SKIN")
    skin.use_smooth_shade = True
    skin_data = mesh.skin_vertices[0].data
    for node_name, i in index.items():
        rx, ry = nodes[node_name][1]
        skin_data[i].radius = (rx, ry)
        skin_data[i].use_root = node_name == ROOT_NODE

    subsurf = obj.modifiers.new("AvatarSubsurf", "SUBSURF")
    subsurf.levels = SUBSURF_LEVELS
    subsurf.render_levels = SUBSURF_LEVELS

    bpy.context.view_layer.objects.active = obj
    for other in bpy.context.selected_objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier="AvatarSkin")
    bpy.ops.object.modifier_apply(modifier="AvatarSubsurf")
    return obj


def _push_vertices(mesh, centre, radius, strength, direction):
    """Sculpt brush: displace every vertex within `radius` of `centre` along
    `direction`, falling off smoothly (raised-cosine) to zero at the edge of
    the radius so it reads as a rounded bump/dent rather than a spike or a
    hard-edged crater."""
    direction = direction.normalized()
    for v in mesh.vertices:
        d = (v.co - centre).length
        if d >= radius:
            continue
        falloff = 0.5 * (1.0 + math.cos(math.pi * d / radius))
        v.co = v.co + direction * (strength * falloff)


def refine_head_resolution(obj, z_lo, z_hi):
    """The neck-skull-crown chain is only 3 graph nodes, so even after 2
    levels of Catmull-Clark the head carries barely ~10 vertices per ring -
    far too coarse for sculpt_face's brow/eye/nose pushes to read as
    anything but a smoothed-away nothing (confirmed: at that resolution the
    first attempt at this sculpt was completely invisible in a render). This
    adds one extra topological subdivision over just the head's face/vertex
    range (a plain edge split, not a Catmull-Clark smooth - the shape is
    already smooth from the earlier subsurf, this purely adds room for a
    small brush to have more than 1-3 vertices to move)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    target_faces = [f for f in bm.faces if z_lo <= f.calc_center_median().z <= z_hi]
    target_edges = list({e for f in target_faces for e in f.edges})
    bmesh.ops.subdivide_edges(bm, edges=target_edges, cuts=1, use_grid_fill=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def _front_y_at(mesh, z, tol=0.016, x_max=0.05):
    """The actual frontmost (most negative Y) vertex Y near height `z` and
    close to the midline, read off the REAL built mesh rather than computed
    analytically from the skull node's radius. Two levels of Catmull-Clark
    subdivision pull the surface in noticeably from the Skin modifier's
    control cage, so `skull.y - skull.radius_y` overshoots past the actual
    surface by roughly 2cm - a sculpt brush centred there sits in empty space
    and touches nothing, which is what silently made the first attempt at
    this a no-op."""
    candidates = [v.co.y for v in mesh.vertices if abs(v.co.x) < x_max and abs(v.co.z - z) < tol]
    return min(candidates) if candidates else 0.0


def sculpt_face(obj, nodes):
    """Brow ridge, eye socket dents and a nose bump, all as a vertex-push
    sculpt on the skull region rather than as graph nodes. Skin inflation can
    only add volume along a straight taper from its parent node's radius, so
    it cannot carve the eye sockets' concavity at all, and a nose modelled as
    a spur off the (much bigger) skull node tapers over its ENTIRE edge
    length and reads as a beak/fin rather than a localised bump (tried during
    pass 2 - see the EDGES comment in avatar_params.py). A vertex push blends
    into whatever geometry is already there instead, at whatever size brush
    radius is requested.

    Runs on male_obj BEFORE the female copy+warp so both bodies inherit the
    same sculpt. This is warp-safe: every push here is radial around the
    skull's roughly-vertical neck-skull-crown axis (see the FACE_NODE_PARENT
    note in avatar_params.py for why that matters), not an axial extension
    past a segment's end - unlike a nose spur would have been, which is the
    other reason it is done this way instead."""
    skull_pos = Vector(nodes["skull"][0])
    eye_z = skull_pos.z + 0.002
    brow_z = skull_pos.z + 0.020
    nose_z = skull_pos.z - 0.026
    tip_z = skull_pos.z - 0.046

    mesh = obj.data
    out = Vector((0.0, -1.0, 0.0))
    inn = Vector((0.0, 1.0, 0.0))

    # Brow ridge: one shallow forward push spanning both eyes. Centred ON the
    # actual surface (not an analytic estimate - see _front_y_at) so the
    # brush has vertices to move at all.
    brow_centre = Vector((0.0, _front_y_at(mesh, brow_z), brow_z))
    _push_vertices(mesh, brow_centre, radius=0.048, strength=0.026, direction=out)

    # Eye sockets: a dent under the brow, one per side. Smaller radius than
    # the brow/nose pushes so the transition reads as a distinct hollow
    # rather than another broad, easily-missed wave.
    eye_front_y = _front_y_at(mesh, eye_z)
    for side in (-1.0, 1.0):
        centre = Vector((side * 0.036, eye_front_y, eye_z))
        _push_vertices(mesh, centre, radius=0.021, strength=0.024, direction=inn)

    # Nose: a narrow bridge push plus a slightly stronger, rounder tip push
    # just below it, both small-radius so the bump stays localised instead of
    # spanning up toward the brow.
    bridge_centre = Vector((0.0, _front_y_at(mesh, nose_z), nose_z))
    _push_vertices(mesh, bridge_centre, radius=0.024, strength=0.024, direction=out)
    tip_centre = Vector((0.0, _front_y_at(mesh, tip_z), tip_z))
    _push_vertices(mesh, tip_centre, radius=0.021, strength=0.032, direction=out)

    mesh.update()


# Fractions of REFERENCE_HEIGHT where the undergarment boundary sits (the
# union of the briefs and bra bands - see clean_undergarment_boundary).
def _band_fractions():
    return sorted({f for band in (BRIEFS_BAND, BRA_BAND) for f in band})


def clean_undergarment_boundary(obj):
    """Insert an exact edge loop at every undergarment band boundary BEFORE
    any face is assigned a material.

    The original approach tested each existing polygon's centre against a
    flat world-Z plane and painted it slot 1 if it fell inside the band. That
    is a per-face judgement call against geometry that was never built to
    align with a flat Z plane: the pelvis-waist-chest chain tilts a few
    degrees off world Z (waist/chest/yoke all carry a small y offset), so the
    Catmull-Clark quad rings around the hip/crotch fork are tilted relative
    to true horizontal. A flat plane test crossing those tilted rings at an
    angle is exactly what produced the jagged/zigzag boundary and the stray
    dark square near the crotch (an isolated quad whose centre fell on the
    wrong side of the plane relative to its neighbours).

    bmesh.ops.bisect_plane instead SPLITS the mesh geometry exactly on the
    plane first, so afterwards no face can straddle a band boundary - the
    boundary is a single clean ring by construction, not a per-face guess.
    Runs on the male base mesh only, before the female copy+warp, so both
    bodies inherit the identical clean ring (and, since finish_body copies
    the male's face material assignment across by face index rather than
    recomputing it, both bodies end up with the byte-for-byte same boundary
    faces)."""
    zs = [v.co.z for v in obj.data.vertices]
    z_min, z_max = min(zs), max(zs)
    scale = REFERENCE_HEIGHT / (z_max - z_min)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for frac in _band_fractions():
        raw_z = frac * REFERENCE_HEIGHT / scale + z_min
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(
            bm, geom=geom, dist=1e-5,
            plane_co=(0.0, 0.0, raw_z), plane_no=(0.0, 0.0, 1.0),
            clear_inner=False, clear_outer=False,
        )
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def triangulate_ngons(obj):
    """bisect_plane and subdivide_edges above occasionally leave a 5+-sided
    face where a cut crosses an existing quad at an angle. Blender's own
    glTF exporter cannot calculate tangents across an n-gon ("Could not
    calculate tangents. Please try to triangulate the mesh first." - seen on
    export after adding the bisect-based boundary fix), so triangulate ONLY
    those faces here - quads are left alone since they exported fine before
    and glTF ships triangles either way."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def _segment_frame(p0, p1):
    """A stable orthonormal frame for a graph segment: axis + two in-plane
    axes. e1 tracks world X where it can (so torso 'across' stays across and
    the elliptical cross-sections map correctly), otherwise world Z."""
    axis = (p1 - p0)
    length = axis.length
    axis = axis / length if length > 1e-9 else Vector((0.0, 0.0, 1.0))
    reference = Vector((1.0, 0.0, 0.0))
    if abs(axis.dot(reference)) > 0.9:
        reference = Vector((0.0, 0.0, 1.0))
    e1 = (reference - axis * axis.dot(reference)).normalized()
    e2 = axis.cross(e1)
    return axis, e1, e2


def _graph_frames(nodes):
    frames = []
    for (a, b) in EDGES:
        p0 = Vector(nodes[a][0])
        p1 = Vector(nodes[b][0])
        axis, e1, e2 = _segment_frame(p0, p1)
        frames.append((p0, p1, axis, e1, e2, nodes[a][1], nodes[b][1]))
    return frames


# Warp falloff. Each vertex is expressed in EVERY segment's local frame and the
# results are blended by inverse distance to the power below - high enough that
# a vertex is effectively owned by its own limb, low enough that the blend
# stays smooth across joints so no crease appears where ownership changes.
WARP_FALLOFF = 4.0


def warp_to_graph(obj, source_nodes, target_nodes):
    """Push a surface built on source_nodes onto target_nodes, preserving
    topology exactly. Each vertex is decomposed into per-segment cylindrical
    coordinates (position along the segment, offset in the segment's cross
    section scaled by that segment's radius) and recomposed against the target
    graph, blended over all segments."""
    source = _graph_frames(source_nodes)
    target = _graph_frames(target_nodes)

    for vert in obj.data.vertices:
        co = vert.co.copy()
        total = 0.0
        accumulated = Vector((0.0, 0.0, 0.0))
        for (s, t) in zip(source, target):
            p0, p1, axis, e1, e2, r0, r1 = s
            span = p1 - p0
            length_sq = span.length_squared
            u = 0.0 if length_sq < 1e-12 else max(0.0, min(1.0, (co - p0).dot(span) / length_sq))
            on_axis = p0 + span * u
            offset = co - on_axis
            a1 = offset.dot(e1)
            a2 = offset.dot(e2)
            distance = offset.length

            tp0, tp1, taxis, te1, te2, tr0, tr1 = t
            # Radius ratio at this point along the segment, per cross-section
            # axis, so the female's flatter chest / wider hips read correctly.
            sr1 = r0[0] + (r1[0] - r0[0]) * u
            sr2 = r0[1] + (r1[1] - r0[1]) * u
            dr1 = tr0[0] + (tr1[0] - tr0[0]) * u
            dr2 = tr0[1] + (tr1[1] - tr0[1]) * u
            mapped = (
                tp0 + (tp1 - tp0) * u
                + te1 * (a1 * (dr1 / sr1 if sr1 > 1e-6 else 1.0))
                + te2 * (a2 * (dr2 / sr2 if sr2 > 1e-6 else 1.0))
            )
            weight = 1.0 / ((distance + 1e-4) ** WARP_FALLOFF)
            accumulated += mapped * weight
            total += weight
        if total > 0.0:
            vert.co = accumulated / total
    obj.data.update()


def normalise_height(obj, nodes):
    """Scale the finished surface so it is EXACTLY REFERENCE_HEIGHT tall with
    the soles at z = 0, and return the matching transform for the joints so the
    armature lands on the same landmarks."""
    zs = [v.co.z for v in obj.data.vertices]
    z_min, z_max = min(zs), max(zs)
    scale = REFERENCE_HEIGHT / (z_max - z_min)
    for v in obj.data.vertices:
        v.co.x *= scale
        v.co.y *= scale
        v.co.z = (v.co.z - z_min) * scale
    obj.data.update()

    def place(node_name):
        x, y, z = nodes[node_name][0]
        return Vector((x * scale, y * scale, (z - z_min) * scale))

    return place, scale


# A hanging arm's forearm/wrist sits at the SAME world z-height as the hips
# (and the female chest/spine at the same height as the bra band), so a
# height-band-only test paints wristbands/armbands onto the arms. Blacklisting
# any polygon touching an arm-dominant vertex (dominant skin bone, computed
# after binding - see finish_body) removes those false positives while
# keeping the z-band's clean, straight edge everywhere else: a whitelist
# ("must be hips/thigh/chest") was tried first and rejected because it made
# the underarm/side-seam boundary jagged - bone-weight iso-surfaces don't
# align with the flat z-rings the way a simple exclusion does.
ARM_BONES = {
    "shoulder.L", "shoulder.R", "upperarm.L", "upperarm.R",
    "forearm.L", "forearm.R", "hand.L", "hand.R",
}


def dominant_bone_per_vertex(obj):
    """Map each vertex index to the vertex-group (bone) name with the highest
    weight, using the automatic weights just computed by bind()."""
    group_names = {vg.index: vg.name for vg in obj.vertex_groups}
    dominant = {}
    for vert in obj.data.vertices:
        best_name, best_weight = None, -1.0
        for g in vert.groups:
            if g.weight > best_weight:
                best_weight = g.weight
                best_name = group_names.get(g.group)
        dominant[vert.index] = best_name
    return dominant


def classify_undergarment_faces(obj, dominant_bone):
    """Tag each polygon "briefs", "bra" or None. Computed ONCE, on the male
    body only, right after its own bind - the female body reuses this exact
    per-face-index classification (see apply_undergarment) instead of
    recomputing it from its own (warped) vertex positions. Both bands are
    tested here regardless of sex (the male body just never applies the
    "bra" tag to a material slot - see apply_undergarment) so one pass gives
    both bodies everything they need, and the two bodies can never end up
    with a different-looking boundary from each other."""
    briefs_lo, briefs_hi = (f * REFERENCE_HEIGHT for f in BRIEFS_BAND)
    bra_lo, bra_hi = (f * REFERENCE_HEIGHT for f in BRA_BAND)

    tags = [None] * len(obj.data.polygons)
    for poly in obj.data.polygons:
        centre = poly.center
        if abs(centre.x) > UNDERGARMENT_MAX_ABS_X:
            continue
        if any(dominant_bone.get(v) in ARM_BONES for v in poly.vertices):
            continue
        if briefs_lo <= centre.z <= briefs_hi:
            tags[poly.index] = "briefs"
        elif bra_lo <= centre.z <= bra_hi:
            tags[poly.index] = "bra"
    return tags


def apply_undergarment(obj, tags, sex):
    """Slot 0 tintable skin, slot 1 neutral undergarment. The undergarment is a
    face-region material assignment on the body itself - zero extra triangles,
    and it can never clip through. Wardrobe is a LATER pass. Material slots
    must already exist on `obj` (see finish_body)."""
    allowed = {"briefs"} if sex == "male" else {"briefs", "bra"}
    covered = 0
    for poly, tag in zip(obj.data.polygons, tags):
        if tag in allowed:
            poly.material_index = 1
            covered += 1
    return covered


def unwrap(obj):
    """A real UV layout so a later wardrobe/tattoo/texture pass has somewhere to
    paint. Falls back to the venue's box projection if the operator is
    unavailable in this build."""
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        return "smart_project"
    except Exception:
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
        mesh = obj.data
        uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            normal = poly.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            u_axis, v_axis = [i for i in range(3) if i != axis]
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                uv_layer.data[li].uv = (co[u_axis] / 2.0 + 0.5, co[v_axis] / 2.0)
        return "box_projection"


def build_armature(name, place):
    armature = bpy.data.armatures.new(name + "_Data")
    obj = bpy.data.objects.new(name, armature)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, head_node, tail_node, parent, connected in BONES:
        bone = armature.edit_bones.new(bone_name)
        bone.head = place(head_node)
        bone.tail = place(tail_node)
        if (bone.tail - bone.head).length < 1e-4:
            bone.tail = bone.head + Vector((0.0, 0.0, 0.02))
        if parent is not None:
            bone.parent = armature.edit_bones[parent]
            bone.use_connect = connected
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def bind(mesh_obj, rig_obj):
    """Bone-heat automatic weights. The surface is watertight and manifold, so
    heat weighting converges; if a Blender build ever refuses, fall back to
    envelopes rather than shipping an unskinned mesh."""
    for other in bpy.context.selected_objects:
        other.select_set(False)
    mesh_obj.select_set(True)
    rig_obj.select_set(True)
    bpy.context.view_layer.objects.active = rig_obj
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        mode = "bone_heat"
    except RuntimeError:
        bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
        mode = "envelope"
    for other in bpy.context.selected_objects:
        other.select_set(False)
    return mode


def repair_unweighted(mesh_obj, rig_obj):
    """Bone-heat can leave a handful of vertices with zero weight where the
    heat diffusion pinches off on a thin, largely-separated appendage - the
    new separate thumb/finger spurs are exactly that shape (thin, branching
    off the palm at a sharp radius change), which is where this actually
    fires. Rather than ship a vertex that would tear, snap any such vertex to
    its nearest bone by straight-line distance to that bone's segment, full
    weight - a rigid fallback exactly where heat already struggled, so the
    tip still moves rigidly with its parent bone instead of not moving at
    all."""
    unweighted = [v for v in mesh_obj.data.vertices if not v.groups]
    if not unweighted:
        return 0
    segments = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in rig_obj.data.bones]
    for v in unweighted:
        best_name, best_d = None, None
        for name, head, tail in segments:
            span = tail - head
            length_sq = span.length_squared
            u = 0.0 if length_sq < 1e-12 else max(0.0, min(1.0, (v.co - head).dot(span) / length_sq))
            closest = head + span * u
            d = (v.co - closest).length
            if best_d is None or d < best_d:
                best_d = d
                best_name = name
        vg = mesh_obj.vertex_groups.get(best_name) or mesh_obj.vertex_groups.new(name=best_name)
        vg.add([v.index], 1.0, "REPLACE")
    mesh_obj.data.update()
    return len(unweighted)


def clamp_weights(mesh_obj):
    """Bone-heat can leave an individual vertex group weight a hair over 1.0
    (seen: 1.0000001-1.0000002) from its own floating-point solve - harmless
    in practice but mesh.validate() flags it, and Mesh.validate() failing is
    exactly what the glTF exporter's "not valid" export warning was pointing
    at. Cheap to clamp outright."""
    for v in mesh_obj.data.vertices:
        for g in v.groups:
            if g.weight > 1.0:
                g.weight = 1.0


def finish_body(mesh_obj, sex, uv_mode, undergarment_tags=None):
    nodes = BODIES[sex]
    place, scale = normalise_height(mesh_obj, nodes)
    # Bind BEFORE surfacing: the undergarment bands are gated on each vertex's
    # dominant bone (see classify_undergarment_faces), which only exists once
    # the armature modifier has produced vertex groups.
    rig_obj = build_armature(f"{GENERATED_PREFIX}Rig_{sex}", place)
    weight_mode = bind(mesh_obj, rig_obj)
    repaired = repair_unweighted(mesh_obj, rig_obj)
    clamp_weights(mesh_obj)

    skin = material_with_fallback(SKIN_MATERIAL, SKIN_BASE_COLOR, 0.55)
    cloth = material_with_fallback(UNDERGARMENT_MATERIAL, UNDERGARMENT_BASE_COLOR, 0.78)
    mesh_obj.data.materials.append(skin)
    mesh_obj.data.materials.append(cloth)

    if undergarment_tags is None:
        # Male only: classify once here, on this (already bound) body, and
        # hand the tags back to main() so the female call above can reuse
        # them instead of recomputing its own (see classify_undergarment_faces).
        dominant_bone = dominant_bone_per_vertex(mesh_obj)
        undergarment_tags = classify_undergarment_faces(mesh_obj, dominant_bone)
    covered = apply_undergarment(mesh_obj, undergarment_tags, sex)
    for poly in mesh_obj.data.polygons:
        poly.use_smooth = True

    tris = sum(len(p.vertices) - 2 for p in mesh_obj.data.polygons)
    groups = len(mesh_obj.vertex_groups)
    unweighted = sum(1 for v in mesh_obj.data.vertices if not v.groups)
    zs = [v.co.z for v in mesh_obj.data.vertices]
    xs = [v.co.x for v in mesh_obj.data.vertices]
    ys = [v.co.y for v in mesh_obj.data.vertices]
    print(
        f"AVATAR_BODY sex={sex} verts={len(mesh_obj.data.vertices)} "
        f"faces={len(mesh_obj.data.polygons)} tris={tris} bones={len(rig_obj.data.bones)} "
        f"vgroups={groups} unweighted={unweighted} repaired={repaired} weights={weight_mode} "
        f"uv={uv_mode} undergarment_faces={covered} scale={scale:.4f} "
        f"height={max(zs) - min(zs):.4f} width={max(xs) - min(xs):.4f} depth={max(ys) - min(ys):.4f}"
    )
    if unweighted:
        raise RuntimeError(f"{sex} body has {unweighted} unweighted vertices - the mesh would tear")
    return (len(mesh_obj.data.vertices), len(mesh_obj.data.polygons)), undergarment_tags


def main():
    write = "--write" in sys.argv
    clear_previous()

    # One inflation - then sculpt/clean it up - then one unwrap - then the
    # female is a warp of that same finished surface.
    male_obj = build_skin_mesh(f"{GENERATED_PREFIX}Body_male", BODIES["male"])
    refine_head_resolution(male_obj, BODIES["male"]["neck"][0][2], BODIES["male"]["crown"][0][2])
    sculpt_face(male_obj, BODIES["male"])
    clean_undergarment_boundary(male_obj)
    triangulate_ngons(male_obj)
    uv_mode = unwrap(male_obj)

    female_obj = male_obj.copy()
    female_obj.data = male_obj.data.copy()
    female_obj.name = f"{GENERATED_PREFIX}Body_female"
    female_obj.data.name = f"{GENERATED_PREFIX}Body_female_Mesh"
    bpy.context.collection.objects.link(female_obj)
    warp_to_graph(female_obj, BODIES["male"], BODIES["female"])

    male_stats, undergarment_tags = finish_body(male_obj, "male", uv_mode)
    female_stats, _ = finish_body(female_obj, "female", uv_mode, undergarment_tags)
    if male_stats != female_stats:
        raise RuntimeError(f"topology parity lost: male={male_stats} female={female_stats}")

    count = len([
        o for o in bpy.data.objects
        if any(o.name.startswith(GENERATED_PREFIX + s) for s in OWNED_SUFFIXES)
    ])
    if write:
        target = bpy.data.filepath or BLEND_PATH
        os.makedirs(os.path.dirname(target), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=target)
    print(f"AVATAR_GENERATED objects={count} reference_height={REFERENCE_HEIGHT} written={write}")


main()
