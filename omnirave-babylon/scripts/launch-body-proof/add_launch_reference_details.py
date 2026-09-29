"""Add the reference-defining groom, glasses, jewelry, paint and straps.
Connection map: scalp/card roots overlap by millimeters; pony bundle gathers at
its root; glasses stand off the measured forehead; necklaces and bracelets sit
outside measured skin; belt chains/straps start on the fitted cargo surface.
"""

import argparse, sys, math, json
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT, ASSETS, array, material, review
from complete_pair_geometry import Surface, create, tube, join, smooth


def rigid(surf, points, bone):
    w = np.zeros((len(points), len(surf.names)))
    w[:, surf.names.index(bone)] = 1
    return w


def strand_mat(name, color):
    mat = material(name, color, 0.62)
    bs = mat.node_tree.nodes["Principled BSDF"]
    bs.inputs["Specular IOR Level"].default_value = 0.20
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(
        str(ASSETS / "astra-male-proof/hair-strands.png"), check_existing=True
    )
    tex.image.pack()
    mat.node_tree.links.new(tex.outputs["Alpha"], bs.inputs["Alpha"])
    mat.surface_render_method = "DITHERED"
    return mat


def ribbon(path, width, center):
    path = np.asarray(path)
    vs = []
    uv = []
    fs = []
    for j, p in enumerate(path):
        t = j / (len(path) - 1)
        tangent = Vector(
            path[min(j + 1, len(path) - 1)] - path[max(0, j - 1)]
        ).normalized()
        normal = (Vector(p) - Vector(center)).normalized()
        across = tangent.cross(normal).normalized()
        if across.length < 0.1:
            across = Vector((1, 0, 0))
        for sign, u in [(-1, 0), (1, 1)]:
            vs.append(Vector(p) + sign * width * 0.5 * (1 - 0.92 * t**4) * across)
            uv.append((u, t))
    for j in range(len(path) - 1):
        a = j * 2
        fs.append((a, a + 1, a + 3, a + 2))
    return vs, fs, uv


