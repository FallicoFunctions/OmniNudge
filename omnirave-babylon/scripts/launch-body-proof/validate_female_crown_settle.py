"""Check the crown fit, retained attachments and evaluated skin/lens clearance."""
import json,sys,hashlib
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
from audit_complete_expressions import POSES,set_pose
from refine_female_crown_settle import NAMES
p=OUT/'hair-likeness-20260921';d=p/'crown-settle-pass'

def structure(ob):
 h=hashlib.sha256()
 for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
 for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
 for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
 for attr in ob.data.color_attributes:h.update(np.asarray([v.color[:] for v in attr.data],dtype=np.float32).tobytes())
 return h.hexdigest()

def keys(ob):return {k.name:np.array([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks} if ob.data.shape_keys else {}

bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
before={name:{'points':array(bpy.data.objects[name]),'structure':structure(bpy.data.objects[name]),'keys':keys(bpy.data.objects[name])} for name in NAMES}
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
old_native=json.loads((d/'before/female-native-validation.json').read_text());native=json.loads((p/'female-native-validation.json').read_text());assert old_native['materials']==native['materials'] and old_native['additions']==native['additions']
authored=native['meshes']['crownSettle'];rows={};tested={};cheeks={}
for name in NAMES:
 ob=bpy.data.objects[name];q=array(ob);old=before[name];roots=[];kept=[];face=[]
 assert structure(ob)==old['structure'],name
 selected=authored['selectedCheekFirstVertices'][name]
 if name!='PLURR gathered pony bundle':
  for ids in islands(ob):
   if len(ids)==34:
    if ids[0] in selected:roots.extend(ids[:8]);face.extend(ids)
    else:kept.extend(ids)
   else:roots.extend(ids[:2])
 kept.extend(roots)
 nonface=set(range(len(q)))-set(face)
 kept.extend(i for i in nonface if old['points'][i,2]<=1.58 or old['points'][i,0]>=-.063)
 kept=list(set(kept));assert np.array_equal(q[kept],old['points'][kept]),name
 drift=0
 for k,value in keys(ob).items():
  assert np.array_equal(value[kept],old['keys'][k][kept]),(name,k)
  drift=max(drift,float(np.abs((value-q)-(old['keys'][k]-old['points'])).max()))
 assert drift<3e-7,(name,drift)
 ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
 def area(points):
  v=points[tri];return np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)*.5
 assert np.isfinite(q).all() and not np.any((area(old['points'])>1e-12)&(area(q)<1e-14)),name
 ids=np.flatnonzero(np.linalg.norm(q-old['points'],axis=1)>1e-7);tested[name]=ids;cheeks[name]=face
 rows[name]={'changedVertices':len(ids),'retainedVertices':len(kept),'retainedRootVertices':len(roots),'extendedCheekCards':len(selected),'maxRelativeShapeDeltaChangeMm':drift*1000,'newlyDegenerateTriangles':0}
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';bpy.context.view_layer.update()
cases=dict(POSES);cases['hair-cross-left']={'Secondary_HairSide':-1,'Secondary_HairBack':1};cases['hair-cross-right']={'Secondary_HairSide':1,'Secondary_HairBack':-1}
samples=[]
for label,values in cases.items():
 set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']).tree;lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
 for name,ids in tested.items():
  pts=array(bpy.data.objects[name],True);gaps=[];occluded=0
  for vi in ids:
   point=pts[vi];_,_,_,distance=body.find_nearest(Vector(point))
   back,_,_,_=body.ray_cast(Vector((point[0],.5,point[2])),Vector((0,-1,0)),1)
   front,_,_,_=body.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
   inside=front is not None and back is not None and front.y<=point[1]<=back.y
   gaps.append(-distance if inside else distance)
  for vi in cheeks[name]:
   point=pts[vi];front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
   occluded+=int(front is not None and point[1]<front.y+.0005)
  samples.append({'pose':label,'mesh':name,'vertices':len(ids),'minimumSkinClearanceMm':min(gaps)*1000,'verticesInFrontOfLens':occluded})
report={'unchangedOtherMeshContracts':len(contracts),'meshes':rows,'retainedTopologyUVWeightsAndColors':True,'hairMaterialManifestUnchanged':True,'poses':len(cases),'samples':samples,'minimumSkinClearanceMm':min(r['minimumSkinClearanceMm'] for r in samples),'maximumVerticesInFrontOfLens':max(r['verticesInFrontOfLens'] for r in samples),'scope':'All changed crown/carrier/cheek vertices in nine finite rest-rig expression and secondary poses. Pony first pairs, cheek first four pairs, lower pony region and 55 other mesh contracts retained exactly. Standard clip/attachment and long-pony jacket checks are separate. No continuous, full triangle-interior, goggle-frame or self-contact guarantee.'}
(d/'native-crown-settle-validation.json').write_text(json.dumps(report,indent=2)+'\n');print('CROWN_SETTLE_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
assert report['minimumSkinClearanceMm']>1.5,report['minimumSkinClearanceMm']
assert report['maximumVerticesInFrontOfLens']==0,report['maximumVerticesInFrontOfLens']
