"""Save three review actions, reopen the exact file and check their playback.

The original lowering action is retained as a known failing control. These
review clips do not establish full animation, appearance or runtime acceptance.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from armhole_pose_correctives import POSES
from build_bodies import point_bone
from surface_crossings import strict_pairs
from validate_body05_tops import between, body_snapshot, geometry
from validate_body_contacts import bones_snapshot


def curves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def key_hash(obj):
    points = np.asarray(
        [[p.co[:] for p in key.data] for key in obj.data.shape_keys.key_blocks],
        dtype=np.float32,
    )
    return hashlib.sha256(points.tobytes()).hexdigest()


def run(source, destination):
    assert not destination.exists()
    destination.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    scene.frame_set(31)
    bpy.context.view_layer.update()
    rig = bpy.data.objects["AvatarSkeleton"]
    coat = bpy.data.objects["Structured armhole jacket"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    original = body_snapshot(body), body_snapshot(top), bones_snapshot(rig)
    shape_hash = key_hash(coat)
    original_action = rig.animation_data.action
    original_action.use_fake_user = True
    scene["riggedJacketOriginalLoweringAction"] = original_action.name
    basis = {b.name: b.matrix_basis.copy() for b in rig.pose.bones}
    actions = []
    for label, (upper, lower) in POSES.items():
        action = bpy.data.actions.new("Jacket review - " + label.replace("_", " "))
        action.use_fake_user = True
        actions.append(action.name)
        rig.animation_data.action = action
        for frame in range(1, 98):
            fraction = (frame - 1) / 48 if frame <= 49 else (97 - frame) / 48
            scene.frame_set(frame)
            for bone in rig.pose.bones:
                bone.matrix_basis = basis[bone.name]
            bpy.context.view_layer.update()
            for side, sign in [("l", 1), ("r", -1)]:
                for part, target in [
                    ("upperarm", upper),
                    ("lowerarm", lower),
                    ("hand", lower),
                ]:
                    direction = (
                        np.array([sign, 0.0, 0.0]) * (1 - fraction)
                        + np.array([sign * target[0], target[1], target[2]]) * fraction
                    )
                    point_bone(rig, f"{part}_{side}", direction)
            for bone in rig.pose.bones:
                if frame in [1, 97]:
                    for path in ["location", "rotation_quaternion", "scale"]:
                        bone.keyframe_insert(
                            data_path=path, frame=frame, group=bone.name
                        )
                elif bone.name in [
                    f"{part}_{side}"
                    for side in ["l", "r"]
                    for part in ["upperarm", "lowerarm", "hand"]
                ]:
                    bone.keyframe_insert(
                        data_path="rotation_quaternion", frame=frame, group=bone.name
                    )
        for fc in curves(action):
            for key in fc.keyframe_points:
                key.interpolation = "LINEAR"
            values = {int(k.co.x): float(k.co.y) for k in fc.keyframe_points}
            assert all(
                abs(value - values[98 - frame]) < 2e-5
                for frame, value in values.items()
            )
    rig.animation_data.action = bpy.data.actions[actions[0]]
    scene.frame_start = 1
    scene.frame_end = 97
    scene.render.fps = 24
    scene.frame_set(1)
    bpy.context.view_layer.update()
    scene["riggedJacketReviewActions"] = json.dumps(actions)
    note = bpy.data.texts.get("RIGGED_JACKET_SCOPE") or bpy.data.texts.new(
        "RIGGED_JACKET_SCOPE"
    )
    note.clear()
    note.write(
        "Editable fitted jacket study. Twelve finite shape keys, armature skinning and a live 1 mm Solidify modifier. The body, shirt and skeleton are unchanged. No runtime contact solver or Python handler is required. Three Jacket review actions demonstrate elbow bend, forward reach and overhead reach; use the Action Editor to select them. The saved default action is elbow bend. Original lowering remains available by the name stored in scene riggedJacketOriginalLoweringAction and still FAILS. Read saved-rig-check.json and review-actions-check.json for exact sample scope. General motion, reference appearance, finished tailoring and export remain unaccepted. A fixed 1.5 mm maximum bind-space clearance adjustment is recorded in fixed-bind-margin.npz.\n"
    )
    assert original == (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    assert key_hash(coat) == shape_hash
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(destination), compress=True)
    saved_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    coat = bpy.data.objects["Structured armhole jacket"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    assert original == (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    assert key_hash(coat) == shape_hash
    rows = []
    for action in actions:
        rig.animation_data.action = bpy.data.actions[action]
        for frame in np.linspace(1, 49, 97):
            scene.frame_set(int(frame), subframe=frame % 1)
            bpy.context.view_layer.update()
            p, f = geometry(coat)
            bp, bf = geometry(body)
            tp, tf = geometry(top)
            row = {
                "action": action,
                "frame": float(frame),
                "self_pairs": len(strict_pairs(p, f)),
                "body_pairs": len(between(p, f, bp, bf)),
                "shirt_pairs": len(between(p, f, tp, tf)),
            }
            row["passed"] = not any(
                row[k] for k in ["self_pairs", "body_pairs", "shirt_pairs"]
            )
            rows.append(row)
        print(
            "REVIEW_ACTION",
            action,
            sum(r["passed"] for r in rows if r["action"] == action),
            97,
            flush=True,
        )
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    assert hashlib.sha256(destination.read_bytes()).hexdigest() == saved_hash
    report = {
        "scope": __doc__,
        "source_sha256": digest,
        "output_sha256": saved_hash,
        "key_coordinates_preserved_sha256": shape_hash,
        "body_top_skeleton_preserved": True,
        "actions": actions,
        "default_action": actions[0],
        "samples": rows,
        "all_review_samples_clear": all(r["passed"] for r in rows),
        "return_keys_mirror_outbound_within": 2e-5,
        "accepted_general_motion": False,
        "blender_version": bpy.app.version_string,
    }
    (destination.parent / "review-actions-check.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(
        "REVIEW_ACTIONS_RESULT",
        report["all_review_samples_clear"],
        len(rows),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.input, args.output)