def female_hair(surf):
    for ob in list(bpy.data.objects):
        if ob.name.startswith("AvatarHair_"):
            bpy.data.objects.remove(ob, do_unlink=True)
    eye = array(bpy.data.objects["AvatarEye_l"], True).mean(axis=0)
    top = surf.array[:, 2].max()
    center = Vector((0, -0.032, eye[2] + 0.039))
    rng = np.random.default_rng(606)
    rootmat = material("PLURR scalp roots", (0.018, 0.009, 0.013), 0.75)

    def scalp(theta, phi, lift=0.001):
        n = Vector(
            (
                math.sin(phi) * math.sin(theta),
                -math.sin(phi) * math.cos(theta),
                math.cos(phi),
            )
        )
        hit, normal, _, _ = surf.tree.ray_cast(center + n * 0.26, -n, 0.52)
        assert hit is not None and hit.z > eye[2] - 0.10
        return hit + normal * lift

    vs = []
    fs = []
    uv = []
    cols = 80
    rows = 25
    for j in range(rows):
        for i in range(cols):
            th = i * math.tau / cols
            end = 1.50 + 0.68 * ((1 - math.cos(th)) * 0.5) ** 0.75
            phi = 0.001 + (end - 0.001) * j / (rows - 1)
            vs.append(scalp(th, phi, 0.0008))
            uv.append((i / cols, j / (rows - 1)))
    for j in range(rows - 1):
        for i in range(cols):
            a = j * cols + i
            fs.append(
                (
                    a,
                    j * cols + (i + 1) % cols,
                    (j + 1) * cols + (i + 1) % cols,
                    a + cols,
                )
            )
    create(
        "PLURR scalp",
        vs,
        fs,
        rootmat,
        surf,
        weights=rigid(surf, vs, "head"),
        uv=uv,
        slot="hair",
        option="plurr-pony",
    )
    palette = [
        (0.026, 0.012, 0.017),
        (0.46, 0.006, 0.14),
        (0.10, 0.01, 0.29),
        (0.22, 0.43, 0.012),
    ]
    mats = [
        strand_mat("PLURR hair strands " + str(i), c) for i, c in enumerate(palette)
    ]
    parts = [[] for _ in palette]
    for i in range(210):
        th = float(rng.uniform(-math.pi, math.pi))
        end = 1.50 + 0.68 * ((1 - math.cos(th)) * 0.5) ** 0.75
        phi = float(rng.uniform(0.25, end))
        target = math.pi if th > 0 else -math.pi
        path = []
        for t in np.linspace(0, 1, 13):
            path.append(
                scalp(
                    th + (target - th) * t * 0.65,
                    phi * (1 - t) + 0.40 * t,
                    0.0015 + 0.0025 * math.sin(math.pi * t),
                )
            )
        parts[0 if i % 19 else 2].append(
            ribbon(path, float(rng.uniform(0.006, 0.011)), center)
        )
    root = Vector((-0.012, 0.036, top + 0.013))
    # A gathered inner bundle supports the strand silhouette throughout its length.
    bundle = []
    bundle_faces = []
    bundle_uv = []
    for j, t in enumerate(np.linspace(0, 1, 24)):
        t = float(t)
        p0 = root
        p1 = root + Vector((-0.08, 0.04, 0.085))
        p2 = root + Vector((-0.13, 0.12, -0.16))
        p3 = root + Vector((-0.08, 0.13, -0.34))
        c = (
            p0 * (1 - t) ** 3
            + p1 * 3 * (1 - t) ** 2 * t
            + p2 * 3 * (1 - t) * t * t
            + p3 * t**3
        )
        radius = (0.014 + 0.016 * math.sin(math.pi * t) ** 0.6) * (1 - 0.85 * t**4)
        tangent = (
            3 * (p1 - p0) * (1 - t) ** 2
            + 6 * (p2 - p1) * (1 - t) * t
            + 3 * (p3 - p2) * t * t
        ).normalized()
        across = tangent.cross(Vector((0, 0, 1))).normalized()
        up = across.cross(tangent).normalized()
        for i in range(16):
            a = i * math.tau / 16
            bundle.append(c + radius * (across * math.cos(a) + up * math.sin(a)))
            bundle_uv.append((i / 16, t))
    for j in range(23):
        for i in range(16):
            a = j * 16 + i
            bundle_faces.append(
                (a, j * 16 + (i + 1) % 16, (j + 1) * 16 + (i + 1) % 16, a + 16)
            )
    bundlemat = material("PLURR pony underlayer", (0.10, 0.004, 0.045), 0.68)
    create(
        "PLURR gathered pony bundle",
        bundle,
        bundle_faces,
        bundlemat,
        surf,
        weights=rigid(surf, bundle, "head"),
        uv=bundle_uv,
        slot="hair",
        option="plurr-pony",
    )
    for i in range(290):
        offset = Vector(
            (rng.normal(0, 0.013), rng.normal(0, 0.009), rng.normal(0, 0.006))
        )
        p0 = root + offset
        p1 = root + Vector((-0.08, 0.04, 0.085)) + offset
        p2 = root + Vector((-0.13, 0.12, -0.16)) + offset * 1.8
        p3 = root + Vector(
            (
                rng.uniform(-0.115, -0.045),
                rng.uniform(0.10, 0.145),
                rng.uniform(-0.39, -0.27),
            )
        )
        path = []
        phase = rng.uniform(0, math.tau)
        for t in np.linspace(0, 1, 18):
            p = (
                p0 * (1 - t) ** 3
                + p1 * 3 * (1 - t) ** 2 * t
                + p2 * 3 * (1 - t) * t * t
                + p3 * t**3
            )
            p.x += 0.005 * math.sin(t * 15 + phase) * math.sin(math.pi * t)
            path.append(p)
        shade = int(rng.choice([0, 1, 2, 3], p=[0.25, 0.52, 0.19, 0.04]))
        parts[shade].append(ribbon(path, float(rng.uniform(0.006, 0.013)), center))
    # Face-framing loose strands stay outside the eye centers.
    for sign in [-1, 1]:
        for k in range(18):
            z0 = top - 0.024
            zs = np.linspace(z0, eye[2] - 0.075 - rng.uniform(0, 0.025), 17)
            path = []
            for j, z in enumerate(zs):
                t = j / 16
                x = sign * (0.014 + 0.042 * math.sin(t * 2.2) + 0.001 * k)
                hit = surf.ray(x, z, 0.006)
                if hit is None:
                    hit = Vector((x, eye[1] - 0.026, z))
                hit.y -= 0.004 * math.sin(t * math.pi)
                path.append(hit)
            parts[0 if k < 13 else 2].append(ribbon(path, 0.0022, center))
    for i, items in enumerate(parts):
        v, f, u = join(items)
        create(
            "PLURR pony strands " + str(i),
            v,
            f,
            mats[i],
            surf,
            weights=rigid(surf, v, "head"),
            uv=u,
            slot="hair",
            option="plurr-pony",
        )
    return eye, top


