"""Complete the visible trouser, sneaker and crop-top silhouettes.
Connection map: cargo cuffs meet measured boot/sock shafts; shoe shell shares
ring vertices with its sole and shaft; laces sit on the shell's measured slope;
crop straps overlap the top edge by 5 mm. Body/rig stay editable and unchanged.
"""

import argparse, sys, math, json
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT, material, array, review
from complete_pair_geometry import Surface, skin_weights, smooth, create, tube, join


def sculpt_pants(surf, sex):
    ob = bpy.data.objects["AvatarBottoms_cargo-pants"]
    p = array(ob, True)
    assert len(p) == len(ob.data.vertices)
    w = skin_weights(ob, surf.names)
    waist = p[:, 2].max()
    bottom = p[:, 2].min()
    cuff = 0.205 if sex == "female" else 0.135
    goal = p.copy()
    for i, q in enumerate(p):
        side = "l" if q[0] >= 0 else "r"
        bone = surf.rig.pose.bones["thigh_" + side]
        center = np.array([bone.head.x, bone.head.y])
        z = q[2]
        u = float(smooth((waist - 0.10 - z) / 0.14))
        t = np.clip((z - bottom) / (waist - 0.12 - bottom), 0, 1)
        newz = cuff + (waist - 0.12 - cuff) * t
        goal[i, 2] = z * (1 - u) + newz * u
        offset = q[:2] - center
        radius = np.linalg.norm(offset)
        if radius > 0.005:
            a = math.atan2(offset[1], offset[0])
            bulk = (0.012 if sex == "male" else 0.030) + (
                0.015 if sex == "male" else 0.027
            ) * math.sin(math.pi * t) ** 1.3
            bulk *= float(smooth(t / 0.10))
            fold = 0.0045 * math.sin(t * math.pi * 11 + 2 * a) + 0.0025 * math.sin(
                t * math.pi * 19 - 3 * a
            )
            goal[i, :2] += offset / radius * (bulk + fold) * u
    ob.data.vertices.foreach_set("co", surf.bind(goal, w).astype(np.float32).ravel())
    for p in ob.data.polygons:
        p.material_index = 0
    ob.data.materials[0].node_tree.nodes["Principled BSDF"].inputs[
        "Roughness"
    ].default_value = 0.34 if sex == "male" else 0.43
    sub = ob.modifiers.new("Tailored fabric smoothing", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    ob["avatarSlot"] = "bottoms"
    ob["avatarOptionId"] = "luxury-cargo" if sex == "male" else "plurr-cargo"
    A.update()
    points, faces = A.H.geometry(ob)
    tree = BVHTree.FromPolygons(points, faces, all_triangles=True)
    cloth = material("Launch " + sex + " pocket fabric", (0.020, 0.023, 0.027), 0.48)
    edge = material(
        "Launch " + sex + " pocket edge",
        (0.60, 0.36, 0.10) if sex == "male" else (0.28, 0.58, 0.014),
        0.25,
        0.7 if sex == "male" else 0.1,
    )
    for side, sign in [("l", 1), ("r", -1)]:
        center = surf.rig.pose.bones["thigh_" + side].head
        zcenter = center.z - 0.26

        def point(theta, z):
            d = Vector((sign * math.sin(theta), -math.cos(theta), 0))
            hit, n, i, distance = tree.ray_cast(Vector((center.x, center.y, z)), d)
            assert hit is not None
            return hit + n * 0.004

        vs = []
        fs = []
        uv = []
        rows = 7
        cols = 7
        for j in range(rows):
            for i in range(cols):
                vs.append(
                    point(
                        0.64 + 0.72 * i / (cols - 1),
                        zcenter - 0.065 + 0.13 * j / (rows - 1),
                    )
                )
                uv.append((i / (cols - 1), j / (rows - 1)))
        for j in range(rows - 1):
            for i in range(cols - 1):
                a = j * cols + i
                fs.append((a, a + 1, a + 1 + cols, a + cols))
        create(
            "Launch cargo pocket " + side,
            vs,
            fs,
            cloth,
            surf,
            uv=uv,
            slot="bottoms",
            option=ob["avatarOptionId"],
            solid=0.0012,
        )
        border = (
            [vs[j * cols] for j in range(rows)]
            + [vs[(rows - 1) * cols + i] for i in range(1, cols)]
            + [vs[j * cols + cols - 1] for j in range(rows - 2, -1, -1)]
            + [vs[i] for i in range(cols - 2, -1, -1)]
        )
        v, f, u = tube(border, 0.0012, 5)
        create(
            "Launch cargo pocket piping " + side,
            v,
            f,
            edge,
            surf,
            uv=u,
            slot="bottoms",
            option=ob["avatarOptionId"],
        )
    # The belt meets the measured waist boundary instead of floating above it.
    beltvs = []
    beltuv = []
    for j, z in enumerate([waist - 0.025, waist + 0.004]):
        for i in range(64):
            theta = i * math.tau / 64
            d = Vector((math.sin(theta), -math.cos(theta), 0))
            hit, n, idx, dist = tree.ray_cast(
                Vector((0, -0.015, min(z, waist - 0.006))), d
            )
            if hit is None:
                hit = surf.radial(theta, waist - 0.012, 0.018)
            p = hit + d * 0.003
            p.z = z
            beltvs.append(p)
            beltuv.append((i / 64, j))
    beltfs = [(i, (i + 1) % 64, (i + 1) % 64 + 64, i + 64) for i in range(64)]
    create(
        "Launch cargo belt",
        beltvs,
        beltfs,
        cloth,
        surf,
        uv=beltuv,
        slot="bottoms",
        option=ob["avatarOptionId"],
        solid=0.002,
    )
    return waist, cuff


def boots(surf, sex):
    for ob in list(bpy.data.objects):
        if ob.name.startswith("AvatarShoes_"):
            bpy.data.objects.remove(ob, do_unlink=True)
    colors = {
        "male": [(0.72, 0.68, 0.56), (0.07, 0.063, 0.055), (0.8, 0.73, 0.57)],
        "female": [(0.024, 0.008, 0.035), (0.045, 0.025, 0.068), (0.55, 0.64, 0.72)],
    }[sex]
    upper = material("Launch " + sex + " sneaker leather", colors[0], 0.32)
    sole = material("Launch " + sex + " sneaker rubber", colors[1], 0.62)
    toe = material("Launch " + sex + " toe panel", colors[2], 0.35, 0.15)
    gold = material("Launch sneaker metal", (0.64, 0.39, 0.13), 0.23, 0.85)
    for side, sign in [("l", 1), ("r", -1)]:
        ankle = surf.rig.pose.bones["foot_" + side].head
        body = surf.array
        foot = body[(body[:, 0] * sign > 0) & (body[:, 2] < 0.10)]
        lo = foot.min(axis=0)
        hi = foot.max(axis=0)
        cx = (lo[0] + hi[0]) * 0.5
        back = hi[1] + 0.018
        front = lo[1] - 0.020
        cy = (back + front) * 0.5
        rx = (hi[0] - lo[0]) * 0.5 + 0.014
        ry = (back - front) * 0.5
        minz = lo[2] - 0.015
        top = 0.215 if sex == "male" else 0.17
        # Shape changes follow the measured foot footprint into the ankle shaft.
        levels = [
            minz,
            minz + 0.010,
            0.023,
            0.032,
            0.048,
            0.066,
            0.090,
            0.125,
            top - 0.009,
            top,
        ]
        verts = []
        uv = []
        n = 48
        for j, z in enumerate(levels):
            lift = float(smooth((z - 0.075) / (0.13)))
            sx = rx * (1 - 0.21 * lift)
            yc = cy * (1 - lift) + (ankle.y - 0.004) * lift
            sy = ry * (1 - lift) + 0.050 * lift
            for i in range(n):
                a = i * math.tau / n
                xx = math.sin(a)
                yy = -math.cos(a)  # rounded footprint, full toe box
                verts.append(
                    (
                        cx + sx * math.copysign(abs(xx) ** 0.82, xx),
                        yc + sy * math.copysign(abs(yy) ** 0.90, yy),
                        z,
                    )
                )
                uv.append((i / n, j / (len(levels) - 1)))
        faces = []
        for j in range(len(levels) - 1):
            for i in range(n):
                a = j * n + i
                faces.append((a, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, a + n))
        faces.append(tuple(reversed(range(n))))
        weights = np.zeros((len(verts), len(surf.names)))

        def shoe_weights(points):
            w = np.zeros((len(points), len(surf.names)))
            f = surf.names.index("foot_" + side)
            c = surf.names.index("calf_" + side)
            for i, p in enumerate(points):
                v = 0.75 * float(smooth((p[2] - 0.09) / 0.13))
                w[i, f] = 1 - v
                w[i, c] = v
            return w

        accent = material(
            "Launch " + side + " sneaker accent",
            (0.72, 0.49, 0.15)
            if sex == "male"
            else ((0.65, 0.008, 0.21) if side == "l" else (0.27, 0.70, 0.012)),
            0.29,
            0.7 if sex == "male" else 0.22,
        )
        ob = create(
            "Launch high-top sneaker " + side,
            verts,
            faces,
            [upper, sole, toe, accent],
            surf,
            weights=shoe_weights(verts),
            uv=uv,
            slot="shoes",
            option="luxury-high-tops" if sex == "male" else "plurr-sneakers",
        )
        for face in ob.data.polygons:
            j = face.index // n
            face.material_index = (
                1 if j < 2 else (3 if j == 2 or j == 8 else (2 if j in [3, 4] else 0))
            )
        # Raised lace crosses run over the toe-to-shaft slope.
        pieces = []
        for j in range(7):
            t = j / 6
            z = 0.074 + t * (top - 0.09)
            lift = float(smooth((z - 0.075) / 0.13))
            yc = cy * (1 - lift) + (ankle.y - 0.004) * lift
            sy = ry * (1 - lift) + 0.050 * lift
            y = yc - sy - 0.004
            width = rx * 0.55
            path = [
                (
                    cx - width + 2 * width * u,
                    y - 0.003 * math.sin(math.pi * u),
                    z + 0.007 * (u - 0.5),
                )
                for u in np.linspace(0, 1, 7)
            ]
            pieces.append(tube(path, 0.0020 if sex == "male" else 0.0027, 6))
        v, f, u = join(pieces)
        create(
            "Launch sneaker laces " + side,
            v,
            f,
            accent if sex == "female" else toe,
            surf,
            weights=shoe_weights(v),
            uv=u,
            slot="shoes",
            option=ob["avatarOptionId"],
        )
        if sex == "female":
            # Ribbed colored socks bridge the ankle and raised cargo cuff.
            vs = []
            fs = []
            uv = []
            for j in range(14):
                z = top - 0.010 + (0.238 - top + 0.010) * j / 13
                radius = 0.035 + 0.0025 * math.sin(j * math.pi * 0.80)
                for i in range(40):
                    a = i * math.tau / 40
                    vs.append(
                        (
                            ankle.x + radius * math.sin(a),
                            ankle.y - radius * math.cos(a),
                            z,
                        )
                    )
                    uv.append((i / 40, j / 13))
            for j in range(13):
                for i in range(40):
                    a = j * 40 + i
                    fs.append(
                        (a, j * 40 + (i + 1) % 40, (j + 1) * 40 + (i + 1) % 40, a + 40)
                    )
            create(
                "Launch neon sock " + side,
                vs,
                fs,
                accent,
                surf,
                uv=uv,
                slot="shoes",
                option=ob["avatarOptionId"],
                solid=0.001,
            )


def crop(surf):
    old = bpy.data.objects.get("AvatarTop_mesh-crop")
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    hem = surf.rig.pose.bones["spine_02"].head.z + 0.065
    neck = surf.rig.pose.bones["neck_01"].head.z
    mat = material("PLURR crop stretch fabric", (0.012, 0.009, 0.018), 0.56)
    vs = []
    fs = []
    uv = []
    cols = 80
    rows = 18
    for j in range(rows):
        for i in range(cols):
            a = i * math.tau / cols
            top = (
                neck
                - 0.112
                + 0.034 * (1 - math.cos(a)) * 0.5
                - 0.024 * math.sin(a) ** 2
            )
            z = hem + (top - hem) * j / (rows - 1)
            vs.append(surf.radial(a, z, 0.013))
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
        "Launch fitted crop top",
        vs,
        fs,
        mat,
        surf,
        uv=uv,
        slot="top",
        option="plurr-crop",
        solid=0.001,
    )
    for sign in [-1, 1]:
        centerx = sign * 0.100
        front = surf.ray(centerx, neck - 0.124, 0.010)
        backhit, _, _, _ = surf.tree.ray_cast(
            Vector((centerx, 2, neck - 0.105)), Vector((0, -1, 0))
        )
        points = []
        uv = []
        for j in range(20):
            y = front.y + (backhit.y - front.y) * j / 19
            for k in range(3):
                x = centerx + (k - 1) * 0.010
                t = j / 19
                guess = Vector(
                    (x, y, neck - 0.125 + 0.020 * t + 0.095 * math.sin(math.pi * t))
                )
                hit, n, _, _ = surf.tree.find_nearest(guess)
                p = hit + n * 0.007
                assert p.z > neck - 0.20
                points.append(p)
                uv.append((k / 2, j / 19))
        faces = [
            (j * 3 + k, j * 3 + k + 1, (j + 1) * 3 + k + 1, (j + 1) * 3 + k)
            for j in range(19)
            for k in range(2)
        ]
        create(
            "Launch crop strap " + str(sign),
            points,
            faces,
            mat,
            surf,
            uv=uv,
            slot="top",
            option="plurr-crop",
            solid=0.001,
        )


def render(sex, s):
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.02 if sex == "male" else 1.95
    camera.location = (0.4, -4, 1.05)
    review.look_at(camera, Vector((0, 0, 0.88)))
    s.view_settings.exposure = -1.0
    s.render.resolution_x = 800
    s.render.resolution_y = 1000
    s.render.filepath = str(OUT / f"{sex}-silhouette.png")
    bpy.ops.render.render(write_still=True)


def run(sex):
    bpy.ops.wm.open_mainfile(
        filepath=str(
            OUT
            / (
                "male-assembly.blend"
                if sex == "male"
                else "female-jacket-assembly.blend"
            )
        )
    )
    s = bpy.context.scene
    r = bpy.data.objects["AvatarSkeleton"]
    b = bpy.data.objects["AvatarBody"]
    A.sample(s, 1)
    surf = Surface(r, b)
    waist, cuff = sculpt_pants(surf, sex)
    boots(surf, sex)
    if sex == "female":
        crop(surf)
    A.update()
    s["completePairPhase"] = "reference silhouette pass"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(
        filepath=str(OUT / f"{sex}-silhouette.blend"), compress=True
    )
    render(sex, s)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--sex", choices=["male", "female"], required=True)
    run(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]).sex)
