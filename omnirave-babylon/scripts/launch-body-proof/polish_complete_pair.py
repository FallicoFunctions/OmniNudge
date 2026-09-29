"""Refine the complete pair against the original artwork, preserving v1 sources.
Connection map: facial edits blend into the unchanged neck; swept hair roots
remain covered by the measured scalp; flyaways start within the groom; cloth
folds move the existing connected shell and every corrective by the same delta.
"""

import argparse, math, sys, json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT, array, review
from complete_pair_geometry import Surface, skin_weights, smooth, create, join
from refine_launch_faces import replace_posed
from add_launch_reference_details import rigid, ribbon, strand_mat


def set_socket(bs, name, value):
    for link in list(bs.inputs[name].links):
        bs.id_data.links.remove(link)
    bs.inputs[name].default_value = value


def add_bump(mat, scale, distance, strength=0.55):
    tree = mat.node_tree
    bs = tree.nodes.get("Principled BSDF")
    if not bs:
        return
    coords = tree.nodes.new("ShaderNodeTexCoord")
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 2.2
    noise.inputs["Roughness"].default_value = 0.62
    tree.links.new(coords.outputs["Object"], noise.inputs["Vector"])
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    if bs.inputs["Normal"].is_linked:
        tree.links.new(bs.inputs["Normal"].links[0].from_socket, bump.inputs["Normal"])
    tree.links.new(bump.outputs["Normal"], bs.inputs["Normal"])
    mat["launchBakeNormal"] = True


