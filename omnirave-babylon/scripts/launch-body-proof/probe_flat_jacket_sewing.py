"""Fit actual flat jacket panels with bounded native Blender sewing springs.

Flat panels define the material rest geometry. Loose edges pull authored seam
pairs together. At each stored check, those pairs are explicitly averaged into
the original connected topology before reconstructing actual 1 mm walls.
Neither loose sewing nor a clear simulation cage constitutes wall acceptance.
"""

# Connection map: three separate material panels connect through loose seam
# springs. Diagnostic welding recovers the authored seams and three openings.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import SOURCE, new_mesh
from probe_native_jacket_cloth import animated_mesh, linear_keys
from validate_body05_tops import geometry


def run(
    pattern_path,
    input_path,
    output,
    max_frame,
    sewing_force,
    bending,
    seam_guides=False,
):
    assert 1 <= max_frame <= 141 and 0 < sewing_force <= 1000 and 0 <= bending <= 200
    output.mkdir(parents=True, exist_ok=True)
    # NPZ members decompress on every indexed access. Materialize once before
    # per-face construction and per-frame simulation loops.
    with np.load(pattern_path) as archive:
        pattern = {name: archive[name] for name in archive.files}
    with np.load(input_path) as archive:
        inputs = {name: archive[name] for name in archive.files}
    source = SOURCE / "male-outfit04.blend"
    hashes = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in [source, pattern_path, input_path]
    }
    assert str(inputs["source_sha256"]) == hashes[source.name]
    assert np.array_equal(inputs["faces"], pattern["weld_faces"])
    prescribed = inputs["panel"].copy()
    cuff_scale = float(pattern.get("cuff_scale", 1.0))
    if cuff_scale != 1:
        for side in [-1, 1]:
            cuff = pattern["source_anchors"][
                inputs["panel"][0, pattern["source_anchors"], 0] * side > 0.70
            ]
            center = prescribed[:, cuff].mean(axis=1, keepdims=True)
            prescribed[:, cuff] = center + (prescribed[:, cuff] - center) * cuff_scale
    assert abs(prescribed[0, pattern["weld_map"]] - pattern["target"]).max() < 3e-6
    bpy.ops.wm.open_mainfile(filepath=str(source))
    original_body, original_top, old = [
        bpy.data.objects[n]
        for n in ["AvatarBody", "AvatarTop_tailored", "Luxury_Bomber rebuilt shell"]
    ]
    body_faces = [tuple(f.vertices) for f in original_body.data.polygons]
    top_faces = [tuple(f.vertices) for f in original_top.data.polygons]
    materials = list(old.data.materials)
    body_materials = list(original_body.data.materials)
    top_materials = list(original_top.data.materials)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = max_frame
    scene.render.fps = 30
    scale = 10.0
    warmup = 61
    lowering_end = 121
    settle_end = 141
    body = animated_mesh(
        "Body collision copy",
        inputs["body"] * scale,
        body_faces,
        body_materials,
        warmup,
        20,
    )
    animated_mesh(
        "Full top check copy",
        inputs["top"] * scale,
        top_faces,
        top_materials,
        warmup,
        20,
    )
    outer_faces = [f for f in top_faces if max(f) < len(inputs["top"][0]) // 2]
    top_collider = animated_mesh(
        "Top outer collision proxy",
        inputs["top"] * scale,
        outer_faces,
        top_materials,
        warmup,
        20,
    )
    for obj in [body, top_collider]:
        obj.modifiers.new("Explicit collider", "COLLISION")
        obj.collision.thickness_outer = 0.001 * scale
        obj.collision.thickness_inner = 0.001 * scale
        obj.collision.cloth_friction = 5
    mesh = bpy.data.meshes.new("Flat jacket sewing mesh")
    mesh.from_pydata(
        (pattern["points"] * scale).tolist(),
        pattern["sewing_edges"].tolist(),
        pattern["faces"].tolist(),
    )
    mesh.update()
    coat = bpy.data.objects.new("Flat jacket sewing diagnostic", mesh)
    scene.collection.objects.link(coat)
    for material in materials:
        mesh.materials.append(material)
    basis = coat.shape_key_add(name="Flat material rest pattern")
    basis.interpolation = "KEY_LINEAR"
    coat.data.shape_keys.use_relative = False
    keys = coat.data.shape_keys
    keys.eval_time = 0
    keys.keyframe_insert(data_path="eval_time", frame=1)
    for index, points in enumerate(prescribed):
        key = coat.shape_key_add(name=f"Attachment pose {index}")
        key.interpolation = "KEY_LINEAR"
        key.data.foreach_set(
            "co", (points[pattern["weld_map"]] * scale).astype(np.float32).ravel()
        )
        keys.eval_time = key.frame
        keys.keyframe_insert(
            data_path="eval_time", frame=31 if index == 0 else warmup + index
        )
        if index == 0:
            keys.keyframe_insert(data_path="eval_time", frame=warmup)
    keys.keyframe_insert(data_path="eval_time", frame=settle_end)
    linear_keys(keys)
    group = coat.vertex_groups.new(name="Opening attachments")
    group.add(pattern["anchors"].tolist(), 1.0, "REPLACE")
    guide_ids = np.setdiff1d(np.unique(pattern["sewing_edges"]), pattern["anchors"])
    if seam_guides:
        guides = coat.vertex_groups.new(name="Temporary seam placement")
        guides.add(guide_ids.tolist(), 1.0, "REPLACE")
        mix = coat.modifiers.new(
            "Release temporary seam placement", "VERTEX_WEIGHT_MIX"
        )
        mix.vertex_group_a = group.name
        mix.vertex_group_b = guides.name
        mix.default_weight_a = 0.0
        mix.default_weight_b = 0.0
        mix.mix_mode = "ADD"
        mix.mix_set = "ALL"
        for frame, value in [(1, 1.0), (31, 1.0), (61, 0.0), (141, 0.0)]:
            mix.mask_constant = value
            mix.keyframe_insert(data_path="mask_constant", frame=frame)
        linear_keys(coat)
    cloth = coat.modifiers.new("Flat rest with actual sewing springs", "CLOTH")
    settings = cloth.settings
    collision = cloth.collision_settings
    settings.quality = 20
    settings.mass = 0.3
    settings.tension_stiffness = 15
    settings.compression_stiffness = 15
    settings.shear_stiffness = 5
    settings.bending_stiffness = bending
    settings.vertex_group_mass = group.name
    settings.pin_stiffness = 20
    settings.use_dynamic_mesh = False
    settings.use_sewing_springs = True
    settings.sewing_force_max = sewing_force
    settings.effector_weights.gravity = 0
    collision.use_collision = True
    collision.collision_quality = 10
    collision.distance_min = 0.001 * scale
    collision.use_self_collision = True
    collision.self_distance_min = 0.0012 * scale
    cloth.point_cache.frame_start = 1
    cloth.point_cache.frame_end = max_frame
    assert sum(e.is_loose for e in mesh.edges) == len(pattern["sewing_edges"])
    report = {
        "scope": __doc__,
        "source_hashes": hashes,
        "source_input": str(input_path.resolve()),
        "flat_pattern": str(pattern_path.resolve()),
        "blender_version": bpy.app.version_string,
        "settings": {
            "sewing": settings.use_sewing_springs,
            "sewing_force_max": settings.sewing_force_max,
            "bending": settings.bending_stiffness,
            "dynamic_mesh": settings.use_dynamic_mesh,
            "scale": scale,
            "quality": settings.quality,
            "collision_quality": collision.collision_quality,
            "loose_sewing_edges": len(pattern["sewing_edges"]),
            "temporary_seam_guides": seam_guides,
            "temporary_seam_guide_vertices": len(guide_ids) if seam_guides else 0,
            "cuff_scale": cuff_scale,
            "prescribed_targets_sha256": hashlib.sha256(
                prescribed.tobytes()
            ).hexdigest(),
            "seam_weld_distance_limit_m": 0.002,
        },
        "schedule": {
            "warmup_end": warmup,
            "arm_lowering_end": lowering_end,
            "settling_end": settle_end,
        },
        "samples": [],
        "accepted": False,
        "status": "RUNNING",
    }
    panels = []
    frames = []
    # For wall/body validation the collider coordinates must be in model units.
    # Separate static check objects track the same prescribed body/top arrays.
    check_body = new_mesh(
        "Unscaled body check", inputs["body"][0].tolist(), body_faces, []
    )
    check_top = new_mesh(
        "Unscaled full top check", inputs["top"][0].tolist(), top_faces, []
    )
    count = np.bincount(pattern["weld_map"])
    for frame in range(1, max_frame + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        positions = np.asarray(geometry(coat)[0]) / scale
        assert np.isfinite(positions).all()
        if frame % 10 == 0 or frame in [1, 31, warmup, max_frame] or frame > warmup:
            seam_distances = np.linalg.norm(
                positions[pattern["sewing_edges"][:, 0]]
                - positions[pattern["sewing_edges"][:, 1]],
                axis=1,
            )
            welded = np.zeros((len(count), 3))
            np.add.at(welded, pattern["weld_map"], positions)
            welded /= count[:, None]
            index = min(len(inputs["frames"]) - 1, max(0, frame - warmup))
            for obj, points in [
                (check_body, inputs["body"][index]),
                (check_top, inputs["top"][index]),
            ]:
                obj.data.vertices.foreach_set("co", points.astype(np.float32).ravel())
                obj.data.update()
            bpy.context.view_layer.update()
            row = {
                "simulation_frame": frame,
                "source_frame": float(inputs["frames"][index]),
                "maximum_seam_distance_m": float(seam_distances.max()),
                "seams_within_weld_limit": bool(seam_distances.max() < 0.002),
            }
            if seam_guides:
                evaluated = coat.evaluated_get(bpy.context.evaluated_depsgraph_get())
                checked_mesh = evaluated.to_mesh()
                actual = []
                for vertex in [int(guide_ids[0]), int(pattern["anchors"][0])]:
                    actual.append(
                        next(
                            (
                                g.weight
                                for g in checked_mesh.vertices[vertex].groups
                                if g.group == group.index
                            ),
                            0.0,
                        )
                    )
                evaluated.to_mesh_clear()
                expected = max(0.0, min(1.0, (61 - frame) / 30))
                assert abs(actual[0] - expected) < 1e-5 and abs(actual[1] - 1) < 1e-5
                row["guide_weight_readback"] = actual[0]
                row["opening_weight_readback"] = actual[1]
                row["released_seam_max_target_error_m"] = float(
                    np.linalg.norm(
                        positions[guide_ids]
                        - prescribed[index, pattern["weld_map"][guide_ids]],
                        axis=1,
                    ).max()
                )
            if row["seams_within_weld_limit"]:
                checked, _, _ = screen(
                    welded, pattern["weld_faces"], check_body, check_top
                )
                row.update(checked)
            else:
                row["passed"] = False
            report["samples"].append(row)
            print("FLAT_SEWING_SAMPLE", row, flush=True)
            if frame >= warmup or (
                frame == max_frame and row["seams_within_weld_limit"]
            ):
                panels.append(welded)
                frames.append(frame)
                if not row["passed"]:
                    report["status"] = "DRAPE_OR_MOTION_REJECTED"
                    break
        (output / "sewing-study.json").write_text(json.dumps(report, indent=2) + "\n")
    report["completed_frame"] = frame
    if report["status"] == "RUNNING":
        report["status"] = "COMPLETED_REQUESTED_SAMPLES_NOT_PROMOTED"
    np.savez_compressed(
        output / "split-endpoint.npz",
        points=positions,
        faces=pattern["faces"],
        sewing_edges=pattern["sewing_edges"],
        weld_map=pattern["weld_map"],
    )
    if panels:
        np.savez_compressed(
            output / "native-panels.npz",
            panels=panels,
            faces=pattern["weld_faces"],
            frames=frames,
        )
        report["native_panels_sha256"] = hashlib.sha256(
            (output / "native-panels.npz").read_bytes()
        ).hexdigest()
        report["result_kind"] = "FLAT_PANEL_SEWING_WITH_EXPLICIT_DIAGNOSTIC_WELD"
        (output / "native-cloth.json").write_text(json.dumps(report, indent=2) + "\n")
    (output / "sewing-study.json").write_text(json.dumps(report, indent=2) + "\n")
    assert hashlib.sha256(source.read_bytes()).hexdigest() == hashes[source.name]
    print("FLAT_SEWING_RESULT", report["status"], report["completed_frame"], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pattern", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-frame", type=int, default=61)
    parser.add_argument("--sewing-force", type=float, default=100)
    parser.add_argument("--bending", type=float, default=0.5)
    parser.add_argument("--seam-guides", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(
        args.pattern,
        args.input,
        args.output,
        args.max_frame,
        args.sewing_force,
        args.bending,
        args.seam_guides,
    )
