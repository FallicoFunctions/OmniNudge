import sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from assemble_complete_pair import review

folder=PASS/'male-layered-sides-20260928'
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
scene=bpy.context.scene;camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.43
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
target=Vector((0,-.025,1.686));camera.location=target+Vector((3,0,.03));review.look_at(camera,target)
other=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair' and o.name!='Male layered side strands']
for label,show_cap in [('new-only',False),('new-cap',True)]:
    for o in other:o.hide_render=show_cap is False or o.name!='Complete scalp'
    scene.render.filepath=str(folder/('diagnostic-'+label+'.png'))
    bpy.ops.render.render(write_still=True)
