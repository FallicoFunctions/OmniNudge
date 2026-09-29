"""Identify which retained hair mesh causes the straight front edge."""
import sys
from pathlib import Path
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path.cwd() / 'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from assemble_complete_pair import review

folder = PASS / 'male-layered-sides-20260928'
bpy.ops.wm.open_mainfile(filepath=str(PASS / 'male-hair-refined.blend'))
scene = bpy.context.scene
camera = review.configure_scene()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = .43
scene.render.resolution_x = 650
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.view_settings.exposure = -.8
if scene.render.engine == 'CYCLES':
    scene.cycles.samples = 20
target = Vector((0, -.025, 1.686))
camera.location = target + Vector((0, -3, .03))
review.look_at(camera, target)
hair = [o for o in bpy.context.scene.objects
        if o.type == 'MESH' and o.get('avatarSlot') == 'hair']
for label, visible in [
    ('front-no-rooted', {'Polished male rooted hairline'}),
    ('front-no-swept', {'Luxury retained swept groom'}),
    ('front-no-scalp', {'Complete scalp'}),
]:
    for ob in hair:
        ob.hide_render = ob.name in visible
    scene.render.filepath = str(folder / ('diagnostic-' + label + '.png'))
    bpy.ops.render.render(write_still=True)
