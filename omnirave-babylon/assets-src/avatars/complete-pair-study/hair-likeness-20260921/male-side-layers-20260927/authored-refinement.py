"""Replace the short lower side/rear edge with overlapping tapered layers.

Connection map: the first three pairs of the lower groom remain on the scalp.
Free ends overlap the retained cap boundary and sweep behind the ears, with
staggered lengths. Fine hair uses sampled millimeter skin clearance rather
than structural assembly overlap. Keep all forehead curls and crown bridges,
origins, topology, UVs, vertex colors, materials, weights, and relative morphs.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges


def layer_side_ends(mapping, report, apply):
    ob=bpy.data.objects['Luxury retained swept groom']; rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob); cards=original.reshape(-1,12,2,3); paths=cards.mean(2)
    revised=original.copy(); groups=group_paths(paths,96)
    t=np.linspace(0,1,12); free=smooth((t-t[2])/(1-t[2]))
    edited=[]; drops=[]
    for i,card in enumerate(cards):
        p=paths[i]; root=p[0]; tip=p[-1]
        # Keep the complete forehead curls and the previously authored crown.
        if root[1]<-.095 or tip[1]<-.095 or tip[2]>1.759: continue
        posterior=float(smooth((root[1]+.095)/.035)*smooth((tip[1]+.095)/.035))
        lower=float(smooth((1.759-tip[2])/.035)*smooth((tip[2]-1.674)/.024))
        weight=posterior*lower
        if weight<.04: continue
        phase=int(groups[i])*2.399963
        rear=float(smooth((tip[1]+.020)/.050))
        # A longer layer at the nape, shorter layers over the ears. Variation
        # comes from coherent wave groups and small stagger within each wave.
        stagger=.76+.24*(.5+.5*math.sin(i*2.399963))
        drop=(.018+.012*rear+.005*(.5+.5*math.sin(phase)))*weight*stagger
        c=p.copy(); c[:,2]-=drop*free
        behind_ear=float(smooth((abs(tip[0])-.040)/.025)*(1-rear))
        c[:,1]+=(.010*behind_ear+.0025*math.sin(phase))*weight*free
        # A shallow outward belly keeps the added length from clinging flat
        # to the cap. The ends settle back into neighboring layers.
        outward=np.array([tip[0],tip[1]+.045,0.0]);outward/=max(np.linalg.norm(outward),1e-10)
        c+=outward[None,:]*(.0035*weight*np.sin(math.pi*free))[:,None]
        c[:,0]+=.0025*math.sin(phase+.7)*weight*free
        c[:3]=p[:3]
        half=(card[:,1]-card[:,0])*.5
        for j in range(3,12):
            before=Vector(p[min(j+1,11)]-p[j-1]).normalized()
            after=Vector(c[min(j+1,11)]-c[j-1]).normalized()
            half[j]=np.array(before.rotation_difference(after)@Vector(half[j]))
            if np.dot(half[j],half[j-1])<0:half[j]*=-1
        result=np.stack([c-half,c+half],axis=1);result[:3]=card[:3]
        revised[i*24:(i+1)*24]=result.reshape(-1,3)
        edited.append(i);drops.append(drop)
    assert edited
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    previous=report.get(ob.name,{}).copy();previous_map=mapping[ob.name].copy()
    apply(ob,revised,mapping,report)
    fitted_pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    for key in ['addedUv','addedColors']:
        if key in previous_map:mapping[ob.name][key]=previous_map[key]
    report[ob.name]={**previous,**report[ob.name],'layeredSideEnds':True}
    final=array(ob); final_paths=final.reshape(-1,12,2,3).mean(2)
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'totalRibbons':len(paths),
            'fixedPairsPerRibbon':3,'skinFitVertices':fitted,'evaluatedFitPairs':fitted_pairs,
            'meanAuthoredDropMm':float(np.mean(drops)*1000),'maxAuthoredDropMm':float(np.max(drops)*1000),
            'meanFinalTipDropMm':float((paths[edited,-1,2]-final_paths[edited,-1,2]).mean()*1000),
            'beforePeakM':float(original[:,2].max()),'afterPeakM':float(final[:,2].max()),
            'maxMovementMm':float(np.linalg.norm(final-original,axis=1).max()*1000),
            'materialsAndVertexColorsUnchanged':True}
    print('MALE_SIDE_LAYERS',{k:v for k,v in result.items() if not k.endswith('Indices')},flush=True)
    return result
