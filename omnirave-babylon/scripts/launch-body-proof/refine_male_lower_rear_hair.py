"""Bring the high rear fade down along the head instead of bulging it out.

Connection map: cap, rooted underlayer and groom roots share the same downward
field. The cap remains about 2 mm outside the head; ribbon roots retain their
millimeter attachment to it. The ear opening stays uncovered.
"""
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth

NAMES=['Complete scalp','Luxury retained swept groom','Polished male rooted hairline','Male layered side strands']


def lower_rear_hair(mapping,report,apply_geometry):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody'])
    changed={}
    for name in NAMES:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy()
        rear=smooth((p[:,1]+.052)/.092)
        flank=smooth((np.abs(p[:,0])-.035)/.032)*smooth((p[:,1]+.075)/.055)
        low=smooth((1.737-p[:,2])/.077)
        zone=low*np.maximum(rear,.55*flank)
        waviness=1+.13*np.sin(52*p[:,0]+21*p[:,1])
        displacement=.017*zone*waviness
        q[:,2]-=displacement
        if name=='Complete scalp':
            for i,point in enumerate(q):
                if zone[i]<.001:continue
                old_hit,old_n,_,old_gap=body.tree.find_nearest(Vector(p[i]))
                hit,n,_,_=body.tree.find_nearest(Vector(point))
                normal=np.asarray(n)
                if np.dot(normal,p[i]-np.array([0,-.03,1.68]))<0:normal=-normal
                q[i]=np.asarray(hit)+normal*max(.0015,min(old_gap,.004))
        apply_geometry(ob,q,mapping,report)
        changed[name]={'movedVertices':int(np.count_nonzero(displacement>.0001)),
                       'maximumDownwardMm':float(displacement.max()*1000)}
    return changed
