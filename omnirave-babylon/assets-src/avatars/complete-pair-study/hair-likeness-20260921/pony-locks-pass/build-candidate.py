import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from refine_reference_hair import PASS,apply_geometry
from refine_female_pony_locks import shape_pony_locks
from audit_complete_expressions import set_pose
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
from refine_female_face_fall import NAMES
p=PASS;d=p/'pony-locks-pass';b=d/'before'
bpy.ops.wm.open_mainfile(filepath=str(b/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
other={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
before={}
for name in NAMES:
 ob=bpy.data.objects[name];before[name]={'positions':array(ob).copy(),'shapes':{k.name:np.array([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks}}
scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.52
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
def render(prefix):
 rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
 for name,loc in [('front',(0,-3,1.72)),('oblique',(-1.8,-2.1,1.76)),('profile',(3,0,1.72))]:
  cam.location=loc;review.look_at(cam,Vector((-.025,.005,1.65)));scene.render.filepath=str(d/(prefix+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
rig.data.pose_position='REST';set_pose({})
mapping=json.loads((b/'female-vertex-mapping.json').read_text());native=json.loads((b/'female-native-validation.json').read_text())
shape_pony_locks(mapping,native['meshes'],apply_geometry)
assert other=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
rows={};changed_total=0
for name in NAMES:
 ob=bpy.data.objects[name];old=before[name];q=array(ob);retained=[];long=[];count=0
 for ids in islands(ob):
  if ids[0] not in native['meshes']['ponyLocks']['selectedCardFirstVertices'][name]:retained.extend(ids);continue
  retained.extend(ids[:10]);long.extend(ids)
  if np.any(q[ids]!=old['positions'][ids]):count+=1
 assert np.array_equal(q[retained],old['positions'][retained]),(name,'fixed roots and cheek fibers')
 drift=0
 for key in ob.data.shape_keys.key_blocks:
  now=np.array([v.co[:] for v in key.data]);then=old['shapes'][key.name]
  assert np.array_equal(now[retained],then[retained]),(name,key.name,'retained shape vertices')
  drift=max(drift,float(np.max(abs((now-q)-(then-old['positions'])))))
 assert drift<3e-7,(name,drift)
 ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
 def areas(v):
  t=v[tri];return np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)*.5
 a0=areas(old['positions']);a1=areas(q);assert not np.any((a0>1e-12)&(a1<1e-14))
 rows[name]={'changedCards':count,'unchangedRootRearAndCheekVertices':len(set(retained)),'maximumRelativeShapeDeltaChangeMm':drift*1000,'newlyDegenerateTriangles':0,'beforeLongBounds':[old['positions'][long].min(0).tolist(),old['positions'][long].max(0).tolist()],'afterLongBounds':[q[long].min(0).tolist(),q[long].max(0).tolist()]};changed_total+=count
native['meshes']['ponyLocks'].update(unchangedOtherMeshContracts=len(other),changedCards=changed_total,validation=rows)
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({});bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
(p/'female-vertex-mapping.json').write_text(json.dumps(mapping)+'\n');(p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
(d/'native-pony-locks-validation.json').write_text(json.dumps(native['meshes']['ponyLocks'],indent=2)+'\n')
print('PONY_LOCKS',json.dumps(native['meshes']['ponyLocks']),flush=True)
render('after')
