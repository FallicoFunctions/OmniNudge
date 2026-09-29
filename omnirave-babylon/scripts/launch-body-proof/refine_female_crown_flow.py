"""Loosen the repeated upper pony arc into staggered, rounded strand groups.

Connection map: the first two pairs remain on the existing pony carrier; the
tie, carrier and scalp connector stay exact. Only the upper half of long
cards and inner fibers changes, with zero displacement/tangent at either end.
Forty short crown wisps sweep down across the bridge, with their first two
pairs retained; the other crown wisps, cheek fibers and lower waves stay exact.
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
from refine_female_crown import bezier


def upper_end(count):
    return int(round(count * .5))


def loosen_crown(mapping, report, apply, materials):
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
    max_fit = 0.; selected = {n: [] for n in NAMES}; short_selected = []
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
    name = 'Polished female flyaways'; p = bases[name]
    for i, ids in enumerate(islands(bpy.data.objects[name])):
        if i % 3 or (i // 3) % 3 == 0: continue
        r = p[ids].reshape(-1, 2, 3); old = r.mean(1); n = len(r)
        phase = (i // 3) * 2.399963; root = old[0]
        incoming = old[1] - root; incoming /= np.linalg.norm(incoming)
        tip = root + np.array([-.060 + .012 * math.sin(phase),
                              -.034 + .018 * math.cos(phase),
                              -.025 + .012 * math.sin(phase + .7)])
        u = np.linspace(0, 1, n - 1)
        c = old.copy()
        c[1:] = bezier([old[1], old[1] + incoming * .024,
                         tip + [.020, -.010, .036], tip], u)
        half = (r[:, 1] - r[:, 0]) * .5; h = half.copy()
        for j in range(2, n):
            a = Vector(old[min(j + 1, n - 1)] - old[j - 1]).normalized()
            b = Vector(c[min(j + 1, n - 1)] - c[j - 1]).normalized()
            h[j] = (a.rotation_difference(b) @ Vector(half[j])) * (1 + .35 * math.sin(math.pi * u[j - 1]))
        rr = np.stack([c - h, c + h], axis=1); rr[:2] = r[:2]
        da, db = [v[ids].reshape(n, 2, 3) for v in deltas[name]]
        shift = np.zeros(n)
        for delta in [np.zeros_like(da), da + db, da - db, -da + db, -da - db]:
            for j in range(2, n):
                for point in (rr + delta)[j]:
                    hit, _, _, _ = body.ray_cast(Vector((point[0], point[1], 2.2)), Vector((0, 0, -1)), 1)
                    if hit is not None: shift[j] = max(shift[j], hit.z + .004 - point[2])
        for _ in range(2):
            smoothed = shift.copy(); smoothed[2:-1] = .15 * shift[1:-2] + .70 * shift[2:-1] + .15 * shift[3:]
            shift = np.maximum(shift, smoothed)
        rr[:, :, 2] += shift[:, None]; max_fit = max(max_fit, float(shift.max()))
        revised[name][ids] = rr.reshape(-1, 3); counts[name] += 1
        selected[name].append(ids[0]); short_selected.append(ids[0])
    for name, q in revised.items():
        prior = dict(report[name]); old_mapping = dict(mapping[name])
        apply(bpy.data.objects[name], q, mapping, report)
        if 'addedUv' in old_mapping: mapping[name]['addedUv'] = old_mapping['addedUv']
        report[name].update({k: v for k, v in prior.items() if k not in report[name]})
    # Match the fine crown fibers to the softer highlights on the long locks.
    # Their old broad, gray highlight made the gathered bridge look molded.
    # Reuse the existing fiber-normal image; alpha/UV/pigment textures stay exact.
    changed_materials = []
    for name in ['PLURR pony surface fibers', 'Polished female flyaways']:
        mat = bpy.data.objects[name].data.materials[0]; tree = mat.node_tree
        bs = tree.nodes['Principled BSDF']
        bs.inputs['Roughness'].default_value = .72
        bs.inputs['Specular IOR Level'].default_value = .06
        for link in list(bs.inputs['Normal'].links): tree.links.remove(link)
        tex = tree.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images['female-brunette-fiber-normal']
        normal = tree.nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .78
        tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
        tree.links.new(normal.outputs['Normal'], bs.inputs['Normal'])
        materials[mat.name].update(roughness=.72, specular=.12,
                                  normalTexture='female-brunette-fiber-normal.png', normalScale=.78)
        changed_materials.append(mat.name)
    report['crownFlow'] = {'cards': len(rows) + len(short_selected), 'byMesh': counts, 'guideGroups': 18,
        'selectedCardFirstVertices': selected, 'retainedRootPairs': 2,
        'drapedShortCrownCardFirstVertices': short_selected,
        'unchangedLowerStartPair': {n: upper_end(len(rows[next(i for i, v in enumerate(rows) if v[0] == n)][2])) for n in NAMES},
        'maximumAdditionalBodyFitMm': max_fit * 1000, 'addedGeometry': 0,
        'softenedCrownMaterials': changed_materials,
        'relativeSecondaryShapesRetained': True, 'allTextureBytesRetained': True}
