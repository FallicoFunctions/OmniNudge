"""Shape overlapping crown waves within the retained thin hair ribbons.

Connection map: the first three pairs remain at their current scalp roots.
Only upper free pairs change; lower side/nape layers and full forehead curls
stay exact. Nested crown arches overlap the scalp support and neighboring
front waves, with sampled millimeter skin clearance. Preserve all origins,
topology, UVs, weights, vertex colors, materials, and relative morph offsets.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_male_loose_fringe import fit_motion_envelope,fit_evaluated_edges


def shape_upper_waves(mapping,report,apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);cards=original.reshape(-1,12,2,3);paths=cards.mean(2);revised=original.copy()
    t=np.linspace(0,1,12);free=smooth((t-t[2])/.30);bell=np.sin(math.pi*t)**1.4
    edited=[];influences=[]
    for i,card in enumerate(cards):
        p=paths[i];root=p[0];tip=p[-1]
        if root[1]<-.095 or tip[1]<-.105:continue
        high=smooth((card[:,:,2].min(1)-1.770)/.025)
        influence=high*free*bell
        if influence.max()<.025:continue
        # Neighboring roots share a slowly changing wave, rather than a
        # random displacement on every fiber. This separates nested arches.
        phase=(root[1]+.042+.16*root[0])/.023*math.tau
        ridge=math.cos(phase)
        shifted=bell+.24*math.sin(phase)*np.sin(math.tau*t)*bell
        c=p.copy()
        c[:,2]+=(.0038*ridge+.0012)*high*free*shifted
        c[:,1]+=.0015*math.sin(phase)*influence
        c[:,0]+=.0013*math.cos(phase+.7)*influence
        c[:3]=p[:3]
        half=(card[:,1]-card[:,0])*.5
        for j in range(3,12):
            if influence[j]==0:continue
            before=Vector(p[min(j+1,11)]-p[j-1]).normalized()
            after=Vector(c[min(j+1,11)]-c[j-1]).normalized()
            half[j]=np.array(before.rotation_difference(after)@Vector(half[j]))
            if np.dot(half[j],half[j-1])<0:half[j]*=-1
        out=np.stack([c-half,c+half],axis=1);out[influence==0]=card[influence==0];out[:3]=card[:3]
        revised[i*24:(i+1)*24]=out.reshape(-1,3);edited.append(i);influences.append(influence.tolist())
    assert edited
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    previous=report.get(ob.name,{}).copy();previous_map=mapping[ob.name].copy()
    apply(ob,revised,mapping,report);pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    for key in ['addedUv','addedColors']:
        if key in previous_map:mapping[ob.name][key]=previous_map[key]
    report[ob.name]={**previous,**report[ob.name],'nestedUpperWaves':True}
    final=array(ob);fc=final.reshape(-1,12,2,3).mean(2)
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'totalRibbons':len(paths),'fixedPairsPerRibbon':3,
            'minimumAffectedPairHeightM':1.770,'skinFitVertices':fitted,'evaluatedFitPairs':pairs,
            'beforePeakM':float(original[:,2].max()),'afterPeakM':float(final[:,2].max()),
            'maxMovementMm':float(np.linalg.norm(final-original,axis=1).max()*1000),
            'meanEditedCrestChangeMm':float((fc[edited,:,2].max(1)-paths[edited,:,2].max(1)).mean()*1000),
            'materialsAndVertexColorsUnchanged':True}
    print('MALE_UPPER_WAVES',{k:v for k,v in result.items() if not k.endswith('Indices')},flush=True)
    return result
