"""Author bomber sleeve ease and broad folds on the validated tailoring rig."""

# Connection map: existing sleeve/shoulder and sleeve/cuff shared edges remain
# sewn in the same mesh. Displacement fades to zero at both ends; no new parts
# or overlapping faces are introduced. Collar, opening and torso remain fixed.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_tailoring as A
from build_rigged_jacket_collar import deformation_linear

SOURCE = SCRIPTS.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-jacket-tailoring-study/"
    "male-rigged-jacket-tailored.blend"
)


def smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    if args.output.exists():
        raise FileExistsError(args.output)
    source_hash = digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    preserved = A.preserved_snapshot(coat, rig, body, shirt)
    weights = A.weights(coat)
    topology = A.topology(coat.data)
    original = scene["riggedJacketOriginalLoweringAction"]
    rig.animation_data.action = bpy.data.actions[original]
    A.sample(scene, 31.0)
    solidify = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
    points, _ = A.midpoint(coat, solidify, len(coat.data.vertices))
    t_points = A.array(points)
    deltas = np.zeros_like(t_points)
    authored = np.zeros_like(t_points)
    axes = {}
    for side, sign in (("l", 1), ("r", -1)):
        bone = rig.pose.bones[f"lowerarm_{side}"]
        center = rig.matrix_world @ bone.head
        axes[side] = list(center)
        for i, point in enumerate(t_points):
            x = sign * point[0]
            envelope = smooth(0.245, 0.325, x) * (1 - smooth(0.642, 0.693, x))
            if envelope <= 0 or x <= 0:
                continue
            radial = np.array([0.0, point[1] - center.y, point[2] - center.z])
            radius = np.linalg.norm(radial)
            if radius < 0.005:
                raise AssertionError(f"Invalid sleeve axis for vertex {i}")
            radial /= radius
            angle = np.arctan2(radial[2], -radial[1])
            # The lower T-pose quadrant faces the torso when arms lower.
            # Preserve that already fitted inner channel and expand the
            # outer/front/back cloth with a smooth angular transition.
            envelope *= smooth(-0.2, 0.45, radial[2])
            elbow_zone = 1 - smooth(0.055, 0.095, abs(x - abs(center.x)))
            envelope *= 1 - elbow_zone * smooth(0.25, 0.8, -radial[1])
            forearm = smooth(0.39, 0.52, x)
            ease = 0.012
            # Oblique, unevenly spaced ridges give broad compression folds.
            # Their troughs stay outside the validated original sleeve.
            phase = (x - 0.32) * 2 * np.pi / 0.105 + 1.25 * np.sin(angle)
            phase += 0.4 * np.sin((x - 0.32) * 2 * np.pi / 0.19 + angle)
            folds = 0.0018 * (0.4 + 0.6 * forearm) * np.sin(phase)
            amount = args.scale * envelope * (ease + folds)
            authored[i] = radial * amount
            linear = coat.matrix_world.to_3x3() @ deformation_linear(
                rig, coat, coat.data.vertices[i]
            )
            deltas[i] = linear.inverted() @ Vector(authored[i])
    blocks = coat.data.shape_keys.key_blocks
    source_shapes = np.array([[p.co[:] for p in k.data] for k in blocks])
    for block in blocks:
        for i in np.flatnonzero(np.linalg.norm(deltas, axis=1) > 0):
            block.data[int(i)].co += Vector(deltas[i])
    for i, v in enumerate(coat.data.vertices):
        v.co = blocks[0].data[i].co
    coat.data.update()
    A.update()
    actual, _ = A.midpoint(coat, solidify, len(coat.data.vertices))
    actual = A.array(actual)
    error = float(np.max(np.abs(actual - t_points - authored)))
    assert error < 1e-6, error
    # Keep TailorRest unchanged: material trim stays anchored to the original
    # sewn fabric coordinates rather than moving when sleeve volume changes.
    assert A.preserved_snapshot(coat, rig, body, shirt) == preserved
    assert A.weights(coat) == weights
    assert A.topology(coat.data) == topology
    scene["riggedJacketSleeveStudy"] = "Authored sleeve ease and oblique broad folds"
    rig.animation_data.action = bpy.data.actions[original]
    A.sample(scene, 1.0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    assert digest(args.input) == source_hash
    np.savez_compressed(
        args.provenance,
        bind_deltas=deltas,
        source_shapes=source_shapes,
        t_points=t_points,
        authored_t_deltas=authored,
    )
    moved = np.linalg.norm(deltas, axis=1) > 0
    report = {
        "source_sha256": source_hash,
        "model_sha256": digest(args.output),
        "builder_sha256": digest(Path(__file__)),
        "scale": args.scale,
        "moved_vertices": int(moved.sum()),
        "fixed_vertices": int((~moved).sum()),
        "maximum_t_displacement_m": float(np.linalg.norm(authored, axis=1).max()),
        "maximum_t_reconstruction_error_m": error,
        "bone_axis_centers": axes,
        "shape_offsets": "Same bind displacement added to all fifteen blocks",
        "material_coordinates": "Original TailorRest retained exactly",
        "topology_weights_and_deformation_metadata_preserved": True,
        "source_preserved": True,
        "acceptance": "Requires reopened native motion audit and visual review",
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("SLEEVE_BUILD", json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--scale", type=float, default=1.0)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
