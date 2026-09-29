"""Keep rear pony ends outside the folded hood in authored motion samples.

Connection map: all crown pairs remain exact; only the last 44% of rear cards
can bend away from the collar. A smooth shared displacement moves both edges
of each card, retaining its taper, UVs, head weights and relative shape deltas.
The collar is measured in evaluated animation poses, not just in the rest pose.
An explicit card subset can choose a different retained-pair boundary; the
default keeps the original rear-tip fit unchanged for earlier authoring stages.
"""
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from audit_complete_expressions import set_pose,POSES


def clear_rear_tips(mapping,report,apply,cards_override=None,retained_pairs=10):
 rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
 names=[f'PLURR pony strands {i}' for i in range(3)]
 bases={n:array(bpy.data.objects[n]) for n in names};cards={};amplitudes={}
 if cards_override is None:ramp=smooth((np.linspace(0,1,18)-.56)/.44)
 else:
  start=(retained_pairs-1)/17
  ramp=smooth((np.linspace(0,1,18)-start)/(1-start))
 for name in names:
  ob=bpy.data.objects[name];head=ob.vertex_groups['head'].index
  assert np.allclose(np.array(ob.matrix_world),np.eye(4)),name
  assert all(abs(sum(g.weight for g in v.groups if g.group==head)-1)<1e-6 and
             sum(g.weight for g in v.groups if g.group!=head)<1e-6 for v in ob.data.vertices),name
  cards[name]=cards_override[name] if cards_override is not None else [ids for ids in islands(bpy.data.objects[name]) if len(ids)==36 and bases[name][ids].reshape(18,2,3)[12:,:,1].mean()>.015]
  amplitudes[name]=np.zeros(len(cards[name]))
 cases=[]
 for clip in ['idle','walk','run']:
  for frame in np.linspace(*bpy.data.actions[clip].frame_range,9):cases.append((clip,float(frame),{}))
 cases += [('idle',1,POSES['hair-left']),('idle',1,POSES['hair-right'])]
 cases += [('idle',1,{'Secondary_HairSide':s,'Secondary_HairBack':b}) for s,b in [(-1,1),(1,-1)]]
 rig.data.pose_position='POSE';rounds=[]
 for iteration in range(5):
  largest=0
  for clip,frame,shape in cases:
   rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(int(frame),subframe=frame%1);set_pose(shape)
   transform=rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()
   direction=np.array(transform.to_3x3())[:,1];assert direction[1]>.8,direction
   coats=[Surface(rig,bpy.data.objects[n]).tree for n in ['Structured armhole jacket','PLURR folded hood']]
   for name in names:
    points=array(bpy.data.objects[name],True)
    for i,ids in enumerate(cards[name]):
     old=amplitudes[name][i];needed=old
     card=points[ids].reshape(18,2,3)
     for j in range(retained_pairs,18):
      if ramp[j]<.001:continue
      for point in card[j]+direction*old*ramp[j]:
       if point[2]>1.63:continue
       for tree in coats:
        back,_,_,_=tree.ray_cast(Vector((point[0],.5,point[2])),Vector((0,-1,0)),1)
        if back is not None:
         needed=max(needed,old+(back.y+.008-point[1])/(direction[1]*ramp[j]))
     # A long last segment can cross the hood even when both endpoints lie
     # outside its outline. Fit actual edge intersections as well as vertices.
     posed=card+direction[None,None,:]*old*ramp[:,None,None]
     for j in range(retained_pairs,18):
      for a,b,ra,rb in [(posed[j-1,0],posed[j,0],ramp[j-1],ramp[j]),
                        (posed[j-1,1],posed[j,1],ramp[j-1],ramp[j]),
                        (posed[j,0],posed[j,1],ramp[j],ramp[j])]:
       if min(a[2],b[2])>1.63:continue
       edge=Vector(b-a);length=edge.length
       if length<1e-8:continue
       for tree in coats:
        hit,_,_,distance=tree.ray_cast(Vector(a),edge.normalized(),length)
        if hit is None:continue
        f=distance/length;weight=ra*(1-f)+rb*f
        if weight<.001:continue
        back,_,_,_=tree.ray_cast(Vector((hit.x,.5,hit.z)),Vector((0,-1,0)),1)
        if back is not None:needed=max(needed,old+(back.y+.010-hit.y)/(direction[1]*weight))
     largest=max(largest,needed-old);amplitudes[name][i]=needed
  rounds.append(float(largest*1000))
  print('REAR_TIP_FIT',iteration+1,'largest increase mm',rounds[-1],flush=True)
  if largest<.0001:break
 assert max(float(a.max(initial=0)) for a in amplitudes.values())<.18,'Rear correction exceeds measured hair scale'
 rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({});rig.data.pose_position='REST';bpy.context.view_layer.update()
 counts={};maximum=0
 for name in names:
  q=bases[name].copy();count=0
  for i,ids in enumerate(cards[name]):
   amount=amplitudes[name][i]
   if amount<=1e-7:continue
   q[ids,1]+=np.repeat(ramp*amount,2);count+=1;maximum=max(maximum,float(amount))
  old_report=dict(report[name]);apply(bpy.data.objects[name],q,mapping,report)
  # Keep measurements of the earlier shoulder stage alongside this edit.
  for k,v in old_report.items():
   if k not in report[name]:report[name][k]=v
  counts[name]=count
 report['rearTipClearance']={'cards':sum(counts.values()),'byMesh':counts,'poseSamples':len(cases),
  'targetJacketMarginMm':8,'edgeIntersectionTargetMarginMm':10,'maximumTipAdjustmentMm':maximum*1000,'iterationIncreasesMm':rounds,
  'rootPairsRetained':retained_pairs if cards_override is not None else 4,'relativeSecondaryShapesRetained':True}
