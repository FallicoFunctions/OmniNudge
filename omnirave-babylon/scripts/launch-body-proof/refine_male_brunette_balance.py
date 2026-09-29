"""Lift the male hair's near-black fibers into a warm dark brunette range.

Material-only change. The existing grayscale fiber atlas, normal map, alpha,
mesh geometry, rig, weights and morphs stay exact. A final tint multiplier in
Blender mirrors the glTF base-color factors in the native export report.
"""
import bpy


PALETTE = {
    'Luxury groom fibers 0.001': (.046, .027, .014, 1),
    'Luxury groom fibers 1.001': (.063, .038, .020, 1),
    'Luxury groom fibers 2.001': (.081, .050, .027, 1),
    'Luxury groom fibers 3.001': (.145, .091, .046, 1),
    'Luxury groom fibers 4.001': (.052, .030, .016, 1),
    'Polished male hair strands roots.002': (.028, .015, .008, 1),
    'Polished male fine hair.002': (.028, .015, .008, 1),
    'Male matte side fibers': (.055, .030, .016, 1),
}


def balance_male_brunette(materials):
    rows = {}
    for name, target in PALETTE.items():
        mat = bpy.data.materials[name]
        source = materials[name]['color']
        assert all(float(v) > 0 for v in source[:3])
        ratio = tuple(target[i] / source[i] for i in range(3)) + (1,)
        tree = mat.node_tree
        bs = tree.nodes['Principled BSDF']
        assert tree.nodes.get('Male brunette lift') is None
        tint = tree.nodes.new('ShaderNodeMixRGB')
        tint.name = 'Male brunette lift'
        tint.blend_type = 'MULTIPLY'
        tint.inputs[0].default_value = 1
        tint.inputs[2].default_value = ratio
        if bs.inputs['Base Color'].is_linked:
            tree.links.new(bs.inputs['Base Color'].links[0].from_socket, tint.inputs[1])
        else:
            tint.inputs[1].default_value = bs.inputs['Base Color'].default_value
        tree.links.new(tint.outputs[0], bs.inputs['Base Color'])
        materials[name]['color'] = list(target)
        rows[name] = {'before': source, 'after': list(target), 'ratio': ratio}
    print('MALE_BRUNETTE_BALANCE', rows, flush=True)
    return rows
