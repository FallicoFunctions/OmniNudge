"""Shape smooth hanging jacket fronts on the preserved finite-motion rig."""

# Connection map: front panels share the existing sewn shoulder, side and hem
# edges. Ease fades before the neck seam and underarm; no separate overlay,
# added surface, masking, topology change or second deformation owner is used.
import argparse
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
from build_rigged_jacket_sleeves import smooth

SOURCE = SCRIPTS.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-jacket-neck-seam-study/"
    "male-rigged-jacket-neck-seam.blend"
)


def run(args):
    if args.output.exists():
        raise FileExistsError(args.output)
    source_hash = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    original = scene["riggedJacketOriginalLoweringAction"]
    preserved = A.preserved_snapshot(coat, rig, body, shirt)
    weights, topology = A.weights(coat), A.topology(coat.data)
    solidify = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
    count = len(coat.data.vertices)
    rig.animation_data.action = bpy.data.actions[original]
    A.sample(scene, 31)
    t_points, _ = A.midpoint(coat, solidify, count)
    t_points = A.array(t_points)
    A.sample(scene, 1)
    down_points, faces = A.midpoint(coat, solidify, count)
    down_points = A.array(down_points)
    # The inherited nipple topology has overlapping XZ triangle footprints.
    # Flattening only Y collapses their distinct depth layers. Relax the local
    # tangential coordinates before shaping the front, with a fixed border.
    neighbors = [set() for _ in range(count)]
    for face in faces:
        for i in face:
            neighbors[i].update(set(face) - {i})
    relaxed = down_points.copy()
    radii = np.sqrt(
        ((np.abs(down_points[:, 0]) - 0.111) / 0.030) ** 2
        + ((down_points[:, 2] - 1.353) / 0.032) ** 2
    )
    relax_mask = (1 - smooth(0.45, 1.0, radii)) * (down_points[:, 1] < -0.08)
    for _ in range(24):
        following = relaxed.copy()
        for i in np.flatnonzero(relax_mask > 0):
            center = relaxed[sorted(neighbors[i])].mean(axis=0)
            following[i, [0, 2]] += (
                0.45 * relax_mask[i] * (center[[0, 2]] - relaxed[i, [0, 2]])
            )
        relaxed = following
    authored, bind_deltas = np.zeros_like(down_points), np.zeros_like(down_points)
    envelope_values, target_y = np.zeros(count), down_points[:, 1].copy()
    for i, (x, y, z) in enumerate(relaxed):
        tx, ty, _tz = t_points[i]
        # T coordinates distinguish the torso from sleeves when arms are down.
        envelope = (1 - smooth(0.125, 0.172, abs(tx))) * smooth(-0.035, -0.085, ty)
        envelope *= smooth(1.04, 1.10, z) * (1 - smooth(1.405, 1.470, z))
        if envelope <= 0 or i >= 2548:
            continue
        # Broad vertical drape plus shallow cross-panel curvature replaces
        # the body-derived nipple/pectoral and abdominal relief.
        depth = 0.132 + 0.025 * np.exp(-(((z - 1.345) / 0.095) ** 2))
        depth += 0.007 * np.exp(-(((z - 1.19) / 0.16) ** 2))
        target_y[i] = -depth + 1.2 * x * x
        amount = args.scale * envelope * max(0.0, y - target_y[i])
        authored[i] = args.scale * (relaxed[i] - down_points[i])
        authored[i, 1] = -amount
        envelope_values[i] = envelope
        linear = coat.matrix_world.to_3x3() @ deformation_linear(
            rig, coat, coat.data.vertices[i]
        )
        bind_deltas[i] = linear.inverted() @ Vector(authored[i])
    moved = np.linalg.norm(bind_deltas, axis=1) > 0
    blocks = coat.data.shape_keys.key_blocks
    source_shapes = np.array(
        [[p.co[:] for p in k.data] for k in blocks], dtype=np.float32
    )
    for block in blocks:
        for i in np.flatnonzero(moved):
            block.data[int(i)].co += Vector(bind_deltas[i])
    for vertex in coat.data.vertices:
        vertex.co = blocks[0].data[vertex.index].co
    coat.data.update()
    A.update()
    actual, _ = A.midpoint(coat, solidify, count)
    error = float(np.max(np.abs(A.array(actual) - down_points - authored)))
    assert error < 1e-6, error
    assert A.preserved_snapshot(coat, rig, body, shirt) == preserved
    assert A.weights(coat) == weights and A.topology(coat.data) == topology
    scene["riggedJacketChestStudy"] = "Smooth front panel ease authored in lowered pose"
    for path in (args.output, args.provenance, args.report):
        path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    np.savez_compressed(
        args.provenance,
        bind_deltas=bind_deltas,
        source_shapes=source_shapes,
        t_points=t_points,
        down_points=down_points,
        authored_down_deltas=authored,
        envelope_values=envelope_values,
        target_y=target_y,
        tangential_relaxation_mask=relax_mask,
    )
    assert A.digest(args.input) == source_hash
    report = {
        "source_sha256": source_hash,
        "model_sha256": A.digest(args.output),
        "builder_sha256": A.digest(Path(__file__)),
        "scale": args.scale,
        "moved_vertices": int(moved.sum()),
        "fixed_vertices": int((~moved).sum()),
        "maximum_authored_down_displacement_m": float(
            np.linalg.norm(authored, axis=1).max()
        ),
        "maximum_down_reconstruction_error_m": error,
        "same_bind_offset_all_fifteen_blocks": True,
        "topology_weights_attributes_and_deformation_metadata_preserved": True,
        "source_preserved": True,
        "acceptance": "Requires reopened native motion/neck audits and visual review",
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("CHEST_BUILD", json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--scale", type=float, default=1.0)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