def goggles(surf, eye):
    z = eye[2] + 0.086
    anchor = surf.ray(0, z, 0.013)
    cy = anchor.y
    vs = []
    fs = []
    uv = []
    cols = 24
    rows = 7
    for j in range(rows):
        for i in range(cols):
            x = -0.069 + 0.138 * i / (cols - 1)
            lower = -0.020 + 0.009 * math.exp(-((x / 0.016) ** 2))
            upper = 0.023 - 0.007 * (abs(x) / 0.069) ** 3
            vs.append(
                (
                    x,
                    cy + 0.033 * (x / 0.069) ** 2,
                    z + lower + (upper - lower) * j / (rows - 1),
                )
            )
            uv.append((i / (cols - 1), j / (rows - 1)))
    for j in range(rows - 1):
        for i in range(cols - 1):
            a = j * cols + i
            fs.append((a, a + 1, a + 1 + cols, a + cols))
    lens = material("PLURR mirrored goggles", (0.095, 0.035, 0.50), 0.13, 0.94)
    bs = lens.node_tree.nodes["Principled BSDF"]
    bs.inputs["Coat Weight"].default_value = 0.65
    layer = lens.node_tree.nodes.new("ShaderNodeTexCoord")
    separate = lens.node_tree.nodes.new("ShaderNodeSeparateXYZ")
    ramp = lens.node_tree.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].color = (0.65, 0.80, 0.015, 1)
    cr.elements[1].color = (0.04, 0.16, 0.75, 1)
    cr.elements.new(0.5).color = (0.7, 0.025, 0.65, 1)
    lens.node_tree.links.new(layer.outputs["UV"], separate.inputs[0])
    lens.node_tree.links.new(separate.outputs["X"], ramp.inputs[0])
    lens.node_tree.links.new(ramp.outputs[0], bs.inputs["Base Color"])
    create(
        "PLURR goggle lens",
        vs,
        fs,
        lens,
        surf,
        weights=rigid(surf, vs, "head"),
        uv=uv,
        slot="accessories",
        option="plurr-goggles",
        solid=0.001,
    )
    border = (
        vs[:cols]
        + [vs[j * cols + cols - 1] for j in range(1, rows)]
        + list(reversed(vs[(rows - 1) * cols : (rows) * cols - 1]))
        + [vs[j * cols] for j in range(rows - 2, 0, -1)]
        + [vs[0]]
    )
    v, f, u = tube(border, 0.0028, 7)
    frame = material("PLURR goggle lime rim", (0.40, 0.62, 0.025), 0.36, 0.15)
    create(
        "PLURR goggle frame",
        v,
        f,
        frame,
        surf,
        weights=rigid(surf, v, "head"),
        uv=u,
        slot="accessories",
        option="plurr-goggles",
    )
    # Temples join the frame corners and pass behind the ear.
    for sign in [-1, 1]:
        path = [
            (sign * 0.069, cy + 0.033, z),
            (sign * 0.078, -0.012, z - 0.004),
            (sign * 0.071, 0.055, z - 0.018),
        ]
        v, f, u = tube(path, 0.0035, 6)
        create(
            "PLURR goggle temple " + str(sign),
            v,
            f,
            frame,
            surf,
            weights=rigid(surf, v, "head"),
            uv=u,
            slot="accessories",
            option="plurr-goggles",
        )


