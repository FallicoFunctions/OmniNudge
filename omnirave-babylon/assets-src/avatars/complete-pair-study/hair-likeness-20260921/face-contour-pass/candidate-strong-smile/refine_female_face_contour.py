"""A restrained lower-face likeness pass, applied after the hair-only contract.

Connection map: the continuous body surface tapers through the jaw into the
unchanged neck. Mouth compression shares one field with its surrounding skin
and every expression shape. Eyes, ears, hair roots and accessories are outside
the field. Origins, topology, UVs and skin weights stay intact.
"""
import numpy as np

SPEC = {
    'version': 1,
    'jawCenterZ': 1.530, 'jawHalfHeight': .059,
    'jawFrontY': -.047, 'jawFrontSpan': .050,
    'jawTaper': .065,
    'mouthCenterZ': 1.5430644, 'mouthHalfHeight': .025,
    'mouthHalfWidth': .038, 'mouthFrontY': -.121,
    'mouthFrontSpan': .016, 'mouthCompress': .24,
    'mouthRecess': .0011,
    'mouthWiden': .055, 'cornerLift': .0012,
    'cornerX': .022, 'cornerHalfWidth': .016, 'cornerHalfHeight': .015,
}


def smooth(x):
    x = np.clip(x, 0, 1)
    return x*x*(3-2*x)


def warp(points, spec=SPEC):
    p = np.asarray(points, dtype=float); q = p.copy()
    jaw = (1-smooth(abs(p[:, 2]-spec['jawCenterZ'])/spec['jawHalfHeight']))
    jaw *= smooth((spec['jawFrontY']-p[:, 1])/spec['jawFrontSpan'])
    q[:, 0] *= 1-spec['jawTaper']*jaw
    mouth = (1-smooth(abs(p[:, 0])/spec['mouthHalfWidth']))
    mouth *= 1-smooth(abs(p[:, 2]-spec['mouthCenterZ'])/spec['mouthHalfHeight'])
    mouth *= smooth((spec['mouthFrontY']-p[:, 1])/spec['mouthFrontSpan'])
    q[:, 2] -= spec['mouthCompress']*(p[:, 2]-spec['mouthCenterZ'])*mouth
    q[:, 1] += spec['mouthRecess']*mouth
    q[:, 0] += spec['mouthWiden']*p[:, 0]*mouth
    corner = 1-smooth(abs(abs(p[:, 0])-spec['cornerX'])/spec['cornerHalfWidth'])
    corner *= 1-smooth(abs(p[:, 2]-spec['mouthCenterZ'])/spec['cornerHalfHeight'])
    corner *= smooth((-.095-p[:, 1])/.025)
    q[:, 2] += spec['cornerLift']*corner
    return q


def apply_to_body(body, spec=SPEC):
    # All retained body transforms are identity; the same rest-space field is
    # applied to exported vertices, including independently simplified LODs.
    assert np.array_equal(np.array(body.matrix_world), np.eye(4))
    before = np.array([v.co[:] for v in body.data.vertices])
    after = warp(before, spec).astype(np.float32)
    for key in body.data.shape_keys.key_blocks:
        points = np.array([v.co[:] for v in key.data])
        key.data.foreach_set('co', warp(points, spec).astype(np.float32).ravel())
    body.data.vertices.foreach_set('co', after.ravel()); body.data.update()
    return {'spec': spec, 'mesh': body.name,
            'changedVertices': int(np.any(after != before, axis=1).sum()),
            'maximumDisplacementMm': float(np.linalg.norm(after-before, axis=1).max()*1000),
            'expressionShapes': [k.name for k in body.data.shape_keys.key_blocks[1:]],
            'scope': 'Lower-face geometry only; no texture, topology, skin-weight or animation edits.'}
