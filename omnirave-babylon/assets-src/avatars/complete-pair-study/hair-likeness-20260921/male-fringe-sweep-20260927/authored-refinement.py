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
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import smooth, Surface
from refine_complete_male_hair import group_paths
from refine_male_loose_fringe import fit_motion_envelope, fit_evaluated_edges, skin_gap
from audit_complete_expressions import POSES, set_pose


def fit_front_surfaces(ob, original, rig, mapping, report, apply):
    """Fit triangle centers and edge midpoints, retaining all three root pairs.

    Clear endpoints alone do not keep the straight chord between them clear
    of a curved scalp. Translate whole free pairs to retain thin widths.
    """
    position=rig.data.pose_position
    rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
    bpy.context.scene.frame_set(1);set_pose({})
    transform=rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()
    rotation=np.asarray(transform)[:3,:3];translation=np.asarray(transform)[:3,3];inverse=np.linalg.inv(rotation)
    base=array(ob);world=base@rotation.T+translation
    ob.data.calc_loop_triangles();indices=np.array([f.vertices[:] for f in ob.data.loop_triangles])
    changed=np.linalg.norm(base-original,axis=1)>2e-7;indices=indices[changed[indices].any(1)]
    poses={**POSES,'hair-mixed-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},
           'hair-mixed-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
    samples=[]
    for label,values in poses.items():
        set_pose(values)
        center=np.mean([array(bpy.data.objects['AvatarEye_'+side],True).mean(0) for side in ['l','r']],axis=0)
        center[1]+=.065;center[2]+=.023
        samples.append((label,Surface(rig,bpy.data.objects['AvatarBody']),array(ob,True)-world,center))
    set_pose({});rig.data.pose_position=position;bpy.context.view_layer.update()
    barycentrics=[np.array(b) for b in [(1/3,1/3,1/3),(.5,.5,0),(0,.5,.5),(.5,0,.5)]]
    corrected=set();minimum=None
    for iteration in range(8):
        current=array(ob);proposals={};failures=0;minimum=float('inf')
        for label,body,delta,center in samples:
            evaluated=current@rotation.T+translation+delta;triangles=evaluated[indices]
            for bary in barycentrics:
                points=(triangles*bary[None,:,None]).sum(1)
                for face,point in zip(indices,points):
                    gap,_=skin_gap(body.tree,Vector(point));minimum=min(minimum,gap)
                    if gap>=.0009:continue
                    movable=(face%24)//2>=3
                    fraction=float(bary[movable].sum())
                    assert fraction>0,'A fixed scalp surface needed adjustment'
                    direction=(Vector(point)-Vector(center)).normalized()
                    outer,_,_,_=body.tree.ray_cast(Vector(center)+direction*.32,-direction,.64)
                    assert outer is not None,(label,face.tolist())
                    correction=inverse@(np.array(direction)*max(.0005,.0016-(Vector(point)-outer).dot(direction))/fraction)
                    for pair in np.unique(face[movable]//2*2):
                        if pair not in proposals or np.linalg.norm(correction)>np.linalg.norm(proposals[pair]):proposals[int(pair)]=correction
                    failures+=1
        print('MALE_FRONT_SURFACES',iteration,failures,minimum*1000,flush=True)
        if not failures:return {'adjustedPairs':len(corrected),'minimumSampledGapMm':minimum*1000,'poses':len(samples)}
        for pair,delta in proposals.items():current[pair:pair+2]+=delta;corrected.add(pair)
        apply(ob,current,mapping,report)
    raise AssertionError('Front hair surface fitting did not converge')


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
        arch=-.003+.008*(.5+.5*math.cos(math.tau*lane))
        crest_tip=.001+.011*(.5+.5*math.sin(math.tau*lane+.5))
        c[:,2]+=crest*(arch*belly+crest_tip*late)
        c[:,1]-=crest*(.004*belly+.002*late)
        c[:,0]-=crest*(.002*belly+.002*late)
        # Outer curls retain more length. Inner curls turn away from the
        # eyebrow instead of sharing the same straight downward stop.
        lift=.004+.010*float(smooth((tip[0]+.068)/.046))
        c[:,2]+=falling*(.002*belly+lift*late)
        c[:,0]-=falling*(.003*belly+.003*late)
        c[:,1]-=falling*(.005*belly+.002*late)
        # A gentle sideways return at the end describes a curl instead of
        # a straight cut. Preserve widths through pair translations.
        c[:,0]+=falling*.002*late**3
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
    surfaces=fit_front_surfaces(ob,original,rig,mapping,report,apply)
    pairs+=fit_evaluated_edges(ob,original,rig,mapping,report,apply)
    for key in ['addedUv','addedColors']:
        if key in prior_map:mapping[ob.name][key]=prior_map[key]
    report[ob.name]={**prior,**report[ob.name],'separatedFrontSweep':True}
    final=array(ob);after=final.reshape(-1,12,2,3).mean(2)
    result={'editedRibbons':len(edited),'editedRibbonIndices':edited,'totalRibbons':len(paths),
            'fixedPairsPerRibbon':3,**roles,'skinFitVertices':fitted,'evaluatedFitPairs':pairs,
            'surfaceFit':surfaces,
            'maxMovementMm':float(np.linalg.norm(final-original,axis=1).max()*1000),
            'beforePeakM':float(original[:,2].max()),'afterPeakM':float(final[:,2].max()),
            'meanSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).mean()*1000),
            'maximumSelectedTipLiftMm':float((after[edited,-1,2]-paths[edited,-1,2]).max()*1000),
            'materialsAndVertexColorsUnchanged':True,'ribbonWidthVectorsRetained':True}
    print('MALE_FRINGE_SWEEP',{k:v for k,v in result.items() if not k.endswith('Indices')},flush=True)
    return result
