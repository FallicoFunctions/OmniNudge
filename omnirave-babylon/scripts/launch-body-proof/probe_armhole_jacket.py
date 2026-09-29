"""Check the structured jacket with explicit armature weights and full motions.

This early construction test includes original arm lowering, elbow bending,
forward reach and overhead reach. It checks the evaluated midsurface and
reconstructed 1 mm walls, with body and complete shirt geometry at every pose.
No cloth simulation or per-frame contact repair is used.
"""

# Connection map: the authored armhole and sleeve loops share mesh vertices.
# A single armature owns deformation; optional subdivision precedes checked
# thickness. The body and shirt remain independent retained source objects.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_bodies import point_bone, review
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import (
    SOURCE,
    apply_modifier,
    bind_points,
    collect_weights,
    new_mesh,
)
from surface_crossings import strict_pairs
from validate_body05_tops import between, body_snapshot, geometry
from validate_body_contacts import bones_snapshot


def run(
    pattern_path,
    output,
    subdivision=0,
    preserve_volume=False,
    body_weights=False,
    target_control=False,
    target_cap=False,
    ring_control=False,
    corrective_smooth=False,
    corrective_targets=None,
    save_study=False,
    native_thickness=False,
):
    output.mkdir(parents=True, exist_ok=True)
    source = SOURCE / "male-outfit04.blend"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    data = np.load(pattern_path)
    construction = json.loads(pattern_path.with_suffix(".json").read_text())
    assert (
        construction["output_sha256"]
        == hashlib.sha256(pattern_path.read_bytes()).hexdigest()
    )
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
    original = body_snapshot(body), body_snapshot(top), bones_snapshot(rig)
    scene.frame_set(31)
    bpy.context.view_layer.update()
    coat = new_mesh(
        "Structured armhole jacket",
        data["points"].tolist(),
        data["quads"].tolist(),
        old.data.materials,
    )
    old.hide_render = True
    old.hide_set(True)
    skin = {b.name: b.matrix @ b.bone.matrix_local.inverted() for b in rig.pose.bones}
    weights = construction["weights"]
    if body_weights:
        transfer_source = body.copy()
        transfer_source.data = body.data.copy()
        scene.collection.objects.link(transfer_source)
        for group in list(transfer_source.vertex_groups):
            if group.name not in skin:
                transfer_source.vertex_groups.remove(group)
        for group in transfer_source.vertex_groups:
            coat.vertex_groups.new(name=group.name)
        transfer = coat.modifiers.new("Shared T-pose body weights", "DATA_TRANSFER")
        transfer.object = transfer_source
        transfer.use_vert_data = True
        transfer.data_types_verts = {"VGROUP_WEIGHTS"}
        transfer.vert_mapping = "POLYINTERP_NEAREST"
        transfer.layers_vgroup_select_src = "ALL"
        transfer.layers_vgroup_select_dst = "NAME"
        transfer.mix_mode = "REPLACE"
        transfer.use_object_transform = True
        apply_modifier(coat, transfer)
        weights = collect_weights(coat, skin)
        bpy.data.objects.remove(transfer_source, do_unlink=True)
    bind_points(coat, weights, skin, rig)
    coat.modifiers[-1].use_deform_preserve_volume = preserve_volume
    corrective_report = None
    if corrective_targets:
        from armhole_pose_correctives import install

        corrective_report = install(
            coat, rig, data["points"], weights, corrective_targets
        )
    targets = None
    if target_control or ring_control:
        if ring_control:
            from armhole_ring_targets import RingTargets

            targets = RingTargets(data["points"], construction, body, top, rig)
        else:
            from armhole_corrective_targets import SurfaceTargets

            targets = SurfaceTargets(data["points"], body, top, target_cap)
        coat.modifiers[-1].show_viewport = coat.modifiers[-1].show_render = False
        coat.data.vertices.foreach_set(
            "co", targets.evaluate().astype(np.float32).ravel()
        )
        coat.data.update()
    if subdivision:
        sub = coat.modifiers.new("Evaluated tailoring surface", "SUBSURF")
        sub.levels = sub.render_levels = subdivision
    if corrective_smooth:
        smooth = coat.modifiers.new(
            "Bound rest corrective smoothing", "CORRECTIVE_SMOOTH"
        )
        smooth.factor = 1
        smooth.iterations = 10
        smooth.smooth_type = "LENGTH_WEIGHTED"
        smooth.rest_source = "BIND"
        bpy.ops.object.select_all(action="DESELECT")
        coat.select_set(True)
        bpy.context.view_layer.objects.active = coat
        bpy.ops.object.correctivesmooth_bind(modifier=smooth.name)
    bpy.context.view_layer.update()
    initial_points, initial_faces = geometry(coat)
    initial, _, _ = screen(
        np.asarray(initial_points), np.asarray(initial_faces), body, top
    )
    thickness = None
    if native_thickness:
        thickness = coat.modifiers.new("Final 1 mm thickness", "SOLIDIFY")
        thickness.thickness = 0.001
        thickness.offset = 0
        thickness.use_even_offset = False
        thickness.use_quality_normals = False
    rows, captured = [], []
    report = {
        "scope": __doc__,
        "source_sha256": digest,
        "pattern_sha256": construction["output_sha256"],
        "native_solidify_thickness_m": 0.001 if native_thickness else None,
        "subdivision": subdivision,
        "preserve_volume": preserve_volume,
        "weight_source": "shared_T_body_transfer"
        if body_weights
        else "authored_regions",
        "weights": weights,
        "surface_target_feasibility_control": target_control,
        "target_offset_contact_cap": target_cap,
        "coherent_ring_target_control": ring_control,
        "bound_corrective_smooth": corrective_smooth,
        "finite_correctives": corrective_report,
        "initial": initial,
        "samples": rows,
        "accepted": False,
        "blender_version": bpy.app.version_string,
    }
    print("ARMHOLE_INITIAL", initial, flush=True)
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.25
    camera.location = (1, -4, 1.35)
    review.look_at(camera, Vector((0, 0, 1.28)))
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    diagnostic = None

    def inspect(label, fraction, render=False):
        nonlocal diagnostic
        if targets:
            coat.data.vertices.foreach_set(
                "co", targets.evaluate().astype(np.float32).ravel()
            )
            coat.data.update()
            bpy.context.view_layer.update()
        if thickness:
            thickness.show_viewport = False
            bpy.context.view_layer.update()
        points, faces = geometry(coat)
        row, walls, wall_faces = screen(
            np.asarray(points), np.asarray(faces), body, top
        )
        if thickness:
            thickness.show_viewport = True
            bpy.context.view_layer.update()
            wp, wf = geometry(coat)
            bp, bf = geometry(body)
            tp, tf = geometry(top)
            actual = {
                "wall_self_pairs": len(strict_pairs(wp, wf)),
                "wall_body_pairs": len(between(wp, wf, bp, bf)),
                "wall_top_pairs": len(between(wp, wf, tp, tf)),
            }
            actual["passed"] = not any(actual.values())
            row["native_solidify"] = actual
            row["passed"] = row["passed"] and actual["passed"]
        row.update(action=label, fraction=float(fraction))
        if coat.data.shape_keys:
            row["corrective_values"] = {
                k.name: float(k.value) for k in coat.data.shape_keys.key_blocks[1:]
            }
            row["drivers_valid"] = all(
                fc.driver.is_valid for fc in coat.data.shape_keys.animation_data.drivers
            )

        if targets:
            row["target_offset_cap"] = targets.last_cap_statistics
        if fraction in [0.0, 1.0]:
            bp, bf = geometry(body)
            row["baseline_body_self_pairs"] = len(strict_pairs(bp, bf))
        rows.append(row)
        captured.append(np.asarray(points))
        print("ARMHOLE_POSE", row, flush=True)
        if render and thickness:
            scene.render.filepath = str(output / (label + ".png"))
            bpy.ops.render.render(write_still=True)
        elif render:
            coat.hide_render = True
            if diagnostic:
                bpy.data.objects.remove(diagnostic, do_unlink=True)
            diagnostic = new_mesh(
                "Evaluated 1 mm jacket walls",
                walls.tolist(),
                wall_faces,
                coat.data.materials,
            )
            scene.render.filepath = str(output / (label + ".png"))
            bpy.ops.render.render(write_still=True)
            diagnostic.hide_render = True
            coat.hide_render = False
        return row

    inspect("tpose", 0, True)
    if initial["passed"]:
        for frame in np.linspace(31, 1, 61):
            scene.frame_set(int(frame), subframe=frame % 1)
            bpy.context.view_layer.update()
            inspect("lowering", (31 - frame) / 30, frame == 1)
        scene.frame_set(31)
        bpy.context.view_layer.update()
        basis = {b.name: b.matrix_basis.copy() for b in rig.pose.bones}
        action = rig.animation_data.action
        rig.animation_data.action = None
        for label, upper_target, lower_target in [
            ("elbow_bend", (0.5, 0, -0.8660254), (0.08, -1, 0)),
            ("forward_reach", (0.25, -1, 0), (0.15, -1, 0.15)),
            ("overhead_reach", (0.35, 0, 1), (0.15, -0.15, 1)),
        ]:
            for fraction in np.linspace(0, 1, 13):
                for bone in rig.pose.bones:
                    bone.matrix_basis = basis[bone.name]
                bpy.context.view_layer.update()
                for side, sign in [("l", 1), ("r", -1)]:
                    for bone_name, target in [
                        ("upperarm", upper_target),
                        ("lowerarm", lower_target),
                        ("hand", lower_target),
                    ]:
                        direction = (
                            np.array([sign, 0.0, 0.0]) * (1 - fraction)
                            + np.array([sign * target[0], target[1], target[2]])
                            * fraction
                        )
                        point_bone(rig, f"{bone_name}_{side}", direction)
                inspect(label, fraction, fraction == 1)
        rig.animation_data.action = action
    report["all_requested_samples_clear"] = initial["passed"] and all(
        r["passed"] for r in rows
    )
    report["completed_motion_set"] = initial["passed"]
    np.savez_compressed(
        output / "evaluated-poses.npz",
        points=np.asarray(captured),
        faces=np.asarray(initial_faces),
    )
    report["evaluated_poses_sha256"] = hashlib.sha256(
        (output / "evaluated-poses.npz").read_bytes()
    ).hexdigest()
    assert original == (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    report["source_body_top_rig_preserved"] = True
    if save_study:
        scene.frame_set(31)
        bpy.context.view_layer.update()
        if diagnostic:
            bpy.data.objects.remove(diagnostic, do_unlink=True)
        coat.hide_render = False
        scene["riggedJacketStudyStatus"] = "PENDING_MOTION_ACCEPTANCE"
        scene["riggedJacketStudyReport"] = "rigged-jacket-check.json"
        note = bpy.data.texts.new("RIGGED_JACKET_SCOPE")
        note.write(
            "Editable fitted jacket study. Armature plus finite pose-space corrective shape keys. The retained body, shirt and skeleton are unchanged. Full lowering and general animation are NOT accepted. Read the adjacent rigged-jacket-check.json for exact pose results. Surface details, silhouette and reference tailoring remain unfinished. The separate Jacket pose weights object drives shape keys from arm bone directions; no runtime contact solver or Python handler is required.\n"
        )
        bpy.ops.object.select_all(action="DESELECT")
        coat.hide_set(False)
        coat.select_set(True)
        bpy.context.view_layer.objects.active = coat
        bpy.context.preferences.filepaths.save_version = 0
        study = output / "rigged-jacket-study.blend"
        assert not study.exists()
        bpy.ops.wm.save_as_mainfile(filepath=str(study), compress=True)
        report["study_sha256"] = hashlib.sha256(study.read_bytes()).hexdigest()

    (output / "rigged-jacket-check.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(
        "ARMHOLE_RESULT", len(rows), report["all_requested_samples_clear"], flush=True
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pattern", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--subdivision", type=int, choices=[0, 1, 2], default=0)
    parser.add_argument("--preserve-volume", action="store_true")
    parser.add_argument("--body-weights", action="store_true")
    parser.add_argument("--surface-target-control", action="store_true")
    parser.add_argument("--target-offset-cap", action="store_true")
    parser.add_argument("--ring-target-control", action="store_true")
    parser.add_argument("--corrective-smooth", action="store_true")
    parser.add_argument("--corrective-targets", type=Path)
    parser.add_argument("--save-study", action="store_true")
    parser.add_argument("--native-thickness", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(
        args.pattern,
        args.output,
        args.subdivision,
        args.preserve_volume,
        args.body_weights,
        args.surface_target_control,
        args.target_offset_cap,
        args.ring_target_control,
        args.corrective_smooth,
        args.corrective_targets,
        args.save_study,
        args.native_thickness,
    )
