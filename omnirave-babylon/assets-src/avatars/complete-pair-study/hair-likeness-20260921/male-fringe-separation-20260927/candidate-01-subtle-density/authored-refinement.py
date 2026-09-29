"""Give front waves space by thinning excess overlapping hair coverage.

Connection map: retain every mesh, root, curve, relative motion shape and
attachment exactly. The front support retains its first three pairs and fades
only its high free portion; the scalp remains covered. Three coherent lanes
in the outer crest retain visible curl cores, with lower falling ends intact.
Use the existing vertex alpha shader and glTF COLOR_0; materials and RGB stay.
"""
import math
import bpy
import numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth

ATTRIBUTE='MaleRearFinish'
NAMES=['Polished male rooted hairline','Luxury retained swept groom']


def separate_fringe(mapping, report):
    result={}
    t=np.linspace(0,1,12)
    free=smooth((t-t[2])/.30)
    for name in NAMES:
        ob=bpy.data.objects[name];cards=array(ob).reshape(-1,12,2,3);paths=cards.mean(2)
        attr=ob.data.color_attributes[ATTRIBUTE]
        old=np.asarray([d.color[:] for d in attr.data],dtype=np.float32)
        colors=old.copy();opacity=colors.reshape(-1,12,2,4)[:,:,:,3]
        affected=[];means=[]
        for i,p in enumerate(paths):
            root=p[0];tip=p[-1]
            if name==NAMES[0]:
                front=float(smooth((-root[1]-.104)/.020))*float(1-smooth((abs(root[0])-.060)/.019))
                high=smooth((cards[i,:,:,2].min(1)-1.744)/.025)
                weight=front*free*high
                if weight.max()<.03:continue
                factors=1-.94*weight
            else:
                if tip[1]>=-.105 or tip[0]>=-.012 or p[:,2].max()<=1.780:continue
                # Shared lanes across nearby roots leave complete wave cores,
                # rather than removing arbitrary individual fibers.
                coordinate=root[0]+.20*(root[1]+.135)
                lane_distance=min(abs(coordinate-c) for c in [.015,.030,.045])
                density=.08+.92*math.exp(-(lane_distance/.0035)**4)
                high=smooth((cards[i,:,:,2].min(1)-1.773)/.012)
                weight=free*high
                if weight.max()<.03:continue
                factors=1-(1-density)*weight
            opacity[i]*=factors[:,None]
            opacity[i,:3]=old.reshape(-1,12,2,4)[i,:3,:,3]
            affected.append(i);means.append(float(factors.min()))
        colors=np.clip(colors,0,1).astype(np.float32)
        attr.data.foreach_set('color',colors.ravel())
        mapping[name]['addedColors']=colors.tolist()
        changed=np.flatnonzero(np.abs(colors[:,3]-old[:,3])>1e-7)
        row={'affectedRibbons':len(affected),'affectedRibbonIndices':affected,
             'changedAlphaVertices':len(changed),'minimumAlpha':float(colors[changed,3].min()),
             'meanMinimumRibbonFactor':float(np.mean(means)),'fixedPairsPerRibbon':3,
             'geometryAndRGBExact':True}
        report[name]={**report.get(name,{}),'frontCoverageSeparation':{k:v for k,v in row.items() if not k.endswith('Indices')}}
        result[name]=row
    print('MALE_FRINGE_SEPARATION',{k:{a:b for a,b in v.items() if not a.endswith('Indices')} for k,v in result.items()},flush=True)
    return {'meshes':result,'geometryUnchanged':True,'materialsAndTexturesUnchanged':True,'scalpUnchanged':True}
