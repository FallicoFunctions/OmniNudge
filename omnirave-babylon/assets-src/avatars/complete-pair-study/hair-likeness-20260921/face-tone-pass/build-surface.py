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
# Bake the authored shader on retained UVs; body geometry stays untouched.
import refine_complete_surfaces as baking
import hashlib
baking.OUT=d
mat=body.data.materials[0];bs=mat.node_tree.nodes['Principled BSDF']
rig.data.pose_position='REST';set_pose({});retained_engine=scene.render.engine;scene.render.engine='CYCLES';scene.cycles.samples=1
ct,_=baking.bake(body,mat,'female-face-surface-color',color,size=2048)
rt,_=baking.bake(body,mat,'female-face-surface-roughness',rough,size=1024,linear=True,background=.46)
mat.node_tree.links.new(ct.outputs['Color'],bs.inputs['Base Color']);mat.node_tree.links.new(rt.outputs['Color'],bs.inputs['Roughness'])
record['channels']={
 'baseColor':{'texture':'female-face-finish-color','file':'face-tone-pass/female-face-surface-color.png'},
 'roughness':{'texture':'female-face-finish-roughness','file':'face-tone-pass/female-face-surface-roughness.png'}}
record['unchangedMeshContracts']=len(contracts)
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
record['sourceTextureHashes']={key:hashlib.sha256((p/item['file']).read_bytes()).hexdigest() for key,item in record['channels'].items()}
rig.data.pose_position='POSE';scene.frame_set(1);scene.render.engine=retained_engine;scene.cycles.samples=24
for view,offset in [('front',(0,-4,.015)),('oblique',(2,-3,.015)),('profile',(4,0,.015))]:
 cam.location=target+Vector(offset);review.look_at(cam,target);scene.render.filepath=str(d/('after-'+view+'.png'));bpy.ops.render.render(write_still=True)
cam.location=target+Vector((0,-4,.015));review.look_at(cam,target)
for label,pose in [('smile',{'Expression_Smile':.85,'Expression_BrowLift':.15}),('closed',{'Expression_BlinkLeft':1,'Expression_BlinkRight':1})]:
 set_pose(pose);scene.render.filepath=str(d/('after-'+label+'.png'));bpy.ops.render.render(write_still=True)
set_pose({})
record['scope']='Material-only deeper rose lip tone, smoother lip sheen and warm upper-lid makeup; all mesh geometry, morphs, UVs, rig weights, attachments and clips are unchanged.'
(d/'native-face-surface-validation.json').write_text(json.dumps(record,indent=2)+'\n')
native=json.loads((d/'before/female-native-validation.json').read_text());native['faceSurface']=record
(p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
print('Saved surface pass:',json.dumps(record),flush=True)
