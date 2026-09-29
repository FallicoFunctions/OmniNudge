"""Fit and inspect an independently authored jacket pattern on retained body05.

Initial construction is screened with actual 1 mm walls before binding. Optional
native nearest-face weight transfer preserves the authored T-pose exactly, then
captures all 61 lowering poses for scoped skinning checks and a cloth input.
No source model is changed. Temporary Blender output is diagnostic only.
"""

# Connection map: the pattern already has welded torso/sleeve seams and three
# openings. The unchanged body rig owns the optional skinned garment motion.
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
from inspect_jacket_ipc import normal_walls, paired_faces
from probe_blender_garment_transfer import (
    COAT_NAME,
    SOURCE,
    apply_modifier,
    bind_points,
    collect_weights,
    new_mesh,
)
from surface_crossings import strict_pairs
from validate_body05_tops import between, body_snapshot, geometry
from validate_body_contacts import bones_snapshot


def screen(points, faces, body, top):
    q, u = geometry(body)
    v, w = geometry(top)
    wall_faces = paired_faces(faces.tolist(), len(points))
    walls, _, _ = normal_walls(np.vstack([points, points]), wall_faces)
    pv, wv = [Vector(p) for p in points], [Vector(p) for p in walls]
    normal = np.cross(
        points[faces[:, 1]] - points[faces[:, 0]],
        points[faces[:, 2]] - points[faces[:, 0]],
    )
    ratios = []
    for surface in [walls[: len(points)], walls[len(points) :]]:
        offset_normal = np.cross(
            surface[faces[:, 1]] - surface[faces[:, 0]],
            surface[faces[:, 2]] - surface[faces[:, 0]],
        )
        ratios.extend(
            np.einsum("ij,ij->i", normal, offset_normal)
            / np.einsum("ij,ij->i", normal, normal)
        )
    hits = strict_pairs(wv, wall_faces)
    row = {
        "midsurface_self_pairs": len(strict_pairs(pv, faces.tolist())),
        "wall_self_pairs": len(hits),
        "wall_body_pairs": len(between(wv, wall_faces, q, u)),
        "wall_top_pairs": len(between(wv, wall_faces, v, w)),
        "reversed_offset_faces": int(np.count_nonzero(np.asarray(ratios) <= 0)),
        "minimum_offset_orientation_ratio": float(min(ratios)),
    }
    row["passed"] = not any(
        row[k]
        for k in [
            "midsurface_self_pairs",
            "wall_self_pairs",
            "wall_body_pairs",
            "wall_top_pairs",
            "reversed_offset_faces",
        ]
    )
    return row, walls, wall_faces


