"""A reference-based face and head likeness pass, applied after the hair-only contract.

Connection map: the continuous body surface tapers through the jaw into the
unchanged neck. Mouth compression shares one field with its surrounding skin
and every expression shape. The orbital skin, eyelids, lash roots and brow
ribbons share one continuous field, maintaining their existing submillimeter
attachment offsets. A linear eyelid band narrows the aperture separately
from the brow angle, with its vertical fade outside the lid opening
(structural overlap does not apply to these face surfaces).
The cheek pad and chin corners blend into the continuous facial skin; their
fields fade before the lip border, ears and eye attachments.
The nasal tip and alar wings share a local skin field; the lip shoulders taper
into the mouth corners without moving the mouth interior independently.
The nasal bridge recedes through the central skin, while medial cheek volume
fades before the eyelid and lash attachments and the upper lip border.
Eyeballs, irises, ears, hair roots and accessories keep their geometry. The iris shader receives a warm-brown tint without changing its image. Origins, topology, UVs and skin weights stay intact.
"""
import numpy as np

SPEC = {
    'version': 11,
    'jawCenterZ': 1.530, 'jawHalfHeight': .059,
    'jawFrontY': -.047, 'jawFrontSpan': .050,
    'jawTaper': .055,
    'mouthCenterZ': 1.5430644, 'mouthHalfHeight': .025,
    'mouthHalfWidth': .047, 'mouthFrontY': -.121,
    'mouthFrontSpan': .016, 'mouthCompress': .25,
    'mouthRecess': .0010,
    'mouthWiden': .24, 'cornerLift': .0010,
    'cornerX': .022, 'cornerHalfWidth': .016, 'cornerHalfHeight': .015,
    'smileScale': .55,
    'jawAngleTaper': .065,
    'chinCenterZ': 1.508, 'chinHalfHeight': .030,
    'chinHalfWidth': .047, 'chinFrontY': -.074, 'chinFrontSpan': .042,
    'chinRecess': .0005, 'chinLift': .0055,
    'cheekCenterX': .034, 'cheekHalfWidth': .023,
    'cheekCenterZ': 1.580, 'cheekHalfHeight': .016,
    'cheekFrontY': -.060, 'cheekFrontSpan': .045,
    'cheekFullness': .0012,
    'noseCenterZ': 1.574, 'noseHalfHeight': .024,
    'noseHalfWidth': .024, 'noseFrontY': -.124, 'noseFrontSpan': .022,
    'noseRecess': .0022, 'noseTaper': .05,
    'outerEyeLift': .0018,
    'innerBrowLift': .0048, 'browArchRelax': .0008,
    'cupidDip': .00115, 'cupidPeak': .00055, 'upperLipRecess': .0009,
    'buccalCenterX': .048, 'buccalHalfWidth': .027,
    'buccalCenterZ': 1.559, 'buccalHalfHeight': .036,
    'buccalSideFullness': .0040, 'buccalFrontFullness': .0074,
    'cheekRidgeEase': .0025, 'cheekRidgeRecess': .0006,
    'chinCornerLift': .0033,
    'noseTipRecess': .0016, 'noseTipLift': .0011, 'noseWingInset': .0010,
    'lipShoulderCompress': .12, 'lipShoulderRecess': .0008,
    'upperLipBalanceRecess': .0005, 'lowerLipBalanceRecess': -.0006,
    'eyeCenterX': .02827054, 'eyeCenterZ': 1.6091883,
    'eyeHalfWidth': .026, 'eyeHalfHeight': .018,
    'eyeOpeningCompress': .15, 'upperLidLower': .00065,
    'bridgeCenterZ': 1.594, 'bridgeHalfHeight': .014,
    'bridgeHalfWidth': .014, 'bridgeFrontY': -.103, 'bridgeFrontSpan': .032,
    'bridgeRecess': .0018,
    'innerCheekCenterX': .024, 'innerCheekHalfWidth': .015,
    'innerCheekCenterZ': 1.579, 'innerCheekHalfHeight': .016,
    'innerCheekFrontY': -.075, 'innerCheekFrontSpan': .045,
    'innerCheekFullness': .0015,
    'almondCompress': .11, 'almondPlateau': .009, 'almondFade': .009,
    'irisColorFactor': [.48, .20, .12, 1.0],
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
        # A separate side-jaw field rounds the mandibular corners; its lateral
        # fade keeps the ears and their attachment vertices fixed.
        angle = 1-smooth(abs(p[:, 2]-1.520)/.043)
        angle *= smooth((.012-p[:, 1])/.075)
        angle *= smooth((abs(p[:, 0])-.026)/.025)
        angle *= 1-smooth((abs(p[:, 0])-.057)/.008)
        q[:, 0] *= 1-spec['jawAngleTaper']*angle
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
    if spec['version'] >= 3:
        front = smooth((-.083-p[:, 1])/.037)
        eye = smooth((abs(p[:, 0])-.025)/.020)
        eye *= 1-smooth((abs(p[:, 0])-.052)/.014)
        eye *= 1-smooth(abs(p[:, 2]-1.607)/.021)
        q[:, 2] += spec['outerEyeLift']*eye*front
        brow = 1-smooth(abs(p[:, 2]-1.624)/.028)
        inner = 1-smooth(abs(abs(p[:, 0])-.014)/.023)
        arch = 1-smooth(abs(abs(p[:, 0])-.037)/.020)
        q[:, 2] += (spec['innerBrowLift']*inner-spec['browArchRelax']*arch)*brow*front
        # Sculpt the lip border in the already-adjusted face coordinates.
        upper = 1-smooth(abs(q[:, 2]-1.549)/.008)
        upper *= smooth((-.133-q[:, 1])/.012)
        dip = 1-smooth(abs(q[:, 0])/.0065)
        peaks = 1-smooth(abs(abs(q[:, 0])-.006)/.005)
        recess = 1-smooth(abs(q[:, 0])/.013)
        q[:, 2] += (spec['cupidPeak']*peaks-spec['cupidDip']*dip)*upper
        q[:, 1] += spec['upperLipRecess']*recess*upper
    if spec['version'] >= 4:
        front = smooth((-.028-p[:, 1])/.077)
        pad = 1-smooth(abs(abs(p[:, 0])-spec['buccalCenterX'])/spec['buccalHalfWidth'])
        pad *= 1-smooth(abs(p[:, 2]-spec['buccalCenterZ'])/spec['buccalHalfHeight'])
        pad *= front
        q[:, 0] += np.sign(p[:, 0])*spec['buccalSideFullness']*pad
        q[:, 1] -= spec['buccalFrontFullness']*pad
        ridge = 1-smooth(abs(abs(p[:, 0])-.054)/.018)
        ridge *= 1-smooth(abs(p[:, 2]-1.580)/.016)
        ridge *= smooth((-.045-p[:, 1])/.055)
        q[:, 0] -= np.sign(p[:, 0])*spec['cheekRidgeEase']*ridge
        q[:, 1] += spec['cheekRidgeRecess']*ridge
        chin_corner = 1-smooth(abs(abs(p[:, 0])-.024)/.019)
        chin_corner *= 1-smooth(abs(p[:, 2]-1.504)/.023)
        chin_corner *= smooth((-.075-p[:, 1])/.045)
        q[:, 2] += spec['chinCornerLift']*chin_corner
    if spec['version'] >= 5:
        tip = 1-smooth(abs(p[:, 0])/.021)
        tip *= 1-smooth(abs(p[:, 2]-1.574)/.024)
        tip *= smooth((-.126-p[:, 1])/.022)
        wing = 1-smooth(abs(abs(p[:, 0])-.013)/.011)
        wing *= 1-smooth(abs(p[:, 2]-1.571)/.016)
        wing *= smooth((-.119-p[:, 1])/.021)
        q[:, 1] += spec['noseTipRecess']*tip
        q[:, 2] += spec['noseTipLift']*tip
        q[:, 0] -= np.sign(p[:, 0])*spec['noseWingInset']*wing
        # Evaluate every lip weight before modifying q so the field is shared
        # by the outline, adjacent skin and expression shapes in both exporters.
        lip_front = smooth((-.124-q[:, 1])/.015)
        shoulder = smooth((abs(q[:, 0])-.004)/.009)
        shoulder *= 1-smooth((abs(q[:, 0])-.014)/.009)
        shoulder *= 1-smooth(abs(q[:, 2]-spec['mouthCenterZ'])/.015)
        shoulder *= lip_front
        upper = (1-smooth(abs(q[:, 0])/.020))*(1-smooth(abs(q[:, 2]-1.549)/.009))*lip_front
        lower = (1-smooth(abs(q[:, 0])/.018))*(1-smooth(abs(q[:, 2]-1.537)/.009))*lip_front
        q[:, 1] += spec['lipShoulderRecess']*shoulder+spec['upperLipBalanceRecess']*upper+spec['lowerLipBalanceRecess']*lower
        q[:, 2] -= spec['lipShoulderCompress']*(q[:, 2]-spec['mouthCenterZ'])*shoulder
    if spec['version'] >= 6:
        # Eyelids, surrounding orbital skin and lash roots share this field.
        # The eyeballs and irises retain their original center and size.
        orbital = 1-smooth(abs(abs(p[:, 0])-spec['eyeCenterX'])/spec['eyeHalfWidth'])
        orbital *= 1-smooth(abs(p[:, 2]-spec['eyeCenterZ'])/spec['eyeHalfHeight'])
        orbital *= smooth((-.101-p[:, 1])/.018)
        upper = smooth((p[:, 2]-spec['eyeCenterZ'])/.005)
        q[:, 2] -= (spec['eyeOpeningCompress']*(p[:, 2]-spec['eyeCenterZ'])+spec['upperLidLower']*upper)*orbital
    if spec['version'] >= 9:
        bridge = 1-smooth(abs(p[:, 0])/spec['bridgeHalfWidth'])
        bridge *= 1-smooth(abs(p[:, 2]-spec['bridgeCenterZ'])/spec['bridgeHalfHeight'])
        bridge *= smooth((spec['bridgeFrontY']-p[:, 1])/spec['bridgeFrontSpan'])
        medial = 1-smooth(abs(abs(p[:, 0])-spec['innerCheekCenterX'])/spec['innerCheekHalfWidth'])
        medial *= 1-smooth(abs(p[:, 2]-spec['innerCheekCenterZ'])/spec['innerCheekHalfHeight'])
        medial *= smooth((spec['innerCheekFrontY']-p[:, 1])/spec['innerCheekFrontSpan'])
        q[:, 1] += spec['bridgeRecess']*bridge-spec['innerCheekFullness']*medial
    if spec['version'] >= 10:
        # A linear band includes the complete lid motion; the vertical fade
        # lies outside the aperture so mixed blinks keep their interpolation.
        almond = 1-smooth(abs(abs(p[:,0])-spec['eyeCenterX'])/spec['eyeHalfWidth'])
        almond *= 1-smooth((abs(p[:,2]-spec['eyeCenterZ'])-spec['almondPlateau'])/spec['almondFade'])
        almond *= smooth((-.083-p[:,1])/.037)
        q[:,2] -= spec['almondCompress']*(p[:,2]-spec['eyeCenterZ'])*almond
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


def apply_to_mesh(body, spec=SPEC):
    # All retained body transforms are identity; the same rest-space field is
    # applied to exported vertices, including independently simplified LODs.
    assert np.array_equal(np.array(body.matrix_world), np.eye(4))
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
            'scope': 'Face proportions, fuller lower and medial cheeks, shorter rounded chin and softened mandibular corners, relaxed inner brow slope and softer arch, narrower almond eye openings with slightly raised outer corners and lowered upper lids, shared orbital/lash/brow field, eased nasal bridge and reduced tip projection and wing width, fuller lip volume with a clearer central upper curve and relaxed corners, tapered lip shoulders, restrained smile and warm iris tint; topology, texture images, skin weights and locomotion retained.'}


def apply_to_body(body, spec=SPEC):
    import bpy
    apply_iris_tint(spec)
    result = apply_to_mesh(body, spec)
    if spec['version'] >= 3:
        result['companionMeshes'] = ['AvatarEyebrows', 'AvatarEyelashes']
        result['companionRevisions'] = {name: apply_to_mesh(bpy.data.objects[name], spec)
                                        for name in result['companionMeshes']}
    return result
