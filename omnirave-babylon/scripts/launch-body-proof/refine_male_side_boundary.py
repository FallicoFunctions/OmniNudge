"""Lower and stagger the male side hair boundary above and behind the ears.

The cap follows the measured head with its old clearance. The rooted support
follows that cap deformation, and only the attached portion of neighboring
main ribbons follows it; the crown, free ends, forehead and nape remain exact.
The thin rigged layers keep their origins, UVs, weights, colors and morph deltas.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from build_rigged_jacket_hardware import barycentric
from refine_male_loose_fringe import fit_motion_envelope,fit_evaluated_edges

NAMES=['Complete scalp','Polished male rooted hairline','Luxury retained swept groom']


def lower_side_boundary(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody'])
    cap=bpy.data.objects[NAMES[0]];old_cap=Surface(rig,cap)
    original=array(cap);revised=original.copy()
    uv=np.zeros((len(original),2))
    for loop in cap.data.loops:uv[loop.vertex_index]=cap.data.uv_layers.active.data[loop.index].uv
    selected=[]
    for i,p in enumerate(original):
        side=float(smooth((abs(p[0])-.043)/.021))
        before_ear=float(smooth((p[1]+.087)/.037))
        behind_ear=float(1-smooth((p[1]-.016)/.030))
        low=float(1-smooth((p[2]-1.686)/.065))
        weight=side*before_ear*behind_ear*low
        if weight<.015:continue
        # The reference has an uneven layer at the temple, rather than one
        # level shave line. The front edge and already shaped nape are held.
        wave=.0014*math.sin(uv[i,0]*math.tau*13+.5)+.0008*math.sin(uv[i,0]*math.tau*29)
        rearward=float(smooth((p[1]+.060)/.055))
        drop=(.008+.011*rearward+wave)*weight
        candidate=p.copy();candidate[2]-=drop
        hit,normal,_,distance=body.tree.find_nearest(Vector(candidate))
        old_hit,old_normal,_,_=body.tree.find_nearest(Vector(p))
        old_gap=max(.0023,(Vector(p)-old_hit).dot(old_normal))
        # A projection that jumps to a different surface (the ear fold) is
        # not a safe hairline attachment. Leave that vertex on its old head.
        if distance>.012:continue
        revised[i]=np.asarray(hit+normal*old_gap)
        selected.append(i)
    assert selected,'No side cap vertices selected'
    fitted_cap=fit_motion_envelope(cap,original,revised,rig)
    cap_delta=revised-original
    def carrier(point):
        hit,_,triangle,_=old_cap.tree.find_nearest(Vector(point))
        ids=old_cap.faces[triangle]
        w=np.maximum(barycentric(np.asarray(hit),old_cap.array[ids]),0)
        w/=w.sum()
        return w@cap_delta[ids]
    originals={NAMES[0]:original};updates={NAMES[0]:revised}
    for name in NAMES[1:]:
        ob=bpy.data.objects[name];prior=array(ob);cards=prior.reshape(-1,12,2,3)
        revised_cards=cards.copy();path=cards.mean(2)
        moved=0
        for i,card in enumerate(cards):
            root=path[i,0]
            if root[1]<-.090 or root[1]>.050:continue
            if name==NAMES[2] and np.min(path[i,:,1])<-.090:continue
            if abs(root[0])<.039:continue
            if name==NAMES[1]:
                for j,center in enumerate(path[i]):
                    delta=carrier(center)
                    revised_cards[i,j]+=delta
                    if np.linalg.norm(delta)>2e-7:moved+=2
            else:
                delta=carrier(root)
                t=np.linspace(0,1,12)
                follow=1-smooth((t-.18)/.42)
                revised_cards[i]+=delta[None,None,:]*follow[:,None,None]
                if np.linalg.norm(delta)>2e-7:moved+=int(np.count_nonzero(follow>1e-5))*2
        updates[name]=revised_cards.reshape(-1,3)
        originals[name]=prior
        print('MALE_SIDE_CARRIER',name,'moved',moved,flush=True)
    results={}
    for name in NAMES:
        ob=bpy.data.objects[name];before=originals[name];after=updates[name]
        fitted=fitted_cap if name==NAMES[0] else fit_motion_envelope(ob,before,after,rig,pairwise=True)
        old_report=report.get(name,{}).copy();old_map=mapping[name].copy()
        apply(ob,after,mapping,report)
        evaluated=0 if name==NAMES[0] else fit_evaluated_edges(ob,before,rig,mapping,report,apply)
        for key in ('addedUv','addedColors'):
            if key in old_map:mapping[name][key]=old_map[key]
        final=array(ob);changed=np.linalg.norm(final-before,axis=1)>2e-7
        results[name]={'changedVertices':int(changed.sum()),'maximumMovementMm':float(np.linalg.norm(final-before,axis=1).max()*1000),
                       'skinFitVertices':fitted,'evaluatedFitPairs':evaluated}
        report[name]={**old_report,**report[name],'loweredSideBoundary':True}
    edge=(uv[:,1]>.999)&(np.abs(original[:,0])>.055)&(original[:,1]>-.070)&(original[:,1]<.010)
    changed_edge=edge&(np.linalg.norm(array(cap)-original,axis=1)>2e-7)
    result={'meshes':results,'selectedCapVertices':len(selected),'changedSideEdgeVertices':int(changed_edge.sum()),
            'meanSideEdgeDropMm':float((original[changed_edge,2]-array(cap)[changed_edge,2]).mean()*1000),
            'maximumSideEdgeDropMm':float((original[changed_edge,2]-array(cap)[changed_edge,2]).max()*1000),
            'materialsTexturesColorsAndWeightsUnchanged':True}
    print('MALE_SIDE_BOUNDARY',result,flush=True)
    return result
