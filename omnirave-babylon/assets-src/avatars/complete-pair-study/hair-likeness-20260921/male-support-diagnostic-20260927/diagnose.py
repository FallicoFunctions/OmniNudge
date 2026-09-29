import sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import review
from audit_complete_expressions import set_pose
f=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-support-diagnostic-20260927')
p=f.parent/'male-hair-refined.blend';bpy.ops.wm.open_mainfile(filepath=str(p))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({})
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.43
scene=bpy.context.scene;scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=16
target=Vector((0,-.025,1.686));camera.location=target+Vector((0,-3,.03));review.look_at(camera,target)
hair=[o for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair']
for label,keep in [('cap',{'Complete scalp'}),('rooted',{'Polished male rooted hairline'}),('rooted-cap',{'Complete scalp','Polished male rooted hairline'}),('main',{'Luxury retained swept groom'})]:
 for ob in hair:ob.hide_render=ob.name not in keep
 scene.render.filepath=str(f/(label+'.png'));bpy.ops.render.render(write_still=True)
