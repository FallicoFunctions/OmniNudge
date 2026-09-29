"""Recess the exposed pony connector inside the gathered hair.

Connection map: six existing connector rings span the scalp-to-carrier join.
Their centerline and both endpoint centers stay fixed; only radial thickness
shrinks to 35%. The original centerline penetration at both ends is retained.
The carrier, tie and every hair-card root stay exact. This is an internal hair
support rather than a structural beam; its overlap follows the measured join.
Origins, head weights, topology, UVs, materials and relative shapes stay exact.
"""
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface

NAME = 'PLURR gathered pony root'


def recess_connector(mapping, report, apply):
    ob = bpy.data.objects[NAME]; p = array(ob); assert p.shape == (96, 3)
    rings = p.reshape(6, 16, 3); centers = rings.mean(1)
    q = (centers[:, None, :] + (rings - centers[:, None, :]) * .35).reshape(-1, 3)
    apply(ob, q, mapping, report)
    revised = array(ob).reshape(6, 16, 3)
    drift = float(np.linalg.norm(revised.mean(1) - centers, axis=1).max())
    assert drift < 1e-7
    rig = bpy.data.objects['AvatarSkeleton']; ends = {}
    for index, name in [(0, 'Complete scalp'), (5, 'PLURR gathered pony bundle')]:
        tree = Surface(rig, bpy.data.objects[name]).tree
        hit, normal, _, distance = tree.find_nearest(Vector(centers[index]))
        ends[name] = {'endpointCenter': centers[index].tolist(), 'surfaceDistanceMm': distance * 1000,
                      'nearestPlaneSignedDistanceMm': (Vector(centers[index]) - hit).dot(normal) * 1000}
    report['gatheredRoot'] = {'mesh': NAME, 'vertices': len(p), 'radialScale': .35,
        'maximumCenterlineDriftMm': drift * 1000, 'unchangedEndpointCenters': True,
        'originalRadiusMm': [float(np.linalg.norm(r - c, axis=1).max() * 1000) for r, c in zip(rings, centers)],
        'revisedRadiusMm': [float(np.linalg.norm(r - c, axis=1).max() * 1000) for r, c in zip(revised, centers)],
        'endpointSurfaceMeasurements': ends, 'addedGeometry': 0, 'relativeSecondaryShapesRetained': True}
