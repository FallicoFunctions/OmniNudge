"""Author broad satin folds on the passing chest-panel jacket."""

# Connection map: all front/side, shoulder/sleeve and cuff/hem edges remain
# sewn. Broad folds fade near the opening, collar, inner arm channel and cuffs.
# No overlay, displacement modifier, new topology or deformation owner is added.
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
import audit_rigged_jacket_sleeves as A
from build_rigged_jacket_collar import deformation_linear

SOURCE = SCRIPTS.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-jacket-chest-study/"
    "male-rigged-jacket-chest.blend"
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
    # Sculpt front drape in the lowered view; retain T coordinates for selection.
    A.sample(scene, 1.0)
    down_points, _ = A.midpoint(coat, solidify, len(coat.data.vertices))
    down_points = A.array(down_points)
    fabric_rest = np.array(
        [value.vector[:] for value in coat.data.attributes["TailorRest"].data]
    )
    front_authored = np.zeros_like(t_points)
    for i, (x, y, z) in enumerate(down_points):
        tx, ty, _tz = t_points[i]
        ax = abs(x)
        # Leave a flat sewn strip beside the zipper's tiny boundary triangles.
        rx, _ry, rz = fabric_rest[i]
        opening_width = 0.046 + 0.034 * np.clip((1.505 - rz) / 0.49, 0, 1)
        seam_distance = abs(rx) - opening_width
        envelope = smooth(0.010, 0.030, seam_distance)
        envelope *= 1 - smooth(0.128, 0.172, abs(tx))
        envelope *= smooth(-0.035, -0.085, ty)
        envelope *= smooth(1.055, 1.090, z) * (1 - smooth(1.410, 1.465, z))
        if envelope <= 0 or i >= 2548:
            continue
        handed = 1 if x > 0 else -1
        folds = 0.0
        # Uneven fans lift away from hem and side seams, with shallow troughs.
        for height, slope, width, amplitude in (
            (1.096, 0.75, 0.032, 0.0045),
            (1.243, -0.60, 0.044, 0.0040),
            (1.383, 0.80, 0.035, 0.0035),
        ):
            center = height + slope * (ax - 0.09) + handed * 0.005
            q = (z - center) / width
            folds += amplitude * (
                np.exp(-q * q) - 0.35 * np.exp(-(((q - 1.1) / 1.25) ** 2))
            )
        front_authored[i, 1] = -args.scale * envelope * folds
        linear = coat.matrix_world.to_3x3() @ deformation_linear(
            rig, coat, coat.data.vertices[i]
        )
        deltas[i] = linear.inverted() @ Vector(front_authored[i])
    # Strengthen outer sleeve compression while preserving the fitted inner channel.
    A.sample(scene, 31.0)
    for side, sign in (("l", 1), ("r", -1)):
        bone = rig.pose.bones[f"lowerarm_{side}"]
        center = rig.matrix_world @ bone.head
        axes[side] = list(center)
        for i, point in enumerate(t_points):
            x = sign * point[0]
            envelope = smooth(0.275, 0.345, x) * (1 - smooth(0.630, 0.690, x))
            if envelope <= 0 or x <= 0:
                continue
            radial = np.array([0.0, point[1] - center.y, point[2] - center.z])
            radius = np.linalg.norm(radial)
            assert radius > 0.005
            radial /= radius
            angle = np.arctan2(radial[2], -radial[1])
            envelope *= smooth(-0.12, 0.50, radial[2])
            elbow_zone = 1 - smooth(0.055, 0.100, abs(x - abs(center.x)))
            envelope *= 1 - elbow_zone * smooth(0.25, 0.8, -radial[1])
            phase = (x - 0.32) * 2 * np.pi / 0.170 + 1.4 * np.sin(angle) + sign * 0.25
            phase += 0.5 * np.sin((x - 0.32) * 2 * np.pi / 0.34 + angle)
            # Baseline sleeve ease already provides room for these shallow troughs.
            amount = args.scale * envelope * (0.0015 + 0.0045 * np.sin(phase))
            authored[i] = radial * amount
            linear = coat.matrix_world.to_3x3() @ deformation_linear(
                rig, coat, coat.data.vertices[i]
            )
            deltas[i] += linear.inverted() @ Vector(authored[i])
    # Record the actual authored T effect of both fields for reconstruction.
    for i in np.flatnonzero(np.linalg.norm(deltas, axis=1) > 0):
        linear = coat.matrix_world.to_3x3() @ deformation_linear(
            rig, coat, coat.data.vertices[int(i)]
        )
        authored[i] = linear @ Vector(deltas[i])
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
    scene["riggedJacketSatinFolds"] = (
        "Authored front drape and outer sleeve compression folds"
    )
    rig.animation_data.action = bpy.data.actions[original]
    A.sample(scene, 1.0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    assert digest(args.input) == source_hash
    args.provenance.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.provenance,
        bind_deltas=deltas,
        source_shapes=source_shapes,
        t_points=t_points,
        authored_t_deltas=authored,
        down_points=down_points,
        front_authored_down_deltas=front_authored,
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
    print("SATIN_FOLD_BUILD", json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--scale", type=float, default=1.0)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
