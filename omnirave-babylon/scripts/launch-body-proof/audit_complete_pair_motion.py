"""Bounded whole-outfit motion probe on the final native runtime assemblies.
Signed nearest-surface distances detect material body poke-through. This is a
sampled diagnostic, not a continuous collision or garment self-contact proof.
"""

import json
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT

result = {}
for sex in ["male", "female"]:
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{sex}-runtime.blend"))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    hand_ids = {}
    for side in ["l", "r"]:
        groups = {g.index for g in body.vertex_groups if g.name.endswith("_" + side)
                  and g.name.startswith(("hand_", "thumb_", "index_", "middle_", "ring_", "pinky_"))}
        hand_ids[side] = [v.index for v in body.data.vertices if any(g.group in groups and g.weight > .2 for g in v.groups)]
    objects = [
        bpy.data.objects[n]
        for n in [
            "Structured armhole jacket",
            "AvatarBottoms_cargo-pants",
            "AvatarTop_tailored" if sex == "male" else "Launch fitted crop top",
        ]
    ]
    rows = []
    for clip in ["idle", "walk", "run"]:
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        for frame in np.linspace(*action.frame_range, 9):
            A.sample(scene, float(frame))
            p, f = A.H.geometry(body)
            tree = BVHTree.FromPolygons(p, f, all_triangles=True)
            parts = {}
            for ob in objects:
                points, faces = A.H.geometry(ob)
                signed = []
                for q in points:
                    hit, n, _, _ = tree.find_nearest(q)
                    signed.append(float((q - hit).dot(n)))
                signed = np.asarray(signed)
                parts[ob.name] = {
                    "vertices": len(points),
                    "bodyPenetrationsOver2mm": int((signed < -0.002).sum()),
                    "minimumSignedDistanceMm": round(float(signed.min() * 1000), 3),
                }
            for name, measured in parts.items():
                assert measured['bodyPenetrationsOver2mm'] == 0, f"{sex} {clip} frame {frame}: {name} enters body: {measured}"
            # The inverse probe catches hands enclosed by otherwise correctly
            # fitted trousers, which a garment-to-body check alone misses.
            pants_points, pants_faces = A.H.geometry(objects[1])
            pants_tree = BVHTree.FromPolygons(pants_points, pants_faces, all_triangles=True)
            pants_bounds = np.asarray(pants_points)
            pants_min, pants_max = pants_bounds.min(0), pants_bounds.max(0)
            hands = {}
            for side, ids in hand_ids.items():
                distances = []
                for index in ids:
                    point = p[index]
                    hit, normal, _, distance = pants_tree.find_nearest(point)
                    # Open waist/ankle rims do not define a signed distance
                    # outside the garment bounds (e.g. a hand above the waist).
                    outside = np.any(np.asarray(point) < pants_min) or np.any(np.asarray(point) > pants_max)
                    distances.append(float(distance if outside else (point - hit).dot(normal)))
                distances = np.asarray(distances)
                hands[side] = {"vertices": len(ids),
                    "trouserPenetrationsOver2mm": int((distances < -.002).sum()),
                    "minimumSignedDistanceMm": round(float(distances.min() * 1000), 3)}
                assert hands[side]["trouserPenetrationsOver2mm"] == 0, f"{sex} {clip} frame {frame}: hand enters trousers: {hands[side]}"
            rows.append({"clip": clip, "frame": float(frame), "parts": parts, "hands": hands})
    result[sex] = rows
(OUT / "motion-probe.json").write_text(
    json.dumps(
        {
            "scope": "9 samples per clip; garment-to-body distance on evaluated jacket, trousers and top, plus hand-to-trouser distance. Not a self-intersection or continuous contact certification.",
            "characters": result,
        },
        indent=2,
    )
    + "\n"
)
for sex, rows in result.items():
    print(
        sex,
        {
            part: min(row["parts"][part]["minimumSignedDistanceMm"] for row in rows)
            for part in rows[0]["parts"]
        },
    )
