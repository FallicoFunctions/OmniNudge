"""A reference-based face and head likeness pass, applied after the hair-only contract.

Connection map: the continuous body surface tapers through the jaw into the
unchanged neck. Mouth compression shares one field with its surrounding skin
and every expression shape. Eyelids, ears, hair roots and accessories are outside
the field. The iris shader receives a warm-brown tint without changing its image. Origins, topology, UVs and skin weights stay intact.
"""
import numpy as np

SPEC = {
    'version': 2,
    'jawCenterZ': 1.530, 'jawHalfHeight': .059,
    'jawFrontY': -.047, 'jawFrontSpan': .050,
    'jawTaper': .15,
    'mouthCenterZ': 1.5430644, 'mouthHalfHeight': .025,
    'mouthHalfWidth': .047, 'mouthFrontY': -.121,
    'mouthFrontSpan': .016, 'mouthCompress': .34,
    'mouthRecess': .0025,
    'mouthWiden': .16, 'cornerLift': .0004,
    'cornerX': .022, 'cornerHalfWidth': .016, 'cornerHalfHeight': .015,
    'smileScale': .55,
    'chinCenterZ': 1.508, 'chinHalfHeight': .030,
    'chinHalfWidth': .047, 'chinFrontY': -.074, 'chinFrontSpan': .042,
    'chinRecess': .0022, 'chinLift': .0018,
    'cheekCenterX': .034, 'cheekHalfWidth': .023,
    'cheekCenterZ': 1.580, 'cheekHalfHeight': .016,
    'cheekFrontY': -.060, 'cheekFrontSpan': .045,
    'cheekFullness': .0012,
    'noseCenterZ': 1.574, 'noseHalfHeight': .024,
    'noseHalfWidth': .024, 'noseFrontY': -.124, 'noseFrontSpan': .022,
    'noseRecess': .0022, 'noseTaper': .05,
    'irisColorFactor': [1.0, .46, .24, 1.0],
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
    if spec['version'] >= 2:
        chin = 1-smooth(abs(p[:, 2]-spec['chinCenterZ'])/spec['chinHalfHeight'])
        chin *= 1-smooth(abs(p[:, 0])/spec['chinHalfWidth'])
        chin *= smooth((spec['chinFrontY']-p[:, 1])/spec['chinFrontSpan'])
        q[:, 1] += spec['chinRecess']*chin
        q[:, 2] += spec['chinLift']*chin
        cheek = 1-smooth(abs(abs(p[:, 0])-spec['cheekCenterX'])/spec['cheekHalfWidth'])
        cheek *= 1-smooth(abs(p[:, 2]-spec['cheekCenterZ'])/spec['cheekHalfHeight'])
        cheek *= smooth((spec['cheekFrontY']-p[:, 1])/spec['cheekFrontSpan'])
        q[:, 1] -= spec['cheekFullness']*cheek
        nose = 1-smooth(abs(p[:, 0])/spec['noseHalfWidth'])
        nose *= 1-smooth(abs(p[:, 2]-spec['noseCenterZ'])/spec['noseHalfHeight'])
        nose *= smooth((spec['noseFrontY']-p[:, 1])/spec['noseFrontSpan'])
        q[:, 1] += spec['noseRecess']*nose
        q[:, 0] -= spec['noseTaper']*p[:, 0]*nose
    return q


def apply_iris_tint(spec):
    if spec['version'] < 2:
        return
    import bpy
    mat = bpy.data.materials['Launch female iris']
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tint = nodes.get('Reference warm iris tint')
    if tint is None:
        source = bsdf.inputs['Base Color'].links[0].from_socket
        tint = nodes.new('ShaderNodeMixRGB')
        tint.name = 'Reference warm iris tint'
        tint.blend_type = 'MULTIPLY'; tint.inputs[0].default_value = 1
        links.new(source, tint.inputs[1]); links.new(tint.outputs[0], bsdf.inputs['Base Color'])
    tint.inputs[2].default_value = spec['irisColorFactor']


def apply_to_body(body, spec=SPEC):
    # All retained body transforms are identity; the same rest-space field is
    # applied to exported vertices, including independently simplified LODs.
    assert np.array_equal(np.array(body.matrix_world), np.eye(4))
    apply_iris_tint(spec)
    before = np.array([v.co[:] for v in body.data.vertices])
    after = warp(before, spec).astype(np.float32)
    for key in body.data.shape_keys.key_blocks:
        points = np.array([v.co[:] for v in key.data])
        revised = warp(points, spec)
        if key.name=='Expression_Smile':revised = after+(revised-after)*spec['smileScale']
        key.data.foreach_set('co', revised.astype(np.float32).ravel())
    body.data.vertices.foreach_set('co', after.ravel()); body.data.update()
    return {'spec': spec, 'mesh': body.name,
            'changedVertices': int(np.any(after != before, axis=1).sum()),
            'maximumDisplacementMm': float(np.linalg.norm(after-before, axis=1).max()*1000),
            'expressionShapes': [k.name for k in body.data.shape_keys.key_blocks[1:]],
            'scope': 'Jaw, chin, cheek, nose and lip proportions, a restrained smile morph, and a warm iris tint; topology, texture images, skin weights and locomotion retained.'}
