"""Loosen the repeated upper pony arc into staggered, rounded strand groups.

Connection map: the first two pairs remain on the existing pony carrier; the
tie, carrier and scalp connector stay exact. Only the upper half of long
cards and inner fibers changes, with zero displacement/tangent at either end.
Short crown/cheek wisps and the previously shaped lower waves remain exact.
Actual card edges are fitted above the head by 4 mm in neutral and four
secondary corners. Hair uses millimeter clearance; all origins, head weights,
UVs, colors and relative secondary displacements retain their owners.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_upper_flow import active_card, NAMES


def upper_end(count):
    return int(round(count * .5))


def loosen_crown(mapping, report, apply):
    rig = bpy.data.objects['AvatarSkeleton']
    body = Surface(rig, bpy.data.objects['AvatarBody']).tree
    bases = {n: array(bpy.data.objects[n]) for n in NAMES}
    revised = {n: p.copy() for n, p in bases.items()}
    rows = []; paths = []; deltas = {}; counts = {n: 0 for n in NAMES}
    for name, p in bases.items():
        ob = bpy.data.objects[name]
        deltas[name] = [np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data]) - p
                       for k in ['Secondary_HairSide', 'Secondary_HairBack']]
        for i, ids in enumerate(islands(ob)):
            if not active_card(name, ids, i): continue
            r = p[ids].reshape(-1, 2, 3); c = r.mean(1)
            # Compare the upper arcs at a common sampling density, so nearby
            # inner fibers and outer cards receive a coherent flow direction.
            t = np.arange(len(c)); sample = np.linspace(0, upper_end(len(c)), 18)
            paths.append(np.stack([np.interp(sample, t, c[:, axis]) for axis in range(3)], axis=1))
            rows.append((name, ids, r))
    groups = group_paths(np.array(paths), 18)
    max_fit = 0.; selected = {n: [] for n in NAMES}
    for i, (name, ids, r) in enumerate(rows):
        old = r.mean(1); n = len(r); end = upper_end(n)
        u = np.clip((np.arange(n) - 1) / (end - 1), 0, 1)
        envelope = np.sin(math.pi * u) ** 2
        envelope[:2] = 0; envelope[end:] = 0
        phase = int(groups[i]) * 2.399963
        c = old.copy()
        c[:, 0] += (.005 + .011 * math.sin(phase)) * envelope
        c[:, 1] += .014 * math.cos(phase + .4) * envelope
        c[:, 2] += (-.003 + .010 * math.sin(phase + .8)) * envelope
        half = (r[:, 1] - r[:, 0]) * .5; h = half.copy()
        for j in range(2, end):
            a = Vector(old[j + 1] - old[j - 1]).normalized()
            b = Vector(c[j + 1] - c[j - 1]).normalized()
            h[j] = (a.rotation_difference(b) @ Vector(half[j])) * (1 - .12 * envelope[j])
        rr = np.stack([c - h, c + h], axis=1); rr[:2] = r[:2]; rr[end:] = r[end:]
        da, db = [v[ids].reshape(n, 2, 3) for v in deltas[name]]
        shift = np.zeros(n)
        for delta in [np.zeros_like(da), da + db, da - db, -da + db, -da - db]:
            for j in range(2, end):
                for point in (rr + delta)[j]:
                    hit, _, _, _ = body.ray_cast(Vector((point[0], point[1], 2.2)), Vector((0, 0, -1)), 1)
                    if hit is not None: shift[j] = max(shift[j], hit.z + .004 - point[2])
        rr[:, :, 2] += shift[:, None]
        max_fit = max(max_fit, float(shift.max()))
        assert np.array_equal(rr[:2], r[:2]) and np.array_equal(rr[end:], r[end:])
        revised[name][ids] = rr.reshape(-1, 3); counts[name] += 1; selected[name].append(ids[0])
    for name, q in revised.items():
        prior = dict(report[name]); old_mapping = dict(mapping[name])
        apply(bpy.data.objects[name], q, mapping, report)
        if 'addedUv' in old_mapping: mapping[name]['addedUv'] = old_mapping['addedUv']
        report[name].update({k: v for k, v in prior.items() if k not in report[name]})
    report['crownFlow'] = {'cards': len(rows), 'byMesh': counts, 'guideGroups': 18,
        'selectedCardFirstVertices': selected, 'retainedRootPairs': 2,
        'unchangedLowerStartPair': {n: upper_end(len(rows[next(i for i, v in enumerate(rows) if v[0] == n)][2])) for n in NAMES},
        'maximumAdditionalBodyFitMm': max_fit * 1000, 'addedGeometry': 0,
        'relativeSecondaryShapesRetained': True, 'allTextureBytesRetained': True}