def face(surf, sex):
    ob = surf.body
    p = array(ob, True)
    q = p.copy()
    eye = np.mean(
        [
            array(bpy.data.objects["AvatarEye_" + side], True).mean(0)
            for side in ["l", "r"]
        ],
        0,
    )
    x = p[:, 0]
    z = p[:, 2] - eye[2]
    front = smooth((-p[:, 1] + eye[1] + 0.03) / 0.035)

    def g(zc, zw, xc, xw):
        return (
            np.exp(-0.5 * ((z - zc) / zw) ** 2 - 0.5 * ((abs(x) - xc) / xw) ** 2)
            * front
        )

    cheek = g(-0.027, 0.013, 0.047, 0.016)
    hollow = g(-0.054, 0.014, 0.043, 0.017)
    jaw = g(-0.085, 0.014, 0.043, 0.018)
    q[:, 0] += np.sign(x) * (
        0.0028 * cheek - 0.0022 * hollow + (0.0024 if sex == "male" else -0.001) * jaw
    )
    q[:, 1] -= 0.0018 * cheek
    lipgroup = ob.vertex_groups["lips"].index
    ids = [
        v.index
        for v in ob.data.vertices
        if any(g.group == lipgroup and g.weight > 0.1 for g in v.groups)
    ]
    lipcenter = p[ids].mean(0)
    lipregion = (
        np.exp(-0.5 * ((p[:, 2] - lipcenter[2]) / 0.012) ** 2 - 0.5 * (x / 0.027) ** 4)
        * front
    )
    if sex == "male":
        q[:, 2] -= (p[:, 2] - lipcenter[2]) * 0.20 * lipregion
        q[:, 0] -= x * 0.055 * lipregion
        q[:, 1] -= 0.0017 * g(-0.10, 0.013, 0, 0.024)
    else:
        q[:, 1] -= 0.0009 * lipregion
    replace_posed(ob, q, surf)
    mat = ob.data.materials[0]
    tree = mat.node_tree
    bs = tree.nodes["Principled BSDF"]
    # Semantic lip membership gives a crisp boundary independent of head scaling.
    colors = np.zeros((len(p), 4), np.float32)
    colors[:, :3] = (0.24, 0.07, 0.055) if sex == "male" else (0.25, 0.042, 0.027)
    colors[ids, 3] = 0.28 if sex == "male" else 0.45
    layer = ob.data.color_attributes.new(
        name="Polished lips", type="FLOAT_COLOR", domain="POINT"
    )
    layer.data.foreach_set("color", colors.ravel())
    attr = tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = layer.name
    mix = tree.nodes.new("ShaderNodeMixRGB")
    tree.links.new(bs.inputs["Base Color"].links[0].from_socket, mix.inputs[1])
    tree.links.new(attr.outputs["Alpha"], mix.inputs[0])
    tree.links.new(attr.outputs["Color"], mix.inputs[2])
    tree.links.new(mix.outputs[0], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = 0.43
    bs.inputs["Specular IOR Level"].default_value = 0.34
    add_bump(mat, 1350, 0.00009, 0.3)
    return {"maximumHeadEditMm": float(np.linalg.norm(q - p, axis=1).max() * 1000)}


def rooted_hairline(surf, sex, center):
    rng = np.random.default_rng(922)
    pieces = []
    for k in range(950):
        theta = float(rng.uniform(-math.pi, math.pi))
        end = (
            1.18
            + 1.02 * ((1 - math.cos(theta)) * 0.5) ** 0.8
            + 0.06 * math.sin(theta * 3) ** 2
        )
        phi0 = end - float(rng.uniform(0, 0.35))
        path = []
        for t in np.linspace(0, 1, 12):
            theta_t = theta + (0.28 if sex == "male" else 0.48) * t * (
                1 if theta > 0 else -1
            )
            phi = phi0 - 0.52 * t
            d = Vector(
                (
                    math.sin(phi) * math.sin(theta_t),
                    -math.sin(phi) * math.cos(theta_t),
                    math.cos(phi),
                )
            )
            hit, n, _, _ = surf.tree.ray_cast(center + d * 0.27, -d, 0.54)
            if hit is None:
                continue
            path.append(
                hit
                + n
                * (0.0028 + (0.010 if sex == "male" else 0.003) * math.sin(math.pi * t))
            )
        if len(path) > 2:
            pieces.append(ribbon(path, float(rng.uniform(0.0015, 0.003)), center))
    v, f, u = join(pieces)
    mat = strand_mat(
        f"Polished {sex} hair strands roots",
        (0.024, 0.012, 0.006) if sex == "male" else (0.025, 0.009, 0.018),
    )
    create(
        f"Polished {sex} rooted hairline",
        v,
        f,
        mat,
        surf,
        weights=rigid(surf, v, "head"),
        uv=u,
        slot="hair",
    )


def paint_mapping(surf):
    for name in ["AvatarBottoms_cargo-pants", "Launch fitted crop top"]:
        ob = bpy.data.objects[name]
        mods = [(m, m.show_viewport) for m in ob.modifiers if m.type != "ARMATURE"]
        for m, _ in mods:
            m.show_viewport = False
        A.update()
        p = array(ob, True)
        layer = ob.data.uv_layers.active
        if layer is None:
            layer = ob.data.uv_layers.new(name="PaintSurfaceUV")
        for face in ob.data.polygons:
            points = p[list(face.vertices)]
            side = "l" if points[:, 0].mean() > 0 else "r"
            center = (
                np.array(surf.rig.pose.bones["thigh_" + side].head)
                if "Bottoms" in name
                else np.array([0, -0.025, 0])
            )
            values = []
            for index in face.vertices:
                q = p[index]
                angle = (
                    math.atan2(q[0] - center[0], -(q[1] - center[1])) / math.tau + 0.5
                )
                values.append(angle)
            if max(values) - min(values) > 0.5:
                values = [a + 1 if a < 0.5 else a for a in values]
            for li, index, u in zip(face.loop_indices, face.vertices, values):
                v = (p[index, 2] - p[:, 2].min()) / max(0.01, np.ptp(p[:, 2]))
                layer.data[li].uv = (
                    (u * 0.5 + (0 if side == "l" else 0.5), v)
                    if "Bottoms" in name
                    else (u, v)
                )
        for m, enabled in mods:
            m.show_viewport = enabled
    size = 2048
    rng = np.random.default_rng(9073)
    pixels = np.zeros((size, size, 4), np.float32)
    pixels[:, :, :3] = (0.010, 0.010, 0.015)
    pixels[:, :, 3] = 1
    palette = [
        (0.8, 0.003, 0.19),
        (0.38, 0.8, 0.006),
        (0.018, 0.19, 0.64),
        (0.31, 0.01, 0.48),
    ]
    for cluster in range(40):
        cx = (0.25 if cluster < 25 else 0.75) + rng.normal(0, 0.07)
        cy = rng.uniform(0.16, 0.90)
        spread = rng.uniform(0.018, 0.075) * size
        color = np.array(palette[cluster % 4])
        for dot in range(320):
            x, y = np.array([cx, cy]) * size + rng.normal(0, spread, 2)
            radius = float(rng.uniform(0.6, 3.2))
            x0 = max(0, int(x - radius - 1))
            x1 = min(size, int(x + radius + 2))
            y0 = max(0, int(y - radius - 1))
            y1 = min(size, int(y + radius + 2))
            if x1 <= x0 or y1 <= y0:
                continue
            yy, xx = np.mgrid[y0:y1, x0:x1]
            a = np.clip(radius + 0.5 - np.hypot(xx - x, yy - y), 0, 1)
            pixels[y0:y1, x0:x1, :3] = (
                pixels[y0:y1, x0:x1, :3] * (1 - a[..., None]) + color * a[..., None]
            )
    img = bpy.data.images.new("Polished fine paint splatter", size, size, alpha=True)
    img.pixels.foreach_set(pixels.ravel())
    img.filepath_raw = str(OUT / "textures/polished-splatter.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    mat = bpy.data.materials["PLURR splattered nylon"]
    bs = mat.node_tree.nodes["Principled BSDF"]
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    mat.node_tree.links.new(tex.outputs["Color"], bs.inputs["Base Color"])


def groom(surf, sex):
    eye = np.mean(
        [
            array(bpy.data.objects["AvatarEye_" + side], True).mean(0)
            for side in ["l", "r"]
        ],
        0,
    )
    top = surf.array[:, 2].max()
    center = Vector((0, -0.028, eye[2] + 0.04))
    rng = np.random.default_rng(2609)
    rooted_hairline(surf, sex, center)
    if sex == "male":
        ob = bpy.data.objects["Luxury retained swept groom"]
        p = array(ob, True)
        q = p.copy()
        # Trim each front strand along its own curve, preserving rooted volume.
        # A point-wise lift creates a uniform fringe; varied curve lengths do not.
        for offset in range(0, len(p), 24):
            strand = p[offset:offset + 24].reshape(12, 2, 3)
            tip = strand[-1].mean(0)
            if tip[1] < -0.075 and tip[2] < eye[2] + 0.055:
                fraction = float(rng.uniform(0.56, 0.83))
                samples = np.linspace(0, 11 * fraction, 12)
                trimmed = np.empty_like(strand)
                for side in range(2):
                    for axis in range(3):
                        trimmed[:, side, axis] = np.interp(samples, np.arange(12), strand[:, side, axis])
                t = np.linspace(0, 1, 12)
                trimmed[:, :, 2] += (0.009 * np.sin(t * math.pi))[:, None]
                trimmed[:, :, 0] -= (0.009 * t ** 2)[:, None]
                q[offset:offset + 24] = trimmed.reshape(24, 3)
        sides = smooth((abs(p[:, 0]) - 0.055) / 0.04) * smooth(
            (eye[2] + 0.08 - p[:, 2]) / 0.10
        )
        q[:, 0] *= 1 - 0.14 * sides
        replace_posed(ob, q, surf)
        for i, mat in enumerate(ob.data.materials):
            bs = mat.node_tree.nodes["Principled BSDF"]
            bs.inputs["Base Color"].default_value = [
                (0.022, 0.012, 0.006, 1),
                (0.032, 0.018, 0.009, 1),
                (0.052, 0.029, 0.014, 1),
                (0.09, 0.05, 0.021, 1),
                (0.030, 0.015, 0.006, 1),
            ][i]
            bs.inputs["Roughness"].default_value = 0.46
            bs.inputs["Specular IOR Level"].default_value = 0.30
        # Short fine curls break the crown silhouette without covering the eyes.
        starts = q[(q[:, 2] > top - 0.025) & (q[:, 1] < 0.03)][::20]
        pieces = []
        for k in range(min(180, len(starts))):
            start = starts[k]
            phase = float(rng.uniform(0, math.tau))
            path = []
            for t in np.linspace(0, 1, 10):
                p0 = start + np.array(
                    [-0.014 * t, 0.025 * t, 0.015 * math.sin(math.pi * t) - 0.009 * t]
                )
                p0[0] += 0.003 * math.sin(phase + t * 5) * math.sin(math.pi * t)
                path.append(p0)
            pieces.append(ribbon(path, float(rng.uniform(0.0008, 0.0016)), center))
        palette = [(0.09, 0.05, 0.021)]
    else:
        for ob in list(bpy.data.objects):
            if ob.type != "MESH" or not (
                ob.name.startswith("PLURR pony strands")
                or ob.name == "PLURR gathered pony bundle"
            ):
                continue
            p = array(ob, True)
            q = p.copy()
            back = smooth((p[:, 1] - 0.015) / 0.07)
            q[:, 0] += (p[:, 0] + 0.012) * 0.37 * back
            q[:, 1] -= 0.015 * back * smooth((top - 0.04 - p[:, 2]) / 0.22)
            replace_posed(ob, q, surf)
            for mat in ob.data.materials:
                bs = mat.node_tree.nodes.get("Principled BSDF")
                if not bs:
                    continue
                name = mat.name
                if name.endswith("1"):
                    bs.inputs["Base Color"].default_value = (0.80, 0.007, 0.26, 1)
                elif name.endswith("2"):
                    bs.inputs["Base Color"].default_value = (0.17, 0.012, 0.44, 1)
                elif name.endswith("3"):
                    bs.inputs["Base Color"].default_value = (0.40, 0.70, 0.018, 1)
                elif "underlayer" in name:
                    bs.inputs["Base Color"].default_value = (0.23, 0.006, 0.08, 1)
                bs.inputs["Roughness"].default_value = 0.48
        pieces = []
        root = Vector((-0.012, 0.036, top + 0.013))
        for k in range(180):
            phase = float(rng.uniform(0, math.tau))
            offset = Vector(
                (rng.normal(0, 0.018), rng.normal(0, 0.012), rng.normal(0, 0.012))
            )
            p0 = root + offset
            p1 = root + Vector((-0.13, 0.035, 0.11)) + offset
            p2 = root + Vector((-0.22, 0.06, -0.17)) + offset
            p3 = root + Vector(
                (
                    rng.uniform(-0.19, -0.06),
                    rng.uniform(0.06, 0.15),
                    rng.uniform(-0.36, -0.20),
                )
            )
            path = []
            for t in np.linspace(0, 1, 20):
                q = (
                    p0 * (1 - t) ** 3
                    + 3 * p1 * (1 - t) ** 2 * t
                    + 3 * p2 * (1 - t) * t * t
                    + p3 * t**3
                )
                q.x += 0.009 * math.sin(t * 13 + phase) * math.sin(math.pi * t)
                path.append(q)
            pieces.append(ribbon(path, float(rng.uniform(0.001, 0.003)), center))
        palette = [(0.8, 0.008, 0.26)]
    if pieces:
        v, f, u = join(pieces)
        mat = strand_mat(f"Polished {sex} fine hair", palette[0])
        create(
            f"Polished {sex} flyaways",
            v,
            f,
            mat,
            surf,
            weights=rigid(surf, v, "head"),
            uv=u,
            slot="hair",
        )


def cloth(surf, sex):
    for name in ["AvatarBottoms_cargo-pants", "Structured armhole jacket"]:
        ob = bpy.data.objects[name]
        disabled = []
        for mod in ob.modifiers:
            if mod.type != "ARMATURE":
                disabled.append((mod, mod.show_viewport))
                mod.show_viewport = False
        A.update()
        p = array(ob, True)
        q = p.copy()
        if name.startswith("Structured"):
            for i, a in enumerate(p):
                side = "l" if a[0] >= 0 else "r"
                elbow = surf.rig.pose.bones["lowerarm_" + side].head
                sleeve = smooth((abs(a[0]) - 0.135) / 0.055) * smooth(
                    (1.48 - a[2]) / 0.13
                )
                center = np.array(elbow)
                angle = math.atan2(a[1] - center[1], a[0] - center[0])
                fold = (
                    0.0035
                    * math.sin(a[2] * 105 + angle * 2 + math.sin(a[2] * 29))
                    * sleeve
                )
                n = Vector((a[0] - center[0], a[1] - center[1], 0))
                if n.length > 1e-5:
                    q[i] += np.array(n.normalized()) * fold
        else:
            for i, a in enumerate(p):
                side = "l" if a[0] >= 0 else "r"
                c = np.array(surf.rig.pose.bones["thigh_" + side].head)
                radial = a[:2] - c[:2]
                length = np.linalg.norm(radial)
                if length < 0.01:
                    continue
                angle = math.atan2(radial[1], radial[0])
                mask = smooth((0.9 - a[2]) / 0.15) * smooth((a[2] - 0.17) / 0.09)
                q[i, :2] += (
                    radial
                    / length
                    * (
                        0.0038
                        * math.sin(a[2] * 115 + angle * 2 + math.sin(angle * 3))
                        * mask
                    )
                )
        w = skin_weights(ob, surf.names)
        delta = surf.bind(q, w) - surf.bind(p, w)
        if ob.data.shape_keys:
            for key in ob.data.shape_keys.key_blocks:
                co = np.array([v.co[:] for v in key.data])
                key.data.foreach_set("co", (co + delta).astype(np.float32).ravel())
        ob.data.vertices.foreach_set(
            "co", (array(ob) + delta).astype(np.float32).ravel()
        )
        ob.data.update()
        for mod, enabled in disabled:
            mod.show_viewport = enabled
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bs = mat.node_tree.nodes.get("Principled BSDF")
        if not bs:
            continue
        name = mat.name.lower()
        if "tailored pearl bomber" in name:
            set_socket(bs, "Roughness", 0.24)
            add_bump(mat, 56, 0.0009, 0.55)
        elif "iridescent foil" in name:
            set_socket(bs, "Roughness", 0.21)
            add_bump(mat, 62, 0.0009, 0.55)
        elif any(
            s in name
            for s in ["black cargo fabric", "pocket fabric", "splattered nylon"]
        ):
            set_socket(bs, "Roughness", 0.38 if sex == "male" else 0.43)
            bs.inputs["Specular IOR Level"].default_value = 0.32
            add_bump(mat, 90, 0.00045, 0.45)
        elif name.startswith("tailored black shirt") or "crop stretch" in name:
            set_socket(bs, "Roughness", 0.36)
            add_bump(mat, 125, 0.0003, 0.40)


def correct_attachment_weights(surf):
    report = {}
    for ob in list(bpy.data.objects):
        if ob.type != "MESH":
            continue
        lower = ob.get("avatarSlot") == "bottoms" or ob.name.startswith(
            ("Launch hanging strap", "Launch hip chain", "PLURR glowstick")
        )
        upper = ob.name.startswith(
            ("Launch necklace", "Launch crop strap")
        ) or ob.name in ["AvatarTop_tailored", "Launch fitted crop top"]
        if not lower and not upper:
            continue
        disabled = [(m, m.show_viewport) for m in ob.modifiers if m.type != "ARMATURE"]
        for m, _ in disabled:
            m.show_viewport = False
        A.update()
        p = array(ob, True)
        old = skin_weights(ob, surf.names)
        new = old.copy()
        allowed = (
            [
                "Root",
                "pelvis",
                "spine_01",
                "thigh_l",
                "thigh_r",
                "calf_l",
                "calf_r",
                "foot_l",
                "foot_r",
                "ball_l",
                "ball_r",
            ]
            if lower
            else [
                "Root",
                "pelvis",
                "spine_01",
                "spine_02",
                "spine_03",
                "neck_01",
                "clavicle_l",
                "clavicle_r",
            ]
        )
        for j, name in enumerate(surf.names):
            if name not in allowed:
                new[:, j] = 0
        missing = new.sum(1) < 1e-6
        for i in np.flatnonzero(missing):
            new[
                i,
                surf.names.index(
                    ("thigh_l" if p[i, 0] > 0 else "thigh_r") if lower else "spine_03"
                ),
            ] = 1
        new /= new.sum(1)[:, None]
        count = int(np.sum(np.max(abs(new - old), axis=1) > 1e-6))
        if count:
            oldskin = np.einsum("vg,gij->vij", old, surf.mats)
            newskin = np.einsum("vg,gij->vij", new, surf.mats)
            conversion = np.linalg.solve(newskin, oldskin)
            if ob.data.shape_keys:
                for key in ob.data.shape_keys.key_blocks:
                    points = np.array([v.co[:] for v in key.data])
                    co = np.einsum(
                        "vij,vj->vi", conversion, np.c_[points, np.ones(len(points))]
                    )[:, :3]
                    key.data.foreach_set("co", co.astype(np.float32).ravel())
            raw = array(ob)
            co = np.einsum("vij,vj->vi", conversion, np.c_[raw, np.ones(len(raw))])[
                :, :3
            ]
            ob.data.vertices.foreach_set("co", co.astype(np.float32).ravel())
            ob.data.update()
            for name in surf.names:
                group = ob.vertex_groups.get(name)
                if group:
                    ob.vertex_groups.remove(group)
            for j, name in enumerate(surf.names):
                ids = np.flatnonzero(new[:, j] > 1e-7)
                if len(ids):
                    group = ob.vertex_groups.new(name=name)
                    for i in ids:
                        group.add([int(i)], float(new[i, j]), "REPLACE")
            report[ob.name] = count
        for m, enabled in disabled:
            m.show_viewport = enabled
    return report


def run(sex):
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{sex}-finished.blend"))
    s = bpy.context.scene
    r = bpy.data.objects["AvatarSkeleton"]
    A.sample(s, 1)
    surf = Surface(r, bpy.data.objects["AvatarBody"])
    report = face(surf, sex)
    A.update()
    surf = Surface(r, surf.body)
    groom(surf, sex)
    if sex == "female":
        paint_mapping(surf)
    cloth(surf, sex)
    report["attachmentWeightsCorrected"] = correct_attachment_weights(surf)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(
        filepath=str(OUT / f"{sex}-polished.blend"), compress=True
    )
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.43
    eye = array(bpy.data.objects["AvatarEye_l"], True).mean(0)
    camera.location = (0.5, -4, eye[2])
    review.look_at(camera, Vector((0, -0.025, eye[2] + 0.005)))
    s.view_settings.exposure = -0.8
    s.render.resolution_x = 800
    s.render.resolution_y = 900
    s.render.filepath = str(OUT / f"{sex}-polished-face.png")
    bpy.ops.render.render(write_still=True)
    camera.data.ortho_scale = 2.04
    camera.location = (0.8, -4, 1.08)
    review.look_at(camera, Vector((0, 0, 0.91)))
    s.render.resolution_x = 900
    s.render.resolution_y = 1100
    s.render.filepath = str(OUT / f"{sex}-polished.png")
    bpy.ops.render.render(write_still=True)
    (OUT / f"{sex}-polished.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sex", choices=["male", "female"], required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]).sex)
