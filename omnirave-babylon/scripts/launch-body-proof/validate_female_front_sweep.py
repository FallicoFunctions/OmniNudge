"""Compare retained front-hair geometry and evaluate expression clearance."""
import sys,json,hashlib
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
from audit_complete_expressions import POSES,set_pose
from refine_female_front_sweep import NAMES
p=OUT/'hair-likeness-20260921';d=p/'front-sweep-pass'
def structure(ob):
 h=hashlib.sha256()
 for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
 for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
 for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
 return h.hexdigest()
def colors(ob):return np.array([v.color[:] for v in ob.data.color_attributes['ReferenceHairTint'].data])
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
before={n:{'points':array(bpy.data.objects[n]),'structure':structure(bpy.data.objects[n]),'colors':colors(bpy.data.objects[n])} for n in NAMES}
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
old_native=json.loads((d/'before/female-native-validation.json').read_text());native=json.loads((p/'female-native-validation.json').read_text())
assert old_native['materials']==native['materials']
assert [a for a in old_native['additions'] if a['name']!=NAMES[1]]==[a for a in native['additions'] if a['name']!=NAMES[1]]
rows={};changed={}
for name in NAMES:
 ob=bpy.data.objects[name];old=before[name];q=array(ob);c=colors(ob);kept=[]
 assert structure(ob)==old['structure'] and not ob.data.shape_keys
 selected=native['meshes']['frontSweep']['meshes'][name]['selectedCardFirstVertices']
 for ids in islands(ob):
  if name==NAMES[0]:kept.extend(ids[:6]+ids[24:] if ids[0] in selected else ids)
  else:kept.extend(ids[:9])
 assert np.array_equal(q[kept],old['points'][kept]) and np.array_equal(c[kept],old['colors'][kept]),name
 assert np.isfinite(q).all() and np.isfinite(c).all() and c.min()>=0 and c.max()<=1
 ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
 def area(a):
  v=a[tri];return np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)*.5
 assert not np.any((area(old['points'])>1e-12)&(area(q)<1e-14)),name
 changed[name]=np.flatnonzero(np.linalg.norm(q-old['points'],axis=1)>1e-7)
 assert len(changed[name])>0
 rows[name]={'changedVertices':len(changed[name]),'retainedVertices':len(kept),'newlyDegenerateTriangles':0,
  'meanTintBefore':float(old['colors'][:,:3].mean()),'meanTintAfter':float(c[:,:3].mean())}
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';bpy.context.view_layer.update()
cases=dict(POSES);cases['hair-cross-left']={'Secondary_HairSide':-1,'Secondary_HairBack':1};cases['hair-cross-right']={'Secondary_HairSide':1,'Secondary_HairBack':-1}
samples=[]
for label,values in cases.items():
 set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']).tree;cap=Surface(rig,bpy.data.objects['Complete scalp']).tree;lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
 for name,ids in changed.items():
  points=array(bpy.data.objects[name],True);gaps=[];cap_gaps=[];occluded=0
  for point in points[ids]:
   hit,n,_,dist=body.find_nearest(Vector(point));gaps.append(float((Vector(point)-hit).dot(n))*1000)
   if name==NAMES[0]:
    hit,n,_,dist=cap.find_nearest(Vector(point));cap_gaps.append(float((Vector(point)-hit).dot(n))*1000)
   hit,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
   occluded+=int(hit is not None and point[1]<hit.y+.0005)
  samples.append({'pose':label,'mesh':name,'vertices':len(ids),'minimumSkinClearanceMm':min(gaps),
   'minimumScalpClearanceMm':min(cap_gaps) if cap_gaps else None,'verticesInFrontOfLens':occluded})
report={'unchangedOtherMeshContracts':len(contracts),'meshes':rows,'retainedTopologyUVsAndWeights':True,
 'retainedRootsAndRearScalp':True,'hairMaterialManifestUnchanged':True,'poses':len(cases),'samples':samples,
 'minimumSkinClearanceMm':min(v['minimumSkinClearanceMm'] for v in samples),
 'minimumScalpClearanceMm':min(v['minimumScalpClearanceMm'] for v in samples if v['minimumScalpClearanceMm'] is not None),
 'maximumVerticesInFrontOfLens':max(v['verticesInFrontOfLens'] for v in samples),
 'scope':'Changed front-sweep vertices in nine finite rest-rig expression/secondary poses. First three root pairs/rows and rear scalp retained exactly; 59 other mesh contracts exact. Standard clip attachments are checked separately. No continuous contact, triangle-interior, goggle-frame or self-contact guarantee.'}
(d/'native-front-sweep-validation.json').write_text(json.dumps(report,indent=2)+'\n');print('FRONT_SWEEP_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
assert report['minimumSkinClearanceMm']>1.5
assert report['minimumScalpClearanceMm']>.5
assert report['maximumVerticesInFrontOfLens']==0
