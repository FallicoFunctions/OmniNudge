"""Check front-lock clearance and preservation against the fiber-pass source.

Connection map: the 35 retained card roots meet the existing scalp beneath the
goggles. Roots remain fitted; free lengths clear the evaluated face and
project behind the lenses. The cap edit is alpha coverage only, so root checks
refer to its physical surface, with visible coverage reviewed in native/game views.
"""
import json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
from audit_complete_expressions import POSES,set_pose

p=OUT/'hair-likeness-20260921';d=p/'hairline-pass';name='PLURR loose brunette front locks'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=name}
ob=bpy.data.objects[name];parts=islands(ob);old=array(ob)
old_roots=np.array([old[ids[:3]].mean(0) for ids in parts])
def structural(ob):
 return {'indices':[tuple(f.vertices) for f in ob.data.polygons],
  'uv':[tuple(v.uv) for v in ob.data.uv_layers.active.data],
  'weights':[[(g.group,g.weight) for g in v.groups] for v in ob.data.vertices],
  'colors':[tuple(c.color) for c in ob.data.color_attributes['ReferenceHairTint'].data]}
retained=structural(ob)
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=name}
ob=bpy.data.objects[name];current=structural(ob)
for key in ['indices','uv','weights']:assert retained[key]==current[key],key
color_drift=float(np.abs(np.asarray(retained['colors'])-np.asarray(current['colors'])).max())
# Tint is derived from fitted root positions. Narrower roots may move slightly
# when their edges are fitted behind the lens; exported colors must match the
# resulting native values (checked separately), not the old floating values.
colors=np.asarray(current['colors']);assert np.isfinite(colors).all() and colors.min()>=0 and colors.max()<=1
roots=np.array([array(ob)[ids[:3]].mean(0) for ids in islands(ob)])
root_delta=float(np.linalg.norm(roots-old_roots,axis=1).max())
print('ROOT_FIT_CHANGE_MM',root_delta*1000,'TINT_CHANGE',color_drift,flush=True)
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';bpy.context.view_layer.update()
rows=[]
for label,values in POSES.items():
 set_pose(values)
 body=Surface(rig,bpy.data.objects['AvatarBody']).tree
 lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
 scalp=Surface(rig,bpy.data.objects['Complete scalp']).tree
 points=array(ob,True);gaps=[];occluding=0
 for point in points:
  hit,n,_,_=body.find_nearest(Vector(point));gaps.append((Vector(point)-hit).dot(n))
  front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
  if front is not None and point[1]<front.y+.0005:occluding+=1
 root_gap=max(scalp.find_nearest(Vector(points[ids[:3]].mean(0)))[3] for ids in islands(ob))
 rows.append({'pose':label,'minimumSkinClearanceMm':min(gaps)*1000,'verticesInFrontOfLens':occluding,'maximumRootDistanceMm':root_gap*1000})
assert min(x['minimumSkinClearanceMm'] for x in rows)>.5
assert max(x['verticesInFrontOfLens'] for x in rows)==0
assert max(x['maximumRootDistanceMm'] for x in rows)<3
report={'unchangedOtherMeshContracts':len(contracts),'changedMesh':name,'vertices':len(ob.data.vertices),
 'retainedIndicesUVWeights':True,'maximumRootDerivedTintChange':color_drift,'maximumRootCenterChangeMm':root_delta*1000,
 'sampledExpressionHairPoses':len(rows),'samples':rows,
 'minimumSkinClearanceMm':min(x['minimumSkinClearanceMm'] for x in rows),
 'maximumVerticesInFrontOfLens':max(x['verticesInFrontOfLens'] for x in rows),
 'scope':'Front-lock vertices in seven finite rest-rig expression/hair poses; exact geometry retention for all other meshes. Does not certify continuous/triangle-interior collisions, goggle frame contact or hair self-contact.'}
(d/'native-hairline-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('HAIRLINE_VALIDATED',json.dumps(report),flush=True)
