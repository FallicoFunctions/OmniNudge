import bpy,sys
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import review
from audit_complete_expressions import set_pose
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'upper-locks-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);set_pose({})
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.30
scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=16
cam.location=(3,0,1.75);review.look_at(cam,Vector((-.015,.012,1.72)))
for label,hidden in [('profile-no-outer',[f'PLURR pony strands {i}' for i in range(3)]),('profile-no-inner',['PLURR pony surface fibers']),('profile-no-wisps',['Polished female flyaways'])]:
 for n in hidden:bpy.data.objects[n].hide_render=True
 scene.render.filepath=str(d/(label+'.png'));bpy.ops.render.render(write_still=True)
 for n in hidden:bpy.data.objects[n].hide_render=False
