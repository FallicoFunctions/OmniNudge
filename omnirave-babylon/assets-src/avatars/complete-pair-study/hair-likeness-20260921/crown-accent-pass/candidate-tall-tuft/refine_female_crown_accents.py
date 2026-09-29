"""Refine the reference's green crown tuft and loose pink crown wisps.

Connection map: the 18 green cards retain their first two pairs on the pony
carrier; 60 short pink flyaways retain their first pair. Three green layers
share a sweep with unequal tapered ends. Pink free spans form soft, shorter
arcs instead of angular loops; all 120 long flyaways remain exact. Body clearance
is 4 mm on free edges in neutral and all four secondary corners. Millimeter
hair clearance applies, not structural overlap. Origins, topology, UVs, skin
weights and relative secondary displacements retain their owners. One tint
attribute is added to the existing green material; no geometry or texture is
added. Pink materials and alpha coverage remain exact.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from refine_female_crown import bezier

GREEN='PLURR pony strands 3'
PINK='Polished female flyaways'
NAMES=[GREEN,PINK]
GREEN_BASE=np.array([.48,.72,.25])


def refine_crown_accents(mapping,report,apply,materials):
    body=Surface(bpy.data.objects['AvatarSkeleton'],bpy.data.objects['AvatarBody']).tree
    selected={n:[] for n in NAMES};max_fit=0.;color=None;shape_records={}
    for name in NAMES:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy();root_pairs=2 if name==GREEN else 1
        deltas=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-p for k in ['Secondary_HairSide','Secondary_HairBack']]
        if name==GREEN:color=np.ones((len(p),4))
        for i,ids in enumerate(islands(ob)):
            if name==PINK and i%3:continue
            r=p[ids].reshape(-1,2,3);old=r.mean(1);n=len(r);t=np.linspace(0,1,n)
            strand=i if name==GREEN else i//3;phase=strand*2.399963
            direction=old[1]-old[0];direction/=np.linalg.norm(direction)
            c=old.copy();half=(r[:,1]-r[:,0])*.5;h=half.copy()
            if name==GREEN:
                family=i//6;variation=(i%6-2.5)/2.5
                offset=np.array([[.016,-.029,.044],[.039,-.025,.028],[.050,-.006,.015]][family])
                offset+=np.array([.0035*variation,.004*math.sin(phase),.004*math.cos(phase)])
                tip=old[0]+offset
                c[1:]=bezier([old[1],old[1]+direction*.027,tip+[-.012,.006,.013],tip],np.linspace(0,1,n-1))
                for j in range(2,n):
                    a=Vector(old[min(j+1,n-1)]-old[j-1]).normalized();b=Vector(c[min(j+1,n-1)]-c[j-1]).normalized()
                    width=(.70+.45*math.sin(phase)) if i%6==5 else (2.15+.25*math.cos(phase))
                    h[j]=(a.rotation_difference(b)@Vector(half[j]))*(1+(width-1)*smooth(t[j]/.26))
                pigment=np.array([[.024,.30,.17],[.18,.52,.045],[.39,.63,.030]][family])
                pigment*=.87+.13*(.5+.5*math.sin(phase))
                root=np.array([.024,.063,.021]);dye=smooth((t-.025)/.40)
                rgb=root[None,:]*(1-dye[:,None])+pigment[None,:]*dye[:,None]
                color[ids,:3]=np.repeat(rgb/GREEN_BASE,2,axis=0)
            else:
                family=strand%5
                length=[.051,.066,.060,.077,.069][family]+.005*math.sin(phase)
                tip=old[0]+np.array([-length,.005+.013*math.cos(phase),[.012,-.006,-.013,-.027,-.036][family]+.004*math.sin(phase+.5)])
                c=bezier([old[0],old[0]+direction*.020,tip+[.014,-.005,.014],tip],t)
                for j in range(1,n):
                    a=Vector(old[min(j+1,n-1)]-old[j-1]).normalized();b=Vector(c[min(j+1,n-1)]-c[j-1]).normalized()
                    # Narrow the free shafts; preserve the original rooted edge.
                    width=1-(.43+.12*(.5+.5*math.sin(phase)))*smooth(t[j]/.20)
                    h[j]=(a.rotation_difference(b)@Vector(half[j]))*width
            rr=np.stack([c-h,c+h],axis=1);rr[:root_pairs]=r[:root_pairs]
            da,db=[v[ids].reshape(n,2,3) for v in deltas];shift=np.zeros(n)
            for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
                for j in range(root_pairs,n):
                    for point in (rr+delta)[j]:
                        hit,_,_,_=body.ray_cast(Vector((point[0],point[1],2.2)),Vector((0,0,-1)),1)
                        if hit is not None:shift[j]=max(shift[j],hit.z+.004-point[2])
            for _ in range(2):
                smoothed=shift.copy();smoothed[root_pairs:-1]=.15*shift[root_pairs-1:-2]+.70*shift[root_pairs:-1]+.15*shift[root_pairs+1:];shift=np.maximum(shift,smoothed)
            rr[:,:,2]+=shift[:,None];max_fit=max(max_fit,float(shift.max()))
            assert np.array_equal(rr[:root_pairs],r[:root_pairs]);q[ids]=rr.reshape(-1,3);selected[name].append(ids[0])
        previous=dict(report[name]);saved_uv=mapping[name].get('addedUv')
        apply(ob,q,mapping,report)
        if saved_uv is not None:mapping[name]['addedUv']=saved_uv
        report[name].update({k:v for k,v in previous.items() if k not in report[name]})
        shape_records[name]={'cards':len(selected[name]),'retainedRootPairs':root_pairs,'maximumMovementMm':float(np.linalg.norm(q-p,axis=1).max()*1000)}
    ob=bpy.data.objects[GREEN];mat=ob.data.materials[0];tree=mat.node_tree;bs=tree.nodes['Principled BSDF']
    base_mix=bs.inputs['Base Color'].links[0].from_node
    assert base_mix.type=='MIX_RGB' and base_mix.blend_type=='MULTIPLY'
    assert ob.data.color_attributes.get('ReferenceHairTint') is None
    assert color is not None and np.isfinite(color).all() and color.min()>=0 and color.max()<=1
    attr=ob.data.color_attributes.new(name='ReferenceHairTint',type='FLOAT_COLOR',domain='POINT')
    attr.data.foreach_set('color',color.astype(np.float32).ravel());mapping[GREEN]['addedColors']=color.tolist()
    base_mix.inputs[1].default_value=(*GREEN_BASE,1.)
    vertex=tree.nodes.new('ShaderNodeAttribute');vertex.attribute_name='ReferenceHairTint'
    tint=tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
    tree.links.new(vertex.outputs['Color'],tint.inputs[1]);tree.links.new(base_mix.outputs[0],tint.inputs[2]);tree.links.new(tint.outputs[0],bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value=.70;bs.inputs['Specular IOR Level'].default_value=.08
    materials[mat.name].update(color=[*GREEN_BASE,1.],roughness=.70,specular=.16)
    report['crownAccents']={'meshes':shape_records,'selectedCardFirstVertices':selected,'greenLayers':3,'greenFineAccentCards':3,
        'maximumAdditionalBodyFitMm':max_fit*1000,'retainedLongPinkCards':120,'changedMaterial':mat.name,
        'addedColorAttributes':[GREEN],'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
        'allTextureBytesRetained':True,'relativeSecondaryShapesRetained':True}
