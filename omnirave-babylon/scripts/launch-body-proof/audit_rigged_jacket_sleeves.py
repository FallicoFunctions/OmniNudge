"""Read-only sleeve audit for a rebuilt tailored jacket."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import build_lowered_jacket_target as H
import gate_rigged_jacket_correctives as gate
from tailor_rigged_jacket_opening import driver_snapshot, shape_metadata

SOURCE = (
    SCRIPTS.parents[1]
    / "assets-src/avatars/launch-body-proof/rigged-jacket-tailoring-study/male-rigged-jacket-tailored.blend"
)
REVIEWS = (
    "Jacket review - elbow bend",
    "Jacket review - forward reach",
    "Jacket review - overhead reach",
)
SIDES = ("l", "r")
EPS = 1e-6
FLOAT_TOL = 2e-6


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def update():
    bpy.context.view_layer.update()


def sample(scene, value):
    whole = int(value)
    scene.frame_set(whole, subframe=float(value - whole))
    update()


def array(points):
    return np.asarray([tuple(point) for point in points], dtype=np.float64)


def bounds(points):
    values = array(points)
    return {"min": values.min(axis=0).tolist(), "max": values.max(axis=0).tolist()}


def midpoint(coat, solidify, base_count):
    previous = solidify.show_viewport
    solidify.show_viewport = False
    try:
        update()
        points, faces = H.geometry(coat)
        if len(points) != base_count:
            raise AssertionError(
                f"midsurface vertex count {len(points)} != {base_count}"
            )
        return points, faces
    finally:
        solidify.show_viewport = previous
        update()


def dynamic_containment(native_points, body_points, body_faces):
    tree = BVHTree.FromPolygons(body_points, body_faces, all_triangles=True)
    direction = H.Vector((1.0, 0.371, 0.173)).normalized()
    counts = {"inside": 0, "outside": 0, "ambiguous": 0, "no_hit": 0}
    for point in native_points:
        counts[H.oriented_inside(point, tree, direction)] += 1
    return {"ray_direction": list(direction), "native_vertex_states": counts}


def record(coat, body, shirt, solidify, base_count):
    native, native_faces = H.geometry(coat)
    body_points, body_faces = H.geometry(body)
    shirt_points, shirt_faces = H.geometry(shirt)
    pairs = {
        "self": H.strict_pairs(native, native_faces),
        "body": H.between(native, native_faces, body_points, body_faces),
        "shirt": H.between(native, native_faces, shirt_points, shirt_faces),
    }
    mid, mid_faces = midpoint(coat, solidify, base_count)
    _, shirt_outer = H.verify_shirt_pairing(shirt_faces, len(shirt_points))
    result = {
        "native_counts": {name: len(rows) for name, rows in pairs.items()},
        "midsurface_self": len(H.strict_pairs(mid, mid_faces)),
        "offset_orientation": H.offset_orientation(
            native, native_faces, mid, mid_faces
        ),
        "containment": dynamic_containment(native, body_points, body_faces),
        "shirt_layering": H.shirt_layering_violations(
            mid, BVHTree.FromPolygons(shirt_points, shirt_outer, all_triangles=True)
        ),
        "native_bounds": bounds(native),
        "midsurface_bounds": bounds(mid),
    }
    result["native_counts"]["total"] = sum(result["native_counts"].values())
    return result


def failing(result):
    states = result["containment"]["native_vertex_states"]
    orientation = result["offset_orientation"]
    return bool(
        result["native_counts"]["total"]
        or result["midsurface_self"]
        or states["inside"]
        or states["ambiguous"]
        or result["shirt_layering"]["count"]
        or orientation["reversed_faces"]
        or orientation["minimum_midsurface_triangle_area_m2"] <= 1e-12
    )


def arm_basis(rig):
    return {
        side: {
            part: rig.pose.bones[f"{part}_{side}"].matrix_basis.copy()
            for part in ("upperarm", "lowerarm", "hand")
        }
        for side in SIDES
    }


def topology(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    edges = [
        tuple(sorted((edge.verts[0].index, edge.verts[1].index))) for edge in bm.edges
    ]
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    boundary_neighbors = {}
    for edge in boundary:
        a, b = edge.verts[0].index, edge.verts[1].index
        boundary_neighbors.setdefault(a, []).append(b)
        boundary_neighbors.setdefault(b, []).append(a)
    boundary_loops = []
    seen = set()
    for start in sorted(boundary_neighbors):
        if start in seen:
            continue
        loop, previous, current = [], None, start
        while current not in seen:
            loop.append(current)
            seen.add(current)
            choices = [
                value for value in boundary_neighbors[current] if value != previous
            ]
            if not choices:
                break
            previous, current = current, choices[0]
        boundary_loops.append({"vertices": loop, "closed": current == start})
    adjacency = {vertex.index: set() for vertex in bm.verts}
    for a, b in edges:
        adjacency[a].add(b)
        adjacency[b].add(a)
    components, pending = [], set(adjacency)
    while pending:
        frontier = [pending.pop()]
        component = []
        while frontier:
            vertex = frontier.pop()
            component.append(vertex)
            for neighbor in adjacency[vertex] & pending:
                pending.remove(neighbor)
                frontier.append(neighbor)
        components.append(component)
    result = {
        "vertices": len(bm.verts),
        "edges": len(bm.edges),
        "faces": len(bm.faces),
        "triangles": sum(len(face.verts) == 3 for face in bm.faces),
        "boundary_edges": len(boundary),
        "nonmanifold_edges": sum(
            not edge.is_manifold and not edge.is_boundary for edge in bm.edges
        ),
        "degenerate_faces": sum(face.calc_area() <= 1e-12 for face in bm.faces),
        "connected_components": len(components),
        "component_vertex_counts": sorted(map(len, components), reverse=True),
        "boundary_loops": [
            {
                "vertex_count": len(row["vertices"]),
                "closed": row["closed"],
                "vertex_ids": row["vertices"],
            }
            for row in boundary_loops
        ],
        "smooth_faces": sum(face.smooth for face in bm.faces),
        "sharp_edges": sum(edge.smooth is False for edge in bm.edges),
    }
    bm.free()
    return result


def weights(obj):
    return [
        {
            obj.vertex_groups[group.group].name: float(group.weight)
            for group in vertex.groups
        }
        for vertex in obj.data.vertices
    ]


def material_snapshot():
    """Stable material/slot content without relying on Blender pointer identity."""
    rows = []
    for material in sorted(bpy.data.materials, key=lambda value: value.name):
        nodes, links = [], []
        if material.use_nodes and material.node_tree:
            for node in sorted(material.node_tree.nodes, key=lambda value: value.name):
                inputs = []
                for socket in node.inputs:
                    try:
                        default = tuple(socket.default_value)
                    except TypeError:
                        default = socket.default_value
                    except AttributeError:
                        default = None
                    inputs.append((socket.name, repr(default), len(socket.links)))
                nodes.append((node.name, node.bl_idname, node.mute, inputs))
            links = sorted(
                (
                    link.from_node.name,
                    link.from_socket.name,
                    link.to_node.name,
                    link.to_socket.name,
                )
                for link in material.node_tree.links
            )
        rows.append(
            {
                "name": material.name,
                "diffuse_color": tuple(material.diffuse_color),
                "metallic": material.metallic,
                "roughness": material.roughness,
                "use_nodes": material.use_nodes,
                "nodes": nodes,
                "links": links,
                "selected_parameters": {
                    "surface_render_method": getattr(
                        material, "surface_render_method", None
                    ),
                    "use_transparency_overlap": getattr(
                        material, "use_transparency_overlap", None
                    ),
                },
            }
        )
    return rows


def attribute_snapshot(mesh):
    rows = {}
    for name in ("TailorRest", "TailorCollar", "TailorNeckDistance"):
        attribute = mesh.attributes.get(name)
        if attribute is None:
            rows[name] = None
            continue
        values = []
        for value in attribute.data:
            if hasattr(value, "vector"):
                values.append(tuple(value.vector))
            elif hasattr(value, "value"):
                values.append(value.value)
            else:
                values.append(repr(value))
        rows[name] = {
            "domain": attribute.domain,
            "data_type": attribute.data_type,
            "sha256": hashlib.sha256(
                np.asarray(values, dtype=np.float32).tobytes()
            ).hexdigest(),
        }
    return rows


def preserved_snapshot(coat, rig, body, shirt):
    return {
        "body": gate.body_snapshot(body),
        "shirt": gate.body_snapshot(shirt),
        "skeleton": gate.bones_snapshot(rig),
        "actions": gate.action_snapshot(),
        "modifiers": gate.modifier_snapshot(coat),
        "shape_metadata": shape_metadata(coat.data.shape_keys),
        "shape_drivers": driver_snapshot(coat.data.shape_keys),
        "object_drivers": {
            o.name: driver_snapshot(o)
            for o in bpy.data.objects
            if o.animation_data and o.animation_data.drivers
        },
        "materials": material_snapshot(),
        "mesh_attributes": attribute_snapshot(coat.data),
    }


def scene_objects():
    return (
        bpy.context.scene,
        bpy.data.objects["AvatarSkeleton"],
        bpy.data.objects["Structured armhole jacket"],
        bpy.data.objects["AvatarBody"],
        bpy.data.objects["AvatarTop_tailored"],
    )


def key_values(coat):
    return {key.name: float(key.value) for key in coat.data.shape_keys.key_blocks[1:]}


def action_scopes(original_name, quick):
    if quick:
        return [(original_name, (31.0, 16.0, 1.0))] + [
            (name, (1.0, 25.0, 49.0)) for name in REVIEWS
        ]
    return [(original_name, tuple(np.linspace(31.0, 1.0, 61)))] + [
        (name, tuple(np.linspace(1.0, 49.0, 97))) for name in REVIEWS
    ]


def main(args):
    source_hash, output_hash = digest(args.source), digest(args.input)
    provenance = np.load(args.provenance)
    if "bind_deltas" not in provenance:
        raise AssertionError("sleeve provenance must contain bind_deltas")
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    scene, rig, coat, body, shirt = scene_objects()
    original_name = scene["riggedJacketOriginalLoweringAction"]
    source_preserved = preserved_snapshot(coat, rig, body, shirt)
    source_weights = weights(coat)
    source_shapes = np.asarray(
        [
            [[*point.co] for point in key.data]
            for key in coat.data.shape_keys.key_blocks
        ],
        dtype=np.float32,
    )
    source_faces = np.asarray(
        [tuple(face.vertices) for face in coat.data.polygons], dtype=np.int32
    )
    if source_shapes.shape != (15, 2671, 3):
        raise AssertionError(
            f"expected 15x2671 source shape data, got {source_shapes.shape}"
        )
    bind_deltas = np.asarray(provenance["bind_deltas"], dtype=np.float32)
    if bind_deltas.shape != (2671, 3) or not np.isfinite(bind_deltas).all():
        raise AssertionError(
            f"bind_deltas must be finite 2671x3, got {bind_deltas.shape}"
        )
    affected = np.linalg.norm(bind_deltas, axis=1) > 1e-9
    baseline = {}
    for action_name, frames in action_scopes(original_name, args.quick):
        rig.animation_data.action = bpy.data.actions[action_name]
        baseline[action_name] = []
        for value in frames:
            sample(scene, float(value))
            baseline[action_name].append(key_values(coat))

    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = scene_objects()
    assert preserved_snapshot(coat, rig, body, shirt) == source_preserved
    solidify = next(
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    )
    base_count = len(coat.data.vertices)
    out_weights = weights(coat)
    shapes = np.asarray(
        [
            [[*point.co] for point in key.data]
            for key in coat.data.shape_keys.key_blocks
        ],
        dtype=np.float32,
    )
    assert shapes.shape == source_shapes.shape and np.isfinite(shapes).all()
    assert np.array_equal(
        np.asarray(
            [tuple(face.vertices) for face in coat.data.polygons], dtype=np.int32
        ),
        source_faces,
    )
    assert out_weights == source_weights
    assert all(
        len(row) <= 4 and abs(sum(row.values()) - 1.0) < EPS for row in out_weights
    )
    bind_residual = float(np.max(np.abs((shapes[0] - source_shapes[0]) - bind_deltas)))
    shape_residual = float(
        np.max(
            np.abs((shapes[1:] - shapes[0]) - (source_shapes[1:] - source_shapes[0]))
        )
    )
    assert bind_residual <= FLOAT_TOL and shape_residual <= FLOAT_TOL
    assert np.array_equal(shapes[:, ~affected], source_shapes[:, ~affected])
    mesh_topology = topology(coat.data)
    assert (
        mesh_topology["connected_components"] == 1
        and not mesh_topology["nonmanifold_edges"]
        and not mesh_topology["degenerate_faces"]
    )

    rows, failures, max_key_delta = [], [], 0.0

    def capture(scope, value, key_delta=0.0, **extra):
        result = record(coat, body, shirt, solidify, base_count)
        states, orientation = (
            result["containment"]["native_vertex_states"],
            result["offset_orientation"],
        )
        compact = {
            "scope": scope,
            "frame": value,
            "native_counts": result["native_counts"],
            "midsurface_self": result["midsurface_self"],
            "inside": states["inside"],
            "ambiguous": states["ambiguous"],
            "shirt_layering": result["shirt_layering"]["count"],
            "reversed_faces": orientation["reversed_faces"],
            "minimum_area_m2": orientation["minimum_midsurface_triangle_area_m2"],
            "minimum_offset_ratio": orientation["minimum_ratio"],
            "key_delta": key_delta,
            **extra,
        }
        rows.append(compact)
        if failing(result) or key_delta > EPS:
            failures.append({"sample": compact, "detail": result})

    for action_name, frames in action_scopes(original_name, args.quick):
        rig.animation_data.action = bpy.data.actions[action_name]
        for index, value in enumerate(frames):
            sample(scene, float(value))
            delta = max(
                abs(key_values(coat)[key] - expected)
                for key, expected in baseline[action_name][index].items()
            )
            max_key_delta = max(max_key_delta, delta)
            capture(
                "lowering" if action_name == original_name else action_name,
                float(value),
                delta,
            )
    rig.animation_data.action = bpy.data.actions[original_name]
    sample(scene, 31.0)
    t_basis = arm_basis(rig)
    sample(scene, 1.0)
    down_basis = arm_basis(rig)
    for active in SIDES:
        rig.animation_data.action = bpy.data.actions[original_name]
        sample(scene, 31.0)
        rig.animation_data.action = None
        for side in SIDES:
            for part, matrix in (down_basis if side == active else t_basis)[
                side
            ].items():
                rig.pose.bones[f"{part}_{side}"].matrix_basis = matrix
        update()
        actual = {
            side: float(
                coat.data.shape_keys.key_blocks[f"lowered_endpoint_{side}"].value
            )
            for side in SIDES
        }
        expected = {side: float(side == active) for side in SIDES}
        capture(
            "asymmetric",
            None,
            max(abs(actual[side] - expected[side]) for side in SIDES),
            full_down_side=active,
            lowering_keys=actual,
            expected_lowering_keys=expected,
        )
    expected_samples = (3 if args.quick else 61) + (9 if args.quick else 291) + 2
    assert len(rows) == expected_samples
    invalid = [
        curve.data_path
        for curve in coat.data.shape_keys.animation_data.drivers
        if not curve.is_valid
        or not curve.driver.is_valid
        or not curve.driver.is_simple_expression
    ]
    assert (
        not invalid and preserved_snapshot(coat, rig, body, shirt) == source_preserved
    )
    assert digest(args.source) == source_hash and digest(args.input) == output_hash
    maxima = {
        name: max(row[name] for row in rows)
        for name in (
            "midsurface_self",
            "inside",
            "ambiguous",
            "shirt_layering",
            "reversed_faces",
        )
    }
    maxima["native_counts"] = {
        name: max(row["native_counts"][name] for row in rows)
        for name in ("self", "body", "shirt", "total")
    }
    audit_key = "audit_quick14" if args.quick else "audit_354"
    report = {
        "scope": __doc__,
        "source_sha256": source_hash,
        "model_sha256": output_hash,
        "mode": "quick" if args.quick else "full_354",
        "source_and_model_preserved": True,
        "topology": mesh_topology,
        "preservation": {
            "body_shirt_skeleton_actions_modifiers_drivers_materials": True,
            "topology_weights_exact": True,
            "unaffected_vertices_exact": True,
            "unaffected_vertices": int((~affected).sum()),
            "affected_vertices": int(affected.sum()),
            "maximum_bind_delta_residual": bind_residual,
            "maximum_shape_delta_residual": shape_residual,
            "maximum_bone_influences": max(map(len, out_weights)),
            "all_shape_coordinates_finite": True,
            "all_fourteen_key_drivers_native_simple_valid": True,
        },
        audit_key: {
            "samples": expected_samples,
            "lowering_samples": 3 if args.quick else 61,
            "review_samples": 9 if args.quick else 291,
            "asymmetric_samples": 2,
            "failed_samples": len(failures),
            "maximum_existing_key_delta": max_key_delta,
            "guard_maxima": maxima,
            "minimum_triangle_area_m2": min(row["minimum_area_m2"] for row in rows),
            "minimum_offset_ratio": min(row["minimum_offset_ratio"] for row in rows),
            "accepted": not failures,
        },
        "sample_rows": rows,
        "failure_rows": failures,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("SLEEVE_AUDIT", json.dumps(report[audit_key]), flush=True)
    if failures:
        raise AssertionError(f"{len(failures)} sleeve samples failed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Use the 14-pose diagnostic scope before the full 354-pose audit",
    )
    main(
        parser.parse_args(
            sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
        )
    )
