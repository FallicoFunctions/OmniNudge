"""Verify the front-cap opacity change against the immutable male source."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path.cwd() / 'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_foil_finish import geometry_contract
from refine_reference_hair import PASS

folder = PASS / 'male-front-gap-20260928'
name = 'Complete scalp'

def mesh_color(ob):
    return {a.name: np.asarray([d.color[:] for d in a.data], dtype=np.float32)
            for a in ob.data.color_attributes}

def structural(ob):
    h = hashlib.sha256()
    h.update(geometry_contract(ob).encode())
    h.update(repr([m.name for m in ob.data.materials]).encode())
    h.update(repr(tuple(tuple(row) for row in ob.matrix_world)).encode())
    h.update(repr(tuple((p.material_index, p.use_smooth) for p in ob.data.polygons)).encode())
    return h.hexdigest()

bpy.ops.wm.open_mainfile(filepath=str(folder / 'before/male-hair-refined.blend'))
before = {ob.name: structural(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
before_colors = {ob.name: mesh_color(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
before_positions = {ob.name: array(ob).copy() for ob in bpy.context.scene.objects if ob.type == 'MESH'}
bpy.ops.wm.open_mainfile(filepath=str(folder / 'candidate.blend'))
after = {ob.name: structural(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
assert before == after
after_colors = {ob.name: mesh_color(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
assert before_colors.keys() == after_colors.keys()
for ob_name in before_colors:
    assert before_colors[ob_name].keys() == after_colors[ob_name].keys()
    for attribute in before_colors[ob_name]:
        if ob_name == name and attribute == 'MaleRearFinish':
            continue
        assert np.array_equal(before_colors[ob_name][attribute], after_colors[ob_name][attribute]), (ob_name, attribute)
old = before_colors[name]['MaleRearFinish']
new = after_colors[name]['MaleRearFinish']
assert np.array_equal(old[:, :3], new[:, :3])
assert (new[:, 3] <= old[:, 3]).all() and (new[:, 3] >= 0).all()
changed = np.flatnonzero(np.abs(new[:, 3] - old[:, 3]) > 1e-6)
assert len(changed) == json.loads((folder / 'authoring-report.json').read_text())['changedAlphaVertices']
positions = before_positions[name]
assert (positions[changed, 1] < -.082).all()
assert (positions[changed, 0].min() > -.065 and positions[changed, 0].max() < .057)
original_map = json.loads((folder / 'before/male-vertex-mapping.json').read_text())
candidate_map = json.loads((folder / 'candidate-mapping.json').read_text())
for ob_name in original_map:
    if ob_name == name:
        assert {k:v for k,v in original_map[name].items() if k != 'addedColors'} == \
               {k:v for k,v in candidate_map[name].items() if k != 'addedColors'}
    else:
        assert original_map[ob_name] == candidate_map[ob_name], ob_name
assert np.allclose(np.array(candidate_map[name]['addedColors']), new, atol=0, rtol=0)
summary = {'exactMeshCount': len(before), 'geometryUvWeightsMaterialsRigMorphsExact': True,
           'allOtherVertexColorsExact': True, 'scalpRgbExact': True,
           'changedFrontCapAlphaVertices': len(changed),
           'minimumChangedFactor': float((new[changed,3]/old[changed,3]).min()),
           'scope': 'Native mesh and color comparison; image review and portable glTF validation are separate.'}
(folder / 'native-checks.json').write_text(json.dumps(summary, indent=2)+'\n')
print('MALE_FRONT_GAP_NATIVE_VALIDATED', summary, flush=True)
