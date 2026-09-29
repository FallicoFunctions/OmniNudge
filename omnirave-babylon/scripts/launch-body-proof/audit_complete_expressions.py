"""Probe the evaluated facial shapes and retain close-up review renders.
This samples the authored controls; it is not a continuous collision guarantee.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array, review
import audit_rigged_jacket_sleeves as A

POSES = {
    "neutral": {},
    "half-blink": {"Expression_BlinkLeft": .5, "Expression_BlinkRight": .5},
    "closed": {"Expression_BlinkLeft": 1, "Expression_BlinkRight": 1},
    "closed-curious": {"Expression_BlinkLeft": 1, "Expression_BlinkRight": 1, "Expression_BrowLift": .8},
    "smile": {"Expression_Smile": .85, "Expression_BrowLift": .15},
    "hair-left": {"Secondary_HairSide": -1, "Secondary_HairBack": -1},
    "hair-right": {"Secondary_HairSide": 1, "Secondary_HairBack": 1},
}


def set_pose(values):
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH" and ob.data.shape_keys:
            for key in ob.data.shape_keys.key_blocks:
                if key.name.startswith(("Expression_", "Secondary_")):
                    key.value = values.get(key.name, 0)
    bpy.context.view_layer.update()


def run(sex, render):
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{sex}-expressive.blend"))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    rig.animation_data.action = bpy.data.actions["idle"]
    scene.frame_set(1)
    set_pose({})
    baseline = array(body, True)
    groom=bpy.data.objects.get('Luxury retained swept groom') if sex=='male' else None
    if groom:
        root_baseline=array(groom,True).reshape(-1,12,2,3)[:,0].mean(axis=1)
        scalp_points,scalp_faces=A.H.geometry(bpy.data.objects['Complete scalp'])
        scalp_tree=BVHTree.FromPolygons(scalp_points,scalp_faces,all_triangles=True)
        flyaways=bpy.data.objects['Polished male flyaways']
        flyaway_baseline=array(flyaways,True).reshape(-1,10,2,3)[:,0].mean(axis=1)
    iris_points = {side: array(bpy.data.objects["AvatarIris_" + side], True) for side in ["l", "r"]}
    eye_height = np.mean([p[:, 2].mean() for p in iris_points.values()])
    lower = baseline[:, 2] < eye_height - .13
    rows = {}
    camera = None
    if render:
        camera = review.configure_scene()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = .33
        camera.location = (.12, -4, eye_height)
        review.look_at(camera, Vector((0, -.03, eye_height - .018)))
        scene.view_settings.exposure = -.8
        scene.render.resolution_x = 700
        scene.render.resolution_y = 800
    for label, values in POSES.items():
        set_pose(values)
        current = array(body, True)
        assert np.isfinite(current).all() and current.shape == baseline.shape
        unchanged = float(np.max(np.abs(current[lower] - baseline[lower])))
        assert unchanged < 1e-7, f"{sex} {label}: face shape moved the lower body"
        p, f = A.H.geometry(body)
        tree = BVHTree.FromPolygons(p, f, all_triangles=True)
        occlusion = {}
        for side, iris in iris_points.items():
            hits = 0
            for point in iris:
                hit, _, _, _ = tree.ray_cast(Vector((float(point[0]), -1, float(point[2]))), Vector((0, 1, 0)), 2)
                hits += hit is not None and hit.y < point[1] - .0001
            occlusion[side] = round(hits / len(iris), 4)
        rows[label] = {"finite": True, "bodyVertices": len(current),
                       "maximumLowerBodyChangeM": unchanged, "irisCoveredBySkinFraction": occlusion}
        if groom:
            hair=array(groom,True);assert np.isfinite(hair).all()
            roots=hair.reshape(-1,12,2,3)[:,0].mean(axis=1)
            drift=float(np.linalg.norm(roots-root_baseline,axis=1).max())
            distance=max(scalp_tree.find_nearest(Vector(root))[3] for root in roots)
            assert drift<1e-7 and distance<.002,(label,drift,distance)
            rows[label]['maximumGroomRootDriftMm']=drift*1000
            rows[label]['maximumRootScalpDistanceMm']=distance*1000
            flyaway_roots=array(flyaways,True).reshape(-1,10,2,3)[:,0].mean(axis=1)
            flyaway_drift=float(np.linalg.norm(flyaway_roots-flyaway_baseline,axis=1).max())
            flyaway_distance=max(scalp_tree.find_nearest(Vector(root))[3] for root in flyaway_roots)
            assert flyaway_drift<1e-7 and flyaway_distance<.002,(label,flyaway_drift,flyaway_distance)
            rows[label]['maximumFlyawayRootDriftMm']=flyaway_drift*1000
            rows[label]['maximumFlyawayRootScalpDistanceMm']=flyaway_distance*1000
        if label in ["closed", "closed-curious"]:
            assert min(occlusion.values()) > .95, f"{sex} {label}: incomplete eyelid closure {occlusion}"
        if render and label in ["half-blink", "closed-curious"]:
            scene.render.filepath = str(OUT / f"{sex}-expression-{label}.png")
            bpy.ops.render.render(write_still=True)
    if render:
        # Review the actual posed hand and cuff instead of guessed rest bounds.
        set_pose({})
        group = body.vertex_groups["fingernails"].index
        ids = [v.index for v in body.data.vertices if any(g.group == group and g.weight > .1 for g in v.groups)]
        hand = baseline[ids]
        hand = hand[hand[:, 0] > 0].mean(0)
        camera.data.ortho_scale = .32
        camera.location = (hand[0] + .5, hand[1] - 3, hand[2] + .25)
        review.look_at(camera, Vector(hand))
        scene.render.filepath = str(OUT / f"{sex}-expression-hand-review.png")
        bpy.ops.render.render(write_still=True)
        for label in ["hair-left", "hair-right"]:
            set_pose(POSES[label])
            camera.data.ortho_scale = .65
            camera.location = (-2, 3, eye_height)
            review.look_at(camera, Vector((-.035, .02, eye_height - .02)))
            scene.render.filepath = str(OUT / f"{sex}-expression-{label}.png")
            bpy.ops.render.render(write_still=True)
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    rows = {sex: run(sex, args.render) for sex in ["male", "female"]}
    (OUT / "expression-probe.json").write_text(json.dumps({
        "scope": "Seven authored expression/groom combinations at idle frame 1; finite body positions, unchanged lower body, and body occlusion of iris vertices. Not continuous collision or self-contact certification.",
        "characters": rows,
    }, indent=2) + "\n")
    print(json.dumps(rows, indent=2))
