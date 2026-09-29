"""Loosen retained hair ribbons without adding geometry.

Connection map: every card's first pair stays at the existing pony attachment;
short crown flyaways use reduced secondary motion. The upper carrier remains
opaque under the gathering point; its lower length fades into the loose locks.
"""
import math
import bpy,numpy as np
from assemble_complete_pair import array
from complete_pair_geometry import smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_crown import bezier


def loosen_pony(mapping,report,apply):
    rows=[];originals={}
    for name in ['PLURR pony strands 0','PLURR pony strands 1','PLURR pony strands 2']:
        ob=bpy.data.objects[name];originals[name]=array(ob)
        for ids in islands(ob):
            if len(ids)==36:rows.append((name,ids,originals[name][ids].reshape(18,2,3)))
    paths=np.array([r.mean(1) for _,_,r in rows]);groups=group_paths(paths,26)
    revised={name:p.copy() for name,p in originals.items()};t=np.linspace(0,1,18)
    for i,(name,ids,r) in enumerate(rows):
        phase=int(groups[i])*2.399963;center=r.mean(1);half=(r[:,1]-r[:,0])*.5
        length=.84+.16*(.5+.5*math.sin(phase+.8))
        center=np.stack([np.interp(t*length,t,center[:,a]) for a in range(3)],axis=1)
        free=smooth((t-.10)/.5);wave=t*math.pi*(2.2+.35*math.sin(phase))
        center[:,0]+=(.007+.005*(.5+.5*math.sin(phase)))*np.sin(wave+phase)*free
        center[:,1]+=.006*np.sin(wave+phase+1.2)*free
        center[:,2]+=.007*np.sin(wave*.7+phase+.6)*free
        center[:,2]-=(.050+.020*(.5+.5*math.cos(phase)))*smooth((t-.32)/.68)
        # Individual tapered locks retain slight separation at their ends.
        half*= (1-.30*smooth((t-.5)/.5))[:,None]
        rr=np.stack([center-half,center+half],axis=1);rr[0]=r[0]
        revised[name][ids]=rr.reshape(-1,3)
    for name,q in revised.items():apply(bpy.data.objects[name],q,mapping,report)
    # Purple belongs primarily in the ponytail. The reference's loose cheek
    # strands are brunette; tint just these vertices without changing the
    # shared pony material or splitting it into additional draw calls.
    ob=bpy.data.objects['PLURR pony strands 2'];tint=np.ones((len(ob.data.vertices),4))
    for ids in islands(ob):
        if len(ids)!=34:continue
        t=np.repeat(np.linspace(0,1,17),2)
        purple_tip=.18*smooth((t-.70)/.30)
        brown=np.array([.167,1,.029])
        tint[ids,:3]=brown[None,:]*(1-purple_tip[:,None])+purple_tip[:,None]
    attribute=ob.data.color_attributes.new(name='ReferenceHairTint',type='FLOAT_COLOR',domain='POINT')
    attribute.data.foreach_set('color',tint.astype(np.float32).ravel())
    mapping[ob.name]['addedColors']=tint.tolist()

    ob=bpy.data.objects['Polished female flyaways'];p=array(ob);q=p.copy();scale=np.ones(len(p))
    for i,ids in enumerate(islands(ob)):
        r=p[ids].reshape(-1,2,3);t=np.linspace(0,1,len(r));c=r.mean(1);half=(r[:,1]-r[:,0])*.5;root=c[0].copy()
        phase=i*2.399963;free=smooth((t-.08)/.92)
        if i%3==0:
            # Short wisps fan away from the pink crown in unequal directions.
            tip=root+np.array([-.045-.035*(.5+.5*math.sin(phase)),
                -.014+.026*math.cos(phase),.012+.045*(.5+.5*math.cos(phase+.4))])
            c=bezier([root,root+[-.012,-.008,.033],tip+[.014,.004,.014],tip],t)
            c[:,0]+=.003*np.sin(2.4*math.pi*t+phase)*np.sin(math.pi*t)
            tangent=np.gradient(c,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
            across=np.cross(tangent,np.tile([0,-1,0],(len(t),1)));across/=np.linalg.norm(across,axis=1)[:,None]
            width=(.00035+.00020*(.5+.5*math.sin(phase)))*(1-.92*t**3)
            half=across*width[:,None];scale[ids]=.24
        else:
            c[:,0]+=.009*np.sin(t*math.pi*2.4+phase)*free
            c[:,1]+=.006*np.sin(t*math.pi*2.0+phase+.7)*free
            c[:,2]-=.035*smooth((t-.32)/.68)
            half*=.75
        rr=np.stack([c-half,c+half],axis=1);rr[0]=r[0];q[ids]=rr.reshape(-1,3)
    apply(ob,q,mapping,report,scale)


def carrier_finish(save_texture):
    h,w=512,256;v,u=np.mgrid[0:h,0:w].astype(float);u=(u+.5)/w;v=(v+.5)/h
    end=.43+.10*np.sin(u*math.tau*5)+.035*np.sin(u*math.tau*13)
    alpha=np.clip((end-v)/.18,0,1)
    pigment=.55+.30*(.5+.5*np.cos(u*math.tau*53+.5*np.sin(v*12)))
    rgba=np.ones((h,w,4));rgba[:,:,:3]=pigment[:,:,None];rgba[:,:,3]=alpha
    image=save_texture('female-feathered-pony-carrier',rgba)
    mat=bpy.data.objects['PLURR gathered pony bundle'].data.materials[0];tree=mat.node_tree;bs=tree.nodes['Principled BSDF']
    color=(.070,.002,.020,1)
    for socket in ['Base Color','Alpha']:
        for link in list(bs.inputs[socket].links):tree.links.remove(link)
    tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image
    mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=color
    tree.links.new(tex.outputs['Color'],mix.inputs[2]);tree.links.new(mix.outputs[0],bs.inputs['Base Color']);tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
    bs.inputs['Roughness'].default_value=.72;bs.inputs['Specular IOR Level'].default_value=.12;mat.surface_render_method='DITHERED'
    return {mat.name:{'color':color,'roughness':.72,'specular':.24,'texture':'female-feathered-pony-carrier.png','alphaCutoff':.32}}


def finish_fiber_normals(materials,save_texture,sex='female'):
    # Small cylindrical fiber ridges break the broad ribbon highlight. Shared
    # UV flow keeps the shading aligned with each actual hair lock.
    h,w=1024,256;v,u=np.mgrid[0:h,0:w].astype(float);u=(u+.5)/w;v=(v+.5)/h
    phase=(u-.07-.013*np.sin(v*8))/.086*math.tau
    nx=.32*np.sin(phase);ny=.045*np.sin(v*12+u*9);nz=np.sqrt(1-nx*nx-ny*ny)
    rgba=np.ones((h,w,4));rgba[:,:,:3]=np.stack([nx,ny,nz],axis=2)*.5+.5
    image=save_texture(sex+'-reference-fiber-normal',rgba,non_color=True)
    for name,value in materials.items():
        if value.get('texture')!=sex+'-reference-hair-fibers.png':continue
        tree=bpy.data.materials[name].node_tree;bs=tree.nodes['Principled BSDF']
        for link in list(bs.inputs['Normal'].links):tree.links.remove(link)
        tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image
        strength=.45 if sex=='female' else .35
        normal=tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=strength
        tree.links.new(tex.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        value['normalTexture']=sex+'-reference-fiber-normal.png';value['normalScale']=strength
