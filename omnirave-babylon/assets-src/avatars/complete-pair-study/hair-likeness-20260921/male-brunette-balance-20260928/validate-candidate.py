"""Check the material-only male brunette change against its saved source."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path.cwd() / 'scripts/launch-body-proof'))
from refine_complete_foil_finish import geometry_contract
from refine_reference_hair import PASS
from refine_male_brunette_balance import PALETTE

folder = PASS / 'male-brunette-balance-20260928'

def colors(ob):
    return {a.name: np.asarray([v.color[:] for v in a.data], dtype=np.float32)
            for a in ob.data.color_attributes}

def scene_contract():
    meshes = {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
    vertex_colors = {ob.name: colors(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
    images = {im.name: hashlib.sha256(bytes(np.asarray(im.pixels[:], dtype=np.float32))).hexdigest()
              for im in bpy.data.images if im.has_data and im.name.startswith('male-')}
    return meshes, vertex_colors, images

bpy.ops.wm.open_mainfile(filepath=str(folder / 'before/male-hair-refined.blend'))
before_meshes, before_colors, before_images = scene_contract()
bpy.ops.wm.open_mainfile(filepath=str(folder / 'candidate.blend'))
after_meshes, after_colors, after_images = scene_contract()
assert before_meshes == after_meshes
assert before_images == after_images
assert before_colors.keys() == after_colors.keys()
for name in before_colors:
    assert before_colors[name].keys() == after_colors[name].keys()
    for attribute in before_colors[name]:
        assert np.array_equal(before_colors[name][attribute], after_colors[name][attribute]), (name, attribute)
new_report = json.loads((folder / 'candidate-validation.json').read_text())
old_report = json.loads((folder / 'before/male-native-validation.json').read_text())
assert new_report['meshes'] == old_report['meshes']
assert new_report['additions'] == old_report['additions']
assert new_report['removedObjects'] == old_report['removedObjects']
for name, spec in old_report['materials'].items():
    target = PALETTE.get(name, spec['color'])
    assert new_report['materials'][name] == {**spec, 'color': list(target)}, name
for name, target in PALETTE.items():
    node = bpy.data.materials[name].node_tree.nodes.get('Male brunette lift')
    assert node and node.blend_type == 'MULTIPLY'
    expected = tuple(target[i]/old_report['materials'][name]['color'][i] for i in range(3))
    assert np.allclose(node.inputs[2].default_value[:3], expected, atol=1e-6, rtol=0)
summary = {'exactMeshCount': len(before_meshes), 'geometryUvWeightsMorphsExact': True,
           'vertexColorsAndAlphaExact': True, 'hairImagesExact': True,
           'changedMaleMaterials': sorted(PALETTE),
           'otherNativeSpecificationsExact': True}
(folder / 'native-checks.json').write_text(json.dumps(summary, indent=2)+'\n')
print('MALE_BRUNETTE_NATIVE_VALIDATED', summary, flush=True)
