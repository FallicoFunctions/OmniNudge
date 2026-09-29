"""Rebuild this male-only pass from its immutable input, then render for review."""
import json, sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path.cwd() / 'scripts/launch-body-proof'))
from refine_reference_hair import PASS, apply_geometry
from refine_male_fringe_feather import feather_fringe
from assemble_complete_pair import review
from audit_complete_expressions import set_pose

folder = PASS / 'male-fringe-feather-20260927'
bpy.ops.wm.open_mainfile(filepath=str(folder / 'before/male-hair-refined.blend'))
rig = bpy.data.objects['AvatarSkeleton']; rig.data.pose_position = 'REST'
set_pose({})
mapping = json.loads((folder / 'before/male-vertex-mapping.json').read_text())
report = json.loads((folder / 'before/male-native-validation.json').read_text())
result = feather_fringe(mapping, report['meshes'], apply_geometry)
(folder / 'authoring-report.json').write_text(json.dumps(result, indent=2)+'\n')
(PASS / 'male-vertex-mapping.json').write_text(json.dumps(mapping)+'\n')
(PASS / 'male-native-validation.json').write_text(json.dumps(report, indent=2)+'\n')
rig.data.pose_position = 'POSE'; rig.animation_data.action = bpy.data.actions['idle']
scene = bpy.context.scene; scene.frame_set(1); set_pose({})
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(PASS / 'male-hair-refined.blend'), compress=True)
print('MALE_AUTHORING', json.dumps({k:v for k,v in result.items() if not k.endswith('Indices')}), flush=True)
camera = review.configure_scene(); camera.data.type = 'ORTHO'; camera.data.ortho_scale = .43
scene.render.resolution_x = 650; scene.render.resolution_y = 800; scene.render.resolution_percentage = 100
scene.view_settings.exposure = -.8
if scene.render.engine == 'CYCLES': scene.cycles.samples = 24
target = Vector((0, -.025, 1.686))
for label, offset in [('front',(0,-3,.03)),('oblique',(.9,-3,.035)),('side',(3,0,.03)),('back',(0,3,.03)),('upper',(.65,-1.9,2.4))]:
    camera.location = target + Vector(offset); review.look_at(camera, target)
    scene.render.filepath = str(folder / ('male-'+label+'.png'))
    bpy.ops.render.render(write_still=True)
