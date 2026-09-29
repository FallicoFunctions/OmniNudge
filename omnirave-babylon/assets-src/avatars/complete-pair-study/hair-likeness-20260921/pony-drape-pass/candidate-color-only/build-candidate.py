import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import review
from refine_reference_hair import PASS
from refine_female_root_dye import blend_pony_roots,INNER,NAMES,DYE_BASE
from audit_complete_expressions import set_pose
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
p=PASS;d=p/'root-dye-pass';b=d/'before'
bpy.ops.wm.open_mainfile(filepath=str(b/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
colors={o.name:{a.name:np.array([v.color[:] for v in a.data]) for a in o.data.color_attributes} for o in bpy.context.scene.objects if o.type=='MESH'}
mapping=json.loads((b/'female-vertex-mapping.json').read_text());native=json.loads((b/'female-native-validation.json').read_text())
blend_pony_roots(mapping,native['meshes'],native['materials'])
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
for ob in bpy.context.scene.objects:
 if ob.type!='MESH':continue
 for a in ob.data.color_attributes:
  now=np.array([v.color[:] for v in a.data])
  if ob.name not in NAMES+[INNER] or a.name!='ReferenceHairTint':
   assert np.array_equal(now,colors[ob.name][a.name]),(ob.name,a.name)
for name in NAMES:
 ob=bpy.data.objects[name];q=np.array([v.color[:] for v in ob.data.color_attributes['ReferenceHairTint'].data]);old=colors[name]['ReferenceHairTint'];retained=[]
 for ids in islands(ob):
  retained.extend(ids if len(ids)!=36 else ids[:2]+ids[14:])
 assert np.array_equal(q[retained],old[retained]),(name,'retained root/lower/cheek pigment')
 assert np.array_equal(q[:,3],old[:,3]),(name,'alpha')
 native['meshes']['rootDye']['meshes'][name]['unchangedColorVertices']=int(np.count_nonzero(np.max(abs(q-old),axis=1)<1e-7))
ob=bpy.data.objects[INNER];q=np.array([v.color[:] for v in ob.data.color_attributes['ReferenceHairTint'].data]);old_base=np.array(native['meshes']['rootDye']['meshes'][INNER]['previousBaseColor'])
retained=[]
for ids in islands(ob):retained.extend(ids[:4]+ids[34:])
error=float(np.max(abs(q[retained,:3]*DYE_BASE-old_base)));assert error<1e-7
assert np.all(q[:,3]==1)
spec=native['meshes']['rootDye'];spec.update(unchangedMeshContracts=len(contracts),geometryContracts=contracts,maximumRetainedInnerPigmentDrift=error)
scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.52
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
(p/'female-vertex-mapping.json').write_text(json.dumps(mapping)+'\n');(p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
(d/'native-root-dye-validation.json').write_text(json.dumps(spec,indent=2)+'\n')
print('ROOT_DYE',json.dumps({k:v for k,v in spec.items() if k!='geometryContracts'}),flush=True)
for name,loc in [('front',(0,-3,1.72)),('oblique',(-1.8,-2.1,1.76)),('profile',(3,0,1.72))]:
 cam.location=loc;review.look_at(cam,Vector((-.025,.005,1.65)));scene.render.filepath=str(d/('after-'+name+'.png'));bpy.ops.render.render(write_still=True)
