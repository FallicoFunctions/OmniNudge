"""Separate the outer pony into staggered waves and brighter dyed locks.

Connection map: existing long cards keep their first five crown pairs exactly.
The selected free spans carry a broad, staggered bend with narrower ends;
unselected strands and cheek cards keep their geometry. Actual card edges fit
outside skin and the front collar. Hair uses millimeter surface clearance.
Existing origins, topology, UVs, weights and relative secondary shapes remain.
"""
import math
import bpy,numpy as np
from mathutils import Vector,Quaternion
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_face_fall import NAMES,fit_front_collar
from refine_female_dye import DYE_BASE


def shape_wind_layers(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    bases={n:array(bpy.data.objects[n]) for n in NAMES};rows=[];deltas={}
    uv={n:mapping[n]['addedUv'] for n in NAMES if 'addedUv' in mapping[n]}
    for name,p in bases.items():
        ob=bpy.data.objects[name]
        deltas[name]=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-p for k in ['Secondary_HairSide','Secondary_HairBack']]
        for ids in islands(ob):
            if len(ids)==36:rows.append((name,ids,p[ids].reshape(18,2,3)))
    paths=np.array([r.mean(1) for _,_,r in rows]);groups=group_paths(paths,26);selected=[]
    for g in np.unique(groups):
        candidates=[i for i in np.flatnonzero(groups==g) if paths[i,-4:,1].mean()<-.035]
        candidates.sort(key=lambda i:paths[i,8:15,0].mean())
        if candidates:selected.extend(candidates[:max(2,int(len(candidates)*.42))])
    revised={n:p.copy() for n,p in bases.items()};parts={n:[] for n in NAMES};max_fit=0
    u=np.clip((np.arange(18)-4)/13,0,1);bell=np.sin(math.pi*u)**2;free=smooth(u)
    for i in selected:
        name,ids,r=rows[i];old=r.mean(1);g=int(groups[i]);phase=g*2.399963;strand=i*2.399963
        c=old.copy();amplitude=.017+.011*(.5+.5*math.sin(phase))
        c[:,0]+=amplitude*np.sin(math.tau*u+phase)*bell-.006*free
        c[:,1]+=.016*np.sin(math.tau*u+phase+.8)*bell-.004*free
        c[:,2]+=(.012+.035*(.5+.5*math.cos(phase))+.004*math.sin(strand))*free
        # One relaxation pass avoids corners at the sparse existing rows.
        relaxed=c.copy();relaxed[5:-1]=.12*c[4:-2]+.76*c[5:-1]+.12*c[6:];c=relaxed
        half=(r[:,1]-r[:,0])*.5;h=half.copy()
        previously_thin=ids[0] in report['looseLocks']['selectedCardFirstVertices'][name]
        for j in range(5,18):
            a=Vector(old[min(j+1,17)]-old[j-1]).normalized();b=Vector(c[min(j+1,17)]-c[j-1]).normalized()
            width=a.rotation_difference(b)@Vector(half[j])
            width=Quaternion(b,.18*math.sin(phase)*bell[j])@width
            h[j]=width*(1-(.08 if previously_thin else .28)*free[j])
        rr=np.stack([c-h,c+h],axis=1);rr[:5]=r[:5]
        da,db=[d[ids].reshape(18,2,3) for d in deltas[name]];shift=np.zeros(18)
        for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
            for j in range(5,18):
                for point in (rr+delta)[j]:
                    hit,_,_,_=body.ray_cast(Vector((-.5,point[1],point[2])),Vector((1,0,0)),1)
                    if hit is not None:shift[j]=min(shift[j],hit.x-.008-point[0])
        for _ in range(2):
            s=shift.copy();s[5:-1]=.15*shift[4:-2]+.7*shift[5:-1]+.15*shift[6:];shift=np.minimum(shift,s)
        rr[:,:,0]+=shift[:,None];max_fit=max(max_fit,float(-shift.min()))
        revised[name][ids]=rr.reshape(-1,3);parts[name].append(ids)
    for name,q in revised.items():
        previous=dict(report[name]);apply(bpy.data.objects[name],q,mapping,report)
        report[name].update({k:v for k,v in previous.items() if k not in report[name]})
    collar=fit_front_collar(parts,mapping,report,apply)
    for name,coords in uv.items():mapping[name]['addedUv']=coords
    # Raise the exposed dye's brightness with per-lock variation. Keep the
    # brunette roots and cheek fibers exact, using the existing base factor.
    tinted=0
    for name,p in bases.items():
        ob=bpy.data.objects[name];attr=ob.data.color_attributes['ReferenceHairTint']
        colors=np.array([v.color[:] for v in attr.data]);before=colors.copy()
        for i,ids in enumerate(islands(ob)):
            if len(ids)!=36:continue
            phase=i*2.399963+NAMES.index(name)*1.7
            t=np.repeat(np.linspace(0,1,18),2);strength=smooth((t-4/17)/.38)
            gain=(.12+.22*(.5+.5*math.sin(phase+.65)))*strength
            pigment=colors[ids,:3]*DYE_BASE
            desired=np.minimum(pigment*(1+gain[:,None]*np.array([1.,1.1,.72])),DYE_BASE)
            colors[ids,:3]=desired/DYE_BASE
            colors[ids[:10]]=before[ids[:10]];tinted+=1
        attr.data.foreach_set('color',colors.astype(np.float32).ravel());mapping[name]['addedColors']=colors.tolist()
    report['windLayers']={'cards':len(selected),'tintedLongCards':tinted,'guideGroups':len(set(int(groups[i]) for i in selected)),
        'selectedCardFirstVertices':{n:[ids[0] for ids in v] for n,v in parts.items()},'retainedRootPairs':5,
        'maximumAdditionalBodyFitMm':max_fit*1000,'frontCollarFit':collar,
        'addedGeometry':0,'relativeSecondaryShapesRetained':True,'textureBytesRetained':True}
