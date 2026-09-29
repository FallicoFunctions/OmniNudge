"""Render the saved tailoring study without changing its Blender file."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from build_bodies import review
from surface_crossings import strict_pairs
from validate_body05_tops import between, geometry

STUDY = (
    SCRIPTS.parents[1]
    / "assets-src/avatars/launch-body-proof/rigged-jacket-tailoring-study"
)


def run(source, output):
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    scene.frame_set(1)
    bpy.context.view_layer.update()
    coat, faces = geometry(bpy.data.objects["Structured armhole jacket"])
    body, body_faces = geometry(bpy.data.objects["AvatarBody"])
    top, top_faces = geometry(bpy.data.objects["AvatarTop_tailored"])
    counts = {
        "self": len(strict_pairs(coat, faces)),
        "body": len(between(coat, faces, body, body_faces)),
        "shirt": len(between(coat, faces, top, top_faces)),
    }
    assert not any(counts.values()), counts
    missing_images = [
        im.filepath
        for im in bpy.data.images
        if im.source == "FILE"
        and im.filepath
        and not im.packed_file
        and not Path(bpy.path.abspath(im.filepath)).exists()
    ]
    assert not missing_images, missing_images
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.94
    scene.render.resolution_x = scene.render.resolution_y = 1000
    jacket = bpy.data.objects["Structured armhole jacket"]
    rest = jacket.data.attributes["TailorRest"].data
    cuff_ids = [i for i, value in enumerate(rest) if value.vector.x > 0.710]
    assert cuff_ids
    cuff_center = sum((coat[i] for i in cuff_ids), Vector()) / len(cuff_ids)
    views = (
        ("tailored-front", (0, -4, 1.28), (0, 0, 1.28), 0.94),
        ("tailored-oblique", (3, -4, 1.48), (0, 0, 1.28), 0.94),
        ("tailored-back", (0, 4, 1.28), (0, 0, 1.28), 0.94),
        ("tailored-collar", (0, -4, 1.58), (0, 0, 1.535), 0.34),
        ("tailored-cuff", (cuff_center.x, -4, cuff_center.z), cuff_center, 0.15),
    )
    for label, location, target, scale in views:
        camera.location = location
        camera.data.ortho_scale = scale
        review.look_at(camera, Vector(target))
        scene.render.filepath = str(output / f"{label}.png")
        bpy.ops.render.render(write_still=True)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    report = {
        "model": source.name,
        "model_sha256": digest,
        "model_preserved": True,
        "action": scene["riggedJacketOriginalLoweringAction"],
        "frame": 1,
        "native_contact_counts": counts,
        "missing_external_images": missing_images,
        "views": [f"{view[0]}.png" for view in views],
        "framing": [
            {
                "view": name,
                "camera": list(location),
                "target": list(target),
                "orthographic_scale_m": scale,
            }
            for name, location, target, scale in views
        ],
    }
    (output / "render-check.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", type=Path, default=STUDY / "male-rigged-jacket-tailored.blend"
    )
    parser.add_argument("--output", type=Path, default=STUDY)
    arguments = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(arguments.input, arguments.output)
