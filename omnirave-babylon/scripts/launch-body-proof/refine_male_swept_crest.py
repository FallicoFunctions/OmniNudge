"""Turn the upright crest into overlapping backward and lateral waves.

Connection map: the first two pairs of every retained ribbon stay on the
lowered scalp. Falling forehead locks retain their complete curve and taper.
The upper free crest rolls back across the crown; side layers overlap the
existing ear-side support. Thin hair uses millimeter skin clearance. Preserve
origins, topology, UVs, material slots, weights and relative shape offsets.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope,fit_evaluated_edges


BRUNETTE_PALETTE=[(.026,.014,.007,1),(.037,.021,.011,1),(.056,.032,.016,1),
                   (.135,.078,.035,1),(.030,.016,.008,1)]


def balance_brunette():
    """Lift the dark base fibers and quiet the few high-contrast gold fibers."""
    ob=bpy.data.objects['Luxury retained swept groom'];colors={}
    assert len(ob.data.materials)==len(BRUNETTE_PALETTE)
    for mat,color in zip(ob.data.materials,BRUNETTE_PALETTE):
        bs=mat.node_tree.nodes.get('Principled BSDF')
        assert bs
        # The cumulative pipeline starts before finish_materials has built
        # the texture nodes; incremental revisions already have that chain.
        if bs.inputs['Base Color'].is_linked:
            tint=bs.inputs['Base Color'].links[0].from_node
            assert tint.type=='MIX_RGB' and tint.blend_type=='MULTIPLY'
            assert not tint.inputs[1].is_linked
            tint.inputs[1].default_value=color
        bs.inputs['Base Color'].default_value=color
        colors[mat.name]=list(color)
    return colors


def sweep_crest(mapping,report,apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);revised=original.copy();components=islands(ob)
    ribbons=np.array([original[ids].reshape(12,2,3) for ids in components]);paths=ribbons.mean(2)
    groups=group_paths(paths,96);guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    t=np.linspace(0,1,12);free=smooth((t-1/11)/.30);late=smooth((t-.32)/.68)
    counts={'uprightCrestRibbons':0,'sideFlowRibbons':0,'preservedFallingFringeRibbons':0}
    for i,(ids,r) in enumerate(zip(components,ribbons)):
        g=int(groups[i]);guide=guides[g];root=guide[0];tip=guide[-1]
        # Preserve the resolved fringe as an exact separate part of the style.
        if tip[1]<-.102 and tip[2]<1.765:
            counts['preservedFallingFringeRibbons']+=1
            continue
        front=float(smooth((-root[1]-.060)/.065))
        upper=float(smooth((tip[2]-1.758)/.028))
        rising=float(smooth((tip[2]-root[2]-.025)/.035))
        crest=front*upper*rising
        side=float(smooth((abs(root[0])-.049)/.022))*float(smooth((root[1]+.112)/.065))
        side*=float(smooth((tip[1]+.102)/.04))*float(smooth((tip[2]-1.686)/.030))
        if max(crest,side)<.02:continue
        c=paths[i].copy()
        # Upright endpoints had made a flat vertical wall above the forehead.
        # Roll them over toward the crown, following the asymmetric front fall.
        lateral=.021+.014*float(smooth((root[0]-.022)/.040))
        c[:,0]-=crest*lateral*late
        c[:,1]+=crest*(.018*late+.008*np.sin(math.pi*t)*free)
        c[:,2]-=crest*(.016*late**1.25+.004*np.sin(math.pi*t)*free)
        # Broad guide variations open shallow valleys between the crest rolls;
        # the variation is shared by whole locks rather than individual fibers.
        phase=g*2.399963
        arch=np.sin(math.pi*t)**1.25
        c[:,2]+=crest*.0045*math.sin(phase)*arch*free
        c[:,1]+=crest*.0035*math.cos(phase)*arch*free
        # Continue the side flow back above the ear, with a smaller rounded
        # belly instead of a straight horizontal shelf.
        c[:,1]+=side*.008*late
        c[:,0]-=np.sign(root[0])*side*.003*arch*free
        c[:,2]-=side*.0035*arch*free
        c[:2]=paths[i,:2]
        half=(r[:,1]-r[:,0])*.5
        for j in range(2,12):
            before=Vector(paths[i,min(j+1,11)]-paths[i,j-1]).normalized()
            after=Vector(c[min(j+1,11)]-c[j-1]).normalized()
            half[j]=np.array(before.rotation_difference(after)@Vector(half[j]))
        rr=np.stack([c-half,c+half],axis=1);rr[:2]=r[:2]
        revised[ids]=rr.reshape(-1,3)
        counts['uprightCrestRibbons']+=int(crest>.3)
        counts['sideFlowRibbons']+=int(side>.3)
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    previous=report.get(ob.name,{}).copy();uv=mapping.get(ob.name,{}).get('addedUv')
    apply(ob,revised,mapping,report)
    pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    if uv is not None:mapping[ob.name]['addedUv']=uv
    maximum=float(np.linalg.norm(array(ob)-original,axis=1).max()*1000)
    report[ob.name]={**previous,**report[ob.name],'backwardSweptCrest':True,'maxMovementMm':maximum}
    colors=balance_brunette()
    result={**counts,'fixedRootPairsPerRibbon':2,'skinFitVertices':fitted,
            'evaluatedFitPairs':pairs,'maxMovementMm':maximum,'materialColors':colors}
    print('MALE_SWEPT_CREST',result,flush=True)
    return result
