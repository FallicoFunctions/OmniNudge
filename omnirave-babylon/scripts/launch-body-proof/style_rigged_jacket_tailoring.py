"""Apply rest-coordinate textile and trim shaders to the open-front study."""

import argparse
import hashlib
import heapq
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion, Vector


def geometry_hash():
    """Hash every mesh, skin weight and shape coordinate, excluding shading."""
    digest = hashlib.sha256()
    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        if obj.type != "MESH":
            continue
        digest.update(obj.name.encode())
        digest.update(np.array(obj.matrix_world, dtype=np.float64).tobytes())
        for vertex in obj.data.vertices:
            digest.update(np.array(vertex.co, dtype=np.float32).tobytes())
            digest.update(repr([(g.group, g.weight) for g in vertex.groups]).encode())
        for polygon in obj.data.polygons:
            digest.update(np.array(polygon.vertices, dtype=np.int32).tobytes())
        if obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:
                digest.update(key.name.encode())
                coordinates = np.empty(len(key.data) * 3, dtype=np.float32)
                key.data.foreach_get("co", coordinates)
                digest.update(coordinates.tobytes())
    return digest.hexdigest()


def style():
    coat = bpy.data.objects["Structured armhole jacket"]
    rest = np.array([a.vector[:] for a in coat.data.attributes["TailorRest"].data])
    edge_faces = {}
    graph = [[] for _ in rest]
    for face in coat.data.polygons:
        ids = list(face.vertices)
        for a, b in zip(ids, ids[1:] + ids[:1]):
            key = tuple(sorted((a, b)))
            edge_faces[key] = edge_faces.get(key, 0) + 1
    for a, b in edge_faces:
        dist = float(np.linalg.norm(rest[a] - rest[b]))
        graph[a].append((b, dist))
        graph[b].append((a, dist))
    has_collar = "TailorCollar" in coat.data.attributes
    neck_top_threshold = 1.530 if has_collar else 1.499
    seeds = {
        i
        for edge, count in edge_faces.items()
        if count == 1
        for i in edge
        if rest[i, 2] > neck_top_threshold and abs(rest[i, 0]) < 0.13
    }
    assert seeds
    distances = [1e3] * len(rest)
    queue = []
    for i in seeds:
        distances[i] = 0
        heapq.heappush(queue, (0, i))
    while queue:
        distance, i = heapq.heappop(queue)
        if distance > distances[i]:
            continue
        for j, weight in graph[i]:
            total = distance + weight
            if total < distances[j]:
                distances[j] = total
                heapq.heappush(queue, (total, j))
    old = coat.data.attributes.get("TailorNeckDistance")
    if old:
        coat.data.attributes.remove(old)
    attr = coat.data.attributes.new("TailorNeckDistance", "FLOAT", "POINT")
    attr.data.foreach_set("value", distances)
    mat = bpy.data.materials.new("Tailored pearl bomber with gold knit trim")
    mat.use_nodes = True
    mat.diffuse_color = (0.74, 0.71, 0.65, 1)
    tree = mat.node_tree
    tree.nodes.clear()

    def node(kind, label):
        n = tree.nodes.new(kind)
        n.label = label
        return n

    def bind(socket, value):
        if isinstance(value, (int, float, tuple, list)):
            socket.default_value = value
        else:
            tree.links.new(value, socket)

    def math(op, a, b=None):
        n = node("ShaderNodeMath", op)
        n.operation = op
        bind(n.inputs[0], a)
        if b is not None:
            bind(n.inputs[1], b)
        return n.outputs[0]

    def band(value, lower, upper):
        return math(
            "MULTIPLY",
            math("GREATER_THAN", value, lower),
            math("LESS_THAN", value, upper),
        )

    def union(a, b):
        return math("MAXIMUM", a, b)

    def mix(factor, a, b):
        n = node("ShaderNodeMixRGB", "Color blend")
        bind(n.inputs[0], factor)
        bind(n.inputs[1], a)
        bind(n.inputs[2], b)
        return n.outputs[0]

    r = node("ShaderNodeAttribute", "Stable T pose coordinates")
    r.attribute_name = "TailorRest"
    split = node("ShaderNodeSeparateXYZ", "T pose axes")
    tree.links.new(r.outputs["Vector"], split.inputs[0])
    x, y, z = split.outputs
    ax = math("ABSOLUTE", x)
    neck_attr = node("ShaderNodeAttribute", "Neck edge distance")
    neck_attr.attribute_name = "TailorNeckDistance"
    nd = neck_attr.outputs["Fac"]
    if has_collar:
        collar_attr = node("ShaderNodeAttribute", "Standing collar fabric")
        collar_attr.attribute_name = "TailorCollar"
        neck = collar_attr.outputs["Fac"]
    else:
        neck = math("LESS_THAN", nd, 0.024)
    hem = math("LESS_THAN", z, 1.050)
    cuff_dist = math("SUBTRACT", 0.735, ax)
    cuff = math("LESS_THAN", cuff_dist, 0.044)
    knit = union(neck, union(hem, cuff))
    neck_gold = union(band(nd, 0.006, 0.0085), band(nd, 0.015, 0.0175))
    hem_gold = union(band(z, 1.023, 1.0255), band(z, 1.038, 1.0405))
    cuff_gold = union(band(cuff_dist, 0.011, 0.0135), band(cuff_dist, 0.028, 0.0305))
    gold = union(
        math("MULTIPLY", neck, neck_gold),
        union(math("MULTIPLY", hem, hem_gold), math("MULTIPLY", cuff, cuff_gold)),
    )
    width = math(
        "ADD",
        0.046,
        math(
            "MULTIPLY",
            0.034,
            math(
                "MINIMUM",
                1,
                math("MAXIMUM", 0, math("DIVIDE", math("SUBTRACT", 1.505, z), 0.49)),
            ),
        ),
    )
    edge_distance = math("SUBTRACT", ax, width)
    front = math("LESS_THAN", y, -0.04)
    if has_collar:
        front = math("MULTIPLY", front, math("SUBTRACT", 1, neck))
    zipper_tape = math("MULTIPLY", front, band(edge_distance, -0.0002, 0.007))
    teeth_rhythm = math("LESS_THAN", math("FRACT", math("MULTIPLY", z, 340)), 0.64)
    teeth = math(
        "MULTIPLY",
        front,
        math("MULTIPLY", band(edge_distance, 0.0003, 0.0038), teeth_rhythm),
    )
    piping = math("MULTIPLY", front, band(edge_distance, 0.005, 0.0062))
    gold = union(gold, union(teeth, piping))
    dark = union(knit, zipper_tape)
    base = mix(dark, (0.74, 0.71, 0.65, 1), (0.004, 0.005, 0.006, 1))
    base = mix(gold, base, (0.72, 0.48, 0.18, 1))
    bsdf = node("ShaderNodeBsdfPrincipled", "Pearl satin and ribbed trim")
    tree.links.new(base, bsdf.inputs["Base Color"])
    bind(
        bsdf.inputs["Metallic"],
        math(
            "ADD",
            math("MULTIPLY", math("SUBTRACT", 1, dark), 0.16),
            math("MULTIPLY", gold, 0.72),
        ),
    )
    bind(
        bsdf.inputs["Roughness"],
        math(
            "ADD",
            0.36,
            math("MULTIPLY", math("MULTIPLY", dark, math("SUBTRACT", 1, gold)), 0.12),
        ),
    )
    bind(bsdf.inputs["Coat Weight"], math("MULTIPLY", 0.08, math("SUBTRACT", 1, knit)))
    bsdf.inputs["Coat Roughness"].default_value = 0.25
    bsdf.inputs["Sheen Weight"].default_value = 0.25
    # Fine knit relief is shader-only; it does not displace the audited mesh.
    cuff_angle = math("ARCTAN2", math("SUBTRACT", z, 1.428), math("ADD", y, 0.022))
    cuff_ribs = math("MULTIPLY", cuff_angle, 38)
    neck_ribs = math("MULTIPLY", math("ARCTAN2", y, x), 75)
    rib_phase = math(
        "ADD",
        math("MULTIPLY", cuff, cuff_ribs),
        math(
            "MULTIPLY",
            math("SUBTRACT", 1, cuff),
            math(
                "ADD",
                math("MULTIPLY", neck, neck_ribs),
                math("MULTIPLY", math("SUBTRACT", 1, neck), math("MULTIPLY", x, 1900)),
            ),
        ),
    )
    ribs = math("MULTIPLY", knit, math("SINE", rib_phase))
    bump = node("ShaderNodeBump", "Fine rib knit, no displacement")
    bump.inputs["Strength"].default_value = 0.3
    bump.inputs["Distance"].default_value = 0.00035
    tree.links.new(ribs, bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    output = node("ShaderNodeOutputMaterial", "Surface")
    tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    coat.data.materials.clear()
    coat.data.materials.append(mat)
    for face in coat.data.polygons:
        face.material_index = 0
    top = bpy.data.objects["AvatarTop_tailored"]
    top_mat = top.data.materials[0].copy()
    top_mat.name = "Tailored black shirt satin"
    top.data.materials[0] = top_mat
    for n in top_mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Base Color"].default_value = (0.005, 0.006, 0.007, 1)
            n.inputs["Roughness"].default_value = 0.48
            n.inputs["Metallic"].default_value = 0.02
            n.inputs["Sheen Weight"].default_value = 0.15
    return {
        "neck_seed_count": len(seeds),
        "rest_vertex_count": len(rest),
        "geometry_displacement": False,
        "trim": "black knit, paired gold bands, zipper teeth and piping",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    digest = hashlib.sha256(args.input.read_bytes()).hexdigest()
    assert args.input.resolve() != args.output.resolve()
    assert not args.output.exists(), args.output
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    before = geometry_hash()
    report = style()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.shading.type = "MATERIAL"
                view = area.spaces.active.region_3d
                view.view_location = Vector((0, 0, 1.28))
                view.view_rotation = Quaternion((1, 0, 0), math.pi / 2)
                view.view_distance = 1.15
                view.view_perspective = "ORTHO"
    assert geometry_hash() == before
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    bpy.ops.wm.open_mainfile(filepath=str(args.output))
    assert geometry_hash() == before
    assert hashlib.sha256(args.input.read_bytes()).hexdigest() == digest
    report.update(
        source_sha256=digest,
        output_sha256=hashlib.sha256(args.output.read_bytes()).hexdigest(),
        geometry_and_skin_sha256=before,
        all_mesh_geometry_and_skin_preserved_after_reopen=True,
    )
    args.output.with_suffix(".style.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
