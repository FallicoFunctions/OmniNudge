"""Shorten crowded free ends of the male frontal sweep.

Connection map: all ribbon roots remain on the existing scalp at their exact
positions. Only the free ends are resampled along their own paths, preserving
head skinning, thin hair overlap, and the existing material assignments.
"""
import math
import bpy
import numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth


def open_fringe(mapping,report,apply_geometry):
    ob=bpy.data.objects['Luxury retained swept groom']
    p=array(ob);rows=p.reshape(-1,12,2,3);q=rows.copy();t=np.linspace(0,1,12)
    changed=0;lengths=[]
    for i,r in enumerate(rows):
        path=r.mean(1);root=path[0];tip=path[-1]
        front=float(smooth((-root[1]-.088)/.040))*float(smooth((-tip[1]-.095)/.035))
        low=float(1-smooth((tip[2]-1.741)/.050))
        central=float(1-smooth((abs(tip[0]+.013)-.020)/.045))
        weight=front*max(low,central*.70)
        if weight<.05:continue
        # Neighboring ribbons share a broad wavelength so visible ends form
        # several loose locks, rather than thousands of identical bang tips.
        cluster=.5+.5*math.sin(110*root[0]+36*root[1]+.65*math.sin(26*root[0]))
        length=1-weight*(.20+.29*central+.13*cluster)
        length=max(.44,min(.95,length));lengths.append(length)
        sample=t*length
        center=np.stack([np.interp(sample,t,path[:,axis]) for axis in range(3)],axis=1)
        half=(r[:,1]-r[:,0])*.5
        half*= (1-.82*smooth((t-.58)/.42))[:,None]
        q[i]=np.stack([center-half,center+half],axis=1)
        q[i,0]=r[0];changed+=1
    apply_geometry(ob,q.reshape(-1,3),mapping,report)
    result={'shortenedRibbons':changed,'meanLengthFactor':float(np.mean(lengths)),
            'minLengthFactor':float(np.min(lengths)),'rootsExact':True}
    report[ob.name]['openFringe']=result
    return result
