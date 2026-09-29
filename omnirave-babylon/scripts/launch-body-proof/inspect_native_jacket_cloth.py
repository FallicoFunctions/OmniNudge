"""Inspect native cloth samples against the actual rig and reconstructed 1 mm walls.

This independent sampled check includes both shirt walls and rims even when
the simulation uses only its outer surface. It provides no continuous-motion,
export or visual acceptance guarantee. Failed samples remain diagnostic only.
"""

# Connection map: matched inner/outer walls share the simulation topology;
# oriented rims close only the authored garment openings.
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
from probe_blender_garment_transfer import SOURCE, new_mesh
from surface_crossings import strict_pairs
from validate_body05_tops import between, geometry


def run(directory, render):
    report = json.loads((directory / "native-cloth.json").read_text())
    data = np.load(directory / "native-panels.npz")
    input_path = Path(
        report.get("source_input", SOURCE / "outfit04-rest-tpose-input.npz")
    )
    assert (
        hashlib.sha256(input_path.read_bytes()).hexdigest()
        == report["source_hashes"][input_path.name]
    )
    assert (
        hashlib.sha256((SOURCE / "male-outfit04.blend").read_bytes()).hexdigest()
        == report["source_hashes"]["male-outfit04.blend"]
    )
    if "native_panels_sha256" in report:
        assert (
            hashlib.sha256((directory / "native-panels.npz").read_bytes()).hexdigest()
            == report["native_panels_sha256"]
        )
    inputs = np.load(input_path)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / "male-outfit04.blend"))
    scene = bpy.context.scene
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    old = bpy.data.objects["Luxury_Bomber rebuilt shell"]
    faces = data["faces"]
    wall_faces = paired_faces(faces.tolist(), len(data["panels"][0]))
    rows = []
    for frame, points in zip(data["frames"], data["panels"]):
        index = min(
            len(inputs["frames"]) - 1,
            max(0, int(frame) - report["schedule"]["warmup_end"]),
        )
        source_frame = float(inputs["frames"][index])
        scene.frame_set(int(source_frame), subframe=source_frame % 1)
        bpy.context.view_layer.update()
        body_points, body_faces = geometry(body)
        top_points, top_faces = geometry(top)
        body_error = float(np.max(abs(np.asarray(body_points) - inputs["body"][index])))
        top_error = float(np.max(abs(np.asarray(top_points) - inputs["top"][index])))
        assert body_error < 3e-6 and top_error < 3e-6
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
        pairs = strict_pairs(wv, wall_faces)
        row = {
            "simulation_frame": int(frame),
            "source_frame": source_frame,
            "midsurface_self_pairs": len(strict_pairs(pv, faces.tolist())),
            "wall_self_pairs": len(pairs),
            "wall_body_pairs": len(between(wv, wall_faces, body_points, body_faces)),
            "wall_top_pairs": len(between(wv, wall_faces, top_points, top_faces)),
            "reversed_offset_faces": int(np.count_nonzero(np.asarray(ratios) <= 0)),
            "minimum_offset_orientation_ratio": float(min(ratios)),
            "body_max_coordinate_error_m": body_error,
            "top_max_coordinate_error_m": top_error,
        }
        if frame == data["frames"][-1] or (
            pairs and not any(r["wall_self_pairs"] for r in rows)
        ):
            row["wall_crossing_examples"] = [
                {
                    "face_indices": [int(a), int(b)],
                    "points_m": walls[
                        np.asarray([wall_faces[a], wall_faces[b]])
                    ].tolist(),
                }
                for a, b in list(pairs)[:8]
            ]
        rows.append(row)
    result = {
        "scope": __doc__,
        "input_result_kind": report.get("result_kind", "RAW_NATIVE_CLOTH"),
        "simulation_report": "native-cloth.json",
        "wall_thickness_m": 0.001,
        "samples": rows,
        "all_sampled_walls_clear_and_oriented": all(
            not any(
                row[k]
                for k in [
                    "midsurface_self_pairs",
                    "wall_self_pairs",
                    "wall_body_pairs",
                    "wall_top_pairs",
                    "reversed_offset_faces",
                ]
            )
            for row in rows
        ),
    }
    (directory / "native-wall-check.json").write_text(
        json.dumps(result, indent=2) + "\n"
    )
    if render:
        old.hide_render = True
        new_mesh(
            "Native cloth 1 mm diagnostic walls",
            walls.tolist(),
            wall_faces,
            old.data.materials,
        )
        from build_bodies import review

        camera = review.configure_scene()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 1.25
        camera.location = (1, -4, 1.35)
        review.look_at(camera, Vector((0, 0, 1.28)))
        scene.render.resolution_x = 900
        scene.render.resolution_y = 900
        if np.ptp(walls[:, 0]) > 1.4:
            camera.data.ortho_scale = 1.98
            scene.render.resolution_x = 1200
            scene.render.resolution_y = 800
        scene.render.filepath = str(directory / "native-walls-endpoint.png")
        bpy.ops.render.render(write_still=True)
    print(
        "NATIVE_WALL_CHECK",
        len(rows),
        result["all_sampled_walls_clear_and_oriented"],
        {k: v for k, v in rows[-1].items() if k != "wall_crossing_examples"},
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.directory, args.render)
