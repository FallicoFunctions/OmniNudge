"""Break up pointed rear fans into compact overlapping waves.

Connection map: retain the first two root pairs on the scalp exactly. Free
posterior ribbons overlap the existing scalp support at millimeter hair-layer
clearance. Preserve the frontal locks, topology, origins, UVs, vertex colors,
weights, and relative motion shapes; fit changed edges across sampled poses.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface, smooth
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges


def soften_rear_flow(mapping, report, apply):
    ob = bpy.data.objects['Luxury retained swept groom']
    rig = bpy.data.objects['AvatarSkeleton']
    original = array(ob); ribbons = original.reshape(-1, 12, 2, 3)
    paths = ribbons.mean(2); revised = original.copy()
    groups = group_paths(paths, 96)
    guides = {g: paths[groups == g].mean(0) for g in np.unique(groups)}
    scalp = Surface(rig, bpy.data.objects['Complete scalp'])
    center = scalp.array.mean(0); center[2] -= .045
    t = np.linspace(0, 1, 12); free = smooth((t - t[1]) / .67)
    late = smooth((t - .38) / .62)
    changed = []
    for i, ribbon in enumerate(ribbons):
        path = paths[i]; guide = guides[groups[i]]
        # Roots and endpoints both lie behind the frontal sweep. Protect each
        # whole ribbon, so even the upper arc of a forehead lock stays exact.
        if path[-1, 1] < -.070 or path[0, 1] < -.062: continue
        weight = float(smooth((path[-1, 1] + .070) / .060)
                       * smooth((path[0, 1] + .062) / .042))
        if weight < .04: continue
        phase = int(groups[i]) * 2.399963
        c = path.copy()
        # Stagger the lengths inside each lock instead of converging all
        # narrow cards to one long, pointed fan. Resample the existing curve.
        shorten = (.08 + .27 * (.5 + .5 * math.sin(i * 2.399963))) * weight
        sample = t - shorten * late
        c = np.stack([np.interp(sample, t, path[:, axis]) for axis in range(3)], axis=1)
        root_spread = path[0] - guide[0]
        length = np.linalg.norm(root_spread)
        if length > .008: root_spread *= .008 / length
        c += root_spread * (2.8 * weight * free)[:, None]
        # Lay the rear arch closer to the skull. A little varying lift keeps
        # distinct waves while removing the raised, curtain-like clumps.
        for j in range(2, 12):
            hit, normal, _, _ = scalp.tree.find_nearest(Vector(c[j]))
            if normal.dot(hit - Vector(center)) < 0: normal = -normal
            lift = .004 + .005 * math.sin(math.pi * t[j]) + .0015 * (.5 + .5 * math.sin(phase))
            target = np.array(hit + normal * lift)
            correction = (target - c[j]) * (.76 * weight * free[j])
            size = np.linalg.norm(correction)
            if size > .016: correction *= .016 / size
            c[j] += correction
        # Gentle sideways flow connects neighboring rear waves.
        c[:, 0] += .0035 * math.sin(phase) * weight * np.sin(math.pi * t) * free
        for _ in range(2):
            relaxed = .18 * c[:-2] + .64 * c[1:-1] + .18 * c[2:]
            c[2:-1] += (relaxed[1:] - c[2:-1]) * weight
        c[:2] = path[:2]
        half = (ribbon[:, 1] - ribbon[:, 0]) * .5
        for j in range(2, 12):
            before = Vector(path[min(j + 1, 11)] - path[j - 1]).normalized()
            after = Vector(c[min(j + 1, 11)] - c[j - 1]).normalized()
            half[j] = np.array(before.rotation_difference(after) @ Vector(half[j]))
        rr = np.stack([c - half, c + half], axis=1); rr[:2] = ribbon[:2]
        revised[i * 24:(i + 1) * 24] = rr.reshape(-1, 3)
        changed.append(i)
    fitted = fit_motion_envelope(ob, original, revised, rig, pairwise=True)
    previous = report.get(ob.name, {}).copy()
    previous_map = mapping[ob.name].copy()
    apply(ob, revised, mapping, report)
    fitted_pairs = fit_evaluated_edges(ob, original, rig, mapping, report, apply)
    for key in ['addedUv', 'addedColors']:
        if key in previous_map: mapping[ob.name][key] = previous_map[key]
    report[ob.name] = {**previous, **report[ob.name], 'softenedRearFlow': True}
    result = {'editedRibbons': len(changed), 'editedRibbonIndices': changed,
              'totalRibbons': len(paths), 'fixedRootPairsPerRibbon': 2,
              'skinFitVertices': fitted, 'evaluatedFitPairs': fitted_pairs,
              'maxMovementMm': float(np.linalg.norm(array(ob) - original, axis=1).max() * 1000),
              'materialsAndVertexColorsUnchanged': True}
    print('MALE_REAR_FLOW', {k: v for k, v in result.items() if k != 'editedRibbonIndices'}, flush=True)
    return result
