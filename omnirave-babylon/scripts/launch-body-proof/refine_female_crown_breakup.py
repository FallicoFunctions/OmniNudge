"""Break the uniform pink crown fan into unequal, softly falling wisps.

Connection map: the existing 60 short flyaway cards retain their first three
pairs on the pony root. All 120 long flyaway cards remain exact. Free tips
turn into staggered depths and lengths above the crown, using millimeter skin
clearance. Existing UVs, weights, colors, origins and relative shape offsets
retain their owners; the inherited secondary-motion scale is not reapplied.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands

NAME='Polished female flyaways'


def break_up_crown(mapping,report,apply):
    ob=bpy.data.objects[NAME];p=array(ob);q=p.copy();rig=bpy.data.objects['AvatarSkeleton']
    body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    deltas=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-p for k in ['Secondary_HairSide','Secondary_HairBack']]
    selected=[];fits=0;tip_displacements=[]
    for i,ids in enumerate(islands(ob)):
        if i%3:continue
        r=p[ids].reshape(-1,2,3);old=r.mean(1);n=len(r);t=np.linspace(0,1,n)
        u=np.clip((t-t[2])/(1-t[2]),0,1);free=smooth(u/.5);bell=np.sin(math.pi*u)**2
        strand=i//3;phase=strand*2.399963;family=strand%5
        # Keep a few longer accents, with most wisps falling closer to the
        # gathered pony. Unequal sampled lengths avoid a comb-like tip line.
        length=.66+.28*(.5+.5*math.sin(phase))
        if family==0:length=.96
        sample=t[2]+u*(1-t[2])*length
        c=np.stack([np.interp(sample,t,old[:,axis]) for axis in range(3)],axis=1)
        c=old*(1-free[:,None])+c*free[:,None]
        c[:,0]+=(.003+.004*math.sin(phase))*free+.005*math.sin(phase)*bell
        c[:,1]+=.010*math.sin(phase+.6)*free+.004*math.cos(phase)*bell
        c[:,2]+=([.003,-.010,-.017,-.007,-.014][family]) * smooth(u)
        c[:3]=old[:3]
        for _ in range(2):
            relaxed=c.copy();relaxed[3:-1]=.16*c[2:-2]+.68*c[3:-1]+.16*c[4:];c=relaxed
        half=(r[:,1]-r[:,0])*.5;h=half.copy()
        for j in range(3,n):
            a=Vector(old[min(j+1,n-1)]-old[j-1]).normalized();b=Vector(c[min(j+1,n-1)]-c[j-1]).normalized()
            width=1-(.12+.12*(.5+.5*math.sin(phase)))*free[j]
            h[j]=(a.rotation_difference(b)@Vector(half[j]))*width
        rr=np.stack([c-h,c+h],axis=1);rr[:3]=r[:3]
        da,db=[d[ids].reshape(n,2,3) for d in deltas];shift=np.zeros(n)
        for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
            for j in range(3,n):
                for point in (rr+delta)[j]:
                    hit,_,_,_=body.ray_cast(Vector((point[0],point[1],2.2)),Vector((0,0,-1)),1)
                    if hit is not None:shift[j]=max(shift[j],hit.z+.006-point[2])
        # Spread any required upward correction while keeping the attachment.
        for _ in range(2):
            s=shift.copy();s[3:-1]=.15*shift[2:-2]+.70*shift[3:-1]+.15*shift[4:];shift=np.maximum(shift,s)
        rr[:,:,2]+=shift[:,None];fits+=int(np.count_nonzero(shift))
        assert np.array_equal(rr[:3],r[:3])
        q[ids]=rr.reshape(-1,3);selected.append(ids[0]);tip_displacements.append((rr[-1].mean(0)-old[-1]).tolist())
    old_report=dict(report[NAME]);old_map=dict(mapping[NAME]);apply(ob,q,mapping,report)
    if 'addedUv' in old_map:mapping[NAME]['addedUv']=old_map['addedUv']
    report[NAME].update({k:v for k,v in old_report.items() if k not in report[NAME]})
    report['crownBreakup']={'cards':len(selected),'selectedCardFirstVertices':selected,
        'retainedRootPairs':3,'retainedLongCards':120,'bodyFittedPairs':fits,'tipDisplacements':tip_displacements,
        'maximumMovementMm':float(np.linalg.norm(q-p,axis=1).max()*1000),
        'addedGeometry':0,'relativeSecondaryShapesRetained':True}
