"""Assemble complete character looks from retained editable assets.
Connection map: trousers follow the indexed source body's hip/leg surfaces;
shoes enclose measured source feet and attach to the existing foot skin;
scalp/root cards follow corresponding head surfaces and use the head bone.
All new assets belong to this study; previous source models are read-only.
"""

import argparse, sys, json, math, hashlib
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A
from build_bodies import review

ROOT = SCRIPTS.parents[1]
ASSETS = ROOT / "assets-src/avatars"
OUT = ASSETS / "complete-pair-study"
PACK = Path("/tmp/omnirave-complete-pair-study")


def material(name, color, rough=0.45, metal=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def array(ob, evaluated=False):
    if evaluated:
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        p = np.array([list(ob.matrix_world @ v.co) for v in me.vertices])
        ev.to_mesh_clear()
        return p
    return np.array([list(v.co) for v in ob.data.vertices])


class BodyWarp:
    def __init__(self, source, target):
        self.delta = target - source
        self.tree = KDTree(len(source))
        for i, p in enumerate(source):
            self.tree.insert(Vector(p), i)
        self.tree.balance()

    def __call__(self, points):
        result = []
        for p in points:
            neighbors = self.tree.find_n(Vector(p), 12)
            ids = [i for _, i, _ in neighbors]
            w = np.array([1 / (0.018 + d) ** 2 for _, _, d in neighbors])
            result.append(p + np.sum(self.delta[ids] * w[:, None], axis=0) / w.sum())
        return np.array(result)


def attach(ob, rig):
    ob.parent = rig
    ob.parent_type = "OBJECT"
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.matrix_world = Matrix.Identity(4)
    for m in ob.modifiers:
        if m.type == "ARMATURE":
            m.object = rig
    ob.hide_render = False
    ob.hide_viewport = False
    ob.hide_set(False)
    ob["completePairStudy"] = True


def mesh(name, points, faces, mat, rig, bone="head", uv=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(points, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    if uv is not None:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uv[me.loops[li].vertex_index]
    for p in me.polygons:
        p.use_smooth = True
    ob.vertex_groups.new(name=bone).add(list(range(len(points))), 1, "REPLACE")
    ob.modifiers.new("Avatar skin", "ARMATURE").object = rig
    attach(ob, rig)
    return ob


def import_wardrobe(sex, body, rig):
    names = [
        "AvatarBottoms_cargo-pants",
        "AvatarShoes_high-tops" if sex == "male" else "AvatarShoes_chunky-sneakers",
    ]
    if sex == "female":
        names += ["AvatarTop_mesh-crop", "AvatarHair_high-pony"]
    with bpy.data.libraries.load(str(PACK / (sex + "-wardrobe.blend")), link=False) as (
        src,
        dst,
    ):
        dst.objects = names
    warp = BodyWarp(np.load(PACK / (sex + "-wardrobe-body.npy")), array(body))
    objects = []
    for ob in dst.objects:
        bpy.context.scene.collection.objects.link(ob)
        co = warp(array(ob))
        ob.data.vertices.foreach_set("co", co.astype(np.float32).ravel())
        attach(ob, rig)
        objects.append(ob)
        print("FITTED", sex, ob.name, len(co), flush=True)
    return objects


def male_hair(body, rig):
    # Face19's groom is sampled into exportable ribbons, with an existing original
    # strand atlas. Its evaluated head correspondence determines the new fit.
    A.sample(bpy.context.scene, 31)
    warp = BodyWarp(np.load(PACK / "hair-source-body.npy"), array(body, True))
    skin = (
        rig.matrix_world
        @ rig.pose.bones["head"].matrix
        @ rig.data.bones["head"].matrix_local.inverted()
        @ rig.matrix_world.inverted()
    )
    inv = skin.inverted()

    def bind(points):
        return [inv @ Vector(p) for p in warp(np.asarray(points))]

    rootmat = material("Launch male hair roots", (0.017, 0.008, 0.004), 0.72)
    mat = material("Launch male swept strands", (0.055, 0.028, 0.015), 0.48)
    img = bpy.data.images.load(
        str(ASSETS / "astra-male-proof/hair-strands.png"), check_existing=True
    )
    img.pack()
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    bs = mat.node_tree.nodes.get("Principled BSDF")
    mat.node_tree.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
    mat.node_tree.links.new(tex.outputs["Alpha"], bs.inputs["Alpha"])
    mat.surface_render_method = "DITHERED"
    cap = np.load(PACK / "Proof_Scalp18Surface.npz")
    ob = mesh(
        "Launch hair - swept scalp",
        bind(cap["positions"]),
        cap["faces"].tolist(),
        rootmat,
        rig,
    )
    ob["avatarSlot"] = "hair"
    ob["avatarOptionId"] = "luxury-swept"
    vs = []
    fs = []
    uv = []
    center = Vector((0, -0.045, 1.651))
    rng = np.random.default_rng(621)
    for shade in range(5):
        d = np.load(PACK / f"Proof_Curl18_{shade}.npz")
        p = d["positions"]
        offsets = d["offsets"]
        for curve in range(0, len(offsets) - 1, 32):
            rows = p[offsets[curve] : offsets[curve + 1]]
            count = min(10, len(rows))
            ids = np.linspace(0, len(rows) - 1, count).round().astype(int)
            rows = rows[ids]
            base = len(vs)
            width = float(rng.uniform(0.0024, 0.0040))
            for j, q in enumerate(rows):
                t = j / (count - 1)
                tangent = Vector(
                    rows[min(j + 1, count - 1)] - rows[max(j - 1, 0)]
                ).normalized()
                n = (Vector(q) - center).normalized()
                side = tangent.cross(n).normalized()
                if side.length < 0.1:
                    side = Vector((1, 0, 0))
                half = width * 0.5 * (1 - 0.85 * t**3)
                for sign, u in [(-1, 0), (1, 1)]:
                    vs.append(Vector(q) + side * half * sign)
                    uv.append((u, t))
            for j in range(count - 1):
                a = base + j * 2
                fs.append((a, a + 1, a + 3, a + 2))
    ob = mesh("Launch hair - swept ribbons", bind(vs), fs, mat, rig, uv=uv)
    ob["avatarSlot"] = "hair"
    ob["avatarOptionId"] = "luxury-swept"
    gold = material("Launch jewelry gold", (0.64, 0.39, 0.12), 0.2, 0.85)
    for sign in [-1, 1]:
        d = np.load(PACK / f"Proof_Earring_{sign}.npz")
        ob = mesh(
            "Launch earring " + str(sign),
            bind(d["positions"]),
            d["faces"].tolist(),
            gold,
            rig,
        )
        ob["avatarSlot"] = "accessories"
        ob["avatarOptionId"] = "luxury-jewelry"
    print("HAIR_RIBBONS", len(vs), len(fs), flush=True)


def style(objects, sex):
    for ob in objects:
        if "Bottoms" in ob.name:
            mat = material(
                "Launch " + sex + " black cargo fabric",
                (0.012, 0.015, 0.019),
                0.42 if sex == "male" else 0.50,
            )
            ob.data.materials.clear()
            ob.data.materials.append(mat)
        elif "Shoes" in ob.name:
            # Preserve authored material regions/UVs for subsequent sneaker detailing.
            pass
        elif "Top_" in ob.name:
            mat = material("Launch female black crop", (0.014, 0.010, 0.022), 0.35)
            ob.data.materials.clear()
            ob.data.materials.append(mat)
        elif "Hair_" in ob.name:
            mat = material("Launch female dark ponytail", (0.019, 0.008, 0.014), 0.46)
            ob.data.materials.clear()
            ob.data.materials.append(mat)


def run(sex):
    source = (
        ASSETS
        / "launch-body-proof"
        / (
            "rigged-collar-corrective-study/male-rigged-collar-correctives.blend"
            if sex == "male"
            else "female-body05.blend"
        )
    )
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    parts = import_wardrobe(sex, body, rig)
    style(parts, sex)
    if sex == "male":
        male_hair(body, rig)
    # Remove only inherited hidden construction controls from the new assembly.
    for ob in list(bpy.data.objects):
        if (
            ob.type == "MESH"
            and ob.hide_render
            and ob.name in ["Luxury_Bomber rebuilt shell"]
        ):
            bpy.data.objects.remove(ob, do_unlink=True)
    A.sample(scene, 1)
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.05 if sex == "male" else 1.98
    camera.location = (0.65, -4, 1.12)
    review.look_at(camera, Vector((0, 0, 0.90)))
    scene.render.resolution_x = 800
    scene.render.resolution_y = 1000
    scene["completePairPhase"] = "full-look assembly in progress"
    scene["completePairSex"] = sex
    output = OUT / f"{sex}-assembly.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
    scene.render.filepath = str(OUT / f"{sex}-assembly-front.png")
    bpy.ops.render.render(write_still=True)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    (OUT / f"{sex}-assembly.json").write_text(
        json.dumps(
            {
                "source": str(source),
                "source_sha256": before,
                "model_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "stage": "Assembly in progress; appearance/motion/export not accepted.",
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sex", choices=["male", "female"], required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]).sex)
