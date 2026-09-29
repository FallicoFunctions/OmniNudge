"""Keep the free fringe legible without extending a cloud of subpixel tips.

Connection map: first two ribbon pairs remain exactly on the lowered scalp;
free forehead locks overlap their original rooted support. Existing curved
paths retain their reach, with the fine taper confined nearer each endpoint.
Millimeter skin clearance, retained origins/UVs/weights and relative morphs.
"""
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope,fit_evaluated_edges


def refine_fringe_taper(mapping,report,apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);revised=original.copy();components=islands(ob)
    ribbons=np.array([original[ids].reshape(12,2,3) for ids in components]);paths=ribbons.mean(2)
    groups=group_paths(paths,96);guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    t=np.linspace(0,1,12);tail=smooth((t-.55)/.45)
    # Retain the full curl length, but use less physical length for the very
    # thin final samples. The same alpha texture then tapers near the endpoint.
    u=np.maximum(0,(t-.5)/.5)
    resolved_t=np.where(t>.5,.5+.5*(1-(1-u)**2.1),t)
    edited=0
    for i,(ids,r) in enumerate(zip(components,ribbons)):
        g=int(groups[i]);guide=guides[g];root=guide[0];tip=guide[-1]
        front=float(smooth((-root[1]-.090)/.035))
        falling=front*float(smooth((-tip[1]-.105)/.022))*float(smooth((1.761-tip[2])/.036))*float(smooth((-.004-tip[0])/.030))
        if falling<.02:continue
        sample=t+(resolved_t-t)*falling
        c=np.stack([np.interp(sample,t,paths[i,:,axis]) for axis in range(3)],axis=1)
        guide_c=np.stack([np.interp(sample,t,guide[:,axis]) for axis in range(3)],axis=1)
        # Gather the last fibers gently into their own lock. The main wave,
        # asymmetric silhouette and distinct guide endpoints remain separate.
        c+=(guide_c-c)*(.38*falling*tail)[:,None]
        c[:2]=paths[i,:2]
        half=(r[:,1]-r[:,0])*.5
        for j in range(2,12):
            before=Vector(paths[i,min(j+1,11)]-paths[i,j-1]).normalized()
            after=Vector(c[min(j+1,11)]-c[j-1]).normalized()
            half[j]=np.array(before.rotation_difference(after)@Vector(half[j]))
        rr=np.stack([c-half,c+half],axis=1);rr[:2]=r[:2]
        revised[ids]=rr.reshape(-1,3);edited+=1
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    previous=report.get(ob.name,{}).copy();uv=mapping.get(ob.name,{}).get('addedUv')
    apply(ob,revised,mapping,report)
    pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    if uv is not None:mapping[ob.name]['addedUv']=uv
    maximum=float(np.linalg.norm(array(ob)-original,axis=1).max()*1000)
    report[ob.name]={**previous,**report[ob.name],'resolvedFringeTaper':True,'maxMovementMm':maximum}
    result={'editedRibbons':edited,'fixedRootPairsPerRibbon':2,'skinFitVertices':fitted,
            'evaluatedFitPairs':pairs,'maxMovementMm':maximum,'materialsUnchanged':True}
    print('MALE_FRINGE_TAPER',result,flush=True)
    return result
