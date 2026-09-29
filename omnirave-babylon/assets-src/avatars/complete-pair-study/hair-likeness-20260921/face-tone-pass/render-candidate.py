import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from audit_complete_expressions import set_pose
from refine_complete_foil_finish import geometry_contract
from refine_female_face_surface import refine_tone
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-tone-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
body=bpy.data.objects['AvatarBody'];previous=json.loads((d/'before/female-native-validation.json').read_text())['faceSurface'];record,color,rough=refine_tone(body,previous)
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);set_pose({})
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.31;scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
eye=array(bpy.data.objects['AvatarIris_l'],True).mean(0);target=Vector((0,-.075,float(eye[2]-.024)))
for label,pose in [('front',{}),('closed',{'Expression_BlinkLeft':1,'Expression_BlinkRight':1})]:
 set_pose(pose);cam.location=target+Vector((0,-4,.015));review.look_at(cam,target);scene.render.filepath=str(d/('candidate-'+label+'.png'));bpy.ops.render.render(write_still=True)
print('Candidate material rendered; source not saved.')
