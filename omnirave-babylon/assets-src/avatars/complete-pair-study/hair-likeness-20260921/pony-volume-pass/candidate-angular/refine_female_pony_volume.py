"""Give the retained pony locks rounded depth and alternating broad bends.

Connection map: all four crown pairs remain at the existing attachment. Each
long card keeps its UVs, topology, head weights and relative secondary shapes.
Short cheek cards are untouched. The free spans turn outward from the head;
actual card edges are fitted to the body and front collar in the rest pose and
four secondary corners. The following rear-tip stage fits authored clip poses.
Hair layers use millimeter clearance; existing rig/object origins stay intact.
"""
import math
import bpy,numpy as np
from mathutils import Vector,Quaternion
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths


def round_pony(mapping,report,apply):
    names=[f'PLURR pony strands {i}' for i in range(3)]
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    coats=[Surface(rig,bpy.data.objects[n]).tree for n in ['Structured armhole jacket','PLURR folded hood']]
    bases={n:array(bpy.data.objects[n]) for n in names};rows=[];deltas={}
    for name,points in bases.items():
        ob=bpy.data.objects[name]
        deltas[name]=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-points
            for k in ['Secondary_HairSide','Secondary_HairBack']]
        for ids in islands(ob):
            if len(ids)==36:rows.append((name,ids,points[ids].reshape(18,2,3)))
    groups=group_paths(np.array([r.mean(1) for _,_,r in rows]),26)
    revised={n:v.copy() for n,v in bases.items()};counts={n:0 for n in names}
    t=np.linspace(0,1,18);v=np.clip((t-t[3])/(1-t[3]),0,1)
    envelope=np.sin(np.pi*v)**1.25
    bounds={};max_move=0.;body_fit=0.;coat_fit=0.
    for i,(name,ids,r) in enumerate(rows):
        phase=int(groups[i])*2.399963;strand=i*2.399963
        old=r.mean(1);center=old.copy()
        # Broad S-shaped turns, with the larger lobe on the exposed side.
        # The displacement returns to zero at the tip so length tiers survive.
        center[:,0]-=(.018+.026*(.5+.5*np.sin(v*2.8*np.pi+phase)))*envelope
        center[:,1]+=.014*np.sin(v*2.6*np.pi+phase+.8)*envelope
        center[:,2]+=.006*np.sin(v*2.2*np.pi+phase)*envelope
        # Distribute adjacent cards around their lock instead of leaving all
        # of them in one plane. The variation follows the whole free span.
        center[:,0]+=.004*math.cos(strand)*envelope
        center[:,1]+=.006*math.sin(strand)*envelope
        half=(r[:,1]-r[:,0])*.5;new_half=half.copy()
        for j in range(4,18):
            before=Vector(old[min(j+1,17)]-old[j-1]).normalized()
            tangent=Vector(center[min(j+1,17)]-center[j-1]).normalized()
            width=before.rotation_difference(tangent)@Vector(half[j])
            # A continuous roll makes the cross-section rounded in oblique
            # views; it does not twist the attached pairs or the tapered end.
            roll=(.50*math.sin(strand)+.24*math.sin(v[j]*math.tau+phase))*envelope[j]
            new_half[j]=Quaternion(tangent,roll)@width
        rr=np.stack([center-new_half,center+new_half],axis=1);rr[:4]=r[:4]
        a,b=[x[ids].reshape(18,2,3) for x in deltas[name]]
        variants=[np.zeros_like(a),a+b,a-b,-a+b,-a-b]
        front_lock=r[-3:,:,1].mean()<0
        if front_lock:
            shift=np.zeros(18)
            for delta in variants:
                for j in range(4,18):
                    for point in (rr+delta)[j]:
                        if point[2]>1.63:continue
                        for tree in coats:
                            hit,_,_,_=tree.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                            if hit is not None:shift[j]=min(shift[j],hit.y-.014-point[1])
            for _ in range(2):
                smoothed=shift.copy();smoothed[4:-1]=.15*shift[3:-2]+.70*shift[4:-1]+.15*shift[5:]
                shift=np.minimum(shift,smoothed)
            rr[:,:,1]+=shift[:,None];coat_fit=max(coat_fit,float(-shift.min()))
        # Check real edges after depth and roll changes. A card center alone
        # can miss the protruding ear rim in an extreme secondary pose.
        shift=np.zeros(18)
        for delta in variants:
            for j in range(4,18):
                for point in (rr+delta)[j]:
                    hit,_,_,_=body.ray_cast(Vector((-.5,point[1],point[2])),Vector((1,0,0)),1)
                    if hit is not None:shift[j]=min(shift[j],hit.x-.008-point[0])
        for _ in range(2):
            smoothed=shift.copy();smoothed[4:-1]=.15*shift[3:-2]+.70*shift[4:-1]+.15*shift[5:]
            shift=np.minimum(shift,smoothed)
        rr[:,:,0]+=shift[:,None];body_fit=max(body_fit,float(-shift.min()))
        assert np.array_equal(rr[:4],r[:4])
        revised[name][ids]=rr.reshape(-1,3);counts[name]+=1
        max_move=max(max_move,float(np.linalg.norm(rr-r,axis=2).max()))
    for name,q in revised.items():
        previous=dict(report[name]);apply(bpy.data.objects[name],q,mapping,report)
        for k,value in previous.items():
            if k not in report[name]:report[name][k]=value
        bounds[name]=[q.min(0).tolist(),q.max(0).tolist()]
    report['ponyVolume']={'cards':sum(counts.values()),'byMesh':counts,'guideGroups':26,
        'retainedRootPairs':4,'maximumMovementMm':max_move*1000,
        'maximumAdditionalBodyFitMm':body_fit*1000,'maximumFrontCollarFitMm':coat_fit*1000,
        'bounds':bounds,'addedGeometry':0,'relativeSecondaryShapesRetained':True}
