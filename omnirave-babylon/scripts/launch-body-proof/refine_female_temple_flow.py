"""Separate the swept forehead locks from their opaque underpainting.

Connection map: all 35 front cards keep their first three rows anchored under
the goggles. Their free sections follow the forehead at 3 mm skin clearance,
above the scalp and behind the lenses. The cap receives only an alpha change
at its frontal boundary. No origins, weights, UVs, joints or topology change.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface, smooth
from refine_complete_groom_finish import islands

NAME = 'PLURR loose brunette front locks'


def soften_underpainting(rgba, u, v, flow, front):
    # Broad uneven lock ends, each resolving into finer fibers. Interior and
    # rear coverage remain exact; this only removes the exposed solid edge.
    theta = u * math.tau
    clumps = .5 + .5 * np.cos(theta * 18 + .35 * np.sin(theta * 6))
    fibers = .5 + .5 * np.cos(flow * 380 + .25 * np.sin(flow * 47))
    edge = .941 + .023 * clumps + .008 * fibers
    alpha = np.clip((edge - v) / .025, 0, 1)
    rgba[:, :, 3] = np.minimum(rgba[:, :, 3], 1 - front + front * alpha)
    return rgba


def shape_temple_flow(mapping, report, apply):
    ob = bpy.data.objects[NAME]
    rig = bpy.data.objects['AvatarSkeleton']
    body = Surface(rig, bpy.data.objects['AvatarBody']).tree
    cap = Surface(rig, bpy.data.objects['Complete scalp']).tree
    lens = Surface(rig, bpy.data.objects['PLURR goggle lens']).tree
    p = array(ob); q = p.copy()
    attr = ob.data.color_attributes['ReferenceHairTint']
    colors = np.array([v.color[:] for v in attr.data])
    fitted = 0
    for i, ids in enumerate(islands(ob)):
        r = p[ids].reshape(28, 3, 3)
        old = (r[:, 0] + r[:, 2]) * .5
        half = (r[:, 2] - r[:, 0]) * .5
        relief = r[:, 1] - old
        lock, layer = divmod(i, 5)
        t = np.clip((np.arange(28) - 2) / 25, 0, 1)
        free = smooth(t / .38)
        bell = np.sin(math.pi * t) ** 2
        tail = smooth((t - .40) / .60)
        c = old.copy()
        c[:, 0] += [-.009, -.005, -.003, .001, -.002, .001, -.001][lock] * tail
        c[:, 2] -= [.022, .013, .008, .004, 0, .002, 0][lock] * tail
        c[:, 2] += .0012 * math.sin(lock * 2.1) * bell
        c[:, 1] -= (.0018 + .0003 * layer) * bell
        rr = r.copy()
        for j in range(3, 28):
            a = Vector(old[min(j + 1, 27)] - old[j - 1]).normalized()
            b = Vector(c[min(j + 1, 27)] - c[j - 1]).normalized()
            rotation = a.rotation_difference(b)
            h = (rotation @ Vector(half[j])) * (1 + .50 * free[j] * (1 - tail[j]) - .30 * tail[j])
            ridge = rotation @ Vector(relief[j])
            rr[j] = [c[j] - h, c[j] + ridge, c[j] + h]
            for k in range(3):
                point = rr[j, k].copy()
                for _ in range(3):
                    hit, normal, _, _ = body.find_nearest(Vector(point))
                    if (Vector(point) - hit).dot(normal) < .003:
                        point[:] = hit + normal * .003
                    hit, _, _, _ = cap.ray_cast(Vector((point[0], -.5, point[2])), Vector((0, 1, 0)), 1)
                    if hit is not None: point[1] = min(point[1], hit.y - .0015)
                    hit, _, _, _ = lens.ray_cast(Vector((point[0], -.5, point[2])), Vector((0, 1, 0)), 1)
                    if hit is not None: point[1] = max(point[1], hit.y + .0015)
                fitted += int(np.linalg.norm(point - rr[j, k]) > 1e-8)
                rr[j, k] = point
            colors[ids[j * 3:j * 3 + 3], :3] *= 1 + .28 * free[j]
        q[ids] = rr.reshape(-1, 3)
    previous = dict(report[NAME])
    apply(ob, q, mapping, report)
    mapping.pop(NAME, None)  # Full addition, rather than an original GLB mesh.
    attr.data.foreach_set('color', np.clip(colors, 0, 1).astype(np.float32).ravel())
    report[NAME].update({k: v for k, v in previous.items() if k not in report[NAME]})
    report['templeFlow'] = {
        'cards': 35, 'retainedRootRows': 3, 'changedVertices': int(np.count_nonzero(np.linalg.norm(q-p, axis=1)>1e-7)),
        'maximumMovementMm': float(np.linalg.norm(q-p, axis=1).max()*1000),
        'fittedVertices': fitted, 'addedGeometry': 0,
        'frontUnderpaintingAlpha': 'Uneven broad lock ends with fine fiber tips; RGB and rear coverage retained.'}
