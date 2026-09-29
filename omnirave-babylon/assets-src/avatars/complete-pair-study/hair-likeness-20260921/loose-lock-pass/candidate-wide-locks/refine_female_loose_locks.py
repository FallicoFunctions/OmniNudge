"""Separate a minority of existing outer locks into looser face-side waves.

Connection map: the first four pairs of every existing pony card stay at the
crown attachment. Most cards keep the continuous upper flow and lower fall;
selected outer cards depart gradually into narrower, staggered waves. Cheek
cards, inner fibers and short crown wisps remain fixed. Actual edges retain
millimeter clearance from skin and coat. Origins, weights, textures and
relative secondary-motion displacement retain their existing owners.
"""
import math
import bpy,numpy as np
from mathutils import Vector,Quaternion
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_face_fall import fit_front_collar,NAMES


def loosen_outer_locks(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    bases={n:array(bpy.data.objects[n]) for n in NAMES};rows=[];deltas={}
    retained_uv={n:mapping[n]['addedUv'] for n in NAMES if 'addedUv' in mapping[n]}
    for name,p in bases.items():
        ob=bpy.data.objects[name]
        deltas[name]=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-p for k in ['Secondary_HairSide','Secondary_HairBack']]
        for ids in islands(ob):
            if len(ids)==36:rows.append((name,ids,p[ids].reshape(18,2,3)))
    paths=np.array([r.mean(1) for _,_,r in rows]);groups=group_paths(paths,26);selected=[]
    for group in np.unique(groups):
        candidates=[i for i in np.flatnonzero(groups==group) if paths[i,-4:,1].mean()<-.035]
        # A minority of surface cards leaves the denser underlying fall intact.
        candidates.sort(key=lambda i:paths[i,7:14,0].mean())
        if candidates:selected.extend(candidates[:max(2,int(len(candidates)*.24))])
    q={n:p.copy() for n,p in bases.items()};parts={n:[] for n in NAMES};max_fit=0
    t=np.linspace(0,1,18);u=np.clip((t-t[3])/(1-t[3]),0,1)
    free=smooth(u/.82);bell=np.sin(math.pi*u)**2
    for i in selected:
        name,ids,r=rows[i];old=r.mean(1);c=old.copy();g=int(groups[i]);phase=g*2.399963;strand=i*2.399963
        c[:,0]-=(.014+.012*(.5+.5*math.sin(phase)))*free
        c[:,0]+=.018*np.sin(math.tau*u+phase)*bell
        c[:,1]+=.014*np.sin(math.tau*u+phase+.9)*bell+.006*math.cos(phase)*free
        c[:,2]+=.012*np.sin(math.pi*u+phase)*bell+.014*math.sin(strand)*free
        # Keep sparse card sampling smooth; root pairs remain untouched.
        for _ in range(2):
            relaxed=c.copy();relaxed[4:-1]=.16*c[3:-2]+.68*c[4:-1]+.16*c[5:];c=relaxed
        h=(r[:,1]-r[:,0])*.5;half=h.copy()
        for j in range(4,18):
            a=Vector(old[min(j+1,17)]-old[j-1]).normalized();b=Vector(c[min(j+1,17)]-c[j-1]).normalized()
            width=a.rotation_difference(b)@Vector(h[j]);width=Quaternion(b,.32*math.sin(phase)*bell[j])@width
            half[j]=width*(1-.32*free[j])
        rr=np.stack([c-half,c+half],axis=1);rr[:4]=r[:4]
        da,db=[d[ids].reshape(18,2,3) for d in deltas[name]];shift=np.zeros(18)
        for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
            for j in range(4,18):
                for point in (rr+delta)[j]:
                    hit,_,_,_=body.ray_cast(Vector((-.5,point[1],point[2])),Vector((1,0,0)),1)
                    if hit is not None:shift[j]=min(shift[j],hit.x-.008-point[0])
        for _ in range(2):
            s=shift.copy();s[4:-1]=.15*shift[3:-2]+.7*shift[4:-1]+.15*shift[5:];shift=np.minimum(shift,s)
        rr[:,:,0]+=shift[:,None];max_fit=max(max_fit,float(-shift.min()));q[name][ids]=rr.reshape(-1,3);parts[name].append(ids)
    for name,points in q.items():
        previous=dict(report[name]);apply(bpy.data.objects[name],points,mapping,report)
        report[name].update({k:v for k,v in previous.items() if k not in report[name]})
    collar=fit_front_collar(parts,mapping,report,apply)
    for name,uv in retained_uv.items():mapping[name]['addedUv']=uv
    report['looseLocks']={'cards':len(selected),'guideGroups':len(set(int(groups[i]) for i in selected)),
        'byMesh':{n:len(ids) for n,ids in parts.items()},'retainedRootPairs':4,
        'selectedCardFirstVertices':{n:[ids[0] for ids in part] for n,part in parts.items()},
        'maximumAdditionalBodyFitMm':max_fit*1000,'frontCollarFit':collar,
        'addedGeometry':0,'relativeSecondaryShapesRetained':True}
