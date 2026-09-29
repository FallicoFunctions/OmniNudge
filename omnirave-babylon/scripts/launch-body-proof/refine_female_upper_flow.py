"""Replace folded upper pony paths with a continuous crown-to-fall sweep.

Connection map: existing pony, inner fiber and long flyaway cards keep their
first four crown pairs and lower six/seven pairs exactly. Short cheek and
crown wisps stay fixed. The free upper span connects those measured anchors
with matching tangents; widths travel with the curve. Hair clears the body by
millimeters, rather than using the structural assembly overlap. Origins,
weights, textures and relative secondary displacements retain their owners.
"""
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface
from refine_complete_groom_finish import islands
from refine_female_crown import bezier

NAMES=[f'PLURR pony strands {i}' for i in range(3)]+['PLURR pony surface fibers','Polished female flyaways']


def active_card(name,ids,index):
    return len(ids)!=34 and not (name=='Polished female flyaways' and index%3==0)


def end_pair(count):return int(round((count-1)*.72))


def refine_upper_flow(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    records={};total=0
    for name in NAMES:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy();count=0;max_fit=0
        deltas=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-p for k in ['Secondary_HairSide','Secondary_HairBack']]
        for i,ids in enumerate(islands(ob)):
            if not active_card(name,ids,i):continue
            r=p[ids].reshape(-1,2,3);old=r.mean(1);n=len(old);end=end_pair(n)
            start=old[3];finish=old[end];span=np.linalg.norm(finish-start)
            incoming=old[3]-old[2];incoming/=np.linalg.norm(incoming)
            outgoing=old[end+1]-old[end];outgoing/=np.linalg.norm(outgoing)
            # Match the existing attached and hanging tangents while replacing
            # intermediate zigzags. A modest crown handle rounds the turnover.
            length=min(span*.31,.068)
            c=old.copy();u=np.linspace(0,1,end-3+1)
            c[3:end+1]=bezier([start,start+incoming*length,finish-outgoing*span*.27,finish],u)
            h=(r[:,1]-r[:,0])*.5;half=h.copy()
            for j in range(4,end):
                a=Vector(old[j+1]-old[j-1]).normalized();b=Vector(c[j+1]-c[j-1]).normalized()
                half[j]=a.rotation_difference(b)@Vector(h[j])
            rr=np.stack([c-half,c+half],axis=1);rr[:4]=r[:4];rr[end:]=r[end:]
            da,db=[d[ids].reshape(n,2,3) for d in deltas];shift=np.zeros(n)
            for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
                for j in range(4,end):
                    for point in (rr+delta)[j]:
                        hit,_,_,_=body.ray_cast(Vector((-.5,point[1],point[2])),Vector((1,0,0)),1)
                        if hit is not None:shift[j]=min(shift[j],hit.x-.008-point[0])
            for _ in range(2):
                smoothed=shift.copy();smoothed[4:end]=.15*shift[3:end-1]+.70*shift[4:end]+.15*shift[5:end+1]
                shift=np.minimum(shift,smoothed)
            rr[:,:,0]+=shift[:,None];max_fit=max(max_fit,float(-shift.min()))
            assert np.array_equal(rr[:4],r[:4]) and np.array_equal(rr[end:],r[end:])
            q[ids]=rr.reshape(-1,3);count+=1
        old_report=dict(report[name]);old_mapping=dict(mapping[name]);apply(ob,q,mapping,report)
        # UVs from the preceding lower-fall stage must survive this geometry edit.
        if 'addedUv' in old_mapping:mapping[name]['addedUv']=old_mapping['addedUv']
        report[name].update({k:v for k,v in old_report.items() if k not in report[name]})
        records[name]={'cards':count,'maximumAdditionalBodyFitMm':max_fit*1000};total+=count
    report['upperFlow']={'cards':total,'meshes':records,'retainedRootPairs':4,
        'unchangedLowerEndPairFraction':.72,'addedGeometry':0,'relativeSecondaryShapesRetained':True}
