"""Carry irregular magenta streaks through the gathered pony roots.

Connection map: this is a pigment-only edit. All mesh vertices, normals, UVs,
weights, shape keys and attachment overlaps remain exact. Outer long cards
retain their root pair, lower pairs 7 onward and every cheek card. Inner fibers
retain their original effective pigment on the first two pairs and after 70%
of their length. Their new tint attribute reuses the existing textured material.
Alpha coverage and texture bytes remain exact; no materials or geometry are added.
"""
import math
import bpy
import numpy as np
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands
from refine_female_dye import DYE_BASE, BRUNETTE, NAMES

INNER = 'PLURR pony surface fibers'


def blend_pony_roots(mapping, report, materials):
    rows = {}
    for mi, name in enumerate(NAMES):
        ob = bpy.data.objects[name]; attr = ob.data.color_attributes['ReferenceHairTint']
        colors = np.array([v.color[:] for v in attr.data]); before = colors.copy(); cards = 0
        for i, ids in enumerate(islands(ob)):
            if len(ids) != 36: continue
            t = np.repeat(np.linspace(0, 1, 18), 2); phase = i * 2.399963 + mi * 1.7
            # Each lock has its own onset; avoid another horizontal dye band.
            start = .003 + .017 * (.5 + .5 * math.sin(phase))
            span = .10 + .10 * (.5 + .5 * math.cos(phase + .7))
            dye = smooth((t - start) / span)
            pink = before[ids[12:14], :3].mean(0) * DYE_BASE
            pigment = BRUNETTE * (1 - dye[:, None]) + pink * dye[:, None]
            upper = 1 - smooth((t - .16) / .25)
            colors[ids, :3] = before[ids, :3] * (1 - upper[:, None]) + pigment / DYE_BASE * upper[:, None]
            colors[ids[:2]] = before[ids[:2]]; colors[ids[14:]] = before[ids[14:]]
            cards += 1
        assert np.isfinite(colors).all() and colors.min() >= 0 and colors.max() <= 1
        attr.data.foreach_set('color', colors.astype(np.float32).ravel())
        mapping[name]['addedColors'] = colors.tolist()
        rows[name] = {'cards': cards, 'retainedRootPairs': 1, 'unchangedLowerStartPair': 7,
                      'changedColorVertices': int(np.count_nonzero(np.max(abs(colors - before), axis=1) > 1e-7))}

    ob = bpy.data.objects[INNER]; mat = ob.data.materials[0]; old_base = np.array(materials[mat.name]['color'][:3])
    colors = np.ones((len(ob.data.vertices), 4)); colors[:, :3] = old_base / DYE_BASE
    effective = np.tile(old_base, (len(colors), 1)); cards = 0
    for i, ids in enumerate(islands(ob)):
        n = len(ids) // 2; t = np.repeat(np.linspace(0, 1, n), 2); phase = i * 2.399963
        light = .5 + .5 * math.sin(phase)
        pink = np.array([.46 + .20 * light, .005 + .004 * light, .14 + .075 * light])
        if i % 7 == 0: pink *= .65
        dye = smooth((t - .035) / (.11 + .09 * (.5 + .5 * math.cos(phase))))
        dye *= 1 - smooth((t - .35) / .35)
        effective[ids] = old_base * (1 - dye[:, None]) + pink * dye[:, None]
        effective[ids[:4]] = old_base
        colors[ids, :3] = effective[ids] / DYE_BASE; cards += 1
    assert np.isfinite(colors).all() and colors.min() >= 0 and colors.max() <= 1
    assert ob.data.color_attributes.get('ReferenceHairTint') is None
    attr = ob.data.color_attributes.new(name='ReferenceHairTint', type='FLOAT_COLOR', domain='POINT')
    attr.data.foreach_set('color', colors.astype(np.float32).ravel()); mapping[INNER]['addedColors'] = colors.tolist()
    tree = mat.node_tree; bs = tree.nodes['Principled BSDF']
    base_mix = bs.inputs['Base Color'].links[0].from_node
    assert base_mix.type == 'MIX_RGB' and base_mix.blend_type == 'MULTIPLY'
    base_mix.inputs[1].default_value = (*DYE_BASE, 1.)
    vertex = tree.nodes.new('ShaderNodeAttribute'); vertex.attribute_name = 'ReferenceHairTint'
    tint = tree.nodes.new('ShaderNodeMixRGB'); tint.blend_type = 'MULTIPLY'; tint.inputs[0].default_value = 1
    tree.links.new(vertex.outputs['Color'], tint.inputs[1]); tree.links.new(base_mix.outputs[0], tint.inputs[2])
    tree.links.new(tint.outputs[0], bs.inputs['Base Color'])
    materials[mat.name]['color'] = [*DYE_BASE, 1.]
    rows[INNER] = {'cards': cards, 'retainedRootPairs': 2, 'unchangedLowerStartPair': 17,
                   'previousBaseColor': old_base.tolist(), 'newBaseColor': DYE_BASE.tolist(),
                   'changedColorVertices': int(np.count_nonzero(np.max(abs(effective - old_base), axis=1) > 1e-7))}
    report['rootDye'] = {'meshes': rows, 'changedMaterial': mat.name,
                         'allGeometryAndRelativeShapesRetained': True, 'allTextureBytesRetained': True,
                         'addedColorAttributes': [INNER], 'addedGeometry': 0, 'addedTextureImages': 0}
