"""Fit the retained male facial study and correct the eye-surface construction.
Connection map: source head blends into the unchanged neck above the collar;
iris caps follow measured eyeballs with 0.15 mm outward clearance; hair follows
head correspondence. No cut is made between the body and head.
"""

import argparse, sys, json, math
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT, PACK, BodyWarp, array, material, review
from complete_pair_geometry import Surface, skin_weights, smooth, create


def replace_posed(ob, points, surf):
    w = skin_weights(ob, surf.names)
    world = surf.bind(np.asarray(points), w)
    local = (
        np.c_[world, np.ones(len(world))] @ np.linalg.inv(np.asarray(ob.matrix_world)).T
    )[:, :3]
    ob.data.vertices.foreach_set("co", local.astype(np.float32).ravel())
    ob.data.update()


def male_face(body, rig, surf):
    src = np.load(PACK / "male-face-source.npz")
    old = array(body, True)
    head = (old[:, 2] > rig.pose.bones["neck_01"].head.z + 0.055) & (old[:, 1] > -0.09)
    fit = np.linalg.lstsq(
        np.c_[src["AvatarBody"][head], np.ones(head.sum())], old[head], rcond=None
    )[0]

    def mapped(p):
        return np.c_[p, np.ones(len(p))] @ fit

    goal = mapped(src["AvatarBody"])
    amount = smooth((old[:, 2] - (rig.pose.bones["neck_01"].head.z + 0.043)) / 0.045)
    new = old + (goal - old) * amount[:, None]
    replace_posed(body, new, surf)
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.name in src.files and ob.name != "AvatarBody":
            replace_posed(ob, mapped(src[ob.name]), surf)
    warp = BodyWarp(old, new)
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.name.startswith(("Launch hair", "Launch earring")):
            replace_posed(ob, warp(array(ob, True)), surf)
    return {
        "head_max_displacement_mm": float(
            np.linalg.norm(new - old, axis=1).max() * 1000
        ),
        "neck_blend_start_m": rig.pose.bones["neck_01"].head.z + 0.043,
    }


def female_face(body, rig, surf):
    p = array(body, True)
    goal = p.copy()
    eye = np.mean(
        [
            array(bpy.data.objects["AvatarEye_" + s], True).mean(axis=0)
            for s in ["l", "r"]
        ],
        axis=0,
    )
    zeye = eye[2]
    # A restrained oval jaw and fuller mouth, judged again with the complete groom.
    front = smooth((-p[:, 1] + eye[1] + 0.004) / 0.028)
    jaw = np.exp(-0.5 * ((p[:, 2] - (zeye - 0.080)) / 0.035) ** 2) * front
    goal[:, 0] *= 1 - 0.055 * jaw
    lips = (
        np.exp(
            -0.5 * ((p[:, 0] / 0.023) ** 2 + ((p[:, 2] - (zeye - 0.066)) / 0.009) ** 2)
        )
        * front
    )
    goal[:, 1] -= 0.0013 * lips
    goal[:, 2] += 0.12 * (p[:, 2] - (zeye - 0.066)) * lips
    replace_posed(body, goal, surf)
    return {
        "head_max_displacement_mm": float(np.linalg.norm(goal - p, axis=1).max() * 1000)
    }


