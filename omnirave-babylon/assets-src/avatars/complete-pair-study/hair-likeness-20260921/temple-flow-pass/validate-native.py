"""Compare retained front-hair geometry and evaluate expression clearance."""
import sys,json,hashlib
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
from audit_complete_expressions import POSES,set_pose
from refine_female_temple_flow import NAME
NAMES=[NAME]
p=OUT/'hair-likeness-20260921';d=p/'temple-flow-pass'
def structure(ob):
 h=hashlib.sha256()
 for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
 for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
 for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
 return h.hexdigest()
def colors(ob):return np.array([v.color[:] for v in ob.data.color_attributes['ReferenceHairTint'].data])
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
before={n:{'points':array(bpy.data.objects[n]),'structure':structure(bpy.data.objects[n]),'colors':colors(bpy.data.objects[n])} for n in set(NAMES)}
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
old_native=json.loads((d/'before/female-native-validation.json').read_text());native=json.loads((p/'female-native-validation.json').read_text())
assert old_native['materials']==native['materials']
assert [a for a in old_native['additions'] if a['name']!=NAME]==[a for a in native['additions'] if a['name']!=NAME]
rows={};changed={}
for name in set(NAMES):
 ob=bpy.data.objects[name];old=before[name];q=array(ob);c=colors(ob);kept=[]
 assert structure(ob)==old['structure'] and not ob.data.shape_keys
 for ids in islands(ob):
  kept.extend(ids[:9])
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
   hit,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
   occluded+=int(hit is not None and point[1]<hit.y+.0005)
  ob=bpy.data.objects[name];edges=[(e.vertices[0],e.vertices[1]) for e in ob.data.edges]
  crossed=0
  for a,b in edges:
   delta=Vector(points[b]-points[a]);length=delta.length
   if length<1e-8:continue
   hit,_,_,distance=body.ray_cast(Vector(points[a]),delta/length,length)
   crossed+=int(hit is not None and distance>1e-7 and distance<length-1e-7)
  samples.append({'strandEdgeBodyIntersections':crossed,'pose' :label,'mesh':name,'vertices':len(ids),'minimumSkinClearanceMm':min(gaps),
   'minimumScalpClearanceMm':min(cap_gaps) if cap_gaps else None,'verticesInFrontOfLens':occluded})
report={'unchangedOtherMeshContracts':len(contracts),'meshes':rows,'retainedTopologyUVsAndWeights':True,
 'retainedRootsAndAllOtherGeometry':True,'hairMaterialManifestUnchanged':True,'poses':len(cases),'samples':samples,
 'minimumSkinClearanceMm':min(v['minimumSkinClearanceMm'] for v in samples),
 'minimumScalpClearanceMm':None,
 'maximumStrandEdgeBodyIntersections':max(v['strandEdgeBodyIntersections'] for v in samples),
 'maximumVerticesInFrontOfLens':max(v['verticesInFrontOfLens'] for v in samples),
 'scope':'Changed temple-flow vertices in nine finite rest-rig expression/secondary poses. First three root rows and 60 other mesh contracts retained exactly. Standard clip attachments are checked separately. No continuous contact, triangle-interior, goggle-frame or self-contact guarantee.'}
old_image=bpy.data.images.load(str(d/'before/reference-female-hairline.png'),check_existing=False)
new_image=bpy.data.images.load(str(p/'reference-female-hairline.png'),check_existing=False)
a=np.array(old_image.pixels[:]).reshape(1024,1024,4);b=np.array(new_image.pixels[:]).reshape(1024,1024,4)
assert np.array_equal(a[:,:,:3],b[:,:,:3]),'hairline RGB changed'
assert np.all(b[:,:,3]<=a[:,:,3]+1e-7),'hairline coverage increased'
assert np.array_equal(a[:910],b[:910]),'interior cap changed'
theta=(np.arange(1024)+.5)/1024*2*np.pi;rear=np.cos(theta)<=.15
assert np.array_equal(a[:,rear],b[:,rear]),'rear cap changed'
report['hairlineTexture']={'rgbRetainedExactly':True,'interiorAndRearRetainedExactly':True,'alphaPixelsReduced':int(np.count_nonzero(b[:,:,3]<a[:,:,3]-1e-7))}
assert report['hairlineTexture']['alphaPixelsReduced']>0
(d/'native-temple-flow-validation.json').write_text(json.dumps(report,indent=2)+'\n');print('TEMPLE_FLOW_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
assert report['minimumSkinClearanceMm']>1.5
assert report['unchangedOtherMeshContracts']==60
assert report['maximumVerticesInFrontOfLens']==0
assert report['maximumStrandEdgeBodyIntersections']==0
