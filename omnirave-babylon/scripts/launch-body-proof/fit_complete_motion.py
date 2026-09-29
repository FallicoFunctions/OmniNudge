"""Fit the complete visible outfit across the three native movement clips.
A bounded sampled skin-space correction preserves the existing skeleton,
animations and morph deltas. No body faces or garment regions are hidden.
"""

import sys, json, argparse
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT, array
from complete_pair_geometry import skin_weights

parser = argparse.ArgumentParser()
parser.add_argument("--sex", choices=["male", "female"])
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
reports = json.loads((OUT / "motion-fit.json").read_text()) if args.sex and (OUT / "motion-fit.json").exists() else {}
for sex in ([args.sex] if args.sex else ["male", "female"]):
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{sex}-runtime.blend"))
    s = bpy.context.scene
    r = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    names = [b.name for b in r.data.bones]
    objects = [
        bpy.data.objects[n]
        for n in [
            "Structured armhole jacket",
            "AvatarBottoms_cargo-pants",
            "AvatarTop_tailored" if sex == "male" else "Launch fitted crop top",
        ]
    ]
    if sex == "female":
        objects += [o for o in s.objects if o.name.startswith("Launch crop strap")]
    # Fit evaluated trouser density directly so subdivision cannot shrink the fit.
    for ob in objects:
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        arms = [m for m in ob.modifiers if m.type == "ARMATURE"]
        for arm in arms:
            arm.show_viewport = False
        for m in list(ob.modifiers):
            if m.type == "SUBSURF":
                bpy.ops.object.modifier_apply(modifier=m.name)
        for arm in arms:
            arm.show_viewport = True
    cache = {ob.name: skin_weights(ob, names) for ob in objects}
    disabled = []
    for ob in objects:
        for m in ob.modifiers:
            if m.type != "ARMATURE":
                disabled.append((m, m.show_viewport))
                m.show_viewport = False
    initial = {o.name: array(o).copy() for o in objects}
    history = []
    for iteration in range(10):
        count = 0
        deepest = 0
        for clip in ["idle", "walk", "run"]:
            r.animation_data.action = bpy.data.actions[clip]
            for frame in np.linspace(*r.animation_data.action.frame_range, 9):
                A.sample(s, float(frame))
                points, faces = A.H.geometry(body)
                tree = BVHTree.FromPolygons(points, faces, all_triangles=True)
                mats = np.asarray(
                    [
                        r.matrix_world
                        @ r.pose.bones[n].matrix
                        @ r.data.bones[n].matrix_local.inverted()
                        @ r.matrix_world.inverted()
                        for n in names
                    ]
                )
                for ob in objects:
                    q = array(ob, True)
                    w = cache[ob.name]
                    assert len(q) == len(w)
                    skin = np.einsum("vg,gij->vij", w, mats)
                    delta = np.zeros_like(q)
                    for i, p in enumerate(q):
                        hit, n, _, _ = tree.find_nearest(Vector(p))
                        signed = (Vector(p) - hit).dot(n)
                        if signed < 0.003:
                            delta[i] = np.array(n) * min(0.012, 0.004 - signed)
                            count += 1
                            deepest = min(deepest, signed)
                    if not np.any(delta):
                        continue
                    local = np.linalg.solve(skin[:, :3, :3], delta[..., None])[:, :, 0]
                    if ob.data.shape_keys:
                        for key in ob.data.shape_keys.key_blocks:
                            co = np.array([list(v.co) for v in key.data])
                            key.data.foreach_set(
                                "co", (co + local).astype(np.float32).ravel()
                            )
                    ob.data.vertices.foreach_set(
                        "co", (array(ob) + local).astype(np.float32).ravel()
                    )
                    ob.data.update()
                    A.update()
        history.append(
            {
                "iteration": iteration,
                "adjustedVertexSamples": count,
                "deepestBeforeAdjustmentMm": deepest * 1000,
            }
        )
        print("FIT", sex, history[-1], flush=True)
        if count == 0:
            break
    # Hardware follows the coat's final local displacement field.
    coat = objects[0]
    delta = array(coat) - initial[coat.name]
    tree = KDTree(len(delta))
    for i, p in enumerate(initial[coat.name]):
        tree.insert(Vector(p), i)
    tree.balance()
    for ob in s.objects:
        if ob.type != "MESH" or not ob.get("jacketHardware"):
            continue
        offsets = []
        for p in array(ob):
            near = tree.find_n(Vector(p), 6)
            ids = [i for _, i, _ in near]
            w = np.array([1 / (0.005 + d) ** 2 for _, _, d in near])
            offsets.append(np.sum(delta[ids] * w[:, None], axis=0) / w.sum())
        offsets = np.array(offsets)
        if ob.data.shape_keys:
            for key in ob.data.shape_keys.key_blocks:
                co = np.array([list(v.co) for v in key.data])
                key.data.foreach_set("co", (co + offsets).astype(np.float32).ravel())
        ob.data.vertices.foreach_set(
            "co", (array(ob) + offsets).astype(np.float32).ravel()
        )
        ob.data.update()
    for mod, visible in disabled:
        mod.show_viewport = visible
    r.animation_data.action = bpy.data.actions["idle"]
    A.sample(s, 1)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(
        filepath=str(OUT / f"{sex}-motion-fitted.blend"), compress=True
    )
    reports[sex] = {
        "iterations": history,
        "maximumRestDisplacementMm": {
            ob.name: float(
                np.linalg.norm(array(ob) - initial[ob.name], axis=1).max() * 1000
            )
            for ob in objects
        },
    }
(OUT / "motion-fit.json").write_text(json.dumps(reports, indent=2) + "\n")
