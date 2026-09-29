"""Measure upper-path turns and preserve attachments, ends and other meshes."""
import sys,json,hashlib
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from refine_complete_groom_finish import islands
from refine_complete_foil_finish import geometry_contract
from refine_female_upper_flow import NAMES,active_card,end_pair
p=OUT/'hair-likeness-20260921';d=p/'upper-flow-pass'

def structure(ob):
 h=hashlib.sha256()
 for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
 for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
 for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
 for attr in ob.data.color_attributes:h.update(np.asarray([v.color[:] for v in attr.data],dtype=np.float32).tobytes())
 return h.hexdigest()

def angles(q):
 delta=np.diff(q.mean(1),axis=0);delta/=np.maximum(np.linalg.norm(delta,axis=1)[:,None],1e-12)
 return np.degrees(np.arccos(np.clip((delta[:-1]*delta[1:]).sum(1),-1,1)))

bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
before={}
for name in NAMES:
 ob=bpy.data.objects[name];before[name]={'base':array(ob),'structure':structure(ob),'shapes':{k.name:np.array([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks}}
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
rows={};total=0
for name in NAMES:
 ob=bpy.data.objects[name];old=before[name];points=array(ob);assert structure(ob)==old['structure'],name
 retained=[];active=[];count=0;old_angles=[];new_angles=[]
 for i,ids in enumerate(islands(ob)):
  if not active_card(name,ids,i):retained.extend(ids);continue
  n=len(ids)//2;end=end_pair(n);retained.extend(ids[:8]+ids[end*2:]);active.extend(ids[8:end*2]);count+=1
  old_angles.extend(angles(old['base'][ids].reshape(n,2,3))[2:end].tolist())
  new_angles.extend(angles(points[ids].reshape(n,2,3))[2:end].tolist())
 assert np.array_equal(points[retained],old['base'][retained]),name
 drift=0
 for key in ob.data.shape_keys.key_blocks:
  q=np.array([v.co[:] for v in key.data]);prior=old['shapes'][key.name]
  assert np.array_equal(q[retained],prior[retained]),(name,key.name,'retained')
  drift=max(drift,float(np.abs((q-points)-(prior-old['base'])).max()))
 assert drift<3e-7,(name,drift)
 ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
 def areas(p):
  v=p[tri];return np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)*.5
 assert np.isfinite(points).all() and not np.any((areas(old['base'])>1e-12)&(areas(points)<1e-14)),name
 previous=float(np.percentile(old_angles,95));current=float(np.percentile(new_angles,95))
 assert current<previous,(name,previous,current)
 rows[name]={'reshapedCards':count,'retainedVertices':len(retained),'changedSpanVertices':len(active),
  'maxRelativeShapeDeltaChangeMm':drift*1000,'newlyDegenerateTriangles':0,
  'upperTurnDegrees95Before':previous,'upperTurnDegrees95After':current,
  'upperTurnDegreesMaximumBefore':max(old_angles),'upperTurnDegreesMaximumAfter':max(new_angles)}
 total+=count
assert total==1212,total
report={'unchangedOtherMeshContracts':len(contracts),'reshapedCards':total,'retainedTopologyUVWeightsAndColors':True,'meshes':rows,
 'scope':'Other meshes exact; four crown pairs and lower 28 percent of each active card exact in all shape keys, cheek cards and short crown wisps exact. Topology, UVs, weights, colors and relative shape deltas retained. 95th-percentile upper centerline turning angle measured including both join rows. Finite motion/body clearance checks are separate.'}
(d/'native-upper-flow-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('UPPER_FLOW_VALIDATED',json.dumps(report),flush=True)
