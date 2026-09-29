"""Relax the large front loop into a lower asymmetric sweep.

Every existing ribbon keeps three scalp pairs and its original width vectors.
Only the free front wave moves; the lowered hairline and rear remain connected
through the retained roots. Sampled skin fitting uses millimeter clearance.
"""
import math
import bpy
import numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges
from refine_male_fringe_sweep import fit_front_surfaces


def relax_front_arc(mapping, report, apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);cards=original.reshape(-1,12,2,3);paths=cards.mean(2)
    groups=group_paths(paths,96);guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    t=np.linspace(0,1,12);free=smooth((t-t[2])/.30)
    belly=np.sin(math.pi*t)**1.5*free;late=smooth((t-.48)/.52)
    revised=original.copy();edited=[];roles={'crossingWaveRibbons':0,'fallingCurlRibbons':0}
    for i,card in enumerate(cards):
        guide=guides[int(groups[i])];tip=guide[-1]
        front=float(smooth((-tip[1]-.105)/.023));left=float(smooth((-.012-tip[0])/.024))
        crest=front*left*float(smooth((guide[:,2].max()-1.773)/.016))
        falling=front*left*float(smooth((1.749-tip[2])/.023))
        if max(crest,falling)<.12:continue
        p=paths[i];c=p.copy()
        # Lower the round arch and advance its sideways sweep. This is a
        # centerline translation; card width and taper remain unchanged.
        c[:,2]-=crest*.0065*belly
        c[:,1]+=crest*.0035*belly
        c[:,0]-=crest*.0045*belly
        # The outer hanging loop narrows above its end, then opens downward.
        # Neighboring fibers follow one continuous field rather than noise.
        outer=float(smooth((-.037-tip[0])/.029))
        c[:,0]+=falling*outer*(.0045*belly-.002*late)
        c[:,2]-=falling*(.003*belly+.0035*late)
        c[:,1]+=falling*.002*belly
        c[:3]=p[:3]
        half=(card[:,1]-card[:,0])*.5
        out=np.stack([c-half,c+half],axis=1);out[:3]=card[:3]
        revised[i*24:(i+1)*24]=out.reshape(-1,3);edited.append(i)
        roles['crossingWaveRibbons']+=int(crest>=.12);roles['fallingCurlRibbons']+=int(falling>=.12)
    assert edited
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    prior=report.get(ob.name,{}).copy();prior_map=mapping[ob.name].copy()
    apply(ob,revised,mapping,report)
    pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    surfaces=fit_front_surfaces(ob,original,rig,mapping,report,apply)
    pairs+=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    for key in ['addedUv','addedColors']:
        if key in prior_map:mapping[ob.name][key]=prior_map[key]
    report[ob.name]={**prior,**report[ob.name],'relaxedFrontArc':True}
    final=array(ob);after=final.reshape(-1,12,2,3).mean(2)
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'totalRibbons':len(paths),
            'fixedPairsPerRibbon':3,**roles,'skinFitVertices':fitted,'evaluatedFitPairs':pairs,'surfaceFit':surfaces,
            'maxMovementMm':float(np.linalg.norm(final-original,axis=1).max()*1000),
            'beforePeakM':float(original[:,2].max()),'afterPeakM':float(final[:,2].max()),
            'meanSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).mean()*1000),
            'maximumSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).max()*1000),
            'materialsAndVertexColorsUnchanged':True,'ribbonWidthVectorsRetained':True}
    print('MALE_FRONT_ARC',{k:v for k,v in result.items() if not k.endswith('Indices')},flush=True)
    return result
