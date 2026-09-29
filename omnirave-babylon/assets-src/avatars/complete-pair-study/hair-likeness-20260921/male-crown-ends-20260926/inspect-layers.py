import bpy,sys,json
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from audit_complete_expressions import set_pose
p=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-crown-ends-20260926')
bpy.ops.wm.open_mainfile(filepath=str(p/'before/male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);set_pose({})
print('HAIR_MESHES',[(o.name,len(o.data.vertices),array(o).min(0).tolist(),array(o).max(0).tolist()) for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair'],flush=True)
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.43
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
target=Vector((0,-.025,1.686));camera.location=target+Vector((0,3,.03));review.look_at(camera,target)
for label,hidden in [('no-flyaways','Polished male flyaways'),('no-main','Luxury retained swept groom')]:
 ob=bpy.data.objects[hidden];ob.hide_render=True
 scene.render.filepath=str(p/('diagnostic-back-'+label+'.png'));bpy.ops.render.render(write_still=True)
 ob.hide_render=False
