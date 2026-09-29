import bpy
import json
import numpy as np
import sys
from pathlib import Path
from mathutils import Vector

root = Path.cwd()
sys.path.insert(0, str(root / 'scripts/launch-body-proof'))
from assemble_complete_pair import array, review
from refine_complete_foil_finish import geometry_contract
from audit_complete_expressions import set_pose

study = root / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
pass_dir = study / 'iris-tone-pass'
bpy.ops.wm.open_mainfile(filepath=str(pass_dir / 'before/female-hair-refined.blend'))
before = {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
material = bpy.data.materials['Launch female iris']
tint = material.node_tree.nodes['Reference warm iris tint']
old = tuple(tint.inputs[2].default_value)
assert np.allclose(old, (1, .46, .24, 1), atol=1e-7), old
updated = (.48, .20, .12, 1)
tint.inputs[2].default_value = updated
assert before == {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}

rig = bpy.data.objects['AvatarSkeleton']
rig.data.pose_position = 'POSE'
rig.animation_data.action = bpy.data.actions['idle']
scene = bpy.context.scene
scene.frame_set(1)
set_pose({})
eye = array(bpy.data.objects['AvatarIris_l'], True).mean(0)
target = Vector((0, -.075, float(eye[2] - .024)))
camera = review.configure_scene()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = .31
camera.location = target + Vector((0, -4, .015))
review.look_at(camera, target)
scene.render.resolution_x = 650
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.view_settings.exposure = -.8
if scene.render.engine == 'CYCLES':
    scene.cycles.samples = 24
scene.render.filepath = str(pass_dir / 'after-front.png')
bpy.ops.render.render(write_still=True)

record = {
    'material': material.name,
    'previousTint': old,
    'newTint': updated,
    'unchangedMeshContracts': len(before),
    'updatedImages': 0,
    'updatedGeometry': 0,
}
(pass_dir / 'native-iris-validation.json').write_text(json.dumps(record, indent=2) + '\n')
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(pass_dir / 'candidate.blend'), compress=True)
print('IRIS_CANDIDATE', json.dumps(record), flush=True)
