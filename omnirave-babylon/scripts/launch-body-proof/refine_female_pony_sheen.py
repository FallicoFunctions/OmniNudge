"""Give the upper magenta pony depth without changing its attachment or shape.

Connection map: every vertex, normal, UV, shape coordinate and skin weight
stays exact. Existing strand groups receive slightly deeper pigment around
(their bright upper turn only); the first two root pairs, lower pairs 8 onward
and cheek-card pigment remain exact. The same three outer materials receive
restrained specular response. All texture images and alpha coverage stay exact;
no meshes, attributes, materials or texture images are added.
"""
import math
import bpy
import numpy as np
from assemble_complete_pair import array
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_dye import NAMES


def soften_pony_sheen(mapping, report, materials):
    rows=[];paths=[];colors={};before={}
    for name in NAMES:
        ob=bpy.data.objects[name];p=array(ob)
        colors[name]=np.array([v.color[:] for v in ob.data.color_attributes['ReferenceHairTint'].data]);before[name]=colors[name].copy()
        for ids in islands(ob):
            if len(ids)!=36:continue
            rows.append((name,ids));paths.append(p[ids].reshape(18,2,3).mean(1)[:9])
    groups=group_paths(np.array(paths),16)
    u=np.clip((np.arange(18)-1)/7,0,1);bell=np.sin(math.pi*u)**2;bell[:2]=0;bell[8:]=0
    depths=[]
    for i,(name,ids) in enumerate(rows):
        phase=int(groups[i])*2.399963
        depth=.16+.29*(.5+.5*math.sin(phase+.4));depths.append(depth)
        # Slight plum variation follows whole locks, rather than random pixels
        # or a shared transverse stripe. The saturated magenta ends stay exact.
        reduction=1-bell[:,None]*np.array([depth,depth*.45,depth*.66])[None,:]
        c=before[name][ids].reshape(18,2,4).copy();c[:,:,:3]*=reduction[:,None,:]
        c[:2]=before[name][ids].reshape(18,2,4)[:2];c[8:]=before[name][ids].reshape(18,2,4)[8:]
        colors[name][ids]=c.reshape(-1,4)
    materials_changed=[];records={}
    for name in NAMES:
        ob=bpy.data.objects[name];c=colors[name]
        assert np.isfinite(c).all() and c.min()>=0 and c.max()<=1 and np.all(c[:,3]==1)
        ob.data.color_attributes['ReferenceHairTint'].data.foreach_set('color',c.astype(np.float32).ravel())
        mapping[name]['addedColors']=c.tolist()
        mat=ob.data.materials[0];bs=mat.node_tree.nodes['Principled BSDF']
        bs.inputs['Roughness'].default_value=.76;bs.inputs['Specular IOR Level'].default_value=.045
        materials[mat.name].update(roughness=.76,specular=.09);materials_changed.append(mat.name)
        records[name]={'changedColorVertices':int(np.count_nonzero(np.max(abs(c-before[name]),axis=1)>1e-7))}
    report['ponySheen']={'cards':len(rows),'guideGroups':16,'retainedRootPairs':2,'retainedLowerStartPair':8,
        'maximumPigmentReductionRange':[min(depths),max(depths)],'meshes':records,'changedMaterials':materials_changed,
        'roughness':.76,'specular':.09,'allGeometryAndRelativeShapesRetained':True,'allTextureBytesRetained':True,
        'alphaCoverageRetained':True,'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0}
