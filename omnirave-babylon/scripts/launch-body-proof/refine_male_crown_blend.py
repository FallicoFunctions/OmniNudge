"""Blend the crown sweep ends into the neighboring frontal hair.

Connection map: the first six pairs of the 168 redirected crown ribbons stay
exact on their existing roots and arches. Their ends overlap the measured
forward crown gap and the retained front-wave support. Preserve all other
hair, origins, topology, UVs, colors, materials, weights, and relative morphs.
Fit free edges to sampled skin with millimeter hair-layer clearance.
"""
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges


def blend_crown_ends(mapping, report, apply):
    ob = bpy.data.objects['Luxury retained swept groom']
    rig = bpy.data.objects['AvatarSkeleton']
    original = array(ob); cards = original.reshape(-1, 12, 2, 3)
    paths = cards.mean(2); revised = original.copy()
    t = np.linspace(0, 1, 12); late = smooth((t - t[5]) / (1 - t[5]))
    minimum_profile = np.array([0, 0, 0, 0, 0, 0, .50, .45, .40, .32, .18, .018])
    edited = []
    for i, card in enumerate(cards):
        path = paths[i]; root = path[0]; tip = path[-1]
        bridge = (root[2] > 1.783 and .012 < root[0] < .045
                  and -.055 < root[1] < .014 and tip[0] < -.015 and tip[2] > 1.790)
        if not bridge: continue
        front = float(smooth((-root[1] + .012) / .045))
        if front < .002: continue
        c = path.copy()
        c[:, 0] -= .004 * front * late
        c[:, 1] -= .034 * front * late
        c[:, 2] -= .004 * front * late
        c[:6] = path[:6]
        half = (card[:, 1] - card[:, 0]) * .5
        root_width = float(np.linalg.norm(card[0, 1] - card[0, 0]))
        for j in range(6, 12):
            tangent = Vector(c[min(j + 1, 11)] - c[j - 1]).normalized()
            lateral = np.cross(c[j] - np.array([0, -.048, 1.70]), np.array(tangent))
            lateral /= max(np.linalg.norm(lateral), 1e-10)
            if np.dot(lateral, half[j - 1]) < 0: lateral *= -1
            width = float(np.linalg.norm(half[j]) * 2)
            width += max(0, root_width * minimum_profile[j] - width) * front
            half[j] = lateral * width * .5
        result = np.stack([c - half, c + half], axis=1); result[:6] = card[:6]
        revised[i * 24:(i + 1) * 24] = result.reshape(-1, 3)
        edited.append(i)
    assert edited, 'Expected the previously authored crown sweep'
    fitted = fit_motion_envelope(ob, original, revised, rig, pairwise=True)
    previous = report.get(ob.name, {}).copy(); previous_map = mapping[ob.name].copy()
    apply(ob, revised, mapping, report)
    fitted_pairs = fit_evaluated_edges(ob, original, rig, mapping, report, apply)
    for key in ['addedUv', 'addedColors']:
        if key in previous_map: mapping[ob.name][key] = previous_map[key]
    report[ob.name] = {**previous, **report[ob.name], 'blendedCrownEnds': True}
    final = array(ob)
    result = {'editedRibbons': len(edited), 'editedRibbonIndices': edited,
              'crownBridgeRibbons': len(edited), 'crownBridgeRibbonIndices': edited,
              'totalRibbons': len(paths), 'fixedPairsPerRibbon': 6,
              'skinFitVertices': fitted, 'evaluatedFitPairs': fitted_pairs,
              'beforePeakM': float(original[:, 2].max()), 'afterPeakM': float(final[:, 2].max()),
              'maxMovementMm': float(np.linalg.norm(final - original, axis=1).max() * 1000),
              'materialsAndVertexColorsUnchanged': True}
    print('MALE_CROWN_BLEND', {k: v for k, v in result.items() if not k.endswith('Indices')}, flush=True)
    return result
