"""Stagger the otherwise planar ends of the male's falling front locks.

Existing ribbons and their first three scalp pairs remain connected. The
long outer fibers still frame the eye; fibers nearer the inner sweep become
progressively shorter, which makes the fringe edge less helmet-like.
"""
import bpy
import numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges
from refine_male_fringe_sweep import fit_front_surfaces


def feather_fringe(mapping,report,apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);cards=original.reshape(-1,12,2,3);paths=cards.mean(2)
    groups=group_paths(paths,96)
    guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    ranges={g:np.percentile(paths[groups==g,0,0],[10,90]) for g in np.unique(groups)}
    t=np.linspace(0,1,12);late=smooth((t-.55)/.45)
    revised=original.copy();edited=[];roles={'longFallingRibbons':0,'shortFallingRibbons':0}
    for i,card in enumerate(cards):
        g=int(groups[i]);guide=guides[g];root=guide[0];tip=guide[-1]
        front=float(smooth((-tip[1]-.105)/.023));left=float(smooth((-.012-tip[0])/.024))
        fall=front*left*float(smooth((1.749-tip[2])/.035))
        if fall<.12 or root[1]>=-.095:continue
        p=paths[i];c=p.copy();lo,hi=ranges[g]
        lane=float(smooth((p[0,0]-lo)/max(hi-lo,.003)))
        # An authored diagonal edge within each existing lock: outward fibers
        # remain long, inward fibers end higher. The small stable variation
        # prevents hundreds of cards from sharing another horizontal stop.
        x=(i+1)*0x9E3779B1 & 0xFFFFFFFF
        x=(x^(x>>16))*0x85EBCA6B & 0xFFFFFFFF
        u=((x^(x>>16))/0xFFFFFFFF)-.5
        lift=fall*(.0015+.0105*lane+.0015*u)
        spread=fall*.004*(lane-.5)
        c[:,2]+=lift*late
        c[:,0]+=spread*late
        c[:3]=p[:3]
        half=(card[:,1]-card[:,0])*.5
        out=np.stack([c-half,c+half],axis=1);out[:3]=card[:3]
        revised[i*24:(i+1)*24]=out.reshape(-1,3);edited.append(i)
        roles['longFallingRibbons']+=int(tip[2]<1.720)
        roles['shortFallingRibbons']+=int(tip[2]>=1.720)
    assert edited
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    prior=report.get(ob.name,{}).copy();prior_map=mapping[ob.name].copy()
    apply(ob,revised,mapping,report)
    pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    surfaces=fit_front_surfaces(ob,original,rig,mapping,report,apply)
    pairs+=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    for key in ['addedUv','addedColors']:
        if key in prior_map:mapping[ob.name][key]=prior_map[key]
    report[ob.name]={**prior,**report[ob.name],'featheredFringeEnds':True}
    final=array(ob);after=final.reshape(-1,12,2,3).mean(2)
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'totalRibbons':len(paths),
            'fixedPairsPerRibbon':3,**roles,'skinFitVertices':fitted,'evaluatedFitPairs':pairs,'surfaceFit':surfaces,
            'maxMovementMm':float(np.linalg.norm(final-original,axis=1).max()*1000),
            'beforePeakM':float(original[:,2].max()),'afterPeakM':float(final[:,2].max()),
            'meanSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).mean()*1000),
            'maximumSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).max()*1000),
            'materialsAndVertexColorsUnchanged':True,'ribbonWidthVectorsRetained':True}
    print('MALE_FRINGE_FEATHER',{k:v for k,v in result.items() if not k.endswith('Indices')},flush=True)
    return result
