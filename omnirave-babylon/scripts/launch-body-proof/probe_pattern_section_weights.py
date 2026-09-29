"""Test garment-specific section weights on the independent authored pattern.

Weights depend on T-pose X/Z coordinates, so front and back points at matching
X/Z locations share the same transforms. The original body/top/rig are retained.
This is an alternative deformation owner, not combined with native cloth.
"""

# Connection map: preserve all independently welded jacket seams and openings.
# The original armature owns all garment motion through explicit section weights.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import SOURCE, bind_points, new_mesh
from validate_body05_tops import body_snapshot, geometry
from validate_body_contacts import bones_snapshot


def smooth(value):
    t = float(np.clip(value, 0, 1))
    return t * t * (3 - 2 * t)


def section_weights(points):
    weights = []
    for x, _, z in points:
        side = "l" if x >= 0 else "r"
        x = abs(x)
        arm = smooth((x - 0.18) / 0.14) * smooth((z - 1.25) / 0.10)
        forearm = smooth((x - 0.405) / 0.10)
        hand = smooth((x - 0.71) / 0.045)
        values = {
            "spine_03": 1 - arm,
            f"upperarm_{side}": arm * (1 - forearm),
            f"lowerarm_{side}": arm * forearm * (1 - hand),
            f"hand_{side}": arm * forearm * hand,
        }
        selected = {name: float(w) for name, w in values.items() if w > 1e-8}
        total = sum(selected.values())
        selected = {name: w / total for name, w in selected.items()}
        assert 1 <= len(selected) <= 4
        weights.append(selected)
    return weights


def run(pattern_path, output, medial_compression=0):
    assert 0 <= medial_compression <= 0.8
    output.mkdir(parents=True, exist_ok=True)
    source = SOURCE / "male-outfit04.blend"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    body, top, rig, old = [
        bpy.data.objects[n]
        for n in [
            "AvatarBody",
            "AvatarTop_tailored",
            "AvatarSkeleton",
            "Luxury_Bomber rebuilt shell",
        ]
    ]
    original = (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    scene.frame_set(31)
    bpy.context.view_layer.update()
    data = np.load(pattern_path)
    points, faces = data["points"], data["faces"]
    weights = section_weights(points)
    skin = {b.name: b.matrix @ b.bone.matrix_local.inverted() for b in rig.pose.bones}
    coat = new_mesh(
        "Garment section weights diagnostic",
        points.tolist(),
        faces.tolist(),
        old.data.materials,
    )
    bind_points(coat, weights, skin, rig)
    bpy.context.view_layer.update()
    initial = np.asarray(geometry(coat)[0])
    error = float(abs(initial - points).max())
    assert error < 3e-6
    keys = {}
    maximum_authored_lift = 0.0
    if medial_compression:
        coat.shape_key_add(name="Basis")
        for side in ["l", "r"]:
            key = coat.shape_key_add(name=f"Medial sleeve clearance {side}")
            for vertex, point, blend in zip(key.data, points, weights):
                x, _, z = point
                if (x >= 0) != (side == "l"):
                    continue
                radius = max(0, float(rig.pose.bones[f"upperarm_{side}"].head.z) - z)
                envelope = (
                    smooth((abs(x) - 0.18) / 0.12)
                    * (1 - smooth((abs(x) - 0.40) / 0.15))
                    * smooth((z - 1.30) / 0.055)
                )
                lift = radius * medial_compression * envelope
                maximum_authored_lift = max(maximum_authored_lift, lift)
                transform = Matrix(((0.0, 0.0, 0.0, 0.0),) * 4)
                for name, weight in blend.items():
                    transform += skin[name] * weight
                target = Vector(point)
                target.z += lift
                vertex.co = transform.inverted() @ target
            key.value = 0
            keys[side] = key
    rows = []
    panels = []
    bodies = []
    tops = []
    frames = np.linspace(31, 1, 61)
    for frame in frames:
        scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        for side, key in keys.items():
            bone = rig.pose.bones[f"upperarm_{side}"]
            key.value = 1 - abs((bone.tail - bone.head).normalized().x)
        bpy.context.view_layer.update()
        current = np.asarray(geometry(coat)[0])
        row, _, _ = screen(current, faces, body, top)
        row["source_frame"] = float(frame)
        rows.append(row)
        panels.append(current)
        bodies.append(np.asarray(geometry(body)[0]))
        tops.append(np.asarray(geometry(top)[0]))
        if not row["passed"] or frame in [31, 21, 11, 1]:
            print("SECTION_WEIGHTS", row, flush=True)
    destination = output / "section-motion-input.npz"
    np.savez_compressed(
        destination,
        panel=panels,
        faces=faces,
        anchors=data["anchors"],
        body=bodies,
        top=tops,
        frames=frames,
        source_sha256=digest,
    )
    report = {
        "scope": __doc__,
        "source_sha256": digest,
        "pattern_sha256": hashlib.sha256(pattern_path.read_bytes()).hexdigest(),
        "weights": weights,
        "medial_compression": medial_compression,
        "maximum_authored_T_space_lift_m": maximum_authored_lift,
        "initial_coordinate_error_m": error,
        "samples": rows,
        "passed": all(r["passed"] for r in rows),
        "accepted": False,
        "motion_input_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
    }
    (output / "section-weights.json").write_text(json.dumps(report, indent=2) + "\n")
    assert original == (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    print(
        "SECTION_WEIGHTS_RESULT",
        report["passed"],
        "failed",
        sum(not r["passed"] for r in rows),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pattern", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--medial-compression", type=float, default=0)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.pattern, args.output, args.medial_compression)
