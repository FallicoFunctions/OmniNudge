"""Resolve the forehead underlayer into tapered, uneven hair roots.

Connection map: existing swept cards retain every centerline and attach to the
same cap. Only their first three rows narrow; a scalp-card UV remap exposes the
fine tips in the existing atlas. The cap's front alpha thins into strand-shaped
coverage; its interior and rear stay solid. No new geometry or material layers.
Hair uses millimeter surface clearance; origins, weights and rig stay fixed.
"""
import numpy as np
import bpy
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands


def refine_roots(mapping,report,apply):
    ob=bpy.data.objects['PLURR swept scalp groom'];p=array(ob);q=p.copy()
    uv=np.zeros((len(p),2))
    layer=ob.data.uv_layers.active.data
    for loop in ob.data.loops:uv[loop.vertex_index]=layer[loop.index].uv[:]
    revised_uv=uv.copy();cards=0
    for ids in islands(ob):
        r=p[ids].reshape(24,2,3);center=r.mean(1);half=(r[:,1]-r[:,0])*.5
        front=float(smooth((-center[0,1]-.057)/.050))
        if front<1e-7:continue
        t=np.linspace(0,1,24)
        taper=1-.58*front*(1-smooth(t/.13))
        h=half*taper[:,None]
        rr=np.stack([center-h,center+h],axis=1)
        rr[3:]=r[3:]
        q[ids]=rr.reshape(-1,3)
        # The common atlas fades its first 5.5%. Sample beyond that fade on
        # frontal scalp cards so their fine ends cover the thinning cap edge.
        v=uv[ids,1];revised_uv[ids,1]=v+.070*front*(1-v)**2
        cards+=1
    old=dict(report[ob.name]);apply(ob,q,mapping,report)
    report[ob.name].update({k:v for k,v in old.items() if k not in report[ob.name]})
    for loop in ob.data.loops:layer[loop.index].uv=revised_uv[loop.vertex_index]
    mapping[ob.name]['addedUv']=np.stack([revised_uv[:,0],1-revised_uv[:,1]],axis=1).tolist()
    report[ob.name]['rootTransition']={'frontalCards':cards,'retainedCenterlines':True,
        'retainedRowsAfter':3,'maximumAtlasOffset':.070,'addedGeometry':0}


def feather_underlayer(rgba,u,v,flow,front):
    # Strand-shaped coverage becomes sparse toward the forehead. An opacity
    # gradient alone is converted back into a hard line by runtime alpha-test.
    # Vary strand ends and widths instead, preserving the established UV seam.
    phase=flow*570+2.0*np.sin(flow*23)+.70*np.sin(flow*67)
    strand_distance=.5+.5*np.cos(phase)
    ends=.980+.004*np.sin(flow*31)+.001*np.sin(flow*53)
    density=smooth((ends-v)/.024)
    alpha=np.clip((density-strand_distance)/.12+.5,0,1)
    alpha*=smooth(density/.12)
    alpha=np.where(density>=.9999,1,alpha)
    alpha=np.minimum(alpha,rgba[:,:,3])
    rgba[:,:,3]=rgba[:,:,3]*(1-front)+alpha*front
    return rgba
