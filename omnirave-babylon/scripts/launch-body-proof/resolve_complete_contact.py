"""Resolve cage vertices trapped between nearby body surfaces across the clips.
Nearest-normal projection can alternate between the arm and torso. Test bounded
rest-space escape directions against every sampled pose before accepting one.
"""

import json, sys, itertools, argparse
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array
from complete_pair_geometry import skin_weights
import audit_rigged_jacket_sleeves as A

parser = argparse.ArgumentParser()
parser.add_argument("--sex", choices=["male", "female"])
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
reports = json.loads((OUT / "contact-escape.json").read_text()) if args.sex and (OUT / "contact-escape.json").exists() else {}
for sex in ([args.sex] if args.sex else ["male", "female"]):
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{sex}-motion-fitted.blend"))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    coat = bpy.data.objects["Structured armhole jacket"]
    disabled = [(m, m.show_viewport) for m in coat.modifiers if m.type != "ARMATURE"]
    for m, _ in disabled:
        m.show_viewport = False
    names = list(rig.data.bones.keys())
    weights = skin_weights(coat, names)
    samples = []
    bad = set()
    for clip in ["idle", "walk", "run"]:
        rig.animation_data.action = bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range, 9):
            A.sample(scene, float(frame))
            points, faces = A.H.geometry(body)
            tree = BVHTree.FromPolygons(points, faces, all_triangles=True)
            q = array(coat, True)
            mats = np.asarray(
                [
                    rig.matrix_world
                    @ rig.pose.bones[n].matrix
                    @ rig.data.bones[n].matrix_local.inverted()
                    @ rig.matrix_world.inverted()
                    for n in names
                ]
            )
            skin = np.einsum("vg,gij->vij", weights, mats)
            for i, p in enumerate(q):
                hit, n, _, _ = tree.find_nearest(Vector(p))
                if (Vector(p) - hit).dot(n) < -0.001:
                    bad.add(i)
            samples.append((tree, q, skin))
    if len(bad) > 32:
        raise RuntimeError(f"{sex}: broad contact requires refitting, not local escape")
    delta = np.zeros((len(coat.data.vertices), 3))
    record = []
    directions = [
        np.array(d) / np.linalg.norm(d)
        for d in itertools.product([-1, 0, 1], repeat=3)
        if any(d)
    ]
    for index in sorted(bad):
        chosen = None
        best = -float("inf")
        for magnitude in [0.003, 0.006, 0.009, 0.012, 0.018, 0.026, 0.038]:
            options = []
            for direction in directions:
                offset = direction * magnitude
                clearance = float("inf")
                for tree, q, skin in samples:
                    p = Vector(q[index] + skin[index, :3, :3] @ offset)
                    hit, n, _, _ = tree.find_nearest(p)
                    clearance = min(clearance, (p - hit).dot(n))
                best = max(best, clearance)
                if clearance >= 0.0015:
                    options.append((clearance, offset))
            if options:
                chosen = max(options, key=lambda pair: pair[0])
                break
        if chosen is None:
            raise RuntimeError(
                f"{sex}: vertex {index} has no bounded all-pose escape ({best})"
            )
        delta[index] = chosen[1]
        record.append(
            {
                "vertex": index,
                "restOffsetMm": (chosen[1] * 1000).tolist(),
                "minimumCageClearanceMm": chosen[0] * 1000,
            }
        )
    if coat.data.shape_keys:
        for key in coat.data.shape_keys.key_blocks:
            co = np.array([v.co[:] for v in key.data])
            key.data.foreach_set("co", (co + delta).astype(np.float32).ravel())
    coat.data.vertices.foreach_set(
        "co", (array(coat) + delta).astype(np.float32).ravel()
    )
    coat.data.update()
    for m, enabled in disabled:
        m.show_viewport = enabled
    rig.animation_data.action = bpy.data.actions["idle"]
    A.sample(scene, 1)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(
        filepath=str(OUT / f"{sex}-motion-fitted.blend"), compress=True
    )
    reports[sex] = record
    print("CONTACT_ESCAPE", sex, json.dumps(record), flush=True)
(OUT / "contact-escape.json").write_text(json.dumps(reports, indent=2) + "\n")