def sphere(center, radius):
    vs = [Vector(center) + Vector((0, 0, radius))]
    fs = []
    uv = [(0.5, 1)]
    n = 8
    for j in range(1, 4):
        phi = math.pi * j / 4
        for i in range(n):
            a = i * math.tau / n
            vs.append(
                Vector(center)
                + Vector(
                    (
                        math.sin(phi) * math.cos(a),
                        math.sin(phi) * math.sin(a),
                        math.cos(phi),
                    )
                )
                * radius
            )
            uv.append((i / n, 1 - j / 4))
    vs.append(Vector(center) - Vector((0, 0, radius)))
    uv.append((0.5, 0))
    for i in range(n):
        fs.append((0, 1 + i, 1 + (i + 1) % n))
    for j in range(2):
        for i in range(n):
            a = 1 + j * n + i
            b = 1 + j * n + (i + 1) % n
            fs.append((a, a + n, b + n, b))
    for i in range(n):
        fs.append((len(vs) - 1, 17 + (i + 1) % n, 17 + i))
    return vs, fs, uv


def colored_beads(
    name,
    centers,
    radii,
    colors,
    surf,
    bone=None,
    slot="accessories",
    option="plurr-beads",
):
    allv = []
    allf = []
    allu = []
    allc = []
    for center, radius, color in zip(centers, radii, colors):
        v, f, u = sphere(center, radius)
        offset = len(allv)
        allv.extend(v)
        allf.extend(tuple(i + offset for i in face) for face in f)
        allu.extend(u)
        allc.extend([(*color, 1)] * len(v))
    mat = material(name + " plastic", (1, 1, 1), 0.30)
    node = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    node.layer_name = "Bead pigment"
    mat.node_tree.links.new(
        node.outputs["Color"],
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"],
    )
    ob = create(
        name,
        allv,
        allf,
        mat,
        surf,
        weights=rigid(surf, allv, bone) if bone else None,
        uv=allu,
        slot=slot,
        option=option,
    )
    attr = ob.data.color_attributes.new(
        name="Bead pigment", type="FLOAT_COLOR", domain="POINT"
    )
    attr.data.foreach_set("color", np.asarray(allc, np.float32).ravel())
    return ob


def jewelry(surf, sex):
    gold = material("Launch layered gold jewelry", (0.64, 0.40, 0.15), 0.23, 0.88)
    palette = [
        (0.5, 0.005, 0.14),
        (0.35, 0.68, 0.015),
        (0.012, 0.32, 0.70),
        (0.45, 0.19, 0.005),
        (0.17, 0.025, 0.42),
    ]
    neck = surf.rig.pose.bones["neck_01"].head.z
    for layer, depth in enumerate(
        [0.06, 0.115, 0.17] if sex == "male" else [0.022, 0.05, 0.085]
    ):
        path = [
            surf.radial(
                i * math.tau / 96,
                neck + 0.016 - depth * ((1 + math.cos(i * math.tau / 96)) * 0.5) ** 1.7,
                0.0045,
            )
            for i in range(97)
        ]
        v, f, u = tube(path, 0.0011 if sex == "male" else 0.0009, 5)
        create(
            "Launch necklace " + str(layer),
            v,
            f,
            gold,
            surf,
            uv=u,
            slot="accessories",
            option="luxury-jewelry" if sex == "male" else "plurr-beads",
        )
        if sex == "female" and layer < 2:
            centers = path[::3][:-1]
            colored_beads(
                "PLURR necklace beads " + str(layer),
                centers,
                [0.0037] * len(centers),
                [palette[i % len(palette)] for i in range(len(centers))],
                surf,
            )
        if layer == 2:
            c = path[0] + Vector((0, -0.003, -0.010))
            shape = [
                c + Vector((0, 0, 0.009)),
                c + Vector((0.006, 0, 0)),
                c + Vector((0, 0, -0.012)),
                c + Vector((-0.006, 0, 0)),
                c + Vector((0, -0.004, 0)),
            ]
            faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)]
            create(
                "Launch necklace pendant",
                shape,
                faces,
                gold,
                surf,
                slot="accessories",
                option="luxury-jewelry" if sex == "male" else "plurr-beads",
            )
    if sex == "female":
        for side in ["l", "r"]:
            wrist = surf.rig.pose.bones["hand_" + side].head
            direction = (
                surf.rig.pose.bones["lowerarm_" + side].head - wrist
            ).normalized()
            across = direction.cross(Vector((0, 1, 0))).normalized()
            other = direction.cross(across).normalized()
            centers = []
            colors = []
            for row in range(7 if side == "r" else 5):
                c = wrist + direction * (0.008 + row * 0.009)
                for i in range(19):
                    a = i * math.tau / 19
                    centers.append(
                        c + (across * math.cos(a) + other * math.sin(a)) * 0.029
                    )
                    colors.append(palette[(i + row * 2) % len(palette)])
            colored_beads(
                "PLURR wrist kandi " + side,
                centers,
                [0.0042] * len(centers),
                colors,
                surf,
                bone="lowerarm_" + side,
            )