def eyes(surf, sex):
    texture_dir = OUT / "textures"
    texture_dir.mkdir(exist_ok=True)
    size = 512
    y, x = np.mgrid[0:size, 0:size]
    xx = (x + 0.5 - size / 2) / (size / 2)
    yy = (y + 0.5 - size / 2) / (size / 2)
    radius = np.sqrt(xx * xx + yy * yy)
    angle = np.arctan2(yy, xx)
    fiber = (
        0.50
        + 0.25 * np.sin(angle * 67 + radius * 18)
        + 0.15 * np.sin(angle * 131 - radius * 31)
        + 0.10 * np.cos(angle * 239 + radius * 60)
    )
    color = np.array([0.28, 0.16, 0.070] if sex == "male" else [0.24, 0.22, 0.095])
    rgb = color[None, None, :] * (0.55 + 0.65 * fiber[..., None])
    rim = 1 - 0.85 * np.exp(-(((radius - 0.97) / 0.055) ** 2))
    rgb *= rim[..., None]
    rgb = np.where((radius < 0.44)[..., None], np.array([0.008, 0.006, 0.004]), rgb)
    pixels = np.concatenate(
        [np.clip(rgb, 0, 1), np.ones((size, size, 1))], axis=-1
    ).astype(np.float32)
    img = bpy.data.images.new(
        sex + " natural iris", width=size, height=size, alpha=True
    )
    img.pixels.foreach_set(pixels.ravel())
    img.filepath_raw = str(texture_dir / (sex + "-iris.png"))
    img.file_format = "PNG"
    img.save()
    img.pack()
    mat = material("Launch " + sex + " iris", (0.04, 0.022, 0.01), 0.35)
    bs = mat.node_tree.nodes["Principled BSDF"]
    bs.inputs["Coat Weight"].default_value = 0.7
    bs.inputs["Coat Roughness"].default_value = 0.10
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    mat.node_tree.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
    for side in ["l", "r"]:
        eye = bpy.data.objects["AvatarEye_" + side]
        p = array(eye, True)
        center = (p.min(axis=0) + p.max(axis=0)) * 0.5
        oldiris = array(bpy.data.objects["AvatarIris_" + side], True).mean(axis=0)
        center[0] = oldiris[0]
        center[2] = oldiris[2]
        rad = (p.max(axis=0) - p.min(axis=0)) * 0.5
        iris_radius = min(rad[0], rad[2]) * 0.505
        eye_points, eye_faces = A.H.geometry(eye)
        eye_tree = BVHTree.FromPolygons(eye_points, eye_faces, all_triangles=True)

        def on_eye(x, z):
            hit, _, _, _ = eye_tree.ray_cast(
                Vector((float(x), -3, float(z))), Vector((0, 1, 0))
            )
            assert hit is not None
            return (x, hit.y - 0.00018, z)

        for prefix in ["AvatarIris_", "AvatarPupil_"]:
            ob = bpy.data.objects.get(prefix + side)
            if ob:
                bpy.data.objects.remove(ob, do_unlink=True)
        vs = [on_eye(center[0], center[2])]
        uv = [(0.5, 0.5)]
        fs = []
        segments = 64
        rings = 8
        for j in range(1, rings + 1):
            rr = iris_radius * j / rings
            for i in range(segments):
                a = i * math.tau / segments
                dx = rr * math.cos(a)
                dz = rr * math.sin(a)
                dy = (
                    -rad[1]
                    * math.sqrt(max(0.01, 1 - (dx / rad[0]) ** 2 - (dz / rad[2]) ** 2))
                    - 0.00015
                )
                vs.append(on_eye(center[0] + dx, center[2] + dz))
                uv.append((0.5 + 0.5 * dx / iris_radius, 0.5 + 0.5 * dz / iris_radius))
        for i in range(segments):
            fs.append((0, 1 + i, 1 + (i + 1) % segments))
        for j in range(rings - 1):
            for i in range(segments):
                a = 1 + j * segments + i
                b = 1 + j * segments + (i + 1) % segments
                fs.append((a, a + segments, b + segments, b))
        w = np.zeros((len(vs), len(surf.names)))
        w[:, surf.names.index("eye_" + side)] = 1
        ob = create("AvatarIris_" + side, vs, fs, mat, surf, weights=w, uv=uv)
        ob["avatarAssetKind"] = "body"
        white = eye.data.materials[0].copy()
        eye.data.materials[0] = white
        bs = white.node_tree.nodes["Principled BSDF"]
        bs.inputs["Base Color"].default_value = (0.40, 0.365, 0.32, 1)
        bs.inputs["Roughness"].default_value = 0.23


