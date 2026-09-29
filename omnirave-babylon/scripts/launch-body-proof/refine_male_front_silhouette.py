"""Open the central forehead while retaining loose outer falling locks.

Existing ribbons and three scalp pairs remain connected. The inner ends lift
and sweep outward instead of forming a dense straight bang at eyebrow level.
Outermost temple curls, crown, side and nape remain unchanged. Sampling fits
all changed vertices and triangles outside the skin over secondary hair poses.
"""
import bpy,numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope,fit_evaluated_edges
from refine_male_fringe_sweep import fit_front_surfaces


def open_forehead(mapping,report,apply):
    ob=bpy.data.objects['Luxury retained swept groom'];rig=bpy.data.objects['AvatarSkeleton']
    original=array(ob);cards=original.reshape(-1,12,2,3);paths=cards.mean(2)
    groups=group_paths(paths,96);guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    t=np.linspace(0,1,12);late=smooth((t-.36)/.64)
    revised=original.copy();edited=[];strong=[]
    for i,card in enumerate(cards):
        guide=guides[int(groups[i])];root=guide[0];tip=guide[-1]
        front=float(smooth((-tip[1]-.105)/.023))
        inner=float(smooth((tip[0]+.065)/.030))
        hanging=float(smooth((1.748-tip[2])/.032))
        weight=front*inner*hanging
        if weight<.12 or root[1]>=-.095:continue
        p=paths[i];c=p.copy()
        c[:,2]+=.020*weight*late
        c[:,0]-=.006*weight*late
        c[:,1]-=.0015*weight*late
        c[:3]=p[:3]
        half=(card[:,1]-card[:,0])*.5
        out=np.stack([c-half,c+half],axis=1);out[:3]=card[:3]
        revised[i*24:(i+1)*24]=out.reshape(-1,3);edited.append(i)
        if weight>.75:strong.append(i)
    assert edited
    fitted=fit_motion_envelope(ob,original,revised,rig,pairwise=True)
    prior=report.get(ob.name,{}).copy();prior_map=mapping[ob.name].copy()
    apply(ob,revised,mapping,report)
    pairs=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    surfaces=fit_front_surfaces(ob,original,rig,mapping,report,apply)
    pairs+=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    for key in ['addedUv','addedColors']:
        if key in prior_map:mapping[ob.name][key]=prior_map[key]
    report[ob.name]={**prior,**report[ob.name],'openedCentralForehead':True}
    final=array(ob);after=final.reshape(-1,12,2,3).mean(2)
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'strongInnerRibbons':len(strong),
            'totalRibbons':len(paths),'fixedPairsPerRibbon':3,'skinFitVertices':fitted,'evaluatedFitPairs':pairs,'surfaceFit':surfaces,
            'maxMovementMm':float(np.linalg.norm(final-original,axis=1).max()*1000),
            'beforePeakM':float(original[:,2].max()),'afterPeakM':float(final[:,2].max()),
            'meanSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).mean()*1000),
            'maximumSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).max()*1000),
            'materialsAndVertexColorsUnchanged':True,'ribbonWidthVectorsRetained':True}
    print('MALE_FRONT_SILHOUETTE',{k:v for k,v in result.items() if not k.endswith('Indices')},flush=True)
    return result