def splatter(surf, sex):
    if sex == "male":
        for ob in bpy.data.objects:
            if ob.type == "MESH" and (
                "cargo" in ob.name.lower() or "Bottoms" in ob.name
            ):
                for mat in ob.data.materials:
                    b = (
                        mat.node_tree.nodes.get("Principled BSDF")
                        if mat and mat.use_nodes
                        else None
                    )
                    if b and b.inputs["Metallic"].default_value < 0.5:
                        b.inputs["Roughness"].default_value = 0.57
        return
    size = 1024
    rng = np.random.default_rng(907)
    pixels = np.zeros((size, size, 4), np.float32)
    pixels[:, :, :3] = (0.014, 0.012, 0.021)
    pixels[:, :, 3] = 1
    colors = [
        (0.65, 0.003, 0.15),
        (0.30, 0.62, 0.006),
        (0.025, 0.12, 0.44),
        (0.20, 0.012, 0.35),
    ]
    for cluster in range(10):
        cx, cy = rng.uniform(0.05, 0.95, 2) * size
        spread = rng.uniform(24, 100)
        color = np.array(colors[cluster % 4])
        for dot in range(230):
            x, y = np.array([cx, cy]) + rng.normal(0, spread, 2)
            radius = float(rng.uniform(0.65, 3.4) * (2 if dot < 8 else 1))
            x0 = max(0, int(x - radius - 1))
            x1 = min(size, int(x + radius + 2))
            y0 = max(0, int(y - radius - 1))
            y1 = min(size, int(y + radius + 2))
            if x1 <= x0 or y1 <= y0:
                continue
            yy, xx = np.mgrid[y0:y1, x0:x1]
            a = np.clip(radius + 0.5 - np.sqrt((xx - x) ** 2 + (yy - y) ** 2), 0, 1)
            pixels[y0:y1, x0:x1, :3] = (
                pixels[y0:y1, x0:x1, :3] * (1 - a[..., None]) + color * a[..., None]
            )
    img = bpy.data.images.new(
        "PLURR paint splatter", width=size, height=size, alpha=True
    )
    img.pixels.foreach_set(pixels.ravel())
    img.filepath_raw = str(OUT / "textures/plurr-splatter.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    mat = material("PLURR splattered nylon", (0.02, 0.01, 0.03), 0.54)
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    mat.node_tree.links.new(
        tex.outputs["Color"],
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"],
    )
    for ob in bpy.data.objects:
        if ob.type == "MESH" and (
            ob.name in ["AvatarBottoms_cargo-pants", "Launch fitted crop top"]
            or ob.name.startswith("Launch cargo pocket ")
            and "piping" not in ob.name
        ):
            ob.data.materials.clear()
            ob.data.materials.append(mat)
            for p in ob.data.polygons:
                p.material_index = 0


def waist_details(surf, sex):
    pants = bpy.data.objects["AvatarBottoms_cargo-pants"]
    points, faces = A.H.geometry(pants)
    tree = BVHTree.FromPolygons(points, faces, all_triangles=True)
    waist = max(p.z for p in points)
    gold = material("Launch belt chain gold", (0.64, 0.40, 0.14), 0.22, 0.85)
    lime = material("PLURR lime straps", (0.32, 0.65, 0.01), 0.45)
    pink = material("PLURR pink straps", (0.60, 0.005, 0.17), 0.40)

    def at(x, z):
        hit, n, _, _ = tree.ray_cast(Vector((x, -2, z)), Vector((0, 1, 0)))
        if hit is None:
            hit, n, _, _ = tree.find_nearest(Vector((x, -0.17, z)))
        return hit + n * 0.006

    for sign in [-1, 1]:
        for layer in range(2 if sex == "male" else 1):
            path = [
                at(
                    sign * (0.080 + 0.12 * t),
                    waist
                    - 0.01
                    - 0.08 * t
                    - (0.035 + layer * 0.021) * math.sin(math.pi * t),
                )
                for t in np.linspace(0, 1, 60)
            ]
            v, f, u = tube(path, 0.0017 if sex == "male" else 0.003, 6)
            create(
                "Launch hip chain " + str(sign) + " " + str(layer),
                v,
                f,
                gold if sex == "male" else lime,
                surf,
                uv=u,
                slot="accessories",
                option="luxury-jewelry" if sex == "male" else "plurr-belt",
            )
        # Long narrow straps lie on the corresponding cargo panel.
        vs = []
        uv = []
        fs = []
        for j, t in enumerate(np.linspace(0, 1, 20)):
            x = sign * (0.19 + 0.008 * math.sin(t * 4))
            z = waist - 0.05 - 0.33 * t
            for k in [-1, 1]:
                vs.append(at(x + k * 0.007, z))
                uv.append(((k + 1) / 2, t))
        for j in range(19):
            a = j * 2
            fs.append((a, a + 1, a + 3, a + 2))
        create(
            "Launch hanging strap " + str(sign),
            vs,
            fs,
            gold if sex == "male" else (lime if sign > 0 else pink),
            surf,
            uv=uv,
            slot="accessories",
            option="luxury-jewelry" if sex == "male" else "plurr-belt",
            solid=0.001,
        )
    if sex == "female":
        for i, (x, color) in enumerate(
            [
                (-0.13, (0.7, 0.004, 0.20)),
                (-0.075, (0.015, 0.07, 0.85)),
                (0.11, (0.25, 0.8, 0.004)),
                (0.17, (0.01, 0.65, 0.45)),
            ]
        ):
            mat = material("PLURR glowstick " + str(i), color, 0.26)
            bs = mat.node_tree.nodes["Principled BSDF"]
            bs.inputs["Emission Color"].default_value = (*color, 1)
            bs.inputs["Emission Strength"].default_value = 0.7
            path = [
                at(x, waist - 0.08 - 0.13 * t) + Vector((0, -0.012, 0))
                for t in np.linspace(0, 1, 12)
            ]
            v, f, u = tube(path, 0.0045, 8)
            create(
                "PLURR glowstick " + str(i),
                v,
                f,
                mat,
                surf,
                uv=u,
                slot="accessories",
                option="plurr-belt",
            )


def run(sex):
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{sex}-face.blend"))
    s = bpy.context.scene
    r = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    A.sample(s, 1)
    surf = Surface(r, body)
    if sex == "female":
        eye, top = female_hair(surf)
        goggles(surf, eye)
    jewelry(surf, sex)
    splatter(surf, sex)
    waist_details(surf, sex)
    A.update()
    s["completePairPhase"] = "complete reference-look candidate"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{sex}-look.blend"), compress=True)
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.10 if sex == "male" else 2.03
    camera.location = (0.7, -4, 1.08)
    review.look_at(camera, Vector((0, 0, 0.90)))
    s.view_settings.exposure = -0.8
    s.render.resolution_x = 900
    s.render.resolution_y = 1100
    s.render.filepath = str(OUT / f"{sex}-look.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--sex", choices=["male", "female"], required=True)
    run(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]).sex)
