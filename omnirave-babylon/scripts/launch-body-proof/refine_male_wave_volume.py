"""Lift coherent bands of the existing swept male crown ribbons.

Connection map: each ribbon's first three vertex pairs remain fixed to the
scalp. Only free pairs move up/forward from the scalp, with original width,
skinning, UVs, and morph deltas retained. No new geometry is created.
"""
import math
import bpy
import numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth


def lift_wave_volume(mapping,report,apply_geometry,amount=1.0):
    ob=bpy.data.objects['Luxury retained swept groom']
    original=array(ob);cards=original.reshape(-1,12,2,3)
    revised=cards.copy();t=np.linspace(0,1,12)
    arch=np.sin(np.pi*t)**1.3*smooth((t-t[2])/.18)
    free=smooth((t-t[2])/.40)
    edited=0;largest=0.0
    for i,card in enumerate(cards):
        center=card.mean(1);root=center[0]
        right=float(smooth((root[0]-.001)/.030))
        front=float(smooth((-root[1]-.070)/.060))
        high=float(smooth((center[:,2].max()-1.750)/.043))
        weight=right*front*high
        # Alternating broad lanes follow the sweep. The raised lanes move
        # toward the viewer so their individual arcs remain visible through
        # the dense underlying cards.
        lane=.5+.5*math.cos(math.tau*(root[1]+.137)/.024)
        band=float(smooth((lane-.72)/.20))
        weight*=band
        if weight<.025:continue
        rise=.027*weight*amount
        forward=.018*weight*amount
        moved=center.copy()
        moved[:,2]+=rise*arch
        moved[:,1]-=forward*arch
        moved[:,0]-=.020*weight*arch*amount
        moved[:3]=center[:3]
        half=(card[:,1]-card[:,0])*.5
        result=np.stack([moved-half,moved+half],axis=1)
        result[:3]=card[:3]
        revised[i]=result
        edited+=1
        largest=max(largest,float(np.linalg.norm(result-card,axis=2).max()))
    apply_geometry(ob,revised.reshape(-1,3),mapping,report)
    details={'editedRibbons':edited,'maxDisplacementMm':largest*1000,'fixedRootPairs':3,'amount':amount}
    report[ob.name]['waveVolume']=details
    return details
