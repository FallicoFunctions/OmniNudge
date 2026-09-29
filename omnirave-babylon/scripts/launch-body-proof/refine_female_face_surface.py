"""Author a softer lip border and satin roughness on the existing facial skin.

Connection map: this is one continuous skin surface. Pigment and roughness
follow retained lip vertices and UVs through every expression; no geometry,
attachment, transform, joint, or skin weight is changed. No overlap is added.
The material masks are baked from Blender shaders for portable glTF delivery.
"""
import numpy as np
import bpy
from refine_female_face_contour import smooth

SPEC = {'version': 1, 'mouthCenterZ': 1.5431, 'halfWidth': .024,
        'upperHeight': .0062, 'lowerHeight': .0095, 'borderFeather': .0016,
        'skinRestore': .76, 'lipTintStrength': .14,
        'skinColor': [.477, .205, .105, 1], 'lipColor': [.235, .058, .041, 1],
        'lipRoughness': .43}

TONE_SPEC = {**SPEC, 'version': 2, 'lipTintStrength': .55,
             'lipColor': [.15, .028, .025, 1], 'lipRoughness': .36,
             'lidCenterX': .0283, 'lidHalfWidth': .023,
             'lidCenterZ': 1.618, 'lidHalfHeight': .014,
             'lidTintStrength': .50, 'lidColor': [.12, .058, .041, 1]}


def author(body, spec=SPEC):
    assert not body.data.attributes.get('Reference lip silhouette'), 'Apply once to archived source'
    p=np.array([v.co[:] for v in body.data.vertices]);x,y,z=p.T
    group=body.vertex_groups['lips'].index
    membership=np.array([max([g.weight for g in v.groups if g.group==group] or [0]) for v in body.data.vertices])
    width=spec['halfWidth'];arch=np.sqrt(np.maximum(0,1-(x/width)**2))
    bow=.0016*np.exp(-((abs(x)-.006)/.004)**2)-.0005*np.exp(-(x/.003)**2)
    top=spec['mouthCenterZ']+(spec['upperHeight']+bow)*arch
    bottom=spec['mouthCenterZ']-spec['lowerHeight']*arch**1.6
    lip=smooth((top-z)/spec['borderFeather'])*smooth((z-bottom)/spec['borderFeather'])
    front=smooth((-.119-y)/.014)
    lip*=front
    cleanup=membership*(1-lip)*front
    mat=body.data.materials[0];nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bs=nodes['Principled BSDF'];source=bs.inputs['Base Color'].links[0].from_socket
    rough=bs.inputs['Roughness'].links[0].from_socket
    def attribute(name,values):
        a=body.data.attributes.new(name,'FLOAT','POINT');a.data.foreach_set('value',values.astype(np.float32))
        n=nodes.new('ShaderNodeAttribute');n.name=name;n.attribute_name=name
        return n.outputs['Fac']
    lp=attribute('Reference lip silhouette',lip)
    edge=attribute('Reference lip edge transition',cleanup*spec['skinRestore'])
    tint=attribute('Reference lip tone',lip*membership*spec['lipTintStrength'])
    # Preserve the original color variation wherever the new border is solid.
    def mix(name,a,b,fac):
        n=nodes.new('ShaderNodeMixRGB');n.name=name;links.new(a,n.inputs[1]);n.inputs[2].default_value=b;links.new(fac,n.inputs[0]);return n.outputs[0]
    color=mix('Reference lip edge skin',source,spec['skinColor'],edge)
    color=mix('Reference soft rose lip',color,spec['lipColor'],tint)
    # Restore skin roughness at the former broad pigment border, then apply
    # a softer sheen inside the authored vermilion silhouette.
    softened=mix('Reference lip edge roughness',rough,[.46,.46,.46,1],edge)
    softened=mix('Reference satin lip roughness',softened,[spec['lipRoughness']]*3+[1],lp)
    links.new(color,bs.inputs['Base Color']);links.new(softened,bs.inputs['Roughness'])
    return {'spec':spec,'mesh':body.name,'material':mat.name,
            'changedGeometry':False,'maskVertices':int(np.sum(cleanup>0)),
            'pigmentVertices':int(np.sum(lip>0)),
            'attributes':['Reference lip silhouette','Reference lip edge transition','Reference lip tone']},color,softened


def refine_tone(body, previous, spec=TONE_SPEC):
    """Revise the retained makeup graph, without stacking its baked output."""
    assert previous['spec']['version'] == 1
    assert not body.data.attributes.get('Reference upper lid tone')
    mat = body.data.materials[0]; nodes, links = mat.node_tree.nodes, mat.node_tree.links
    assert mat.name == previous['material']
    tone = body.data.attributes['Reference lip tone']
    values = np.array([v.value for v in tone.data])
    values *= spec['lipTintStrength']/previous['spec']['lipTintStrength']
    assert np.isfinite(values).all() and values.min() >= 0 and values.max() <= 1
    tone.data.foreach_set('value', values.astype(np.float32))
    nodes['Reference soft rose lip'].inputs[2].default_value = spec['lipColor']
    nodes['Reference satin lip roughness'].inputs[2].default_value = [spec['lipRoughness']]*3+[1]
    p = np.array([v.co[:] for v in body.data.vertices]); x, y, z = p.T
    lid = 1-smooth(abs(abs(x)-spec['lidCenterX'])/spec['lidHalfWidth'])
    lid *= 1-smooth(abs(z-spec['lidCenterZ'])/spec['lidHalfHeight'])
    lid *= smooth((z-1.606)/.006)*smooth((-.095-y)/.022)
    values = lid*spec['lidTintStrength']
    attr = body.data.attributes.new('Reference upper lid tone', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', values.astype(np.float32))
    mask = nodes.new('ShaderNodeAttribute'); mask.name = attr.name; mask.attribute_name = attr.name
    blend = nodes.new('ShaderNodeMixRGB'); blend.name = 'Reference warm upper lid'
    links.new(mask.outputs['Fac'], blend.inputs[0])
    links.new(nodes['Reference soft rose lip'].outputs[0], blend.inputs[1])
    blend.inputs[2].default_value = spec['lidColor']
    color, rough = blend.outputs[0], nodes['Reference satin lip roughness'].outputs[0]
    bs = nodes['Principled BSDF']; links.new(color, bs.inputs['Base Color']); links.new(rough, bs.inputs['Roughness'])
    return {**previous, 'spec': spec, 'changedGeometry': False,
            'upperLidMaskVertices': int(np.sum(lid>0)),
            'attributes': [*previous['attributes'], attr.name],
            'authoredFromSurfaceVersion': previous['spec']['version']}, color, rough
