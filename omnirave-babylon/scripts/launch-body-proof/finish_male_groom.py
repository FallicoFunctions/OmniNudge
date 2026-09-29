"""Fit the retained short swept groom to the completed head.
Sample the original hair curves into textured ribbons and transfer their
positions using the corresponding source and destination head vertices.
"""

import sys
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from assemble_complete_pair import OUT, array, review
from complete_pair_geometry import Surface, create
from add_launch_reference_details import rigid, ribbon, strand_mat

bpy.ops.wm.open_mainfile(filepath=str(OUT / "male-finished.blend"))
s = bpy.context.scene
A.sample(s, 1)
r = bpy.data.objects["AvatarSkeleton"]
surf = Surface(r, bpy.data.objects["AvatarBody"])
for name in [
    "Launch hair - swept ribbons",
    "Complete scalp strands",
    "Luxury swept wave locks",
    "Luxury fine hair fibers",
    "Luxury retained swept groom",
]:
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)
eye = np.mean(
    [array(bpy.data.objects["AvatarEye_" + side], True).mean(0) for side in ["l", "r"]],
    axis=0,
)
center = Vector((0, -0.028, eye[2] + 0.039))
rng = np.random.default_rng(318)


# Retain the previously authored realistic groom in the same affine head fit.
# This avoids a second approximate body warp changing the actual hairstyle.
from assemble_complete_pair import PACK

source = np.load(PACK / "male-face-source.npz")["AvatarBody"]
target = array(bpy.data.objects["AvatarBody"], True)
mask = target[:, 2] > r.pose.bones["neck_01"].head.z + 0.095
fit = np.linalg.lstsq(
    np.c_[source[mask], np.ones(mask.sum())], target[mask], rcond=None
)[0]


def mapped(p):
    return np.c_[p, np.ones(len(p))] @ fit


allv = []
allf = []
alluv = []
indices = []
palette = [
    (0.018, 0.009, 0.004),
    (0.027, 0.013, 0.005),
    (0.036, 0.019, 0.008),
    (0.052, 0.030, 0.014),
    (0.026, 0.012, 0.004),
]
mats = [strand_mat("Luxury groom fibers " + str(i), c) for i, c in enumerate(palette)]
for shade in range(5):
    data = np.load(PACK / f"Proof_Curl18_{shade}.npz")
    points = data["positions"]
    offset = data["offsets"]
    for index in range(0, len(offset) - 1, 8):
        rows = points[offset[index] : offset[index + 1]]
        ids = np.linspace(0, len(rows) - 1, 12).round().astype(int)
        path = mapped(rows[ids])
        v, f, u = ribbon(path, float(rng.uniform(0.0007, 0.0014)), center)
        base = len(allv)
        allv.extend(v)
        allf.extend(tuple(i + base for i in face) for face in f)
        alluv.extend(u)
        indices.extend([shade] * len(f))
ob = create(
    "Luxury retained swept groom",
    allv,
    allf,
    mats,
    surf,
    weights=rigid(surf, allv, "head"),
    uv=alluv,
    slot="hair",
    option="luxury-swept",
)
for p, index in zip(ob.data.polygons, indices):
    p.material_index = index
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "male-finished.blend"), compress=True)
camera = review.configure_scene()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 0.52
camera.location = (0.6, -4, 1.65)
review.look_at(camera, Vector((0, -0.02, eye[2] - 0.012)))
s.view_settings.exposure = -0.8
s.render.resolution_x = 800
s.render.resolution_y = 900
s.render.filepath = str(OUT / "male-finished-face.png")
bpy.ops.render.render(write_still=True)
