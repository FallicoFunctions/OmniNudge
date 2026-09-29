"""Build an isolated front-underlay candidate from the delivered male source."""
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path.cwd() / 'scripts/launch-body-proof'))
from assemble_complete_pair import review
from audit_complete_expressions import set_pose
from refine_reference_hair import PASS
from refine_male_front_underlay import open_front_underlay

folder = PASS / 'male-front-gap-20260928'
bpy.ops.wm.open_mainfile(filepath=str(folder / 'before/male-hair-refined.blend'))
rig = bpy.data.objects['AvatarSkeleton']
rig.data.pose_position = 'REST'
set_pose({})
mapping = json.loads((folder / 'before/male-vertex-mapping.json').read_text())
report = json.loads((folder / 'before/male-native-validation.json').read_text())
summary = open_front_underlay(mapping, report['meshes'])
(folder / 'candidate-mapping.json').write_text(json.dumps(mapping) + '\n')
(folder / 'candidate-validation.json').write_text(json.dumps(report, indent=2) + '\n')
(folder / 'authoring-report.json').write_text(json.dumps(summary, indent=2) + '\n')
rig.data.pose_position = 'POSE'
rig.animation_data.action = bpy.data.actions['idle']
scene = bpy.context.scene
scene.frame_set(1)
set_pose({})
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'candidate.blend'), compress=True)
camera = review.configure_scene()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = .43
scene.render.resolution_x = 650
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.view_settings.exposure = -.8
if scene.render.engine == 'CYCLES':
    scene.cycles.samples = 24
target = Vector((0, -.025, 1.686))
for label, offset in [('front', (0, -3, .03)),
                      ('oblique', (.9, -3, .035)),
                      ('side', (3, 0, .03))]:
    camera.location = target + Vector(offset)
    review.look_at(camera, target)
    scene.render.filepath = str(folder / ('candidate-' + label + '.png'))
    bpy.ops.render.render(write_still=True)
