"""Measure the revised upper edges, including both fixed junctions."""
import sys,json,bpy,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from complete_pair_geometry import Surface
from refine_complete_groom_finish import islands
from refine_female_upper_locks import NAMES, END
from audit_complete_expressions import set_pose,POSES
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'upper-locks-pass'
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
spec=json.loads((d/'native-upper-locks-validation.json').read_text());parts={}
for name in NAMES:
 parts[name]=[]
 for ids in islands(bpy.data.objects[name]):
  if ids[0] not in spec['selectedCardFirstVertices'][name]:continue
  n=len(ids)//2;end=n-1 if name=='Polished female flyaways' else END
  parts[name].append(np.array(ids).reshape(n,2)[1:end+1])
cases={**POSES,'hair-cross-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},'hair-cross-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
rows=[]
for label,pose in cases.items():
 set_pose(pose);body=Surface(rig,bpy.data.objects['AvatarBody']).tree;gap=float('inf');intersections=0;points=0;edges=0;witnesses=[]
 for name,card_ids in parts.items():
  pnts=array(bpy.data.objects[name],True)
  for ids in card_ids:
   card=pnts[ids]
   for point in card[1:].reshape(-1,3):
    _,_,_,dist=body.find_nearest(Vector(point))
    front,_,_,_=body.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
    back,_,_,_=body.ray_cast(Vector((point[0],.5,point[2])),Vector((0,-1,0)),1)
    inside=front is not None and back is not None and front.y<=point[1]<=back.y
    gap=min(gap,-dist if inside else dist);points+=1
   for j in range(1,len(card)):
    for a,b in [(card[j-1,0],card[j,0]),(card[j-1,1],card[j,1]),(card[j,0],card[j,1])]:
     direction=Vector(b-a);length=direction.length
     if length<1e-8:continue
     hit,_,_,_=body.ray_cast(Vector(a),direction.normalized(),length);edges+=1
     if hit is not None:
      intersections+=1
      if len(witnesses)<5:witnesses.append({'mesh':name,'firstVertex':int(ids[0,0]),'pair':j+1,'hit':list(hit)})
 rows.append({'pose':label,'minimumBodyClearanceMm':gap*1000,'bodyEdgeIntersections':intersections,'points':points,'edges':edges,'witnesses':witnesses})
result={'samples':rows,'minimumBodyClearanceMm':min(x['minimumBodyClearanceMm'] for x in rows),'maximumBodyEdgeIntersections':max(x['bodyEdgeIntersections'] for x in rows),'scope':'Nine finite expression/secondary poses. Changed upper card spans and incoming/outgoing edges of the three outer pony meshes and 20 rounded short flyaways. No continuous collision, self-contact or full triangle-interior proof.'}
(d/'crown-contact-validation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
assert result['minimumBodyClearanceMm']>0
assert result['maximumBodyEdgeIntersections']==0
