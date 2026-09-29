"""Refine fixed shirt clearance and independently inspect a saved rigged study.

Optional fitting moves Basis and every corrective key by the same bounded bind
space offset. No per-frame deformation, cloth simulation or body edit is added.
Full lowering remains in the final validation even when it is a known failure.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from armhole_pose_correctives import POSES
from build_bodies import point_bone, review
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import collect_weights
from surface_crossings import strict_pairs
from validate_body05_tops import between, body_snapshot, geometry
from validate_body_contacts import bones_snapshot


def run(source, output, fit_margin):
    output.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    coat = bpy.data.objects["Structured armhole jacket"]
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    preserved = body_snapshot(body), body_snapshot(top), bones_snapshot(rig)
    scene.frame_set(31)
    bpy.context.view_layer.update()
    basis = {b.name: b.matrix_basis.copy() for b in rig.pose.bones}
    action = rig.animation_data.action
    names = [b.name for b in rig.pose.bones]
    weights = collect_weights(coat, set(names))
    weighted = np.zeros((len(weights), len(names)))
    for i, row in enumerate(weights):
        for name, value in row.items():
            weighted[i, names.index(name)] = value
    keys = coat.data.shape_keys.key_blocks
    original_keys = np.asarray([[v.co[:] for v in key.data] for key in keys])
    count = original_keys.shape[1]
    correction = np.zeros((count, 3))
    fit_rows = []

    def pose(label, fraction, side_only=None):
        rig.animation_data.action = None
        for bone in rig.pose.bones:
            bone.matrix_basis = basis[bone.name]
        bpy.context.view_layer.update()
        upper, lower = POSES[label]
        for side, sign in [("l", 1), ("r", -1)]:
            if side_only and side != side_only:
                continue
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

    if fit_margin:
        for iteration in range(5):
            proposed = np.zeros_like(correction)
            counts = np.zeros(count)
            longest = np.zeros(count)
            contacts = 0
            for label in POSES:
                for fraction in np.linspace(0, 1, 25):
                    pose(label, fraction)
                    p, f = geometry(coat)
                    q, g = geometry(top)
                    pairs = np.asarray(between(p, f, q, g))
                    contacts += len(pairs)
                    if not len(pairs):
                        continue
                    p, f, q, g = (
                        np.asarray(p),
                        np.asarray(f),
                        np.asarray(q),
                        np.asarray(g),
                    )
                    faces = f[pairs[:, 0]]
                    other = g[pairs[:, 1]]
                    tri = q[other]
                    normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
                    normal /= np.maximum(np.linalg.norm(normal, axis=1), 1e-12)[:, None]
                    normal[np.min(other, axis=1) >= len(q) // 2] *= -1
                    signed = np.einsum("pvi,pi->pv", p[faces] - tri[:, None, 0], normal)
                    shifts = (
                        normal * np.maximum(0, 0.0007 - signed.min(axis=1))[:, None]
                    )
                    skin = np.asarray(
                        [
                            rig.pose.bones[n].matrix
                            @ rig.data.bones[n].matrix_local.inverted()
                            for n in names
                        ]
                    )
                    inverse = np.linalg.inv(np.einsum("vb,bij->vij", weighted, skin))[
                        :, :3, :3
                    ]
                    ids = faces % count
                    local = np.einsum("pvij,pj->pvi", inverse[ids], shifts)
                    np.add.at(proposed, ids.ravel(), local.reshape(-1, 3))
                    np.add.at(counts, ids.ravel(), 1)
                    np.maximum.at(
                        longest, ids.ravel(), np.linalg.norm(local, axis=2).ravel()
                    )
            fit_rows.append(
                {
                    "iteration": iteration,
                    "shirt_pairs_across_75_samples": contacts,
                    "maximum_total_bind_offset_m": float(
                        np.linalg.norm(correction, axis=1).max()
                    ),
                }
            )
            print("FIXED_MARGIN", fit_rows[-1], flush=True)
            if not contacts:
                break
            proposed /= np.maximum(counts, 1)[:, None]
            lengths = np.linalg.norm(proposed, axis=1)
            proposed *= np.divide(longest, np.maximum(lengths, 1e-12))[:, None]
            correction += proposed
            lengths = np.linalg.norm(correction, axis=1)
            correction *= np.minimum(1, 0.0015 / np.maximum(lengths, 1e-12))[:, None]
            for key, original in zip(keys, original_keys):
                key.data.foreach_set(
                    "co", (original + correction).astype(np.float32).ravel()
                )
            coat.data.update()
            bpy.context.view_layer.update()
    rows = []
    solidify = coat.modifiers.get("Final 1 mm thickness")
    assert solidify and solidify.show_viewport and solidify.show_render

    def inspect(label, fraction, side=None):
        p, f = geometry(coat)
        bp, bf = geometry(body)
        tp, tf = geometry(top)
        actual = {
            "self_pairs": len(strict_pairs(p, f)),
            "body_pairs": len(between(p, f, bp, bf)),
            "shirt_pairs": len(between(p, f, tp, tf)),
        }
        actual["passed"] = not any(actual.values())
        solidify.show_viewport = False
        bpy.context.view_layer.update()
        mp, mf = geometry(coat)
        reconstructed, _, _ = screen(np.asarray(mp), np.asarray(mf), body, top)
        solidify.show_viewport = True
        bpy.context.view_layer.update()
        values = {key.name: float(key.value) for key in keys[1:]}
        row = {
            "action": label,
            "fraction": float(fraction),
            "side": side,
            "native_solidify": actual,
            "reconstructed": reconstructed,
            "passed": actual["passed"] and reconstructed["passed"],
            "corrective_values": values,
        }
        rows.append(row)
        if fraction in [0, 1]:
            print("SAVED_RIG_CHECK", row, flush=True)

    rig.animation_data.action = action
    for frame in np.linspace(31, 1, 61):
        scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        inspect("lowering", (31 - frame) / 30)
    scene.frame_set(31)
    bpy.context.view_layer.update()
    for label in POSES:
        for fraction in np.linspace(0, 1, 49):
            pose(label, fraction)
            inspect(label, fraction)
        for side in ["l", "r"]:
            for fraction in [0.3333333333333333, 0.6666666666666666, 1]:
                pose(label, fraction, side)
                inspect(label, fraction, side)
    for bone in rig.pose.bones:
        bone.matrix_basis = basis[bone.name]
    rig.animation_data.action = action
    scene.frame_set(31)
    bpy.context.view_layer.update()
    assert preserved == (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.25
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    views = {"front": (0, -4, 1.27), "back": (0, 4, 1.27), "profile": (4, 0, 1.27)}
    for label, location in views.items():
        camera.location = location
        review.look_at(camera, Vector((0, 0, 1.27)))
        scene.render.filepath = str(output / (label + ".png"))
        bpy.ops.render.render(write_still=True)
    camera.location = (1, -4, 1.4)
    review.look_at(camera, Vector((0, 0, 1.27)))
    for label in POSES:
        pose(label, 1)
        scene.render.filepath = str(output / (label + ".png"))
        bpy.ops.render.render(write_still=True)
    for bone in rig.pose.bones:
        bone.matrix_basis = basis[bone.name]
    rig.animation_data.action = action
    scene.frame_set(31)
    bpy.context.view_layer.update()
    report = {
        "scope": __doc__,
        "input_sha256": digest,
        "fixed_margin_fit": fit_rows,
        "maximum_total_bind_offset_m": float(np.linalg.norm(correction, axis=1).max()),
        "shape_keys_excluding_basis": len(keys) - 1,
        "source_body_top_rig_preserved": True,
        "samples": rows,
        "accepted": False,
        "blender_version": bpy.app.version_string,
        "runtime_contact_solver": False,
    }
    report["all_samples_clear"] = all(row["passed"] for row in rows)
    report["missing_external_images"] = [
        im.filepath
        for im in bpy.data.images
        if im.source == "FILE"
        and not im.packed_file
        and im.filepath
        and not Path(bpy.path.abspath(im.filepath)).exists()
    ]
    scene["riggedJacketStudyStatus"] = "PENDING_FULL_MOTION_AND_APPEARANCE"
    scene["riggedJacketStudyReport"] = "saved-rig-check.json"
    note = bpy.data.texts.get("RIGGED_JACKET_SCOPE") or bpy.data.texts.new(
        "RIGGED_JACKET_SCOPE"
    )
    note.clear()
    note.write(
        "Editable fitted jacket study with 12 finite shape keys, armature skinning and a live 1 mm Solidify modifier. The body, shirt and skeleton are retained unchanged. No runtime contact solver or Python handler is used. Read adjacent saved-rig-check.json for exact scope. Full lowering, general motion, reference appearance and export are NOT accepted. A fixed bind-space clearance adjustment is recorded separately in fixed-bind-margin.npz. The current T-pose is a review view, not an acceptance claim.\n"
    )
    bpy.context.preferences.filepaths.save_version = 0
    destination = output / "rigged-jacket-study.blend"
    assert not destination.exists()
    bpy.ops.wm.save_as_mainfile(filepath=str(destination), compress=True)
    report["output_sha256"] = hashlib.sha256(destination.read_bytes()).hexdigest()
    np.savez_compressed(output / "fixed-bind-margin.npz", delta=correction)
    (output / "saved-rig-check.json").write_text(json.dumps(report, indent=2) + "\n")
    print("SAVED_RIG_RESULT", sum(row["passed"] for row in rows), len(rows), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fit-shirt-margin", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.input, args.output, args.fit_shirt_margin)
