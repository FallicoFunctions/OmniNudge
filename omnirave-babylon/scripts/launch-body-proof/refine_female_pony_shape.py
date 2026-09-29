"""Narrow the broad outer pony fan while retaining its loose ends and layers.

Connection map: the first five pairs of every long card remain at their crown
attachment. A shared smooth lateral field gathers the outer free span toward
the existing inner pony. Cheek wisps, core, inner fibers and short crown wisps
stay fixed. The front locks fit outside the collar across 31 authored poses;
thin hair uses millimeter clearances rather than structural overlap. Existing
rig/object origins, topology, UVs, pigment and relative hair shapes stay intact.
"""
import bpy, numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands
from refine_female_face_fall import NAMES, fit_front_collar


def narrow_pony(mapping, report, apply):
    records={};parts={n:[] for n in NAMES};saved_uv={}
    for name in NAMES:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy();roots=[];count=0
        for ids in islands(ob):
            if len(ids)!=36:continue
            r=p[ids];weight=smooth((-r[:,0]-.110)/.080)
            weight*=1-smooth((r[:,2]-1.65)/.10)
            q[ids,0]+=.030*weight
            roots.extend(ids[:10])
            if np.any(q[ids]!=p[ids]):
                count+=1
                # Only locks already falling in front of the shoulder receive
                # front-collar fitting; rear locks retain their existing side.
                if r[-6:,1].mean()<0:parts[name].append(ids)
        assert np.array_equal(q[roots],p[roots]),(name,'crown anchors')
        prior=dict(report[name]);old_mapping=dict(mapping[name])
        if 'addedUv' in old_mapping:saved_uv[name]=old_mapping['addedUv']
        apply(ob,q,mapping,report)
        report[name].update({k:v for k,v in prior.items() if k not in report[name]})
        records[name]={'changedCards':count,'maximumLateralMoveMm':float(np.max(abs(q[:,0]-p[:,0]))*1000)}
    fit=fit_front_collar(parts,mapping,report,apply,retained_pairs=5)
    for name,uv in saved_uv.items():mapping[name]['addedUv']=uv
    report['ponyShape']={'meshes':records,'retainedRootPairs':5,
        'outerFieldStartX':-.110,'outerFieldSpan':.080,'maximumFieldMoveMm':30,
        'frontCollarFit':fit,'addedGeometry':0,'relativeSecondaryShapesRetained':True,
        'textureAndPigmentRetained':True}
