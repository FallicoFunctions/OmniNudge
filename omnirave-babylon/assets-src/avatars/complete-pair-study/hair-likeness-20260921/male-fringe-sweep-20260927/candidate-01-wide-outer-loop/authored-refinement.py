"""Separate the retained front waves and stagger the falling curl ends.

Connection map: every ribbon retains its first three scalp pairs, overlapping
the unchanged lowered hairline/support. Only existing front free pairs move.
The crown, side layers, nape, weights, origins, UVs and relative motion shapes
are retained. Thin hair is fitted with sampled millimeter skin clearance;
structural assembly overlap would be inappropriate for these surfaces.
"""
import math
import bpy
import numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges


def sweep_fringe(mapping, report, apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);cards=original.reshape(-1,12,2,3);paths=cards.mean(2)
    groups=group_paths(paths,96)
    guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    t=np.linspace(0,1,12);free=smooth((t-t[2])/.32)
    late=smooth((t-.48)/.52);belly=np.sin(math.pi*t)**1.5*free
    revised=original.copy();edited=[];roles={'crossingWaveRibbons':0,'fallingCurlRibbons':0}
    for i,card in enumerate(cards):
        guide=guides[int(groups[i])];root=guide[0];tip=guide[-1]
        front=float(smooth((-tip[1]-.105)/.023))
        left=float(smooth((-.012-tip[0])/.024))
        crest=front*left*float(smooth((guide[:,2].max()-1.773)/.016))
        falling=front*left*float(smooth((1.749-tip[2])/.023))
        if max(crest,falling)<.12:continue
        p=paths[i];c=p.copy()
        # Continuous lanes across existing tip positions keep neighboring
        # fibers together while giving overlapping waves different arches.
        lane=(tip[0]+.078)/.068
        arch=.004+.004*(.5+.5*math.cos(math.tau*lane))
        crest_tip=.004+.008*(.5+.5*math.sin(math.tau*lane+.5))
        c[:,2]+=crest*(arch*belly+crest_tip*late)
        c[:,1]-=crest*(.006*belly+.002*late)
        c[:,0]-=crest*(.005*belly+.005*late)
        # Outer curls retain more length. Inner curls turn away from the
        # eyebrow instead of sharing the same straight downward stop.
        lift=.004+.010*float(smooth((tip[0]+.068)/.046))
        c[:,2]+=falling*(.002*belly+lift*late)
        c[:,0]-=falling*(.007*belly+.004*late)
        c[:,1]-=falling*(.005*belly+.002*late)
        # A gentle sideways return at the end describes a curl instead of
        # a straight cut. Preserve widths through pair translations.
        c[:,0]+=falling*.004*late**3
        c[:3]=p[:3]
        half=(card[:,1]-card[:,0])*.5
        out=np.stack([c-half,c+half],axis=1);out[:3]=card[:3]
        revised[i*24:(i+1)*24]=out.reshape(-1,3);edited.append(i)
        roles['crossingWaveRibbons']+=int(crest>=.12)
        roles['fallingCurlRibbons']+=int(falling>=.12)
    assert edited
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    prior=report.get(ob.name,{}).copy();prior_map=mapping[ob.name].copy()
    apply(ob,revised,mapping,report)
    pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    for key in ['addedUv','addedColors']:
        if key in prior_map:mapping[ob.name][key]=prior_map[key]
    report[ob.name]={**prior,**report[ob.name],'separatedFrontSweep':True}
    final=array(ob);after=final.reshape(-1,12,2,3).mean(2)
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'totalRibbons':len(paths),
            'fixedPairsPerRibbon':3,**roles,'skinFitVertices':fitted,'evaluatedFitPairs':pairs,
            'maxMovementMm':float(np.linalg.norm(final-original,axis=1).max()*1000),
            'beforePeakM':float(original[:,2].max()),'afterPeakM':float(final[:,2].max()),
            'meanSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).mean()*1000),
            'maximumSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).max()*1000),
            'materialsAndVertexColorsUnchanged':True,'ribbonWidthVectorsRetained':True}
    print('MALE_FRINGE_SWEEP',{k:v for k,v in result.items() if not k.endswith('Indices')},flush=True)
    return result
