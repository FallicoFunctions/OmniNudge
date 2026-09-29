"""Shape a softly irregular nape underneath the retained outer hair.

Connection map: the low posterior scalp follows the measured skin, with
millimeter clearance. The rooted underlayer and main-groom roots share its
barycentric displacement; main free ends retain their side-layer shaping.
Scalp and underlayer share a feathered coverage field along the new boundary.
Keep origins, topology, UVs, weights, materials, relative morphs, and front hair.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from build_rigged_jacket_hardware import barycentric
from refine_male_loose_fringe import fit_motion_envelope,fit_evaluated_edges

NAMES=['Complete scalp','Polished male rooted hairline','Luxury retained swept groom']
ATTRIBUTE='MaleRearFinish'


def shape_nape(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];cap=bpy.data.objects[NAMES[0]]
    body=Surface(rig,bpy.data.objects['AvatarBody']);old_cap=Surface(rig,cap)
    original=array(cap);q=original.copy();uv=np.zeros((len(q),2))
    for loop in cap.data.loops:uv[loop.vertex_index]=cap.data.uv_layers.active.data[loop.index].uv
    for i,p in enumerate(original):
        rear=float(smooth((p[1]+.035)/.050));low=float(1-smooth((p[2]-1.700)/.044))
        weight=rear*low
        if weight<1e-5:continue
        # A modest off-center low point and uneven overlapping edge replace
        # the level lower arc. The front and temple boundary stay untouched.
        wave=.0026*math.sin(uv[i,0]*math.tau*9+.4)+.0014*math.sin(uv[i,0]*math.tau*17)
        drop=(.007+.007*math.exp(-((p[0]+.009)/.035)**2)+wave)*weight
        candidate=p.copy();candidate[2]-=drop
        hit,n,_,_=body.tree.find_nearest(Vector(candidate))
        old_hit,old_n,_,_=body.tree.find_nearest(Vector(p))
        gap=max(.0024,(Vector(p)-old_hit).dot(old_n))
        q[i]=np.array(hit+n*gap)
    fitted_cap=fit_motion_envelope(cap,original,q,rig)
    delta=q-original
    edge=uv[:,1]>.999;edge_u=uv[edge,0];edge_z=q[edge,2]
    order=np.argsort(edge_u);edge_u=edge_u[order];edge_z=edge_z[order]
    def carrier(point):
        hit,_,triangle,_=old_cap.tree.find_nearest(Vector(point));ids=old_cap.faces[triangle]
        w=np.maximum(barycentric(np.array(hit),old_cap.array[ids]),0);w/=w.sum()
        u=uv[ids,0].copy()
        if np.ptp(u)>.5:u[u<.5]+=1
        return w@delta[ids],float(w@u)%1
    originals={NAMES[0]:original};revised={NAMES[0]:q};columns={NAMES[0]:uv[:,0]}
    for name in NAMES[1:]:
        ob=bpy.data.objects[name];p=array(ob);out=p.copy();cards=p.reshape(-1,12,2,3)
        u=np.zeros(len(p));follow=1-smooth(np.linspace(0,1,12)/.73)
        for i,card in enumerate(cards):
            for j,center in enumerate(card.mean(1)):
                move,column=carrier(center);u[i*24+j*2:i*24+j*2+2]=column
                weight=1 if name==NAMES[1] else follow[j]
                out[i*24+j*2:i*24+j*2+2]+=move*weight
        originals[name]=p;revised[name]=out;columns[name]=u
    results={}
    for name in NAMES:
        ob=bpy.data.objects[name];p=originals[name];out=revised[name]
        fitted=fitted_cap if name==NAMES[0] else fit_motion_envelope(ob,p,out,rig,pairwise=True)
        previous=report.get(name,{}).copy();old_map=mapping[name].copy()
        apply(ob,out,mapping,report)
        pairs=0 if name==NAMES[0] else fit_evaluated_edges(ob,p,rig,mapping,report,apply)
        for key in ['addedUv','addedColors']:
            if key in old_map:mapping[name][key]=old_map[key]
        final=array(ob);coverage_vertices=0
        if name in NAMES[:2]:
            colors=np.asarray([v.color[:] for v in ob.data.color_attributes[ATTRIBUTE].data])
            before_colors=colors.copy();u=columns[name]
            boundary=np.interp(u,edge_u,edge_z,period=1)
            rear=smooth((p[:,1]+.035)/.050)
            varied=.0022*np.sin(u*math.tau*17)+.0016*np.sin(u*math.tau*29+.8)+.001*np.cos(u*math.tau*41)
            transition=.018+.005*(.5+.5*np.sin(u*math.tau*7+.3))
            coverage=smooth((final[:,2]-boundary+.0005-varied)/transition)
            colors[:,3]=colors[:,3]*(1-rear)+coverage*rear
            colors=colors.astype(np.float32)
            ob.data.color_attributes[ATTRIBUTE].data.foreach_set('color',colors.ravel())
            mapping[name]['addedColors']=colors.tolist()
            coverage_vertices=int(np.count_nonzero(np.abs(colors[:,3]-before_colors[:,3])>1e-7))
        changed=np.flatnonzero(np.linalg.norm(final-p,axis=1)>2e-7)
        report[name]={**previous,**report[name],'shapedNape':True}
        results[name]={'changedVertices':len(changed),'skinFitVertices':fitted,'evaluatedFitPairs':pairs,
            'coverageVertices':coverage_vertices,'maxMovementMm':float(np.linalg.norm(final-p,axis=1).max()*1000)}
    central=edge&(np.abs(original[:,0])<.035)&(original[:,1]>.01)
    result={'meshes':results,'scalpRearEdgeMeanDropMm':float((original[central,2]-array(cap)[central,2]).mean()*1000),
            'centralRearEdgeVertices':int(central.sum()),'frontHairPreserved':True,'texturesAndMaterialsUnchanged':True}
    print('MALE_NAPE_SHAPE',result,flush=True)
    return result
