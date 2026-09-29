"""Finish whole-look gaps found in the live Babylon comparison.
Connections: scalp follows the measured head with 2 mm clearance; swept cards
start inside its silhouette. Rolled female cuffs keep the original sleeve
surface continuous and move its edge up the measured forearm, exposing kandi.
"""

import argparse
import math
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT, array, material, review
from complete_pair_geometry import Surface, skin_weights, create, join, smooth
from add_launch_reference_details import rigid, ribbon, strand_mat


def scalp(surf, sex):
    oldnames = ["Launch hair - swept scalp"] if sex == "male" else ["PLURR scalp"]
    for name in oldnames:
        ob = bpy.data.objects.get(name)
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)
    eye = np.mean(
        [
            array(bpy.data.objects["AvatarEye_" + side], True).mean(0)
            for side in ["l", "r"]
        ],
        axis=0,
    )
    center = Vector((0, -0.028, eye[2] + 0.039))

    def end(theta):
        back = (1 - math.cos(theta)) * 0.5
        # A curved temple hairline leaves forehead visible and covers the nape.
        return 1.18 + 1.02 * back**0.8 + 0.06 * math.sin(theta * 3) ** 2

    def point(theta, phi, lift=0.0025):
        d = Vector(
            (
                math.sin(phi) * math.sin(theta),
                -math.sin(phi) * math.cos(theta),
                math.cos(phi),
            )
        )
        hit, n, _, _ = surf.tree.ray_cast(center + d * 0.27, -d, 0.54)
        assert hit is not None and hit.z > eye[2] - 0.15
        return hit + n * lift

    vs = []
    fs = []
    uv = []
    cols = 96
    rows = 28
    for j in range(rows):
        for i in range(cols):
            theta = math.tau * i / cols
            vs.append(point(theta, 0.003 + (end(theta) - 0.003) * j / (rows - 1)))
            uv.append((i / cols, j / (rows - 1)))
    for j in range(rows - 1):
        for i in range(cols):
            a = j * cols + i
            b = j * cols + (i + 1) % cols
            fs.append((a, b, b + cols, a + cols))
    mat = material(
        "Complete " + sex + " scalp",
        (0.025, 0.013, 0.009) if sex == "male" else (0.020, 0.008, 0.016),
        0.78,
    )
    create(
        "Complete scalp",
        vs,
        fs,
        mat,
        surf,
        weights=rigid(surf, vs, "head"),
        uv=uv,
        slot="hair",
        option=sex + "-hair",
    )
    rng = np.random.default_rng(903)
    pieces = []
    for i in range(430):
        theta = float(rng.uniform(-math.pi, math.pi))
        phi = float(rng.uniform(0.15, end(theta)))
        path = []
        for t in np.linspace(0, 1, 12):
            t = float(t)
            target = math.pi if theta > 0 else -math.pi
            angle = theta + (target - theta) * t * (0.44 if sex == "female" else 0.18)
            targetphi = 0.35 if sex == "female" else max(0.20, phi - 0.42)
            p = point(
                angle,
                phi * (1 - t) + targetphi * t,
                0.0035 + (0.004 if sex == "female" else 0.009) * math.sin(t * math.pi),
            )
            path.append(p)
        pieces.append(ribbon(path, float(rng.uniform(0.004, 0.008)), center))
    vs, fs, uv = join(pieces)
    mat = strand_mat(
        "Complete " + sex + " scalp strands",
        (0.030, 0.015, 0.009) if sex == "male" else (0.035, 0.010, 0.021),
    )
    create(
        "Complete scalp strands",
        vs,
        fs,
        mat,
        surf,
        weights=rigid(surf, vs, "head"),
        uv=uv,
        slot="hair",
        option=sex + "-hair",
    )


def rolled_sleeves(rig, body):
    scene = bpy.context.scene
    A.sample(scene, 31)
    surf = Surface(rig, body)
    coat = bpy.data.objects["Structured armhole jacket"]
    for m in coat.modifiers:
        if m.type != "ARMATURE":
            m.show_viewport = False
    A.update()
    positions = array(coat, True)
    weights = skin_weights(coat, surf.names)
    skin = np.einsum("vg,gij->vij", weights, surf.mats)
    moved = positions.copy()
    for side, sign in [("l", 1), ("r", -1)]:
        elbow = rig.pose.bones["lowerarm_" + side].head
        wrist = rig.pose.bones["lowerarm_" + side].tail
        axis = (wrist - elbow).normalized()
        length = (wrist - elbow).length
        for i, q in enumerate(positions):
            t = (Vector(q) - elbow).dot(axis) / length
            if q[0] * sign < elbow.x * sign - 0.025 or t < 0.12:
                continue
            f = float(smooth((t - 0.12) / 0.88))
            # Gather the original cuff and forearm sleeve by 11 cm.
            moved[i] -= np.array(axis) * 0.110 * f
            radial = Vector(q) - elbow - axis * ((Vector(q) - elbow).dot(axis))
            if radial.length > 1e-5:
                moved[i] += (
                    np.array(radial.normalized())
                    * 0.003
                    * math.sin(t * math.pi * 12)
                    * f
                )
    local = np.linalg.solve(skin[:, :3, :3], (moved - positions)[..., None])[:, :, 0]
    for key in coat.data.shape_keys.key_blocks:
        co = np.array([list(v.co) for v in key.data])
        key.data.foreach_set("co", (co + local).astype(np.float32).ravel())
    coat.data.vertices.foreach_set(
        "co", (array(coat) + local).astype(np.float32).ravel()
    )
    coat.data.update()
    # Move distal weights to their actual forearm attachment after gathering.
    newweights = surf.weights_at(moved)
    for i, q in enumerate(positions):
        if abs(q[0]) < 0.57:
            continue
        for group in coat.vertex_groups:
            group.remove([i])
        for j, n in enumerate(surf.names):
            if newweights[i, j] > 1e-7:
                group = coat.vertex_groups.get(n) or coat.vertex_groups.new(name=n)
                group.add([i], float(newweights[i, j]), "REPLACE")
    for m in coat.modifiers:
        m.show_viewport = True
    A.sample(scene, 1)


def run(sex):
    bpy.ops.wm.open_mainfile(
        filepath=str(
            OUT / ("male-look.blend" if sex == "male" else "female-complete.blend")
        )
    )
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    A.sample(scene, 1)
    scalp(Surface(rig, body), sex)
    if sex == "female":
        rolled_sleeves(rig, body)
    # Fabric highlights should support folds without reading as rubber.
    for name in [
        "Launch male black cargo fabric",
        "Launch male pocket fabric",
        "PLURR splattered nylon",
    ]:
        mat = bpy.data.materials.get(name)
        if mat:
            bs = mat.node_tree.nodes["Principled BSDF"]
            bs.inputs["Roughness"].default_value = 0.72
            bs.inputs["Specular IOR Level"].default_value = 0.22
    scene["completePairPhase"] = "complete appearance and runtime pass"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(
        filepath=str(OUT / f"{sex}-finished.blend"), compress=True
    )
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.04
    camera.location = (0.8, -4, 1.08)
    review.look_at(camera, Vector((0, 0, 0.91)))
    scene.view_settings.exposure = -0.8
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.filepath = str(OUT / f"{sex}-finished.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--sex", choices=["male", "female"], required=True)
    run(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]).sex)
