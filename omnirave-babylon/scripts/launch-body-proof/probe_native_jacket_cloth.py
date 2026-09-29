"""Test the full jacket with native Blender Cloth and explicit collision meshes.

Unlike the earlier small pinned-panel trial, the whole connected midsurface
can redistribute fabric. The source T-pose and 61 prescribed samples are held
fixed. The output is a diagnostic simulation, not a production garment rig.
"""

# Connection map: one continuous jacket surface, with pin groups only at the
# archived cuff/collar/waist attachments. Body and top are separate colliders.
# Thickness is checked after simulation, never inferred from a clear cage.
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from probe_blender_garment_transfer import SOURCE, new_mesh
from surface_crossings import strict_pairs
from validate_body05_tops import between, geometry


def linear_keys(keys):
    action = keys.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"


def animated_mesh(name, samples, faces, material, settle, end_settle):
    obj = new_mesh(name, samples[0].tolist(), faces, material)
    basis = obj.shape_key_add(name="Initial T-pose")
    obj.data.shape_keys.use_relative = False
    basis.interpolation = "KEY_LINEAR"
    for index in range(1, len(samples)):
        key = obj.shape_key_add(name=f"Prescribed sample {index:02}")
        key.interpolation = "KEY_LINEAR"
        key.data.foreach_set("co", samples[index].astype(np.float32).ravel())
        obj.data.shape_keys.eval_time = key.frame
        obj.data.shape_keys.keyframe_insert(data_path="eval_time", frame=settle + index)
    keys = obj.data.shape_keys
    keys.eval_time = 0
    keys.keyframe_insert(data_path="eval_time", frame=1)
    keys.keyframe_insert(data_path="eval_time", frame=settle)
    keys.eval_time = keys.key_blocks[-1].frame
    keys.keyframe_insert(
        data_path="eval_time", frame=settle + len(samples) - 1 + end_settle
    )
    linear_keys(keys)
    return obj


