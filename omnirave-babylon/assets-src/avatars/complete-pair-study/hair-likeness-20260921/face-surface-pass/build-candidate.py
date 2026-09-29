import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from audit_complete_expressions import set_pose
from refine_complete_foil_finish import geometry_contract
from refine_female_face_surface import author
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-surface-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
body=bpy.data.objects['AvatarBody'];record,color,rough=author(body)
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);set_pose({})
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.31;scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
eye=array(bpy.data.objects['AvatarIris_l'],True).mean(0);target=Vector((0,-.075,float(eye[2]-.024)))
for view,offset in [('front',(0,-4,.015)),('oblique',(2,-3,.015)),('profile',(4,0,.015))]:
 cam.location=target+Vector(offset);review.look_at(cam,target);scene.render.filepath=str(d/('candidate-'+view+'.png'));bpy.ops.render.render(write_still=True)
record['unchangedMeshContracts']=len(contracts)
(d/'candidate-material.json').write_text(json.dumps(record,indent=2)+'\n')
print('Candidate renders only, original source untouched',flush=True)
