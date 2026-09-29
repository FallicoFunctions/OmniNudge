import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import review,array
from refine_reference_hair import PASS,apply_geometry
from refine_female_rear_drape import drape_rear_pony
from refine_female_root_dye import blend_pony_roots,INNER,NAMES,DYE_BASE
from audit_complete_expressions import set_pose
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
p=PASS;d=p/'pony-drape-pass';b=d/'before'
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

before={n:{'positions':array(bpy.data.objects[n]).copy(),'shapes':{k.name:np.array([v.co[:] for v in k.data]) for k in bpy.data.objects[n].data.shape_keys.key_blocks}} for n in NAMES}
drape_rear_pony(mapping,native['meshes'],apply_geometry)
for name,contract in contracts.items():
 if name not in NAMES:assert geometry_contract(bpy.data.objects[name])==contract,name
validation={}
for name in NAMES:
 ob=bpy.data.objects[name];old=before[name];q=array(ob);retained=[]
 for ids in islands(ob):
  retained.extend(ids[:18] if ids[0] in native['meshes']['rearDrape']['selectedCardFirstVertices'][name] else ids)
 assert np.array_equal(q[retained],old['positions'][retained]),(name,'attached upper span and front/cheek cards')
 drift=0
 for key in ob.data.shape_keys.key_blocks:
  now=np.array([v.co[:] for v in key.data]);then=old['shapes'][key.name]
  assert np.array_equal(now[retained],then[retained]),(name,key.name,'retained positions')
  drift=max(drift,float(np.max(abs((now-q)-(then-old['positions'])))))
 assert drift<3e-7,(name,drift)
 ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
 def area(v):
  a=v[tri];return np.linalg.norm(np.cross(a[:,1]-a[:,0],a[:,2]-a[:,0]),axis=1)*.5
 assert not np.any((area(old['positions'])>1e-12)&(area(q)<1e-14))
 validation[name]={'unchangedRootFrontAndCheekVertices':len(retained),'maximumRelativeShapeDriftMm':drift*1000,'newlyDegenerateTriangles':0}
native['meshes']['rearDrape'].update(unchangedOtherMeshContracts=len(contracts)-len(NAMES),validation=validation)

scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.52
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
(p/'female-vertex-mapping.json').write_text(json.dumps(mapping)+'\n');(p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
(d/'native-root-dye-validation.json').write_text(json.dumps(spec,indent=2)+'\n')
(d/'native-pony-drape-validation.json').write_text(json.dumps(native['meshes']['rearDrape'],indent=2)+'\n')
print('PONY_DRAPE',json.dumps({k:v for k,v in native['meshes']['rearDrape'].items() if k!='selectedCardFirstVertices'}),flush=True)
for name,loc in [('front',(0,-3,1.72)),('oblique',(-1.8,-2.1,1.76)),('profile',(3,0,1.72))]:
 cam.location=loc;review.look_at(cam,Vector((-.025,.005,1.65)));scene.render.filepath=str(d/('after-'+name+'.png'));bpy.ops.render.render(write_still=True)
