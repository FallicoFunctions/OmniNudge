"""Shorten the rear pony fan into softly bent, shoulder-length tiers.

Connection map: all first nine pairs retain their exact crown-to-fall path;
front-facing and cheek cards stay fixed. Rear free spans are resampled shorter,
with distinct tip heights and soft bends. Both card edges clear skin by 8 mm
in neutral/four secondary corners, and the rear collar in 31 evaluated poses.
Thin hair uses millimeter clearance. Origins, topology, UVs, weights, pigment
and relative secondary offsets retain their owners.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_face_fall import NAMES,apply_retained
from refine_female_pony_clearance import clear_rear_tips


def drape_rear_pony(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    bases={n:array(bpy.data.objects[n]) for n in NAMES};revised={n:p.copy() for n,p in bases.items()}
    saved_uv={n:mapping[n]['addedUv'] for n in NAMES if 'addedUv' in mapping[n]}
    rows=[];deltas={};selected={n:[] for n in NAMES}
    for name,p in bases.items():
        ob=bpy.data.objects[name]
        deltas[name]=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-p for k in ['Secondary_HairSide','Secondary_HairBack']]
        for ids in islands(ob):
            if len(ids)!=36:continue
            r=p[ids].reshape(18,2,3)
            if r[-4:,:,1].mean()>=-.025:rows.append((name,ids,r))
    groups=group_paths(np.array([r.mean(1) for _,_,r in rows]),12)
    t=np.arange(18);u=np.clip((t-8)/9,0,1);free=smooth(u);bell=np.sin(math.pi*u)**2
    tips_before=[];max_fit=0
    for i,(name,ids,r) in enumerate(rows):
        old=r.mean(1);phase=int(groups[i])*2.399963;length=.58+.20*(.5+.5*math.sin(phase))
        sample=8+(t-8)*(1-(1-length)*free)
        c=np.stack([np.interp(sample,t,old[:,axis]) for axis in range(3)],axis=1)
        c[:,0]+=.012*math.sin(phase)*bell
        c[:,1]-=.035*free; c[:,1]+=.010*math.sin(phase+.6)*bell
        tip_z=1.435+.045*(.5+.5*math.cos(phase))
        c[:,2]+=max(0,tip_z-c[-1,2])*free
        c[:9]=old[:9]
        half=(r[:,1]-r[:,0])*.5;h=half.copy()
        for j in range(9,18):
            a=Vector(old[min(j+1,17)]-old[j-1]).normalized();b=Vector(c[min(j+1,17)]-c[j-1]).normalized()
            h[j]=(a.rotation_difference(b)@Vector(half[j]))*(1-.18*free[j])
        rr=np.stack([c-h,c+h],axis=1);rr[:9]=r[:9]
        da,db=[v[ids].reshape(18,2,3) for v in deltas[name]];shift=np.zeros(18)
        for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
            for j in range(9,18):
                for point in (rr+delta)[j]:
                    hit,_,_,_=body.ray_cast(Vector((-.5,point[1],point[2])),Vector((1,0,0)),1)
                    if hit is not None:shift[j]=min(shift[j],hit.x-.008-point[0])
        for _ in range(2):
            smoothed=shift.copy();smoothed[9:-1]=.15*shift[8:-2]+.70*shift[9:-1]+.15*shift[10:];shift=np.minimum(shift,smoothed)
        rr[:,:,0]+=shift[:,None];max_fit=max(max_fit,float(-shift.min()))
        revised[name][ids]=rr.reshape(-1,3);selected[name].append(ids);tips_before.extend(r[-1])
    for name,q in revised.items():apply_retained(bpy.data.objects[name],q,mapping,report,apply)
    clear_rear_tips(mapping,report,apply,cards_override=selected,retained_pairs=9)
    for name,uv in saved_uv.items():mapping[name]['addedUv']=uv
    tips_after=np.concatenate([array(bpy.data.objects[n])[np.array(ids[-2:])] for n,parts in selected.items() for ids in parts])
    tips_before=np.array(tips_before)
    report['rearDrape']={'cards':len(rows),'guideGroups':12,'retainedRootPairs':9,
        'selectedCardFirstVertices':{n:[ids[0] for ids in parts] for n,parts in selected.items()},
        'byMesh':{n:len(parts) for n,parts in selected.items()},'maximumAdditionalBodyFitMm':max_fit*1000,
        'collarFit':dict(report['rearTipClearance']),
        'beforeTipBounds':[tips_before.min(0).tolist(),tips_before.max(0).tolist()],
        'afterTipBounds':[tips_after.min(0).tolist(),tips_after.max(0).tolist()],
        'medianTipLiftMm':float(np.median(tips_after[:,2]-tips_before[:,2])*1000),
        'medianTipPullForwardMm':float(np.median(tips_before[:,1]-tips_after[:,1])*1000),
        'addedGeometry':0,'relativeSecondaryShapesRetained':True}
