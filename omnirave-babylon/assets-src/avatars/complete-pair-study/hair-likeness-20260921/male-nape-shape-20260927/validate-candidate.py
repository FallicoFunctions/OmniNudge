"""Check the connected nape deformation against the immutable native input."""
import hashlib,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_reference_hair import PASS
from refine_male_nape_shape import NAMES,ATTRIBUTE
from refine_complete_foil_finish import geometry_contract
from complete_pair_geometry import Surface
from audit_complete_expressions import POSES,set_pose
from validate_reference_hair import run as validate_motion
from refine_male_loose_fringe import skin_gap,point_inside
folder=PASS/'male-nape-shape-20260927'
def structure(ob):
 h=hashlib.sha256()
 for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes());h.update(str(f.material_index).encode())
 for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
 for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
 h.update(repr([m.name for m in ob.data.materials]).encode());h.update(repr(tuple(tuple(row) for row in ob.matrix_world)).encode())
 return h.hexdigest()
def snapshot(ob):
 p=array(ob);ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
 return {'points':p,'structure':structure(ob),'tri':tri,'colors':{a.name:np.array([v.color[:] for v in a.data]) for a in ob.data.color_attributes},'shapes':{k.name:np.array([v.co[:] for v in k.data])-p for k in ob.data.shape_keys.key_blocks} if ob.data.shape_keys else {}}
def triangles(p,tri):return np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
unchanged={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
old={n:snapshot(bpy.data.objects[n]) for n in NAMES}
materials={m.name:(tuple(m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value),m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value) for n in NAMES for m in bpy.data.objects[n].data.materials}
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
assert unchanged=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
assert materials=={m.name:(tuple(m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value),m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value) for n in NAMES for m in bpy.data.objects[n].data.materials}
old_map=json.loads((folder/'before/male-vertex-mapping.json').read_text());new_map=json.loads((PASS/'male-vertex-mapping.json').read_text())
for name in old_map:
 allowed=['after','afterNormals']+(['addedColors'] if name in NAMES[:2] else []) if name in NAMES else []
 assert {k:v for k,v in old_map[name].items() if k not in allowed}=={k:v for k,v in new_map[name].items() if k not in allowed},name
changed={};checks={}
for name in NAMES:
 ob=bpy.data.objects[name];new=snapshot(ob);prior=old[name];p=prior['points'];q=new['points']
 assert prior['structure']==new['structure'];assert np.isfinite(q).all()
 assert np.array_equal(q[p[:,1]<-.065],p[p[:,1]<-.065]),(name,'Front hair moved')
 assert np.array_equal(q[p[:,2]>1.750],p[p[:,2]>1.750]),(name,'Upper hair moved')
 for attribute in prior['colors']:
  a=prior['colors'][attribute];b=new['colors'][attribute]
  if name in NAMES[:2] and attribute==ATTRIBUTE:
   assert np.array_equal(a[:,:3],b[:,:3]);assert np.array_equal(a[p[:,1]<-.035],b[p[:,1]<-.035]);assert np.all((b>=0)&(b<=1))
   assert np.array_equal(np.array(new_map[name]['addedColors'],dtype=np.float32),b.astype(np.float32))
  else:assert np.array_equal(a,b)
 morph_error=max([float(np.abs(new['shapes'][k]-v).max()) for k,v in prior['shapes'].items()]+[0]);assert morph_error<3e-7
 oa=triangles(p,prior['tri']);na=triangles(q,prior['tri'])
 assert not np.any((np.linalg.norm(na,axis=1)<1e-14)&(np.linalg.norm(oa,axis=1)>=1e-14)),name+' new degenerate triangles'
 width=None
 if name!=NAMES[0]:
  a=p.reshape(-1,12,2,3);b=q.reshape(-1,12,2,3)
  wa=a[:,:,1]-a[:,:,0];wb=b[:,:,1]-b[:,:,0]
  assert np.allclose(np.linalg.norm(wa,axis=2),np.linalg.norm(wb,axis=2),atol=3e-7,rtol=0),name+' widths changed'
  width=float(np.linalg.norm(wb,axis=2).max()*1000)
  original_width=float(np.linalg.norm(wa,axis=2).max()*1000)
  assert width<=original_width+.0003, (name,width,original_width)
  print('RETAINED_WIDTH',name,original_width,width,flush=True)
  if name==NAMES[2]:
   assert width<2.5
   assert np.array_equal(a[:,9:],b[:,9:]),'Main-groom free ends changed'
   fringe=np.array(json.loads((folder/'protected-fringe-ribbons.json').read_text()),dtype=int)
   bridge=np.array(json.loads((PASS/'male-crown-blend-20260927/authoring-report.json').read_text())['editedRibbonIndices'],dtype=int)
   assert np.array_equal(a[fringe],b[fringe]);assert np.array_equal(a[bridge],b[bridge])
 changed[name]=np.flatnonzero(np.linalg.norm(q-p,axis=1)>2e-7)
 checks[name]={'changedVertices':len(changed[name]),'exactFrontVertices':int((p[:,1]<-.065).sum()),'exactUpperVertices':int((p[:,2]>1.750).sum()),'maximumRibbonWidthMm':width,'maxRelativeMorphErrorMm':morph_error*1000,'structurePreserved':True,'noNewDegenerateTriangles':True}
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
poses={**POSES,'hair-mixed-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},'hair-mixed-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
clearance={}
for label,values in poses.items():
 set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody'])
 center=np.mean([array(bpy.data.objects['AvatarEye_'+s],True).mean(0) for s in ['l','r']],axis=0);center[1]+=.065;center[2]+=.023
 assert point_inside(body.tree,Vector(center));assert not point_inside(body.tree,Vector(center)+Vector((.3,0,0)))
 for name in NAMES:
  points=array(bpy.data.objects[name],True)[changed[name]];gaps=np.array([skin_gap(body.tree,Vector(p))[0] for p in points])
  entry={'samples':len(points),'minimumSkinClearanceMm':float(gaps.min()*1000),'belowHalfMm':int((gaps<.0005).sum()),'rayControlsPassed':True}
  clearance[label+' / '+name]=entry;print('NAPE_CLEARANCE',label,name,entry,flush=True)
assert all(v['belowHalfMm']==0 for v in clearance.values()),'Inspect sampled skin clearance'
report={'unchangedMeshes':len(unchanged),'meshes':checks,'exactProtectedFringeRibbons':len(fringe),'exactCrownBridgeRibbons':len(bridge),'mainGroomFreeEndPairsExact':3,'sampledSkinClearance':clearance,'scope':'Nine sampled expressions and hair shapes on changed vertices; five-ray parity resolves concave skin normals. Finite sampling does not establish continuous or hair-to-hair collision freedom.'}
(folder/'native-checks.json').write_text(json.dumps(report,indent=2)+'\n')
validate_motion('male',False)
print('MALE_NATIVE_CHECKS_PASSED',flush=True)