def run(pattern_path, output, bind, render, save_study=False):
    assert not (save_study and bind), (
        "Editable study is the static, unbound T-pose construction"
    )
    output.mkdir(parents=True, exist_ok=True)
    pattern = np.load(pattern_path)
    source = SOURCE / "male-outfit04.blend"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    body, top, rig, old = [
        bpy.data.objects[n]
        for n in ["AvatarBody", "AvatarTop_tailored", "AvatarSkeleton", COAT_NAME]
    ]
    original = (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    scene.frame_set(31)
    bpy.context.view_layer.update()
    points, faces = pattern["points"], pattern["faces"]
    coat = new_mesh(
        "Authored jacket pattern", points.tolist(), faces.tolist(), old.data.materials
    )
    old.hide_render = True
    initial, walls, wall_faces = screen(points, faces, body, top)
    report = {
        "scope": __doc__,
        "source_sha256": digest,
        "pattern_sha256": hashlib.sha256(pattern_path.read_bytes()).hexdigest(),
        "blender_version": bpy.app.version_string,
        "initial": initial,
        "bound": False,
        "samples": [],
        "status": "INITIAL_CLEAR_PENDING_BIND"
        if initial["passed"]
        else "INITIAL_CONSTRUCTION_REJECTED",
    }
    print("PATTERN_INITIAL", initial, flush=True)
    if bind and initial["passed"]:
        skin = {
            bone.name: bone.matrix @ bone.bone.matrix_local.inverted()
            for bone in rig.pose.bones
        }
        for obj in [body, top, rig, coat]:
            assert (
                max(
                    abs(obj.matrix_world[i][j] - (i == j))
                    for i in range(4)
                    for j in range(4)
                )
                < 1e-6
            )
        transfer_source = body.copy()
        transfer_source.data = body.data.copy()
        scene.collection.objects.link(transfer_source)
        for group in list(transfer_source.vertex_groups):
            if group.name not in skin:
                transfer_source.vertex_groups.remove(group)
        for name in skin:
            coat.vertex_groups.new(name=name)
        transfer = coat.modifiers.new("Shared T-pose weight transfer", "DATA_TRANSFER")
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
        coat.vertex_groups.clear()
        bind_points(coat, weights, skin, rig)
        bpy.data.objects.remove(transfer_source, do_unlink=True)
        bpy.context.view_layer.update()
        p, _ = geometry(coat)
        error = float(np.max(abs(np.asarray(p) - points)))
        assert error < 3e-6
        report.update({"bound": True, "T-pose_coordinate_error_m": error})
        panels, bodies, tops, frames = [], [], [], np.linspace(31, 1, 61)
        first_failure = None
        for frame in frames:
            scene.frame_set(int(frame), subframe=frame % 1)
            bpy.context.view_layer.update()
            p, t = geometry(coat)
            panels.append(np.asarray(p))
            bodies.append(np.asarray(geometry(body)[0]))
            tops.append(np.asarray(geometry(top)[0]))
            if first_failure is None:
                row, walls, wall_faces = screen(np.asarray(p), np.asarray(t), body, top)
                row["source_frame"] = float(frame)
                report["samples"].append(row)
                if not row["passed"]:
                    first_failure = frame
                if not row["passed"] or frame in [31, 21, 11, 1]:
                    print("PATTERN_SKINNING", row, flush=True)
        np.savez_compressed(
            output / "pattern-motion-input.npz",
            panel=panels,
            faces=faces,
            anchors=pattern["anchors"],
            body=bodies,
            top=tops,
            frames=frames,
            source_sha256=digest,
        )
        report["first_failed_source_frame"] = (
            None if first_failure is None else float(first_failure)
        )
        report["status"] = (
            "SKINNING_SAMPLES_CLEAR_NOT_PROMOTED"
            if first_failure is None
            else "SKINNING_REJECTED_CLOTH_INPUT_AVAILABLE"
        )
        report["motion_input_sha256"] = hashlib.sha256(
            (output / "pattern-motion-input.npz").read_bytes()
        ).hexdigest()
        # Render the first rejected sample, or the completed endpoint.
        frame = 1 if first_failure is None else float(first_failure)
        scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        p, _ = geometry(coat)
        _, walls, wall_faces = screen(np.asarray(p), faces, body, top)
    if render:
        coat.hide_render = True
        new_mesh(
            "Authored pattern diagnostic walls",
            walls.tolist(),
            wall_faces,
            old.data.materials,
        )
        from build_bodies import review

        camera = review.configure_scene()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 1.98
        camera.location = (1, -4, 1.35)
        review.look_at(camera, Vector((0, 0, 1.28)))
        scene.render.resolution_x = 1200
        scene.render.resolution_y = 800
        scene.render.filepath = str(output / "pattern-diagnostic.png")
        bpy.ops.render.render(write_still=True)
    assert (body_snapshot(body), body_snapshot(top), bones_snapshot(rig)) == original
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    report["source_body_top_skeleton_preserved"] = True
    if save_study:
        assert initial["passed"] and not bind
        scene.frame_set(31)
        scene.frame_start = scene.frame_end = 31
        old.hide_set(True)
        coat.name = "EDITABLE authored jacket midsurface - static T pose"
        coat["scope"] = (
            "Independent pattern construction only. Unbound static T pose. No accepted lowering animation."
        )
        readme = bpy.data.texts.new("READ ME - authored pattern study")
        readme.write(
            "Diagnostic editable pattern, not a production avatar.\n"
            "The selected midsurface is unbound and valid only at source frame 31.\n"
            "Playback is restricted to that frame; the retained body rig still contains its original actions.\n"
            "If rendered, the separate diagnostic walls are a frozen 1 mm reconstruction.\n"
            "After editing the midsurface, rebuild and recheck those walls.\n"
            "Full arm lowering fails; see outfit04-authored-pattern-study.json.\n"
        )
        bpy.ops.object.select_all(action="DESELECT")
        coat.hide_set(False)
        coat.select_set(True)
        bpy.context.view_layer.objects.active = coat
        if render:
            bpy.data.objects["Authored pattern diagnostic walls"].hide_set(True)
        bpy.ops.file.pack_all()
        destination = output / "authored-jacket-pattern-study.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(destination), copy=True)
        report["editable_study"] = str(destination)
        report["editable_study_sha256"] = hashlib.sha256(
            destination.read_bytes()
        ).hexdigest()
    (output / "pattern-fit.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pattern", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bind", action="store_true")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--save-study", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.pattern, args.output, args.bind, args.render, args.save_study)
