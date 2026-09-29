"""Give the female foil jacket outer-layer ease, lime trims and a folded hood.
Connection map: hood rim sits above the measured jacket/neck area; the original
sewn jacket remains connected. Hardware follows the jacket's displacement.
"""

import bpy, sys, numpy as np, math
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT, array, material, review
from complete_pair_geometry import Surface, skin_weights, create, tube

bpy.ops.wm.open_mainfile(filepath=str(OUT / "female-look.blend"))
s = bpy.context.scene
r = bpy.data.objects["AvatarSkeleton"]
body = bpy.data.objects["AvatarBody"]
coat = bpy.data.objects["Structured armhole jacket"]
A.sample(s, 31)
surf = Surface(r, body)
hidden = []
for m in coat.modifiers:
    if m.type != "ARMATURE":
        hidden.append((m, m.show_viewport))
        m.show_viewport = False
A.update()
p = array(coat, True)
assert len(p) == len(coat.data.vertices)
delta = []
for q in p:
    hit, n, _, _ = surf.tree.find_nearest(Vector(q))
    delta.append(np.array(n) * 0.012)
delta = np.asarray(delta)
neighbors = [set() for _ in p]
for edge in coat.data.edges:
    a, b = edge.vertices
    neighbors[a].add(b)
    neighbors[b].add(a)
for _ in range(4):
    delta = np.array(
        [
            d * 0.65 + delta[list(neighbors[i])].mean(0) * 0.35 if neighbors[i] else d
            for i, d in enumerate(delta)
        ]
    )
tree = KDTree(len(p))
for i, q in enumerate(p):
    tree.insert(Vector(q), i)
tree.balance()
objects = [coat] + [
    o for o in bpy.data.objects if o.get("jacketHardware") and o.name in s.objects
]
for ob in objects:
    w = skin_weights(ob, surf.names)
    skin = np.einsum("vg,gij->vij", w, surf.mats)
    if ob == coat:
        offset = delta
    else:
        q = array(ob, True)
        assert len(q) == len(ob.data.vertices)
        offset = []
        for point in q:
            near = tree.find_n(Vector(point), 6)
            ids = [i for _, i, _ in near]
            amount = np.array([1 / (0.005 + d) ** 2 for _, _, d in near])
            offset.append(np.sum(delta[ids] * amount[:, None], axis=0) / amount.sum())
        offset = np.asarray(offset)
    local = np.linalg.solve(skin[:, :3, :3], offset[..., None])[:, :, 0]
    if ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:
            key.data.foreach_set(
                "co",
                (np.array([list(v.co) for v in key.data]) + local)
                .astype(np.float32)
                .ravel(),
            )
    ob.data.vertices.foreach_set("co", (array(ob) + local).astype(np.float32).ravel())
    ob.data.update()
for mod, visible in hidden:
    mod.show_viewport = visible
lime = material("PLURR lime knit trim", (0.34, 0.61, 0.012), 0.65, 0.05)
coat.data.materials.append(lime)
rest = np.array([list(v.vector) for v in coat.data.attributes["TailorRest"].data])
for poly in coat.data.polygons:
    q = rest[list(poly.vertices)]
    if np.max(abs(q[:, 0])) > 0.707 or np.max(q[:, 2]) < 1.025:
        poly.material_index = len(coat.data.materials) - 1
for ob in objects[1:]:
    ob.data.materials.clear()
    ob.data.materials.append(lime)
    for p in ob.data.polygons:
        p.material_index = 0
A.sample(s, 1)
surf = Surface(r, body)
neck = r.pose.bones["neck_01"].head.z
vs = []
fs = []
uv = []
cols = 60
rows = 9
for j in range(rows):
    v = j / (rows - 1)
    for i in range(cols):
        th = 0.82 + (math.tau - 1.64) * i / (cols - 1)
        back = (1 - math.cos(th)) * 0.5
        z = neck + 0.020 - 0.075 * v + 0.030 * math.sin(math.pi * v) * back
        point = surf.radial(th, z, 0.033 + 0.008 * math.sin(math.pi * v))
        point.z += 0.004 * math.sin(th * 7) * math.sin(math.pi * v)
        vs.append(point)
        uv.append((i / (cols - 1), v))
for j in range(rows - 1):
    for i in range(cols - 1):
        a = j * cols + i
        fs.append((a, a + 1, a + 1 + cols, a + cols))
hood = create(
    "PLURR folded hood",
    vs,
    fs,
    coat.data.materials[0],
    surf,
    uv=uv,
    slot="jacket",
    option="plurr-foil",
    solid=0.0012,
)
path = vs[(rows - 1) * cols :]
v, f, u = tube(path, 0.0022, 6)
create("PLURR hood binding", v, f, lime, surf, uv=u, slot="jacket", option="plurr-foil")
A.update()
s["completePairPhase"] = "female complete-look candidate"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "female-complete.blend"), compress=True)
camera = review.configure_scene()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.05
camera.location = (1.0, -4, 1.06)
review.look_at(camera, Vector((0, 0, 0.89)))
s.view_settings.exposure = -0.8
s.render.resolution_x = 900
s.render.resolution_y = 1100
s.render.filepath = str(OUT / "female-complete.png")
bpy.ops.render.render(write_still=True)
