"""A continuous brunette-to-magenta palette on the retained pony cards.

No geometry, UVs, alpha coverage or attachments change. All three long-card
meshes share the same pigment envelope, with variations between locks. Short
cheek cards retain their previous base-color product. The existing brunette
normal atlas also fits these fibers exactly, so no texture image is added.
"""
import math
import bpy,numpy as np
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands

BRUNETTE=np.array([.04,.015,.009])
NAMES=[f'PLURR pony strands {i}' for i in range(3)]
DYE_BASE=np.array([.92,.025,.34])
PREVIOUS_BASES=[np.array(v) for v in [(.60,.020,.160),(.72,.008,.19),(.24,.015,.31)]]


def color_pony(mapping,report):
    for mesh_index,name in enumerate(NAMES):
        ob=bpy.data.objects[name];colors=np.ones((len(ob.data.vertices),4))
        attr=ob.data.color_attributes.get('ReferenceHairTint')
        if mesh_index==0:colors[:,:3]=BRUNETTE/DYE_BASE
        else:
            if attr:attr.data.foreach_get('color',colors.ravel())
            colors[:,:3]*=PREVIOUS_BASES[mesh_index]/DYE_BASE
        count=0
        for i,ids in enumerate(islands(ob)):
            if len(ids)!=36:continue
            t=np.repeat(np.linspace(0,1,18),2);phase=i*2.399963+mesh_index*1.7
            # Vary the dye boundary per lock: a shared horizontal color band
            # would emphasize the card construction. Pink starts just beyond
            # the gathering point, as it does in the supplied artwork.
            start=.035+.025*(.5+.5*math.sin(phase))
            length=.21+.07*(.5+.5*math.cos(phase*.63))
            mix=smooth((t-start)/length)
            light=.5+.5*math.sin(phase)
            pink=np.array([.55+.27*light,.004+.005*light,.155+.095*light])
            # A minority of darker locks adds depth without making an entire
            # underlying mesh purple or leaving brown bands through the pony.
            if (i+mesh_index*3)%9==0:pink*=np.array([.65,.8,.80])
            fade=1-.10*smooth((t-.75)/.25)
            pigment=BRUNETTE[None,:]*(1-mix[:,None])+pink[None,:]*mix[:,None]*fade[:,None]
            colors[ids,:3]=pigment/DYE_BASE;count+=1
        assert np.isfinite(colors).all() and colors.min()>=0 and colors.max()<=1
        if attr is None:attr=ob.data.color_attributes.new(name='ReferenceHairTint',type='FLOAT_COLOR',domain='POINT')
        attr.data.foreach_set('color',colors.astype(np.float32).ravel())
        mapping[ob.name]['addedColors']=colors.tolist()
        report[ob.name]['dyedLongLocks']=count
        report[ob.name]['retainedCheekPigment']=True
        if mesh_index==0:report[ob.name]['faceTendrilPigment']=BRUNETTE.tolist()


def finish_pony(materials):
    """Reuse the fiber-aligned normal image and soften broad card highlights."""
    image=bpy.data.images['female-brunette-fiber-normal']
    for name in NAMES:
        mat=bpy.data.objects[name].data.materials[0];tree=mat.node_tree
        bs=tree.nodes['Principled BSDF'];color=(*DYE_BASE,1.)
        # finish_materials constructs the base-factor multiply before the
        # optional vertex tint. Change that factor while keeping both links.
        tint_mix=bs.inputs['Base Color'].links[0].from_node
        color_mix=tint_mix.inputs[2].links[0].from_node
        assert color_mix.type=='MIX_RGB' and color_mix.blend_type=='MULTIPLY'
        assert color_mix.inputs[2].links[0].from_node.image.name=='female-reference-hair-fibers'
        color_mix.inputs[1].default_value=color
        for link in list(bs.inputs['Normal'].links):tree.links.remove(link)
        tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image
        normal=tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.78
        tree.links.new(tex.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        bs.inputs['Roughness'].default_value=.70;bs.inputs['Specular IOR Level'].default_value=.09
        materials[mat.name].update(color=color,roughness=.70,specular=.18,
            normalTexture='female-brunette-fiber-normal.png',normalScale=.78)
