"""Give the falling male curls a continuous body and a short fine tip.

Connection map: the first two pairs stay at the lowered scalp; free forehead
fibers gather around their own existing lock guides, overlapping the rooted
support. Existing crown and side ribbons stay exact. Millimeter hair/skin
clearance is checked in the evaluated rig. Retain origins, topology, UVs,
material slots, weights, and relative morph offsets.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges


def gather_fringe(mapping, report, apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);revised=original.copy();components=islands(ob)
    ribbons=np.array([original[ids].reshape(12,2,3) for ids in components])
    paths=ribbons.mean(2);groups=group_paths(paths,96)
    guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    t=np.linspace(0,1,12);free=smooth((t-.32)/.68)
    # Earlier taper passes compounded until the penultimate pair was only
    # about 40 microns wide. A continuous lock needs body closer to its tip.
    width_profile=np.array([0,0,.88,.84,.81,.78,.75,.68,.58,.44,.24,.016])
    edited=[];width_changes=[]
    for i,(ids,r) in enumerate(zip(components,ribbons)):
        g=int(groups[i]);guide=guides[g];root=guide[0];tip=guide[-1]
        falling=float(smooth((-root[1]-.090)/.030))*float(smooth((-tip[1]-.112)/.032))
        falling*=float(smooth((1.747-tip[2])/.028))*float(smooth((-.010-tip[0])/.026))
        if falling<.05:continue
        c=paths[i].copy()
        # Keep each wave's main body, gather only its free lower part. A small
        # guide-wide height stagger softens the old common eyebrow clamp.
        c+=(guide-c)*(.68*falling*free)[:,None]
        c[:,2]+=(.001+.002*(.5+.5*math.sin(g*2.399963)))*falling*free
        c[:2]=paths[i,:2]
        half=(r[:,1]-r[:,0])*.5
        root_width=float(np.linalg.norm(r[0,1]-r[0,0]))
        for j in range(2,12):
            before=Vector(paths[i,min(j+1,11)]-paths[i,j-1]).normalized()
            after=Vector(c[min(j+1,11)]-c[j-1]).normalized()
            half[j]=np.array(before.rotation_difference(after)@Vector(half[j]))
            old_width=float(np.linalg.norm(half[j])*2)
            wanted=old_width+max(0,root_width*width_profile[j]-old_width)*falling
            half[j]*=wanted/max(old_width,1e-10)
            width_changes.append(wanted-old_width)
        rr=np.stack([c-half,c+half],axis=1);rr[:2]=r[:2]
        revised[ids]=rr.reshape(-1,3);edited.append(i)
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    previous=report.get(ob.name,{}).copy();uv=mapping.get(ob.name,{}).get('addedUv')
    apply(ob,revised,mapping,report)
    fitted_pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    if uv is not None:mapping[ob.name]['addedUv']=uv
    maximum=float(np.linalg.norm(array(ob)-original,axis=1).max()*1000)
    report[ob.name]={**previous,**report[ob.name],'gatheredFringeLocks':True}
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'totalRibbons':len(components),
            'fixedRootPairsPerRibbon':2,'skinFitVertices':fitted,'evaluatedFitPairs':fitted_pairs,
            'maxMovementMm':maximum,'maximumWidthIncreaseMm':float(max(width_changes)*1000),
            'materialsUnchanged':True}
    print('MALE_FRINGE_LOCKS', {k:v for k,v in result.items() if k!='editedRibbonIndices'},flush=True)
    return result
