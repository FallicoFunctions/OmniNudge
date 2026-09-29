"""Round the male quiff and separate its broad surface into flowing locks.

Connection map: the first two pairs of every retained ribbon remain fixed to
the lowered scalp. Free crown sections roll back from the forehead and sweep
toward the falling fringe. The scalp, rooted underlayer and flyaway attachments
stay unchanged. Thin-hair clearance is verified against evaluated skin; no
origins, topology, UVs, weights or relative shape-key offsets are replaced.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope,fit_evaluated_edges


def soften_crown(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];ob=bpy.data.objects['Luxury retained swept groom']
    original=array(ob);revised=original.copy();components=islands(ob)
    ribbons=np.array([original[ids].reshape(12,2,3) for ids in components]);paths=ribbons.mean(2)
    groups=group_paths(paths,96);guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    t=np.linspace(0,1,12);free=smooth((t-1/11)/.28);arch=np.sin(math.pi*t)
    late=smooth((t-.60)/.40);edited=0
    for i,(ids,r) in enumerate(zip(components,ribbons)):
        g=int(groups[i]);guide=guides[g];root=guide[0];phase=g*2.399963
        front=float(smooth((-root[1]-.075)/.045))
        crown=float(smooth((root[2]-1.760)/.030));weight=max(front,crown)
        if weight<.015:continue
        c=paths[i].copy()
        lift=smooth((guide[:,2]-root[2]-.008)/.034)
        # Round off the broad upper corners without shifting the new hairline.
        corner=np.minimum(1,(np.abs(c[:,0])/.075)**1.4)
        c[:,2]-=.011*corner*lift*front*free
        c[:,2]+=.004*np.maximum(0,1-(c[:,0]/.072)**2)*arch*front*free
        # A backward roll followed by a sideways sweep replaces the vertical
        # front curtain; each guide keeps a slightly different crest location.
        c[:,1]+=(.011+.003*math.sin(phase))*front*arch**1.2*free
        sweep=float(smooth((root[0]+.025)/.05))
        c[:,0]-=.013*front*sweep*arch*free
        c[:,0]+=.004*np.sin(phase+t*math.pi*1.4)*arch*free*weight
        c[:,1]+=.0035*np.cos(phase+t*math.pi*1.5)*arch*free*weight
        c[:,2]+=.005*np.sin(phase+t*math.tau)*arch*free*weight
        # Retain coherent locks while letting their constituent ends open up.
        c+=(paths[i]-guide)*(.32*free*weight)[:,None]
        c[:,0]+=.0025*math.sin((i//18)*2.399963)*late*front
        relaxed=.14*c[:-2]+.72*c[1:-1]+.14*c[2:]
        c[2:-1]=relaxed[1:];c[:2]=paths[i,:2]
        half=(r[:,1]-r[:,0])*.5
        for j in range(2,12):
            old_tangent=Vector(paths[i,min(j+1,11)]-paths[i,j-1]).normalized()
            new_tangent=Vector(c[min(j+1,11)]-c[j-1]).normalized()
            half[j]=np.array(old_tangent.rotation_difference(new_tangent)@Vector(half[j]))*(1-weight*(.06*free[j]+.22*late[j]))
        rr=np.stack([c-half,c+half],axis=1);rr[:2]=r[:2]
        revised[ids]=rr.reshape(-1,3);edited+=1
    fitted=fit_motion_envelope(ob,original,revised,rig)
    previous=report.get(ob.name,{}).copy();added_uv=mapping.get(ob.name,{}).get('addedUv')
    apply(ob,revised,mapping,report)
    evaluated_pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    if added_uv is not None:mapping[ob.name]['addedUv']=added_uv
    maximum=float(np.linalg.norm(array(ob)-original,axis=1).max()*1000)
    report[ob.name]={**previous,**report[ob.name],'roundedCrownFlow':True,'maxMovementMm':maximum}
    result={'editedRibbons':edited,'waveGuides':len(guides),'fixedRootPairsPerRibbon':2,
            'skinFitVertices':fitted,'evaluatedFitPairs':evaluated_pairs,'maxMovementMm':maximum,
            'preservedScalpUnderlayerAndFlyaways':True}
    print('MALE_CROWN_FLOW',result,flush=True)
    return result
