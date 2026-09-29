"""Pigment and aligned fiber normals on the retained female brunette cards.

No geometry, UV, alpha coverage, origins or attachments change. Two shared
256x1024 maps replace the brunette materials' shared pony maps; two vertex
color attributes vary neighboring locks without adding materials or meshes.
"""
import math
import bpy,numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands

NAMES=['PLURR swept scalp groom','PLURR loose brunette front locks']


def prepare_tints(mapping,report):
    for name in NAMES:
        ob=bpy.data.objects[name];p=array(ob);colors=np.ones((len(p),4))
        parts=islands(ob)
        for i,ids in enumerate(parts):
            root=p[ids[:2 if name==NAMES[0] else 3]].mean(0)
            phase=root[0]*130+root[1]*90
            if name==NAMES[0]:shade=.78+.15*math.sin(phase)+.065*math.sin(i*2.399963)
            else:shade=[.82,.72,.90,.73,.87,.78,.84][i//5]*(.87+.13*(.5+.5*math.sin(i*2.399963)))
            colors[ids,:3]=[shade,shade*(.97+.025*math.cos(phase)),shade*(.94+.035*math.sin(phase))]
        assert 0<=colors.min() and colors.max()<=1
        attr=ob.data.color_attributes.get('ReferenceHairTint') or ob.data.color_attributes.new(name='ReferenceHairTint',type='FLOAT_COLOR',domain='POINT')
        attr.data.foreach_set('color',colors.astype(np.float32).ravel())
        if name in mapping:mapping[name]['addedColors']=colors.tolist()
        report[name]['tintedLocks']=len(parts)


def finish_brunette(materials,save_texture):
    h,w=1024,256;v,u=np.mgrid[0:h,0:w].astype(float);u=(u+.5)/w;v=(v+.5)/h
    alpha=np.zeros((h,w));pigment=np.zeros((h,w));normal=np.zeros((h,w,3));normal[:,:,2]=1
    rng=np.random.default_rng(921)
    for i in range(11):
        # Exactly the same fiber boundaries and root/tip fades as the retained
        # atlas. Color and normals follow each fiber's individual curved path.
        center=.07+i*.086+.013*np.sin(v*8+i*.8)
        width=rng.uniform(.016,.026)*(1-.7*smooth((v-.60)/.40))
        coverage=np.clip((width-np.abs(u-center))/.004+.5,0,1)
        end=rng.uniform(.80,1.04);rng.uniform(.68,1.0)
        coverage*=np.clip((end-v)/.07,0,1)*smooth(v/.055)
        shade=.48+.42*(.5+.5*math.sin(i*2.399963+.7))
        pigment+=coverage*shade
        nx=.52*np.clip((u-center)/np.maximum(width,.0001),-1,1)
        ny=-nx*.104*np.cos(v*8+i*.8)
        n=np.stack([nx,ny,np.sqrt(1-nx*nx-ny*ny)],axis=2)
        selected=coverage>alpha;normal[selected]=n[selected]
        alpha=np.maximum(alpha,coverage)
    previous=np.array(bpy.data.images['female-reference-hair-fibers'].pixels[:]).reshape(h,w,4)
    # Blender's byte image buffer quantizes the analytic coverage. Reuse that
    # stored alpha exactly; tolerate only its one-byte rounding in this check.
    assert np.max(np.abs(alpha-previous[:,:,3]))<=1/255+1e-7,'Brunette coverage changed'
    rgba=np.ones((h,w,4));rgba[:,:,:3]=(np.clip(pigment/np.maximum(alpha,.001),.25,1)*(.48+.52*smooth(v/.22)))[:,:,None]
    rgba[:,:,3]=previous[:,:,3]
    color_image=save_texture('female-brunette-fibers',rgba)
    assert np.array_equal(np.array(color_image.pixels[:]).reshape(h,w,4)[:,:,3],previous[:,:,3])
    normal_rgba=np.ones((h,w,4));normal_rgba[:,:,:3]=normal*.5+.5
    normal_image=save_texture('female-brunette-fiber-normal',normal_rgba,non_color=True)
    for name in NAMES:
        ob=bpy.data.objects[name];mat=ob.data.materials[0];tree=mat.node_tree;bs=tree.nodes['Principled BSDF']
        color=(.056,.024,.012,1) if name==NAMES[0] else (.068,.028,.014,1)
        rough=.64 if name==NAMES[0] else .60
        for socket in ['Base Color','Alpha','Normal']:
            for link in list(bs.inputs[socket].links):tree.links.remove(link)
        tex=tree.nodes.new('ShaderNodeTexImage');tex.image=color_image
        tint=tree.nodes.new('ShaderNodeAttribute');tint.attribute_name='ReferenceHairTint'
        mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=color
        tree.links.new(tex.outputs['Color'],mix.inputs[2])
        variation=tree.nodes.new('ShaderNodeMixRGB');variation.blend_type='MULTIPLY';variation.inputs[0].default_value=1
        tree.links.new(mix.outputs[0],variation.inputs[1]);tree.links.new(tint.outputs['Color'],variation.inputs[2])
        tree.links.new(variation.outputs[0],bs.inputs['Base Color']);tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
        tex_normal=tree.nodes.new('ShaderNodeTexImage');tex_normal.image=normal_image
        bump=tree.nodes.new('ShaderNodeNormalMap');bump.inputs['Strength'].default_value=.80
        tree.links.new(tex_normal.outputs['Color'],bump.inputs['Color']);tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
        bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.15
        materials[mat.name]={'color':color,'roughness':rough,'specular':.30,'texture':'female-brunette-fibers.png','alphaCutoff':.32,
            'normalTexture':'female-brunette-fiber-normal.png','normalScale':.80}
