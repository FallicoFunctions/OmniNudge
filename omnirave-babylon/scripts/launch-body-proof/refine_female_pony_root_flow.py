"""Root the outer pony locks at the gathered base, not on its exposed crest.

Connection map: outer long-card root pairs move onto the existing carrier's
first ring span above the tie, with 0.4 mm surface clearance. Their upper seven
pairs form a continuous raised curve into retained pair seven and the fitted
hanging lengths. Cheek cards, tie, carrier, inner fibers and wisps stay exact.
Actual edges clear the body by 4 mm through the free span, in neutral and four
secondary corners. Root endpoints clear skin by at least 1 mm. Millimeter hair
clearances apply. Origins, UVs, topology, weights and relative shape offsets
retain their owners; no geometry or material is added by this stage.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_crown import bezier
from refine_female_dye import NAMES
END=7


def gather_outer_roots(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    core_ob=bpy.data.objects['PLURR gathered pony bundle'];core=Surface(rig,core_ob).tree
    rings=array(core_ob).reshape(24,16,3);centers=rings.mean(1)
    axis_a=rings[1,0]-centers[1];axis_a/=np.linalg.norm(axis_a)
    axis_b=rings[1,4]-centers[1];axis_b/=np.linalg.norm(axis_b)
    incoming=centers[1]-centers[0];incoming/=np.linalg.norm(incoming)
    bases={n:array(bpy.data.objects[n]) for n in NAMES};revised={n:p.copy() for n,p in bases.items()};rows=[];deltas={}
    for name,p in bases.items():
        ob=bpy.data.objects[name]
        deltas[name]=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-p for k in ['Secondary_HairSide','Secondary_HairBack']]
        for ids in islands(ob):
            if len(ids)==36:rows.append((name,ids,p[ids].reshape(18,2,3)))
    groups=group_paths(np.array([r.mean(1)[:9] for _,_,r in rows]),16)
    selected={n:[] for n in NAMES};max_fit=0.;root_gaps=[];skin_gaps=[];root_moves=[]
    for i,(name,ids,r) in enumerate(rows):
        old=r.mean(1);phase=int(groups[i])*2.399963
        radial=old[0]-centers[1];angle=np.clip(math.atan2(np.dot(radial,axis_b),np.dot(radial,axis_a)),.16,math.pi-.16)
        k=angle/math.tau*16;a=int(k);fraction=k-a
        half=(r[:,1]-r[:,0])*.5;h=half.copy()
        # Follow the measured carrier cross section rather than an invented
        # floating ring. Progress upward only if the scalp covers that sector.
        accepted=None
        for t in [.58,.68,.78,.88,1.0,1.12]:
            ri=int(t);rt=t-ri;ring=rings[ri]*(1-rt)+rings[ri+1]*rt
            probe=ring[a]*(1-fraction)+ring[(a+1)%16]*fraction
            hit,normal,_,_=core.find_nearest(Vector(probe));root=np.array(hit+normal*.0004)
            tangent=Vector(old[1]-old[0]).normalized().rotation_difference(Vector(incoming))
            root_half=np.array(tangent@Vector(half[0]))*.65
            pair=np.array([root-root_half,root+root_half]);gaps=[]
            for point in pair:
                hit,n,_,dist=body.find_nearest(Vector(point));gaps.append(float((Vector(point)-hit).dot(n)))
            if min(gaps)>=.001:accepted=(root,root_half,min(gaps));break
        assert accepted is not None,(name,ids[0],angle)
        root,root_half,gap=accepted;skin_gaps.append(gap)
        outgoing=old[END+1]-old[END];outgoing/=np.linalg.norm(outgoing)
        span=np.linalg.norm(old[END]-root);handle=.090+.035*(.5+.5*math.sin(phase))
        c=old.copy();c[:END+1]=bezier([root,root+incoming*handle,old[END]-outgoing*span*.26,old[END]],np.linspace(0,1,END+1))
        h[0]=root_half
        for j in range(1,END):
            a=Vector(old[j+1]-old[j-1]).normalized();b=Vector(c[j+1]-c[j-1]).normalized()
            h[j]=(a.rotation_difference(b)@Vector(half[j]))*(.65+.35*j/END)
        rr=np.stack([c-h,c+h],axis=1);rr[END:]=r[END:]
        da,db=[v[ids].reshape(18,2,3) for v in deltas[name]];shift=np.zeros(18)
        for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
            for j in range(1,END):
                for point in (rr+delta)[j]:
                    hit,_,_,_=body.ray_cast(Vector((point[0],point[1],2.2)),Vector((0,0,-1)),1)
                    if hit is not None:shift[j]=max(shift[j],hit.z+.004-point[2])
        for _ in range(2):
            smoothed=shift.copy();smoothed[1:END]=.15*shift[:END-1]+.70*shift[1:END]+.15*shift[2:END+1];shift=np.maximum(shift,smoothed)
        rr[:,:,2]+=shift[:,None];max_fit=max(max_fit,float(shift.max()))
        assert np.array_equal(rr[END:],r[END:])
        root_gaps.append(core.find_nearest(Vector(root))[3]);root_moves.append(np.linalg.norm(root-old[0]))
        revised[name][ids]=rr.reshape(-1,3);selected[name].append(ids[0])
    for name,q in revised.items():
        previous=dict(report[name]);saved_uv=mapping[name].get('addedUv')
        apply(bpy.data.objects[name],q,mapping,report)
        if saved_uv is not None:mapping[name]['addedUv']=saved_uv
        report[name].update({k:v for k,v in previous.items() if k not in report[name]})
    report['ponyRootFlow']={'cards':len(rows),'guideGroups':16,'selectedCardFirstVertices':selected,'retainedLowerStartPair':END,
        'maximumAdditionalBodyFitMm':max_fit*1000,'maximumRootCarrierDistanceMm':max(root_gaps)*1000,
        'minimumRootSkinClearanceMm':min(skin_gaps)*1000,'rootMovementMm':[min(root_moves)*1000,max(root_moves)*1000],
        'addedGeometry':0,'relativeSecondaryShapesRetained':True,'allTextureBytesRetained':True}
