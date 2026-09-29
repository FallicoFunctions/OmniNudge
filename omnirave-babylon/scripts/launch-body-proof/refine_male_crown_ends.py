"""Lay the loose crown ends into overlapping waves around the back of the head.

Connection map: first two ribbon pairs remain on the lowered scalp. The free
rear and side tips settle toward layers 3.5–5.5 mm above the scalp support, overlapping
the existing groom. Forehead curls remain exact. Retain rig origins, topology,
UVs, materials, weights, and relative morph offsets; fit evaluated skin gaps.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface, smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges


def settle_crown_ends(mapping,report,apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);revised=original.copy();components=islands(ob)
    ribbons=np.array([original[ids].reshape(12,2,3) for ids in components])
    paths=ribbons.mean(2);groups=group_paths(paths,96)
    guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    scalp=Surface(rig,bpy.data.objects['Complete scalp'])
    head_center=np.mean(scalp.array,axis=0);head_center[2]-=.045
    t=np.linspace(0,1,12);late=smooth((t-.15)/.85);gather=smooth((t-.12)/.65)
    profile=np.array([0,0,0,0,0,0,.58,.53,.44,.32,.16,.012])
    edited=[];tip_movements=[]
    for i,(ids,r) in enumerate(zip(components,ribbons)):
        g=int(groups[i]);guide=guides[g];tip=guide[-1]
        # Exact protection of the forward curls, including their upper loops.
        if tip[1]<-.105:continue
        rear=float(smooth((tip[1]+.105)/.060))
        crown=float(smooth((guide[:,2].max()-1.733)/.044))
        weight=rear*crown
        if weight<.04:continue
        phase=g*2.399963
        c=paths[i].copy()
        c+=(guide-c)*(.82*weight*gather)[:,None]
        # Carry the broad middle backward; tips land in varied, close layers
        # instead of forming splayed fans in empty space above the rear cap.
        c[:,1]+=.012*weight*np.sin(math.pi*t)*late
        c[:,1]+=.009*weight*late
        c[:,2]-=.018*weight*late
        layer=.0035+.002*(.5+.5*math.sin(phase))
        for j in range(2,12):
            hit,normal,_,_=scalp.tree.find_nearest(Vector(c[j]))
            if normal.dot(hit-Vector(head_center))<0:normal=-normal
            target=np.array(hit+normal*layer)
            amount=.88*weight*late[j]
            correction=(target-c[j])*amount
            length=float(np.linalg.norm(correction))
            if length>.018:correction*=.018/length
            c[j]+=correction
        c[:2]=paths[i,:2]
        half=(r[:,1]-r[:,0])*.5;root_width=float(np.linalg.norm(r[0,1]-r[0,0]))
        for j in range(2,12):
            before=Vector(paths[i,min(j+1,11)]-paths[i,j-1]).normalized()
            after=Vector(c[min(j+1,11)]-c[j-1]).normalized()
            half[j]=np.array(before.rotation_difference(after)@Vector(half[j]))
            width=float(np.linalg.norm(half[j])*2)
            wanted=width+max(0,root_width*profile[j]-width)*weight
            half[j]*=wanted/max(width,1e-10)
        rr=np.stack([c-half,c+half],axis=1);rr[:2]=r[:2]
        revised[ids]=rr.reshape(-1,3);edited.append(i)
        tip_movements.append(float(np.linalg.norm(c[-1]-paths[i,-1])*1000))
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    previous=report.get(ob.name,{}).copy();uv=mapping.get(ob.name,{}).get('addedUv')
    apply(ob,revised,mapping,report)
    fitted_pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    if uv is not None:mapping[ob.name]['addedUv']=uv
    maximum=float(np.linalg.norm(array(ob)-original,axis=1).max()*1000)
    report[ob.name]={**previous,**report[ob.name],'settledCrownEnds':True}
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'totalRibbons':len(components),
            'fixedRootPairsPerRibbon':2,'skinFitVertices':fitted,'evaluatedFitPairs':fitted_pairs,
            'maxMovementMm':maximum,'meanAuthoredTipMovementMm':float(np.mean(tip_movements)),
            'materialsUnchanged':True}
    print('MALE_CROWN_ENDS',{k:v for k,v in result.items() if k!='editedRibbonIndices'},flush=True)
    return result
