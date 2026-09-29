"""Verify the loose outer locks against the preceding delivered source."""
import sys,json,hashlib
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from refine_complete_groom_finish import islands
from refine_complete_foil_finish import geometry_contract

p=OUT/'hair-likeness-20260921';d=p/'loose-lock-pass'
names=[f'PLURR pony strands {i}' for i in range(3)]
def structure(ob):
 h=hashlib.sha256()
 for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
 for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
 for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
 for attr in ob.data.color_attributes:h.update(np.asarray([v.color[:] for v in attr.data],dtype=np.float32).tobytes())
 return h.hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in names}
before={}
for name in names:
 ob=bpy.data.objects[name];before[name]={'base':array(ob),'structure':structure(ob),'uv':np.array([v.uv[:] for v in ob.data.uv_layers.active.data]),'shapes':{k.name:np.array([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks}}
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in names}
authoring=json.loads((p/'female-native-validation.json').read_text())['meshes']['looseLocks']
rows={};total=0
for name in names:
 ob=bpy.data.objects[name];old=before[name];points=array(ob);assert structure(ob)==old['structure'],name
 face=[];roots=[];long=[];count=0;unchanged=[]
 selected=authoring['selectedCardFirstVertices'][name]
 for ids in islands(ob):
  if len(ids)!=36:face.extend(ids);continue
  if ids[0] not in selected:unchanged.extend(ids)
  long.extend(ids)
  roots.extend(ids[:8])
  if not np.array_equal(points[ids],old['base'][ids]):count+=1
 unchanged+=face+roots
 assert np.array_equal(points[unchanged],old['base'][unchanged]),(name,'unselected vertices')
 uv=np.array([v.uv[:] for v in ob.data.uv_layers.active.data]);retained=set(unchanged)
 retained_loops=[loop.index for loop in ob.data.loops if loop.vertex_index in retained]
 assert np.array_equal(uv[retained_loops],old['uv'][retained_loops]),(name,'retained UV')
 assert np.isfinite(uv).all() and uv.min()>=0 and uv.max()<=1
 assert np.array_equal(points[roots],old['base'][roots]),(name,'roots')
 assert np.array_equal(points[face],old['base'][face]),(name,'face')
 drift=0
 for key in ob.data.shape_keys.key_blocks:
  q=np.array([v.co[:] for v in key.data]);prior=old['shapes'][key.name]
  assert np.array_equal(q[unchanged],prior[unchanged]),(name,key.name,'unchanged')
  assert np.array_equal(q[face],prior[face]),(name,key.name,'face')
  assert np.array_equal(q[roots],prior[roots]),(name,key.name,'roots')
  drift=max(drift,float(np.abs((q-points)-(prior-old['base'])).max()))
 assert drift<3e-7,(name,drift)
 ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
 def areas(p):
  v=p[tri];return np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)*.5
 old_area=areas(old['base']);new_area=areas(points)
 assert np.isfinite(points).all() and not np.any((old_area>1e-12)&(new_area<1e-14)),name
 rows[name]={'reshapedCards':count,'unchangedVertices':len(set(unchanged)),'unchangedCheekVertices':len(face),'retainedRootVertices':len(roots),
  'maxRelativeShapeDeltaChangeMm':drift*1000,'newlyDegenerateTriangles':0,
  'previousLongCardBounds':[old['base'][long].min(0).tolist(),old['base'][long].max(0).tolist()],
  'longCardBounds':[points[long].min(0).tolist(),points[long].max(0).tolist()]}
 total+=count
assert total==authoring['cards']==124,(total,authoring['cards'])
report={'unchangedOtherMeshContracts':len(contracts),'reshapedCards':total,'looseGuideGroups':13,'retainedTopologyWeightsAndColors':True,'meshes':rows,
 'scope':'Exact retention of other meshes, cheek vertices and all shape coordinates, four crown pairs per long card, topology, weights and colors. All UVs stay exact. Relative secondary-shape deltas retained within float rounding. Pose/clearance checks are separate.'}
(d/'native-loose-lock-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('LOOSE_LOCKS_VALIDATED',json.dumps(report),flush=True)
