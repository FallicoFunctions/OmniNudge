"""Reference pigmentation on retained hair vertices; no geometry or UV edit.

The face-framing locks keep their brunette color. The long locks of the same
mesh transition from that root pigment to magenta below the gathering point.
One existing material and one vertex-color attribute carry both appearances.
"""
import math
import bpy,numpy as np
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands

BRUNETTE=np.array([.04,.015,.009])
DYE_BASE=np.array([.60,.020,.160])


def color_pony(mapping,report):
    ob=bpy.data.objects['PLURR pony strands 0']
    colors=np.ones((len(ob.data.vertices),4));colors[:,:3]=BRUNETTE/DYE_BASE
    count=0
    for i,ids in enumerate(islands(ob)):
        if len(ids)!=36:continue
        t=np.repeat(np.linspace(0,1,18),2)
        mix=smooth((t-.16)/.42)
        # Slightly different pigment among neighboring locks avoids a flat
        # uniform pink sheet while leaving the whole root region brunette.
        pink=np.array([.42+.08*(.5+.5*math.sin(i*2.399963)),.006,.112+.018*math.sin(i*1.7)])
        pigment=BRUNETTE[None,:]*(1-mix[:,None])+pink[None,:]*mix[:,None]
        colors[ids,:3]=pigment/DYE_BASE;count+=1
    assert colors.min()>=0 and colors.max()<=1
    attr=ob.data.color_attributes.get('ReferenceHairTint')
    if attr is None:attr=ob.data.color_attributes.new(name='ReferenceHairTint',type='FLOAT_COLOR',domain='POINT')
    attr.data.foreach_set('color',colors.astype(np.float32).ravel())
    mapping[ob.name]['addedColors']=colors.tolist()
    report[ob.name]['dyedLongLocks']=count
    report[ob.name]['faceTendrilPigment']=BRUNETTE.tolist()