def complexion(body, sex, surf):
    mat = body.data.materials[0].copy()
    mat.name = "Launch " + sex + " skin"
    body.data.materials[0] = mat
    tree = mat.node_tree
    bs = tree.nodes["Principled BSDF"]
    source = bs.inputs["Base Color"].links[0].from_socket
    mix = tree.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1
    mix.inputs[2].default_value = (
        (0.84, 0.76, 0.67, 1) if sex == "male" else (0.64, 0.49, 0.39, 1)
    )
    tree.links.new(source, mix.inputs[1])
    tree.links.new(mix.outputs[0], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = 0.51
    bs.inputs["Specular IOR Level"].default_value = 0.28
    bs.inputs["Subsurface Weight"].default_value = 0.045
    bs.inputs["Subsurface Scale"].default_value = 0.010
    if sex == "female":
        p = array(body, True)
        eye = array(bpy.data.objects["AvatarEye_l"], True).mean(axis=0)
        z = eye[2]
        front = smooth((-p[:, 1] + eye[1] + 0.008) / 0.025)
        lip = (
            np.exp(
                -0.5
                * ((p[:, 0] / 0.021) ** 4 + ((p[:, 2] - (z - 0.066)) / 0.0050) ** 4)
            )
            * front
        )
        blush = (
            np.exp(
                -0.5
                * (
                    ((abs(p[:, 0]) - 0.045) / 0.015) ** 2
                    + ((p[:, 2] - (z - 0.027)) / 0.017) ** 2
                )
            )
            * front
        )
        shadow = (
            np.exp(
                -0.5
                * (
                    ((abs(p[:, 0]) - 0.028) / 0.018) ** 2
                    + ((p[:, 2] - (z + 0.011)) / 0.006) ** 2
                )
            )
            * front
        )
        colors = np.zeros((len(p), 4))
        colors[:, :3] = (0.34, 0.10, 0.064)
        colors[:, 3] = np.minimum(0.75, 0.75 * lip + 0.14 * blush + 0.32 * shadow)
        colors[shadow > lip, :3] = (0.060, 0.022, 0.018)
        lip_group = body.vertex_groups["lips"].index
        for v in body.data.vertices:
            if any(g.group == lip_group and g.weight > 0.1 for g in v.groups):
                colors[v.index] = (0.30, 0.075, 0.055, 0.50)
        a = body.data.color_attributes.new(
            name="Launch cosmetics", type="FLOAT_COLOR", domain="POINT"
        )
        a.data.foreach_set("color", colors.astype(np.float32).ravel())
        attr = tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = a.name
        over = tree.nodes.new("ShaderNodeMixRGB")
        tree.links.new(attr.outputs["Alpha"], over.inputs[0])
        tree.links.new(mix.outputs[0], over.inputs[1])
        tree.links.new(attr.outputs["Color"], over.inputs[2])
        tree.links.new(over.outputs[0], bs.inputs["Base Color"])
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.name.startswith("Launch hair"):
            for m in ob.data.materials:
                if m and m.use_nodes:
                    b = m.node_tree.nodes.get("Principled BSDF")
                    if b:
                        b.inputs["Roughness"].default_value = 0.68
                        b.inputs["Specular IOR Level"].default_value = 0.12


def run(sex):
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{sex}-silhouette.blend"))
    s = bpy.context.scene
    r = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    A.sample(s, 1)
    surf = Surface(r, body)
    record = male_face(body, r, surf) if sex == "male" else female_face(body, r, surf)
    A.update()
    surf = Surface(r, body)
    eyes(surf, sex)
    complexion(body, sex, surf)
    A.update()
    bpy.context.preferences.filepaths.save_version = 0
    s["completePairPhase"] = "face and ocular surface pass"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{sex}-face.blend"), compress=True)
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.34
    z = r.pose.bones["head"].head.z + 0.025
    camera.location = (0, -3, z)
    review.look_at(camera, Vector((0, -0.01, z)))
    s.view_settings.exposure = -0.8
    s.render.resolution_x = s.render.resolution_y = 700
    s.render.filepath = str(OUT / f"{sex}-face.png")
    bpy.ops.render.render(write_still=True)
    (OUT / f"{sex}-face.json").write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--sex", choices=["male", "female"], required=True)
    run(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]).sex)
