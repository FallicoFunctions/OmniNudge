"""Stagger the visible ends of the retained male fringe ribbons.

The groom geometry and roots remain exact. A deterministic subset of existing
front-facing ribbons loses opacity gradually after its middle pairs, leaving
long guide strands between shorter wisps. Existing color alpha and glTF
COLOR_0 already drive the authored alpha-test shader.
"""
import bpy
import numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth

ATTRIBUTE='MaleRearFinish'
NAME='Luxury retained swept groom'


def taper_fringe_tips(mapping, report):
    ob=bpy.data.objects[NAME]
    paths=array(ob).reshape(-1,12,2,3).mean(2)
    attr=ob.data.color_attributes[ATTRIBUTE]
    old=np.asarray([d.color[:] for d in attr.data],dtype=np.float32)
    colors=old.copy();opacity=colors.reshape(-1,12,2,4)[:,:,:,3]
    t=np.linspace(0,1,12)
    # A ramp distributed over four pairs avoids a hard cut across the ribbon.
    taper=smooth((t-.57)/.43)
    affected=[];long_visible=0;faded_visible=0
    for i,p in enumerate(paths):
        root=p[0];tip=p[-1]
        if root[1]>=-.095 or tip[1]>=-.105 or tip[0]>=-.012:continue
        # Integer mixing samples strands evenly within every lock. It changes
        # no curve shape and keeps a substantial share of existing tips full length.
        x=(i+1)*0x9E3779B1 & 0xFFFFFFFF
        x=(x^(x>>16))*0x85EBCA6B & 0xFFFFFFFF
        x=(x^(x>>13))*0xC2B2AE35 & 0xFFFFFFFF
        u=(x^(x>>16))/0xFFFFFFFF
        if u>=.64:
            long_visible+=int(opacity[i,-1].mean()>.32)
            continue
        strength=.78+.22*(u/.64)
        forward=smooth((-p[:,1]-.105)/.018)
        factors=1-strength*taper*forward
        opacity[i]*=factors[:,None]
        opacity[i,:3]=old.reshape(-1,12,2,4)[i,:3,:,3]
        affected.append(i)
        faded_visible+=int(old.reshape(-1,12,2,4)[i,-1,:,3].mean()>.32)
    colors=np.clip(colors,0,1).astype(np.float32)
    attr.data.foreach_set('color',colors.ravel())
    mapping[NAME]['addedColors']=colors.tolist()
    changed=np.flatnonzero(np.abs(colors[:,3]-old[:,3])>1e-7)
    row={'affectedRibbons':len(affected),'affectedRibbonIndices':affected,
         'changedAlphaVertices':len(changed),'minimumAlpha':float(colors[changed,3].min()),
         'visibleFullLengthTipRibbonsRetained':long_visible,
         'previouslyVisibleTipRibbonsTapered':faded_visible,
         'fixedPairsPerRibbon':3,'geometryAndRGBExact':True}
    report[NAME]={**report.get(NAME,{}),'tipWisps':{k:v for k,v in row.items() if not k.endswith('Indices')}}
    print('MALE_TIP_WISPS',{k:v for k,v in row.items() if not k.endswith('Indices')},flush=True)
    return {'meshes':{NAME:row},'geometryUnchanged':True,'materialsAndTexturesUnchanged':True,'scalpUnchanged':True}
