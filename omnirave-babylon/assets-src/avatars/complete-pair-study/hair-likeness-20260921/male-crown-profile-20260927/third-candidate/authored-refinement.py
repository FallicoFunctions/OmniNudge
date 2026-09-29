"""Round the broad crown shelf into an off-center, sideways swept crest.

Connection map: both original root pairs remain attached to the retained
scalp. Lower forehead pairs retain their exact positions. A small set of
posterior upper locks is redirected over the exposed crown; remaining pairs
below 1.775 m stay exact. Upper free ribbons overlap the existing groom;
skin clearance uses millimeter hair layers, not structural assembly overlap.
Preserve topology, origins, UVs, weights, colors, and relative morph offsets.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges


def round_crown_profile(mapping, report, apply):
    ob = bpy.data.objects['Luxury retained swept groom']
    rig = bpy.data.objects['AvatarSkeleton']
    original = array(ob); cards = original.reshape(-1, 12, 2, 3)
    paths = cards.mean(2); revised = original.copy()
    t = np.linspace(0, 1, 12); free = smooth((t - t[1]) / .30)
    late = smooth((t - .58) / .42)
    edited = []; bridges = []
    for i, card in enumerate(cards):
        c = paths[i].copy()
        # Whole pairs share a mask, so the thin ribbons keep their width.
        high = smooth((card[:, :, 2].min(1) - 1.775) / .025)
        front_crown = 1 - smooth((c[:, 1] + .008) / .060)
        influence = high * free * front_crown
        if influence.max() < .02: continue
        x, y = c[:, 0].copy(), c[:, 1].copy()
        dome = np.exp(-((x + .016) / .053) ** 2 - ((y + .071) / .088) ** 2)
        corner = smooth((np.abs(x) - .037) / .035)
        # An asymmetric arch replaces the broad nearly level top.
        c[:, 2] += (.015 * dome - .0045 * corner) * influence
        c[:, 0] -= .007 * dome * influence
        c[:, 1] += .006 * dome * influence
        # Turn high endpoints back into the arch instead of lifting them
        # into separate upright fins along the top silhouette.
        c[:, 2] -= .010 * dome * influence * late
        c[:, 1] += .010 * dome * influence * late
        c[:, 0] -= .003 * dome * influence * late
        # Shallow channels run with the sweep, separating adjacent waves.
        across = x + .10 * (y + .070) + .003 * np.sin((y + .09) * 24)
        channels = np.cos((across + .008) / .025 * math.tau)
        c[:, 2] += .0024 * channels * dome * influence
        root = paths[i, 0]
        bridge = (root[2] > 1.783 and .012 < root[0] < .045
                  and -.055 < root[1] < .014 and paths[i, -1, 1] > -.070)
        if bridge:
            # These high side roots previously pointed away from the crown,
            # leaving its center uncovered. Lay their free lengths across it.
            start = paths[i, 1]
            tangent = paths[i, 1] - root
            tangent /= max(np.linalg.norm(tangent), 1e-10)
            bend = start + tangent * .009
            end = np.array([-.026 + (root[0] - .028) * .24,
                            root[1] + .016, 1.802 + .003 * math.sin(i * 2.399963)])
            crest = np.array([-.006, root[1] + .008, 1.829])
            u = np.clip((t - t[1]) / (1 - t[1]), 0, 1)[:, None]
            c = (1-u)**3 * start + 3*(1-u)**2*u*bend + 3*(1-u)*u**2*crest + u**3*end
            influence[2:] = 1
            bridges.append(i)
        c[:2] = paths[i, :2]
        half = (card[:, 1] - card[:, 0]) * .5
        for j in range(2, 12):
            if influence[j] == 0: continue
            before = Vector(paths[i, min(j + 1, 11)] - paths[i, j - 1]).normalized()
            after = Vector(c[min(j + 1, 11)] - c[j - 1]).normalized()
            half[j] = np.array(before.rotation_difference(after) @ Vector(half[j]))
        result = np.stack([c - half, c + half], axis=1)
        result[influence == 0] = card[influence == 0]
        result[:2] = card[:2]
        revised[i * 24:(i + 1) * 24] = result.reshape(-1, 3)
        edited.append(i)
    fitted = fit_motion_envelope(ob, original, revised, rig, pairwise=True)
    previous = report.get(ob.name, {}).copy(); previous_map = mapping[ob.name].copy()
    apply(ob, revised, mapping, report)
    fitted_pairs = fit_evaluated_edges(ob, original, rig, mapping, report, apply)
    for key in ['addedUv', 'addedColors']:
        if key in previous_map: mapping[ob.name][key] = previous_map[key]
    report[ob.name] = {**previous, **report[ob.name], 'roundedCrownProfile': True}
    final = array(ob)
    result = {'editedRibbons': len(edited), 'editedRibbonIndices': edited,
              'totalRibbons': len(paths), 'fixedRootPairsPerRibbon': 2,
              'fixedPairsBelowHeightMExceptCrownBridges': 1.775,
              'crownBridgeRibbons': len(bridges), 'crownBridgeRibbonIndices': bridges,
              'skinFitVertices': fitted, 'evaluatedFitPairs': fitted_pairs,
              'beforePeakM': float(original[:, 2].max()),
              'afterPeakM': float(final[:, 2].max()),
              'maxMovementMm': float(np.linalg.norm(final - original, axis=1).max() * 1000),
              'materialsAndVertexColorsUnchanged': True}
    print('MALE_CROWN_PROFILE', {k: v for k, v in result.items() if k != 'editedRibbonIndices'}, flush=True)
    return result
