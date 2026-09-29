"""Check retained cheek-lock edges in finite expression and hair poses."""
import sys,json,bpy,numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_groom_finish import islands
from audit_complete_expressions import set_pose,POSES
p=OUT/'hair-likeness-20260921';bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
indices={n:np.concatenate([np.array(ids).reshape(17,2)[2:].ravel() for ids in islands(bpy.data.objects[n]) if len(ids)==34]) for n in ['PLURR pony strands 0','PLURR pony strands 2']}
poses=dict(POSES)
poses['hair-left-back']={'Secondary_HairSide':-1,'Secondary_HairBack':1}
poses['hair-right-front']={'Secondary_HairSide':1,'Secondary_HairBack':-1}
inner=bpy.data.objects['PLURR pony surface fibers']
inner_ids=np.concatenate([np.array(ids).reshape(24,2)[2:13].ravel() for ids in islands(inner)])
rows=[]
for name,pose in poses.items():
 set_pose(pose);body=Surface(rig,bpy.data.objects['AvatarBody']);minimum=1000;at=None;count=0
 for n,ids in indices.items():
  for point in array(bpy.data.objects[n],True)[ids]:
   front,_,_,_=body.tree.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
   if front is None:continue
   distance=body.tree.find_nearest(Vector(point))[3]
   gap=distance if point[1]<front.y else -distance
   if gap<minimum:minimum=gap;at=[n,point.tolist(),list(front)]
   count+=1
 inner_minimum=1000
 for point in array(inner,True)[inner_ids]:
  front,_,_,_=body.tree.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
  back,_,_,_=body.tree.ray_cast(Vector((point[0],.5,point[2])),Vector((0,-1,0)),1)
  inside=front is not None and back is not None and front.y<=point[1]<=back.y
  distance=body.tree.find_nearest(Vector(point))[3]
  inner_minimum=min(inner_minimum,-distance if inside else distance)
 rows.append({'innerFiberSamples':len(inner_ids),'minimumInnerFiberBodyClearanceMm':inner_minimum*1000,'pose':name,'samples':count,'minimumFaceClearanceMm':minimum*1000,'closest':at})
result={'poses':rows,'minimumInnerFiberBodyClearanceMm':min(r['minimumInnerFiberBodyClearanceMm'] for r in rows),'minimumFaceClearanceMm':min(r['minimumFaceClearanceMm'] for r in rows),'scope':'Retained face-tendril edges after first two samples and upper inner-fiber edges (samples 2-12 of 24), nine expression/hair poses; front/back body ray classification. Not continuous collision or hardware/self-contact.'}
(p/'fringe-pass'/'female-tendril-clearance.json').write_text(json.dumps(result,indent=2)+'\n')
print('TENDRIL_CLEARANCE',json.dumps(result),flush=True)
assert result['minimumFaceClearanceMm']>.5
assert result['minimumInnerFiberBodyClearanceMm']>0
