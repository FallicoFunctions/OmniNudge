"""Audit a reopened tailored jacket through the established 354-pose scope."""

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
    / "assets-src/avatars/launch-body-proof/rigged-jacket-lowering-study/male-rigged-jacket-lowering.blend"
)
REVIEWS = (
    "Jacket review - elbow bend",
    "Jacket review - forward reach",
    "Jacket review - overhead reach",
)
SIDES = ("l", "r")
EPS = 1e-6


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


def main(args):
    source_hash, output_hash = digest(args.source), digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    scene, rig, coat, body, shirt = scene_objects()
    original_name = scene["riggedJacketOriginalLoweringAction"]
    source_preserved = preserved_snapshot(coat, rig, body, shirt)
    source_weights = weights(coat)
    source_shapes = np.array(
        [
            [point.co[:] for point in key.data]
            for key in coat.data.shape_keys.key_blocks
        ],
        dtype=np.float32,
    )
    baseline = {}
    for action_name, frames in [(original_name, np.linspace(31.0, 1.0, 61))] + [
        (name, np.linspace(1.0, 49.0, 97)) for name in REVIEWS
    ]:
        rig.animation_data.action = bpy.data.actions[action_name]
        baseline[action_name] = []
        for value in frames:
            sample(scene, float(value))
            baseline[action_name].append(key_values(coat))

    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = scene_objects()
    assert preserved_snapshot(coat, rig, body, shirt) == source_preserved
    assert len(coat.data.shape_keys.key_blocks) == 15
    solidify = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
    base_count = len(coat.data.vertices)
    out_weights = weights(coat)
    shapes = np.array(
        [[p.co[:] for p in key.data] for key in coat.data.shape_keys.key_blocks],
        dtype=np.float32,
    )
    assert np.isfinite(shapes).all()
    assert all(
        len(row) <= 4
        and all(np.isfinite(v) and v >= 0 for v in row.values())
        and abs(sum(row.values()) - 1) < EPS
        for row in out_weights
    )
    provenance = np.load(args.opening_provenance)
    retained = np.flatnonzero(provenance["source_kind"] == 0)
    source_ids = provenance["original_vertex_ids"][retained]
    assert np.array_equal(shapes[:, retained], source_shapes[:, source_ids])
    weight_delta = max(
        (
            abs(out_weights[int(i)].get(name, 0) - source_weights[int(j)].get(name, 0))
            for i, j in zip(retained, source_ids)
            for name in set(out_weights[int(i)]) | set(source_weights[int(j)])
        ),
        default=0,
    )
    assert weight_delta < EPS
    mesh_topology = topology(coat.data)
    assert mesh_topology["connected_components"] == 1
    assert mesh_topology["nonmanifold_edges"] == mesh_topology["degenerate_faces"] == 0
    assert len(mesh_topology["boundary_loops"]) == 3
    assert all(loop["closed"] for loop in mesh_topology["boundary_loops"])

    rows, failures = [], []
    max_key_delta = 0.0

    def capture(scope, value, key_delta=0.0, **extra):
        result = record(coat, body, shirt, solidify, base_count)
        states = result["containment"]["native_vertex_states"]
        orientation = result["offset_orientation"]
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

    for action_name, frames in [(original_name, np.linspace(31.0, 1.0, 61))] + [
        (name, np.linspace(1.0, 49.0, 97)) for name in REVIEWS
    ]:
        rig.animation_data.action = bpy.data.actions[action_name]
        for index, value in enumerate(frames):
            sample(scene, float(value))
            current = key_values(coat)
            delta = max(
                abs(current[k] - v) for k, v in baseline[action_name][index].items()
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
        delta = max(abs(actual[side] - expected[side]) for side in SIDES)
        capture(
            "asymmetric",
            None,
            delta,
            full_down_side=active,
            lowering_keys=actual,
            expected_lowering_keys=expected,
        )
    assert len(rows) == 354
    invalid = [
        c.data_path
        for c in coat.data.shape_keys.animation_data.drivers
        if not c.is_valid or not c.driver.is_valid or not c.driver.is_simple_expression
    ]
    assert not invalid, invalid
    assert preserved_snapshot(coat, rig, body, shirt) == source_preserved
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
    report = {
        "scope": __doc__,
        "source_sha256": source_hash,
        "model_sha256": output_hash,
        "source_and_model_preserved": True,
        "topology": mesh_topology,
        "preservation": {
            "body_shirt_skeleton_actions_modifiers_drivers": True,
            "retained_original_key_coordinates_exact": True,
            "retained_original_vertices": len(retained),
            "max_retained_weight_delta": weight_delta,
            "maximum_bone_influences": max(map(len, out_weights)),
            "all_shape_coordinates_finite": True,
            "all_fourteen_key_drivers_native_simple_valid": not invalid,
        },
        "audit_354": {
            "samples": 354,
            "lowering_samples": 61,
            "review_samples": 291,
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
    print("TAILORING_AUDIT", json.dumps(report["audit_354"]), flush=True)
    if failures:
        raise AssertionError(f"{len(failures)} tailored jacket samples failed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--opening-provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    main(
        parser.parse_args(
            sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
        )
    )
