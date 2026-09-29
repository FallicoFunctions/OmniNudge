"""Turn the front groom toward its side part, with broad layered relief.

Connection map: each scalp card retains its first pair on the cap (1.4 mm
attachment). Rows 1–15 sweep over the cap with at least 1 mm clearance; row 16
onward keeps the gathering direction. The braid channel stays shallow and all
revised edges remain behind the lenses and outside skin. Thin hair uses these
millimeter separations rather than a structural 5 mm overlap. Rig, origins,
topology, UVs and weights are retained.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface, smooth
from refine_complete_groom_finish import islands

NAME = 'PLURR swept scalp groom'


def shape_swept_layers(mapping, report, apply):
    rig = bpy.data.objects['AvatarSkeleton']
    cap = Surface(rig, bpy.data.objects['Complete scalp']).tree
    body = Surface(rig, bpy.data.objects['AvatarBody']).tree
    lens = Surface(rig, bpy.data.objects['PLURR goggle lens']).tree
    braid = Surface(rig, bpy.data.objects['PLURR reference temple braid']).tree
    ob = bpy.data.objects[NAME]; p = array(ob); q = p.copy()
    attr = ob.data.color_attributes['ReferenceHairTint']
    colors = np.array([v.color[:] for v in attr.data])
    selected = []; fitted = 0
    for i, ids in enumerate(islands(ob)):
        r = p[ids].reshape(24, 2, 3)
        old = r.mean(1); half = (r[:, 1] - r[:, 0]) * .5
        front = float(smooth((-old[0, 1] - .060) / .050))
        if front < .025: continue
        c = old.copy(); relief = np.zeros(24); weight = np.zeros(24)
        layer = .5 + .5 * math.cos(old[0, 0] * 180 + old[0, 1] * 30)
        for j in range(1, 16):
            t = j / 16
            bell = math.sin(math.pi * t) ** 1.6
            _, _, _, distance = braid.find_nearest(Vector(old[j]))
            channel = float(smooth((distance - .009) / .018))
            weight[j] = front * bell * channel
            probe = old[j].copy()
            probe[0] += (.023 - old[0, 0]) * .45 * weight[j]
            hit, normal, _, _ = cap.find_nearest(Vector(old[j]))
            gap = max(.0014, (Vector(old[j]) - hit).dot(normal))
            hit, normal, _, _ = cap.find_nearest(Vector(probe))
            relief[j] = (.0018 + .0045 * layer) * weight[j]
            c[j] = hit + normal * (gap + relief[j])
        rr = r.copy()
        for j in range(1, 16):
            if weight[j] < 1e-8: continue
            a = Vector(old[j + 1] - old[j - 1]).normalized()
            b = Vector(c[j + 1] - c[j - 1]).normalized()
            h = (a.rotation_difference(b) @ Vector(half[j])) * (1 - .26 * weight[j])
            rr[j] = [c[j] - h, c[j] + h]
            for k in range(2):
                point = rr[j, k].copy()
                for _ in range(3):
                    hit, normal, _, _ = cap.find_nearest(Vector(point))
                    if (Vector(point) - hit).dot(normal) < .001:
                        point[:] = hit + normal * .001
                    hit, normal, _, _ = body.find_nearest(Vector(point))
                    if (Vector(point) - hit).dot(normal) < .003:
                        point[:] = hit + normal * .003
                    hit, _, _, _ = lens.ray_cast(Vector((point[0], -.5, point[2])), Vector((0, 1, 0)), 1)
                    if hit is not None: point[1] = max(point[1], hit.y + .0015)
                fitted += int(np.linalg.norm(point - rr[j, k]) > 1e-8)
                rr[j, k] = point
            colors[ids[j * 2:j * 2 + 2], :3] *= 1 + .22 * weight[j] * layer
        q[ids] = rr.reshape(-1, 3); selected.append(ids[0])
    saved_uv = mapping[NAME].get('addedUv')
    previous = dict(report[NAME])
    apply(ob, q, mapping, report)
    if saved_uv is not None: mapping[NAME]['addedUv'] = saved_uv
    colors = np.clip(colors, 0, 1)
    attr.data.foreach_set('color', colors.astype(np.float32).ravel())
    mapping[NAME]['addedColors'] = colors.tolist()
    report[NAME].update({k: v for k, v in previous.items() if k not in report[NAME]})
    report['sweptLayers'] = {
        'selectedCardFirstVertices': selected, 'cards': len(selected),
        'retainedRootPairs': 1, 'retainedRowsFrom': 16,
        'changedVertices': int(np.count_nonzero(np.linalg.norm(q-p, axis=1)>1e-7)),
        'maximumMovementMm': float(np.linalg.norm(q-p, axis=1).max()*1000),
        'fittedVertices': fitted, 'addedGeometry': 0, 'allTextureBytesRetained': True}
