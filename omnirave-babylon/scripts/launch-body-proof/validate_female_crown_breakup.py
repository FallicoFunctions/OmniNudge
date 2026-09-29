"""Check crown-wisp attachments, retained geometry and evaluated clearance."""
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
from refine_female_crown_breakup import NAME
p=OUT/'hair-likeness-20260921';d=p/'crown-breakup-pass'
def structure(ob):
 h=hashlib.sha256()
 for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
 for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
 for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
 for attr in ob.data.color_attributes:h.update(np.asarray([v.color[:] for v in attr.data],dtype=np.float32).tobytes())
 return h.hexdigest()
def keys(ob):return {k.name:np.array([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks}
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=NAME}
ob=bpy.data.objects[NAME];before=array(ob);old_structure=structure(ob);old_keys=keys(ob)
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=NAME}
ob=bpy.data.objects[NAME];q=array(ob);assert structure(ob)==old_structure
old_native=json.loads((d/'before/female-native-validation.json').read_text());native=json.loads((p/'female-native-validation.json').read_text())
assert old_native['materials']==native['materials'] and old_native['additions']==native['additions']
selected=native['meshes']['crownBreakup']['selectedCardFirstVertices'];kept=[];tested=[];long=[];roots=[];count=0;old_tips=[];new_tips=[]
for i,ids in enumerate(islands(ob)):
 if i%3:long.extend(ids);continue
 assert ids[0] in selected
 roots.extend(ids[:6]);tested.extend(ids[6:]);old_tips.append(before[ids[-2:]].mean(0));new_tips.append(q[ids[-2:]].mean(0));count+=1
kept=long+roots;assert count==60 and len(selected)==60
assert np.array_equal(q[kept],before[kept])
drift=0
for key,value in keys(ob).items():
 assert np.array_equal(value[kept],old_keys[key][kept]),key
 drift=max(drift,float(np.max(np.abs((value-q)-(old_keys[key]-before)))))
assert drift<3e-7
ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
def area(a):
 v=a[tri];return np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)*.5
assert np.isfinite(q).all() and not np.any((area(before)>1e-12)&(area(q)<1e-14))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';bpy.context.view_layer.update()
cases=dict(POSES);cases['hair-cross-left']={'Secondary_HairSide':-1,'Secondary_HairBack':1};cases['hair-cross-right']={'Secondary_HairSide':1,'Secondary_HairBack':-1}
samples=[]
for label,values in cases.items():
 set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']).tree;cap=Surface(rig,bpy.data.objects['Complete scalp']).tree;lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
 gaps=[];cap_gaps=[];occluded=0
 for point in array(ob,True)[tested]:
  hit,n,_,dist=body.find_nearest(Vector(point));gaps.append(float((Vector(point)-hit).dot(n))*1000)
  hit,n,_,dist=cap.find_nearest(Vector(point));cap_gaps.append(float((Vector(point)-hit).dot(n))*1000)
  hit,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
  occluded+=int(hit is not None and point[1]<hit.y+.0005)
 samples.append({'pose':label,'vertices':len(tested),'minimumSkinClearanceMm':min(gaps),'minimumScalpClearanceMm':min(cap_gaps),'verticesInFrontOfLens':occluded})
report={'unchangedOtherMeshContracts':len(contracts),'reshapedCards':count,'retainedLongCards':120,
 'retainedLongVertices':len(long),'retainedRootVertices':len(roots),'retainedTopologyUVWeightsAndColors':True,
 'maximumRelativeShapeDeltaChangeMm':drift*1000,'newlyDegenerateTriangles':0,
 'tipBoundsBefore':[np.min(old_tips,axis=0).tolist(),np.max(old_tips,axis=0).tolist()],
 'tipBoundsAfter':[np.min(new_tips,axis=0).tolist(),np.max(new_tips,axis=0).tolist()],
 'poses':len(cases),'samples':samples,'minimumSkinClearanceMm':min(v['minimumSkinClearanceMm'] for v in samples),
 'minimumScalpClearanceMm':min(v['minimumScalpClearanceMm'] for v in samples),
 'maximumVerticesInFrontOfLens':max(v['verticesInFrontOfLens'] for v in samples),
 'scope':'All free short-crown vertices in nine finite expression/secondary poses. First three pairs and 120 long flyaway cards, including shape coordinates, remain exact; 60 other mesh contracts exact. Clip attachments checked separately; no continuous, triangle-interior, goggle-frame or self-contact guarantee.'}
(d/'native-crown-breakup-validation.json').write_text(json.dumps(report,indent=2)+'\n');print('CROWN_BREAKUP_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
assert report['minimumSkinClearanceMm']>1.5 and report['minimumScalpClearanceMm']>.5
assert report['maximumVerticesInFrontOfLens']==0