def run(
    output,
    quality,
    collision_quality,
    bending,
    render,
    colliders="both",
    self_collision=True,
    max_frame=None,
    scale=1.0,
    object_gap=0.001,
    self_gap=0.002,
    top_surface="full",
    input_path=None,
    check_walls=False,
    rest_shape=None,
    check_every_frame=False,
    relative_rest_control=False,
    record_contacting_frames=False,
):
    assert not record_contacting_frames or check_every_frame
    assert not relative_rest_control or rest_shape is not None
    assert scale > 0 and object_gap > 0 and self_gap > 0
    assert max_frame is None or max_frame >= 1
    assert not render or scale == 1, (
        "Use inspect_native_jacket_cloth.py to render scaled runs"
    )
    output.mkdir(parents=True, exist_ok=True)
    data_path = input_path or SOURCE / "outfit04-rest-tpose-input.npz"
    source = SOURCE / "male-outfit04.blend"
    data = np.load(data_path)
    hashes = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [source, data_path]
    }
    assert str(data["source_sha256"]) == hashes[source.name]
    bpy.ops.wm.open_mainfile(filepath=str(source))
    original_body = bpy.data.objects["AvatarBody"]
    original_top = bpy.data.objects["AvatarTop_tailored"]
    original_coat = bpy.data.objects["Luxury_Bomber rebuilt shell"]
    body_faces = [tuple(p.vertices) for p in original_body.data.polygons]
    top_faces = [tuple(p.vertices) for p in original_top.data.polygons]
    materials = list(original_coat.data.materials)
    body_materials = list(original_body.data.materials)
    top_materials = list(original_top.data.materials)
    for obj in list(bpy.data.objects):
        if obj.name == "AvatarSkeleton":
            obj.hide_render = True
        else:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    settle, end_settle = 11, 20
    end = settle + len(data["frames"]) - 1 + end_settle
    scene.frame_start, scene.frame_end = 1, end
    scene.render.fps = 30
    body = animated_mesh(
        "Body collision copy",
        data["body"] * scale,
        body_faces,
        body_materials,
        settle,
        end_settle,
    )
    top = animated_mesh(
        "Top collision copy",
        data["top"] * scale,
        top_faces,
        top_materials,
        settle,
        end_settle,
    )
    top_collider = top
    if top_surface == "outer":
        half = len(data["top"][0]) // 2
        outer_faces = [face for face in top_faces if max(face) < half]
        assert outer_faces and len(data["top"][0]) == 2 * half
        top_collider = animated_mesh(
            "Top outer collision proxy",
            data["top"] * scale,
            outer_faces,
            top_materials,
            settle,
            end_settle,
        )
        top_collider.hide_render = True
    coat = animated_mesh(
        "Full jacket cloth",
        data["panel"] * scale,
        data["faces"].tolist(),
        materials,
        settle,
        end_settle,
    )
    authored_rest_key = None
    if rest_shape is not None:
        rest = np.load(rest_shape)
        assert np.array_equal(rest["faces"], data["faces"])
        assert rest["points"].shape == data["panel"][0].shape
        hashes[rest_shape.name] = hashlib.sha256(rest_shape.read_bytes()).hexdigest()
        authored_rest_key = coat.shape_key_add(name="Authored garment rest pattern")
        assert np.isfinite(rest["points"]).all()
        authored_rest_key.value = 0
        authored_rest_key.interpolation = "KEY_LINEAR"
        authored_rest_key.data.foreach_set(
            "co", (rest["points"] * scale).astype(np.float32).ravel()
        )
    pin = coat.vertex_groups.new(name="Cuff collar waist attachments")
    pin.add(data["anchors"].tolist(), 1.0, "REPLACE")
    guide_weights = np.zeros(len(data["panel"][0]))
    if "guide_weights" in data:
        guide_weights = np.asarray(data["guide_weights"])
        assert guide_weights.shape == (len(data["panel"][0]),)
        assert np.isfinite(guide_weights).all()
        assert (guide_weights >= 0).all() and (guide_weights < 1).all()
        assert not guide_weights[data["anchors"]].any()
        for vertex in np.flatnonzero(guide_weights):
            pin.add([int(vertex)], float(guide_weights[vertex]), "REPLACE")

    actual_pin_weights = np.zeros(len(guide_weights))
    for vertex in coat.data.vertices:
        for group in vertex.groups:
            if group.group == pin.index:
                actual_pin_weights[vertex.index] = group.weight
    expected_pin_weights = guide_weights.copy()
    expected_pin_weights[data["anchors"]] = 1
    assert np.max(abs(actual_pin_weights - expected_pin_weights)) < 1e-7
    selected_colliders = {
        "both": [body, top_collider],
        "body": [body],
        "top": [top_collider],
        "none": [],
    }[colliders]
    for obj in selected_colliders:
        obj.modifiers.new("Explicit cloth collider", "COLLISION")
        obj.collision.thickness_outer = object_gap * scale
        obj.collision.thickness_inner = object_gap * scale
        obj.collision.cloth_friction = 5
    animation_parity = None
    if authored_rest_key is not None and relative_rest_control:
        # Optional animation representation control; no rest-key response is assumed.
        # Preserve the entire prescribed attachment schedule with linear hats.
        keys = coat.data.shape_keys
        keys.animation_data_clear()
        keys.use_relative = True
        basis = keys.key_blocks[0]
        for index, key in enumerate(list(keys.key_blocks)[1:-1], 1):
            key.relative_key = basis
            key.value = 0
            key.keyframe_insert(data_path="value", frame=settle + index - 1)
            key.value = 1
            key.keyframe_insert(data_path="value", frame=settle + index)
            if index < len(data["panel"]) - 1:
                key.value = 0
                key.keyframe_insert(data_path="value", frame=settle + index + 1)
        authored_rest_key.relative_key = basis
        authored_rest_key.value = 0
        linear_keys(keys)
        max_error = 0.0
        # Before adding Cloth, compare integer and half-frame positions so a
        # changed rest pattern cannot accidentally drive the pin animation.
        for sample_frame in np.arange(1, end + 0.5, 0.5):
            scene.frame_set(int(sample_frame), subframe=sample_frame % 1)
            bpy.context.view_layer.update()
            p, _ = geometry(coat)
            index = min(len(data["panel"]) - 1, max(0, sample_frame - settle))
            low, high = int(np.floor(index)), int(np.ceil(index))
            alpha = index - low
            expected = (1 - alpha) * data["panel"][low] + alpha * data["panel"][high]
            max_error = max(
                max_error, float(np.max(abs(np.asarray(p) / scale - expected)))
            )
        assert max_error < 3e-6, max_error
        animation_parity = {"samples": 2 * end - 1, "max_coordinate_error_m": max_error}
        scene.frame_set(1)
        bpy.context.view_layer.update()
    cloth = coat.modifiers.new("Native full-jacket cloth", "CLOTH")
    settings = cloth.settings
    settings.quality = quality
    settings.mass = 0.2
    settings.tension_stiffness = 30
    settings.compression_stiffness = 30
    settings.shear_stiffness = 15
    settings.bending_stiffness = bending
    settings.air_damping = 5
    settings.vertex_group_mass = pin.name
    settings.pin_stiffness = 1
    settings.use_dynamic_mesh = False
    if authored_rest_key is not None:
        settings.rest_shape_key = authored_rest_key
        assert settings.rest_shape_key == authored_rest_key
    settings.effector_weights.gravity = 0
    collision = cloth.collision_settings
    collision.use_collision = bool(selected_colliders)
    collision.distance_min = object_gap * scale
    collision.collision_quality = collision_quality
    collision.use_self_collision = self_collision
    collision.self_distance_min = self_gap * scale
    collision.self_friction = 5
    assert settings.quality == quality
    assert collision.collision_quality == collision_quality
    assert abs(settings.bending_stiffness - bending) < 1e-6
    assert settings.tension_stiffness == settings.compression_stiffness == 30
    assert settings.shear_stiffness == 15
    cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, end
    requested = {"cloth_body": object_gap, "self": self_gap}
    effective = {
        "cloth_body": collision.distance_min / scale,
        "self": collision.self_distance_min / scale,
    }
    for obj in selected_colliders:
        requested[obj.name] = object_gap
        effective[obj.name] = obj.collision.thickness_outer / scale
    assert all(abs(requested[k] - effective[k]) < 1e-8 for k in requested), effective
    report = {
        "scope": __doc__,
        "source_hashes": hashes,
        "source_input": str(data_path.resolve()),
        "blender_version": bpy.app.version_string,
        "settings": {
            "quality": quality,
            "collision_quality": collision_quality,
            "bending": bending,
            "gravity": 0,
            "dynamic_mesh": False,
            "bending_model": settings.bending_model,
            "colliders": colliders,
            "self_collision": self_collision,
            "simulation_scale": scale,
            "top_collision_surface": top_surface,
            "checkpoint_1mm_wall_screen": check_walls,
            "check_every_stored_frame": check_every_frame,
            "record_contacting_frames_diagnostic": record_contacting_frames,
            "authored_rest_input": str(rest_shape.resolve()) if rest_shape else None,
            "relative_rest_control": relative_rest_control,
            "garment_relative_keys": coat.data.shape_keys.use_relative,
            "prescribed_animation_parity": animation_parity,
            "rest_shape_key": settings.rest_shape_key.name
            if settings.rest_shape_key
            else None,
            "pin_count": len(data["anchors"]),
            "soft_guide_vertex_count": int(np.count_nonzero(guide_weights)),
            "maximum_soft_guide_weight": float(guide_weights.max()),
            "effective_distances_m": effective,
        },
        "schedule": {
            "warmup_end": settle,
            "arm_lowering_end": end - end_settle,
            "settling_end": end,
        },
        "samples": [],
        "status": "RUNNING",
    }
    panels, frames = [], []
    first_contact = None
    started = time.monotonic()
    stop = min(end, max_frame) if max_frame is not None else end
    checkpoints = {1, settle, 21, 31, 41, 51, 61, 71, stop}
    for frame in range(1, stop + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        p, t = geometry(coat)
        p = [point / scale for point in p]
        panels.append(np.asarray(p))
        frames.append(frame)
        if frame in checkpoints or check_every_frame:
            q, u = geometry(body)
            v, w = geometry(top)
            q = [point / scale for point in q]
            v = [point / scale for point in v]
            expected_index = min(len(data["frames"]) - 1, max(0, frame - settle))
            assert np.max(abs(np.asarray(q) - data["body"][expected_index])) < 3e-6
            assert np.max(abs(np.asarray(v) - data["top"][expected_index])) < 3e-6
            row = {
                "frame": frame,
                "source_frame": float(data["frames"][expected_index]),
                "midsurface_self_pairs": len(strict_pairs(p, t)),
                "body_pairs": len(between(p, t, q, u)),
                "top_pairs": len(between(p, t, v, w)),
                "max_displacement_from_initial_m": float(
                    np.max(np.linalg.norm(np.asarray(p) - data["panel"][0], axis=1))
                ),
                "elapsed_seconds": time.monotonic() - started,
            }
            gates = ["midsurface_self_pairs", "body_pairs", "top_pairs"]
            if check_walls:
                from inspect_jacket_ipc import normal_walls, paired_faces

                wall_faces = paired_faces(data["faces"].tolist(), len(p))
                walls, _, _ = normal_walls(np.vstack([p, p]), wall_faces)
                wall_vectors = [Vector(point) for point in walls]
                row.update(
                    wall_self_pairs=len(strict_pairs(wall_vectors, wall_faces)),
                    wall_body_pairs=len(between(wall_vectors, wall_faces, q, u)),
                    wall_top_pairs=len(between(wall_vectors, wall_faces, v, w)),
                )
                gates += ["wall_self_pairs", "wall_body_pairs", "wall_top_pairs"]
            report["samples"].append(row)
            if frame in checkpoints or any(row[k] for k in gates):
                print("NATIVE_JACKET", row, flush=True)
            (output / "native-cloth.json").write_text(
                json.dumps(report, indent=2) + "\n"
            )
            if any(row[k] for k in gates):
                if first_contact is None:
                    first_contact = {
                        "frame": frame,
                        "source_frame": row["source_frame"],
                    }
                report["status"] = (
                    "CONTACTING_RAW_DIAGNOSTIC_CAPTURE"
                    if record_contacting_frames
                    else "STOPPED_ON_SAMPLED_CONTACT"
                )
                if not record_contacting_frames:
                    break
    else:
        report["status"] = (
            "CHECKPOINT_WALLS_CLEAR_PENDING_ALL_FRAME_INSPECTION"
            if check_walls
            else "SAMPLED_MIDSURFACE_CLEAR_FINAL_WALLS_UNCHECKED"
        )
    if first_contact is not None and record_contacting_frames:
        report["status"] = "CONTACTING_RAW_DIAGNOSTIC_CAPTURE"
    report["first_sampled_contact"] = first_contact
    report["completed_frame"] = frame
    report["elapsed_seconds"] = time.monotonic() - started
    np.savez_compressed(
        output / "native-panels.npz",
        panels=np.asarray(panels),
        frames=np.asarray(frames),
        faces=data["faces"],
    )
    report["native_panels_sha256"] = hashlib.sha256(
        (output / "native-panels.npz").read_bytes()
    ).hexdigest()
    (output / "native-cloth.json").write_text(json.dumps(report, indent=2) + "\n")
    if render:
        assert scale == 1, "Use the normalized NPZ for scaled-simulation renders"
        from build_bodies import review

        camera = review.configure_scene()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 1.25
        camera.location = (1, -4, 1.35)
        review.look_at(camera, Vector((0, 0, 1.28)))
        scene.render.resolution_x = 800
        scene.render.resolution_y = 800
        scene.render.filepath = str(output / "native-endpoint.png")
        bpy.ops.render.render(write_still=True)
    for p in [source, data_path] + ([rest_shape] if rest_shape else []):
        assert hashlib.sha256(p.read_bytes()).hexdigest() == hashes[p.name]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--quality", type=int, default=20)
    parser.add_argument("--collision-quality", type=int, default=10)
    parser.add_argument("--bending", type=float, default=0.5)
    parser.add_argument("--render", action="store_true")
    parser.add_argument(
        "--colliders", choices=["both", "body", "top", "none"], default="both"
    )
    parser.add_argument("--no-self-collision", action="store_true")
    parser.add_argument("--max-frame", type=int)
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--object-gap", type=float, default=0.001)
    parser.add_argument("--self-gap", type=float, default=0.002)
    parser.add_argument("--top-surface", choices=["full", "outer"], default="full")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--check-walls", action="store_true")
    parser.add_argument("--rest-shape", type=Path)
    parser.add_argument("--check-every-frame", action="store_true")
    parser.add_argument("--relative-rest-control", action="store_true")
    parser.add_argument("--record-contacting-frames", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(
        args.output,
        args.quality,
        args.collision_quality,
        args.bending,
        args.render,
        args.colliders,
        not args.no_self_collision,
        args.max_frame,
        args.scale,
        args.object_gap,
        args.self_gap,
        args.top_surface,
        args.input,
        args.check_walls,
        args.rest_shape,
        args.check_every_frame,
        args.relative_rest_control,
        args.record_contacting_frames,
    )
