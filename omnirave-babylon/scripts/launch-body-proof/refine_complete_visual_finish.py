"""Match the reference fabrics while preserving all fitted geometry.

Connection map: every garment edge, zipper, fitting, joint and corrective stays
at its existing position. Shell/knit boundaries use the retained material masks;
this pass only changes optical response. No geometry is created or displaced.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT
from refine_complete_foil_finish import geometry_contract
from refine_complete_surfaces import set_value

PASS = OUT / 'visual-reference-pass-20260911'


def pixels(image):
    values = np.empty(image.size[0] * image.size[1] * 4, np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(image.size[1], image.size[0], 4)


def scalar_image(material, channel, name, values, source_node):
    """Retain the source UV binding and write an exact linear material map."""
    image = bpy.data.images.new(name, values.shape[1], values.shape[0], alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((*values.shape, 4), np.float32)
    rgba[:, :, :3] = values[:, :, None]
    image.pixels.foreach_set(rgba.ravel())
    image.update()
    image.filepath_raw = str(OUT / f'{name}.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    if source_node.inputs['Vector'].is_linked:
        material.node_tree.links.new(source_node.inputs['Vector'].links[0].from_socket, node.inputs['Vector'])
    material.node_tree.links.new(node.outputs['Color'], material.node_tree.nodes['Principled BSDF'].inputs[channel])
    return image


def color_image(material, channel, name, values, source_node):
    image = bpy.data.images.new(name, values.shape[1], values.shape[0], alpha=False)
    image.pixels.foreach_set(values.astype(np.float32).ravel())
    image.update()
    image.filepath_raw = str(OUT / f'{name}.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    if source_node.inputs['Vector'].is_linked:
        material.node_tree.links.new(source_node.inputs['Vector'].links[0].from_socket, node.inputs['Vector'])
    material.node_tree.links.new(node.outputs['Color'], material.node_tree.nodes['Principled BSDF'].inputs[channel])
    return image


def image_node(material, channel):
    socket = material.node_tree.nodes['Principled BSDF'].inputs[channel]
    assert socket.is_linked and socket.links[0].from_node.type == 'TEX_IMAGE', channel
    return socket.links[0].from_node


def channel_value(material, channel):
    socket = material.node_tree.nodes['Principled BSDF'].inputs[channel]
    if socket.is_linked:
        node = socket.links[0].from_node
        assert node.type == 'TEX_IMAGE', (material.name, channel)
        return {'image': Path(node.image.filepath_raw).name or node.image.name + '.png'}
    value = socket.default_value
    return {'factor': float(value) if isinstance(value, (int, float)) else list(value)}


def describe(material):
    result = {channel: channel_value(material, channel) for channel in [
        'Base Color', 'Metallic', 'Roughness', 'Transmission Weight',
        'Coat Weight', 'Coat Roughness', 'Specular IOR Level',
    ]} | {'sheenWeight': float(material.get('launchSheenWeight', 0))}
    if material.get('launchReferenceFilm'):
        result['film'] = {key: material['launchFilm' + key] for key in [
            'Texture', 'MinimumNm', 'MaximumNm', 'IOR', 'Intensity', 'Mask',
        ]}
    return result


def finish(sex, source_suffix):
    source = PASS / 'before' / f'{sex}-runtime.blend' if source_suffix == 'baseline' else OUT / f'{sex}-{source_suffix}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    meshes = [ob for ob in scene.objects if ob.type == 'MESH']
    retained = {ob.name: geometry_contract(ob) for ob in meshes}
    matrices = {ob.name: [list(row) for row in ob.matrix_world] for ob in scene.objects}
    rig = bpy.data.objects['AvatarSkeleton']
    joints = {bone.name: [list(row) for row in bone.matrix_local] for bone in rig.data.bones}
    changed = set()
    coat = bpy.data.objects['Structured armhole jacket'].data.materials[0]
    settings = json.loads((PASS / 'surface-parameters.json').read_text())[sex]

    for ob in meshes:
        for mat in ob.data.materials:
            if not mat or mat.name in changed:
                continue
            name = mat.name.lower()
            if any(term in name for term in ['black cargo fabric', 'pocket fabric', 'pocket splattered fabric']) or (sex == 'female' and ob.name == 'AvatarBottoms_cargo-pants' and 'splattered nylon' in name):
                set_value(mat, 'Roughness', settings['trousersRoughness'])
                set_value(mat, 'Specular IOR Level', .40)
                set_value(mat, 'Coat Weight', .025)
                set_value(mat, 'Coat Roughness', .25)
                set_value(mat, 'Sheen Weight', .045)
                mat['launchSheenWeight'] = .045
                changed.add(mat.name)
            elif sex == 'male' and any(term in name for term in ['black shirt satin', 'black satin collar and placket']):
                set_value(mat, 'Roughness', .27)
                set_value(mat, 'Specular IOR Level', .38)
                set_value(mat, 'Sheen Weight', .075)
                mat['launchSheenWeight'] = .075
                changed.add(mat.name)

    if sex == 'male':
        rough_node = image_node(coat, 'Roughness')
        rough = pixels(rough_node.image)[:, :, 0]
        # The source map explicitly separates the satin shell from rough knit.
        shell = np.clip((.68 - rough) / (.68 - .235), 0, 1)
        revised = rough * (1 - shell) + settings['jacketRoughness'] * shell
        scalar_image(coat, 'Roughness', 'male-reference-jacket-roughness', revised, rough_node)
        assert np.array_equal(revised[shell == 0], rough[shell == 0])
        set_value(coat, 'Coat Roughness', .13)
        changed.add(coat.name)
    else:
        for ob_name, label, transmission_source in [
            ('Structured armhole jacket', 'jacket', .85), ('PLURR folded hood', 'hood', .70),
        ]:
            mat = bpy.data.objects[ob_name].data.materials[0]
            transmission_node = image_node(mat, 'Transmission Weight')
            transmission = pixels(transmission_node.image)[:, :, 0]
            shell = np.clip(transmission / transmission_source, 0, 1)
            for channel, key, suffix in [
                ('Metallic', 'jacketMetallic', 'metallic'),
                ('Roughness', 'jacketRoughness', 'roughness'),
                ('Coat Weight', 'jacketCoat', 'coat'),
                ('Transmission Weight', 'jacketTransmission', 'transmission'),
            ]:
                socket = mat.node_tree.nodes['Principled BSDF'].inputs[channel]
                node = socket.links[0].from_node if socket.is_linked else transmission_node
                values = pixels(node.image)[:, :, 0] if socket.is_linked else np.full(shell.shape, float(socket.default_value), np.float32)
                assert values.shape == shell.shape
                revised = values * (1 - shell) + settings[key] * shell
                image = scalar_image(mat, channel, f'female-reference-{label}-{suffix}', revised, node)
                assert np.array_equal(revised[shell == 0], values[shell == 0])
                if channel == 'Transmission Weight':
                    assert not np.any(revised[shell == 0])
                    mat['launchTransmissionTexture'] = image.name + '.png'
            color_node = image_node(mat, 'Base Color')
            color = pixels(color_node.image)
            target = np.array(settings['jacketBaseColor'], np.float32)
            revised = color.copy()
            # Retain the existing pigment variation; shift its pale substrate.
            reference_mean = np.mean(color[:, :, :3][shell > .98], axis=0)
            tint = np.clip(color[:, :, :3] * (target / np.maximum(reference_mean, .001)), 0, 1)
            revised[:, :, :3] = color[:, :, :3] * (1 - shell[:, :, None]) + tint * shell[:, :, None]
            color_image(mat, 'Base Color', f'female-reference-{label}-color', revised, color_node)
            assert np.array_equal(revised[shell == 0], color[shell == 0])
            # Keep the authored film field and its knit boundary. Expand the
            # compressed thickness distribution so its interference spectrum
            # includes cyan/yellow as well as pink under ordinary illumination.
            tree = mat.node_tree
            old_film = next(n for n in tree.nodes if n.type == 'TEX_IMAGE' and n.image
                            and Path(n.image.filepath_raw).name == mat['launchFilmTexture'])
            film = pixels(old_film.image)
            thickness = film[:, :, 1]
            active = film[:, :, 0] > .98 if mat.get('launchFilmMask') else thickness > .01
            low, high = np.quantile(thickness[active], [.025, .975])
            film[:, :, 1] = np.clip((thickness - low) / max(float(high-low), .001), 0, 1)
            name = f'female-reference-{label}-film'
            im = bpy.data.images.new(name, film.shape[1], film.shape[0], alpha=False)
            im.colorspace_settings.name = 'Non-Color'
            im.pixels.foreach_set(film.ravel()); im.update()
            im.filepath_raw = str(OUT / f'{name}.png'); im.file_format = 'PNG'; im.save(); im.pack()
            tex = tree.nodes.new('ShaderNodeTexImage'); tex.image = im
            if old_film.inputs['Vector'].is_linked:
                tree.links.new(old_film.inputs['Vector'].links[0].from_socket, tex.inputs['Vector'])
            split = tree.nodes.new('ShaderNodeSeparateColor'); tree.links.new(tex.outputs['Color'], split.inputs[0])
            remap = tree.nodes.new('ShaderNodeMapRange')
            remap.inputs['To Min'].default_value = settings['filmMinimumNm']
            remap.inputs['To Max'].default_value = settings['filmMaximumNm']
            tree.links.new(split.outputs['Green'], remap.inputs['Value'])
            output = remap.outputs['Result']
            if mat.get('launchFilmMask'):
                multiply = tree.nodes.new('ShaderNodeMath'); multiply.operation = 'MULTIPLY'
                tree.links.new(output, multiply.inputs[0]); tree.links.new(split.outputs['Red'], multiply.inputs[1])
                output = multiply.outputs[0]
            tree.links.new(output, tree.nodes['Principled BSDF'].inputs['Thin Film Thickness'])
            set_value(mat, 'Thin Film IOR', settings['filmIOR'])
            mat['launchFilmTexture'] = im.name + '.png'
            mat['launchFilmMinimumNm'] = settings['filmMinimumNm']
            mat['launchFilmMaximumNm'] = settings['filmMaximumNm']
            mat['launchFilmIOR'] = settings['filmIOR']
            mat['launchFilmMask'] = bool(mat.get('launchFilmMask', False))
            mat['launchReferenceFilm'] = True
            changed.add(mat.name)

    assert retained == {ob.name: geometry_contract(ob) for ob in meshes}
    assert matrices == {ob.name: [list(row) for row in ob.matrix_world] for ob in scene.objects}
    assert joints == {bone.name: [list(row) for row in bone.matrix_local] for bone in rig.data.bones}
    report = {'character': sex, 'source': str(source.relative_to(OUT)),
              'preservedMeshes': retained, 'preservedJointRestMatrices': len(joints),
              'preservedObjectTransforms': len(matrices),
              'materials': {name: describe(bpy.data.materials[name]) for name in sorted(changed)}}
    for name in changed:
        bpy.data.materials[name]['launchReferenceSurfaceFinish'] = '20260911'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{sex}-visual-refined.blend'), compress=True)
    (PASS / f'{sex}-native-surface-validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print('REFERENCE_SURFACES_FINISHED', sex, len(changed), 'materials;', len(meshes), 'meshes preserved', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sex', choices=['male', 'female'], required=True)
    parser.add_argument('--source-suffix', default='baseline')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    finish(options.sex, options.source_suffix)
