import sys,bpy
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from validate_reference_hair import run
from assemble_complete_pair import review
from audit_complete_expressions import set_pose
run('female',False)
scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE'
rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.52
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
p=Path.cwd()/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/swept-layers-pass'
for name,loc in [('right-oblique',(1.8,-2.1,1.76)),('profile',(3,0,1.72))]:
 cam.location=loc;review.look_at(cam,Vector((-.025,.005,1.65)));scene.render.filepath=str(p/('after-'+name+'.png'));bpy.ops.render.render(write_still=True)
