"""Shape a sewn bomber collar and isolate its upper rim from arm motion."""

# Connection map: the original 41-vertex neck seam remains fixed. Three existing
# collar rings keep their shared faces; the anchor blend increases toward the
# free upper edge. No disconnected overlay or overlapping collar is added.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A

STUDIES = SCRIPTS.parents[1] / "assets-src/avatars/launch-body-proof"
SOURCE = STUDIES / "rigged-jacket-sleeves-study/male-rigged-jacket-sleeves.blend"
COLLAR = STUDIES / "rigged-jacket-tailoring-study/inputs/collar-provenance.npz"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def affine(rig, coat, weights):
    result = Matrix(((0.0,) * 4,) * 4)
    before = rig.matrix_world.inverted() @ coat.matrix_world
    after = coat.matrix_world.inverted() @ rig.matrix_world
    for name, weight in weights.items():
        bone = rig.pose.bones[name]
        result += weight * (
            after @ bone.matrix @ bone.bone.matrix_local.inverted() @ before
        )
    return coat.matrix_world @ result


def run(args):
    if args.output.exists():
        raise FileExistsError(args.output)
    source_hash = digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    original = scene["riggedJacketOriginalLoweringAction"]
    rig.animation_data.action = bpy.data.actions[original]
    A.sample(scene, 31.0)
    preserved = A.preserved_snapshot(coat, rig, body, shirt)
    weights = A.weights(coat)
    source_shapes = np.array(
        [[p.co[:] for p in key.data] for key in coat.data.shape_keys.key_blocks],
        dtype=np.float32,
    )
    t_key_values = np.array([key.value for key in coat.data.shape_keys.key_blocks[1:]])
    collar = np.load(args.collar_provenance)
    ids = collar["new_vertex_ids"]
    rings = collar["new_vertex_ring"]
    assert np.array_equal(ids, np.arange(2548, 2671))
    solidify = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
    t_points, _ = A.midpoint(coat, solidify, len(coat.data.vertices))
    t_points = A.array(t_points)
    top_ids = ids[rings == 2]
    top = t_points[top_ids]
    arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(top, axis=0), axis=1))]
    cell = np.r_[np.diff(arc)[0], np.diff(arc)]
    kernel = np.exp(-0.5 * ((arc[:, None] - arc[None, :]) / 0.012) ** 2)
    kernel *= cell[None, :]
    kernel /= kernel.sum(axis=1)[:, None]
    smoothed = kernel @ top
    end_fade = np.clip(np.minimum(arc, arc[-1] - arc) / 0.02, 0, 1)
    goal = top.copy()
    goal[:, :2] += 0.65 * end_fade[:, None] * (smoothed[:, :2] - top[:, :2])
    goal[:, 2] = 1.555 + 0.005 * np.clip(top[:, 1] / 0.06, -1, 1)
    shape_deltas = goal - top
    strengths = (0.04, 0.45, 1.0)
    goal_strengths = (0.0, 0.35, 1.0)
    modified = []
    for column, vertex_id in enumerate(ids):
        vertex_id = int(vertex_id)
        ring = int(rings[column])
        anchor = strengths[ring]
        original_weights = weights[vertex_id]
        new_weights = {name: (1 - anchor) * w for name, w in original_weights.items()}
        for name, weight in (("spine_03", 0.25), ("neck_01", 0.75)):
            new_weights[name] = new_weights.get(name, 0) + anchor * weight
        # Keep the existing runtime influence limit. Rebinding below compensates
        # for this deliberate local weight change at the authored T pose.
        new_weights = dict(sorted(new_weights.items(), key=lambda item: -item[1])[:4])
        total = sum(new_weights.values())
        new_weights = {
            name: weight / total for name, weight in new_weights.items() if weight > 0
        }
        old_matrix = affine(rig, coat, original_weights)
        new_inverse = affine(rig, coat, new_weights).inverted()
        old_base = old_matrix @ Vector(source_shapes[0, vertex_id])
        effective_delta = np.sum(
            t_key_values[:, None]
            * (source_shapes[1:, vertex_id] - source_shapes[0, vertex_id]),
            axis=0,
        )
        posed_delta = old_matrix.to_3x3() @ Vector(effective_delta)
        assert (
            np.max(np.abs(np.array(old_base + posed_delta) - t_points[vertex_id]))
            < 1e-6
        )
        target_base = (
            Vector(t_points[vertex_id])
            + Vector(goal_strengths[ring] * shape_deltas[column % 41])
            - (1 - anchor) * posed_delta
        )
        for key_index, key in enumerate(coat.data.shape_keys.key_blocks):
            old_key = old_matrix @ Vector(source_shapes[key_index, vertex_id])
            target_key = target_base + (1 - anchor) * (old_key - old_base)
            key.data[vertex_id].co = new_inverse @ target_key
        for group in coat.vertex_groups:
            group.remove([vertex_id])
        for name, weight in new_weights.items():
            group = coat.vertex_groups.get(name) or coat.vertex_groups.new(name=name)
            group.add([vertex_id], weight, "REPLACE")
        modified.append(vertex_id)
    for vertex in coat.data.vertices:
        vertex.co = coat.data.shape_keys.key_blocks[0].data[vertex.index].co
    coat.data.update()
    A.update()
    actual, _ = A.midpoint(coat, solidify, len(coat.data.vertices))
    actual = A.array(actual)
    top_error = float(np.max(np.abs(actual[top_ids] - goal)))
    assert top_error < 1e-6, top_error
    assert A.preserved_snapshot(coat, rig, body, shirt) == preserved
    expected_shapes = np.array(
        [[p.co[:] for p in key.data] for key in coat.data.shape_keys.key_blocks],
        dtype=np.float32,
    )
    assert np.array_equal(expected_shapes[:, :2548], source_shapes[:, :2548])
    expected_weights = A.weights(coat)
    assert expected_weights[:2548] == weights[:2548]
    group_names = [group.name for group in coat.vertex_groups]
    dense_weights = np.array(
        [[row.get(name, 0) for name in group_names] for row in expected_weights],
        dtype=np.float32,
    )
    scene["riggedJacketCollarRefinement"] = (
        "Chest/neck anchored upper rim with smooth curved profile"
    )
    rig.animation_data.action = bpy.data.actions[original]
    A.sample(scene, 1.0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    for p in (args.provenance, args.report):
        p.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.provenance,
        expected_shapes=expected_shapes,
        expected_weights=dense_weights,
        expected_weight_names=np.array(group_names),
        modified_vertex_ids=np.array(modified, dtype=np.int32),
        fixed_vertex_ids=np.arange(2548, dtype=np.int32),
        target_t_top=goal,
        top_vertex_ids=top_ids,
        source_shapes=source_shapes,
    )
    assert digest(args.input) == source_hash
    report = {
        "source_sha256": source_hash,
        "model_sha256": digest(args.output),
        "builder_sha256": digest(Path(__file__)),
        "modified_collar_vertices": len(modified),
        "preserved_original_vertices": 2548,
        "anchor_strengths_quarter_mid_top": strengths,
        "target_anchor_weights": {"spine_03": 0.25, "neck_01": 0.75},
        "maximum_influences": max(map(len, expected_weights)),
        "maximum_target_t_error_m": top_error,
        "top_shape_change_max_m": float(np.linalg.norm(shape_deltas, axis=1).max()),
        "source_and_noncollar_preserved": True,
        "acceptance": "Requires native motion audit and visual review",
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("COLLAR_REFINEMENT", json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--collar-provenance", type=Path, default=COLLAR)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
