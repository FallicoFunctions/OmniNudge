"""Check retained geometry, hair-root narrowing, atlas remap and cap coverage."""
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
p=OUT/'hair-likeness-20260921';d=p/'root-transition-pass';name='PLURR swept scalp groom'
def structure(ob):
 h=hashlib.sha256()
 for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
 for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
 for attr in ob.data.color_attributes:h.update(np.asarray([v.color[:] for v in attr.data],dtype=np.float32).tobytes())
 return h.hexdigest()
def uv(ob):
 a=np.zeros((len(ob.data.vertices),2));layer=ob.data.uv_layers.active.data
 for loop in ob.data.loops:a[loop.vertex_index]=layer[loop.index].uv[:]
 return a
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=name}
ob=bpy.data.objects[name];before=array(ob);old_structure=structure(ob);old_uv=uv(ob)
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=name}
ob=bpy.data.objects[name];after=array(ob);now_uv=uv(ob)
assert structure(ob)==old_structure and not ob.data.shape_keys
kept=[];drift=0
for ids in islands(ob):
 a=before[ids].reshape(24,2,3);b=after[ids].reshape(24,2,3)
 kept.extend(ids[6:]);drift=max(drift,float(np.max(np.linalg.norm(a.mean(1)-b.mean(1),axis=1))))
 assert np.all(np.linalg.norm(b[:,1]-b[:,0],axis=1)<=np.linalg.norm(a[:,1]-a[:,0],axis=1)+1e-7)
assert drift<1e-7 and np.array_equal(after[kept],before[kept])
assert np.array_equal(now_uv[:,0],old_uv[:,0]) and np.all(now_uv>=0) and np.all(now_uv<=1)
assert np.all(now_uv[:,1]>=old_uv[:,1]) and float(np.max(now_uv-old_uv))<=.020001
mapping=json.loads((p/'female-vertex-mapping.json').read_text())[name]
assert np.max(np.abs(np.stack([now_uv[:,0],1-now_uv[:,1]],axis=1)-mapping['addedUv']))<1e-7
changed=np.flatnonzero(np.linalg.norm(after-before,axis=1)>1e-7)
assert len(changed)>0
ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
v=after[tri];area=np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)*.5
assert np.isfinite(after).all() and area.min()>1e-14
def pixels(f):
 image=bpy.data.images.load(str(f),check_existing=False);assert tuple(image.size)==(1024,1024)
 return np.array(image.pixels[:]).reshape(1024,1024,4)
old=pixels(d/'before/reference-female-hairline.png');new=pixels(p/'reference-female-hairline.png')
assert np.array_equal(old[:,:,:3],new[:,:,:3])
u=(np.arange(1024)+.5)/1024;rear=np.cos(u*np.pi*2)<=.15
assert np.array_equal(old[:,rear],new[:,rear]) and np.array_equal(old[:900],new[:900])
assert np.all(new[:,:,3]<=old[:,:,3]+1/255+1e-7)
texture={'width':1024,'height':1024,'rgbRetained':True,'rearCoverageRetained':True,
 'solidInteriorRetained':True,'changedAlphaPixels':int(np.count_nonzero(new[:,:,3]!=old[:,:,3]))}
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';bpy.context.view_layer.update();rows=[]
for label,values in POSES.items():
 set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']).tree
 cap=Surface(rig,bpy.data.objects['Complete scalp']).tree;lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
 gaps=[];cap_gaps=[];covered=0
 for point in array(ob,True)[changed]:
  hit,n,_,_=body.find_nearest(Vector(point));gaps.append((Vector(point)-hit).dot(n)*1000)
  hit,n,_,_=cap.find_nearest(Vector(point));cap_gaps.append((Vector(point)-hit).dot(n)*1000)
  hit,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
  if hit is not None and point[1]<hit.y+.0005:covered+=1
 rows.append({'pose':label,'minimumSkinGapMm':min(gaps),'minimumCapGapMm':min(cap_gaps),'verticesInFrontOfLens':covered})
report={'unchangedOtherMeshContracts':len(contracts),'changedVertices':len(changed),'retainedVerticesAfterThirdRow':len(kept),
 'maximumCenterlineDriftMm':drift*1000,'topologyWeightsColorsRetained':True,'poses':len(POSES),'samples':rows,
 'minimumSkinGapMm':min(r['minimumSkinGapMm'] for r in rows),'minimumCapGapMm':min(r['minimumCapGapMm'] for r in rows),
 'maximumVerticesInFrontOfLens':max(r['verticesInFrontOfLens'] for r in rows),'texture':texture,
 'scope':'Seven finite expression/secondary poses and changed root vertices; no continuous or triangle-interior collision guarantee. Other mesh/shape contracts exact; prior face-wisp, braid and long-pony checks remain applicable.'}
(d/'native-root-transition-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('ROOT_TRANSITION_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
assert report['minimumSkinGapMm']>1.5 and report['minimumCapGapMm']>.5
assert report['maximumVerticesInFrontOfLens']==0
