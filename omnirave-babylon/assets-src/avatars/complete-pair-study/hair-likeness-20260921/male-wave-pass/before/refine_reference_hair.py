"""Reference hair refinement on retained Blender topology, weights and shapes.

Connection map: scalp cards retain their measured scalp clearance; pony/flyaway
root pairs remain at their existing core attachment (under 2 mm). The forehead
layers receive the same continuous displacement. Millimeter hair layers retain
their thin overlap, rather than the assembly defaults for structural parts.
The archived source is read-only. Existing origins and armature transforms stay
intact because changing them would invalidate skinning and the export mapping.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_complete_foil_finish import geometry_contract
from complete_pair_geometry import smooth, Surface

PASS = OUT / 'hair-likeness-20260921'
convert = lambda p: np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1).tolist()


def save_texture(name, pixels, non_color=False):
    image = bpy.data.images.new(name, pixels.shape[1], pixels.shape[0], alpha=True)
    if non_color:image.colorspace_settings.name='Non-Color'
    image.pixels.foreach_set(pixels.astype(np.float32).ravel()); image.update()
    image.filepath_raw = str(PASS / (name+'.png')); image.file_format = 'PNG'
    image.save(); image.pack()
    return image


def strand_texture(sex):
    # A few resolved fibers per narrow card, instead of hundreds whose alpha
    # averages into a solid strip in the first mip levels. No baked highlights.
    h, w = 1024, 256
    v, u = np.mgrid[0:h, 0:w].astype(float); u = (u+.5)/w; v = (v+.5)/h
    alpha = np.zeros((h,w)); pigment = np.zeros((h,w))
    rng = np.random.default_rng(921)
    for i in range(11):
        center = .07+i*.086 + .013*np.sin(v*8+i*.8)
        width = rng.uniform(.016,.026)*(1-.7*smooth((v-.60)/.40))
        coverage = np.clip((width-np.abs(u-center))/.004+.5,0,1)
        end = rng.uniform(.80,1.04)
        coverage *= np.clip((end-v)/.07,0,1)*smooth(v/.055)
        shade = rng.uniform(.68,1.0)
        pigment += coverage*shade
        alpha = np.maximum(alpha,coverage)
    shade = np.clip(pigment/np.maximum(alpha,.001),.25,1)
    root = .48+.52*smooth(v/.22)
    rgba = np.ones((h,w,4)); rgba[:,:,:3] = (shade*root)[:,:,None]; rgba[:,:,3] = alpha
    return save_texture(sex+'-reference-hair-fibers',rgba)


def apply_geometry(ob, revised, mapping, report, morph_scale=None):
    before = array(ob).copy(); old_normals = np.array([v.normal[:] for v in ob.data.vertices])
    delta = revised-before
    if ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:
            old = np.array([v.co[:] for v in key.data])
            shape_delta = old-before
            if morph_scale is not None: shape_delta *= np.asarray(morph_scale)[:,None]
            key.data.foreach_set('co',(revised+shape_delta).astype(np.float32).ravel())
    ob.data.vertices.foreach_set('co',revised.astype(np.float32).ravel()); ob.data.update()
    after = array(ob)
    assert np.isfinite(after).all()
    previous = mapping.get(ob.name)
    mapping[ob.name] = {'before':convert(before),'after':convert(after),
        'beforeNormals':convert(old_normals),'afterNormals':convert(np.array([v.normal[:] for v in ob.data.vertices]))}
    if previous:
        for key in ['before','beforeNormals']:mapping[ob.name][key]=previous[key]
    if ob.name=='PLURR gathered pony bundle':
        # The old solid-color GLB omitted this mesh's authored coordinates.
        uv=np.zeros((len(after),2));layer=ob.data.uv_layers.active.data
        for loop in ob.data.loops:
            u,v=layer[loop.index].uv;uv[loop.vertex_index]=[u,1-v]
        mapping[ob.name]['addedUv']=uv.tolist()
    if morph_scale is not None and ob.data.shape_keys:
        shapes={};base_normals=np.array([v.normal[:] for v in ob.data.vertices])
        for key in ob.data.shape_keys.key_blocks[1:]:
            positions=np.array([v.co[:] for v in key.data])
            ob.data.vertices.foreach_set('co',positions.astype(np.float32).ravel());ob.data.update()
            shapes[key.name]={'position':convert(positions-after),
                'normal':convert(np.array([v.normal[:] for v in ob.data.vertices])-base_normals)}
        ob.data.vertices.foreach_set('co',after.astype(np.float32).ravel());ob.data.update()
        mapping[ob.name]['morphs']=shapes
        mapping[ob.name]['morphScale']=np.asarray(morph_scale).tolist()
    report[ob.name] = {'vertices':len(after),'maxMovementMm':float(np.linalg.norm(after-before,axis=1).max()*1000),
        'bounds':[after.min(0).tolist(),after.max(0).tolist()]}


def female(mapping, report):
    names = [f'PLURR pony strands {i}' for i in range(4)]
    rows = []
    originals = {name:array(bpy.data.objects[name]).copy() for name in names}
    for name in names:
        for ids in islands(bpy.data.objects[name]):
            if len(ids)==36: rows.append((name,ids,originals[name][ids].reshape(18,2,3)))
    paths = np.array([r.mean(1) for _,_,r in rows])
    groups = group_paths(paths,24)
    guides = {g:paths[groups==g].mean(0) for g in np.unique(groups)}
    revised = {name:p.copy() for name,p in originals.items()}
    t = np.linspace(0,1,18); free = smooth((t-.06)/.94)
    for i,(name,ids,r) in enumerate(rows):
        g=int(groups[i]); phase=g*2.399963; guide=guides[g]; original=r.mean(1)
        # Vary actual strand lengths and the tip fan. Roots remain exact.
        length = .76+.24*(.5+.5*math.sin(phase+1.2))
        if name.endswith('3'): length=.25+.09*(.5+.5*math.sin(phase))
        q=np.stack([np.interp(t*length,t,guide[:,a]) for a in range(3)],axis=1)
        q[:,0]+=.022*free
        q[:,1]-=.035*free
        wave=np.sin(t*math.pi*3.6+phase)*np.sin(math.pi*t)**.7
        q[:,0]+=(.014+.012*(.5+.5*math.sin(phase)))*wave*free
        q[:,1]+=.014*np.sin(t*math.pi*3.2+phase+.8)*free
        q[:,2]+=(.035+.025*(.5+.5*math.cos(phase)))*np.sin(math.pi*t)**1.5
        # Slight separation within a lock, with strongly tapered free ends.
        q+=(original-guide)*(.28*free[:,None])
        q=original*(1-free[:,None])+q*free[:,None]
        half=(r[:,1]-r[:,0])*.5
        half*= (.65*(1-.70*smooth((t-.65)/.35)))[:,None]
        new=np.stack([q-half,q+half],axis=1);new[0]=r[0]
        revised[name][ids]=new.reshape(-1,3)
    # The short face tendrils follow the same roots but avoid rigid straight bars.
    for name in names:
        for i,ids in enumerate(islands(bpy.data.objects[name])):
            if len(ids)!=34:continue
            r=originals[name][ids].reshape(17,2,3);tt=np.linspace(0,1,17)
            p=r.mean(1);half=(r[:,1]-r[:,0])*.5
            p[:,0]+=.003*np.sin(tt*math.pi*1.6)*np.sign(p[0,0])
            p[:,1]-=.0015*np.sin(tt*math.pi)
            half*=.55*(1-.65*tt[:,None]**2)
            q=np.stack([p-half,p+half],axis=1);q[0]=r[0]
            revised[name][ids]=q.reshape(-1,3)
        apply_geometry(bpy.data.objects[name],revised[name],mapping,report)
    # Bring the sparse outline hairs into the revised pony envelope.
    ob=bpy.data.objects['Polished female flyaways'];p=array(ob);q=p.copy()
    for i,ids in enumerate(islands(ob)):
        r=p[ids].reshape(-1,2,3);tt=np.linspace(0,1,len(r));free=smooth((tt-.10)/.90)
        center=r.mean(1);half=(r[:,1]-r[:,0])*.5
        length=.72+.24*(.5+.5*math.sin(i*2.39996))
        curve=np.stack([np.interp(tt*length,tt,center[:,a]) for a in range(3)],axis=1)
        curve[:,0]+=.027*free;curve[:,1]-=.028*free
        curve=center*(1-free[:,None])+curve*free[:,None]
        rr=np.stack([curve-half*.65,curve+half*.65],axis=1);rr[0]=r[0]
        q[ids]=rr.reshape(-1,3)
    apply_geometry(ob,q,mapping,report)

    # Break the helmet-like frontal edge into an asymmetric swept hairline.
    # Project each shifted point back onto the measured head so the scalp and
    # ribbon roots keep their original surface clearance.
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody'])
    for name in ['Complete scalp','PLURR swept scalp groom']:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy()
        for i,point in enumerate(p):
            front=float(smooth((-point[1]-.045)/.07));edge=float(smooth((1.730-point[2])/.075))
            amount=front*edge
            if amount<1e-6:continue
            hit,n,_,_=body.tree.find_nearest(Vector(point))
            clearance=max(.0025,(Vector(point)-hit).dot(n))
            revised=point.copy()
            revised[2]+=amount*(-.002-.003*math.exp(-((point[0]+.022)/.035)**2))
            new_hit,new_n,_,_=body.tree.find_nearest(Vector(revised))
            q[i]=np.array(new_hit+new_n*clearance)
        if name=='PLURR swept scalp groom':
            for ids in islands(ob):
                r=q[ids].reshape(-1,2,3);t=np.linspace(0,1,len(r));p0=r[0].mean(0)
                front=float(smooth((-p0[1]-.025)/.07))
                # Rounded lifted sweeps above the forehead, tapering into the
                # original gathering point without moving the root pair.
                r[:,:,2]+=(.003*front*np.sin(math.pi*t)**1.2)[:,None]
                center=r.mean(1);half=(r[:,1]-r[:,0])*.5
                half*= (.18+.82*smooth(t/.14))[:,None]
                r=np.stack([center-half,center+half],axis=1)
                q[ids]=r.reshape(-1,3)
        apply_geometry(ob,q,mapping,report)


def finish_materials(sex, atlas):
    values={}
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH' or ob.get('avatarSlot')!='hair':continue
        if ob.name in ['Complete scalp','PLURR gathered pony root','PLURR gathered pony bundle']:continue
        for old in list(ob.data.materials):
            mat=old # Hair-specific existing materials; retain slot assignment.
            tree=mat.node_tree;bs=tree.nodes.get('Principled BSDF')
            if not bs:continue
            color=tuple(bs.inputs['Base Color'].default_value)
            if sex=='female':
                color = {'PLURR pony strands 0':(.04,.015,.009,1),'PLURR pony strands 1':(.72,.008,.19,1),
                    'PLURR pony strands 2':(.24,.015,.31,1),'PLURR pony strands 3':(.35,.55,.009,1),
                    'PLURR swept scalp groom':(.060,.026,.012,1),'Polished female flyaways':(.60,.009,.17,1)}.get(ob.name,color)
            for socket in ['Base Color','Alpha']:
                for link in list(bs.inputs[socket].links):tree.links.remove(link)
            tex=tree.nodes.new('ShaderNodeTexImage');tex.image=atlas
            mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=color
            tree.links.new(tex.outputs['Color'],mix.inputs[2]);tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
            if ob.data.color_attributes.get('ReferenceHairTint'):
                vertex=tree.nodes.new('ShaderNodeAttribute');vertex.attribute_name='ReferenceHairTint'
                tint=tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
                tree.links.new(vertex.outputs['Color'],tint.inputs[1]);tree.links.new(mix.outputs[0],tint.inputs[2]);tree.links.new(tint.outputs[0],bs.inputs['Base Color'])
            tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
            rough=(.68 if ob.name=='PLURR swept scalp groom' else .60) if sex=='female' else .46
            spec=.14 if sex=='female' else .20
            bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=spec
            mat.surface_render_method='DITHERED'
            values[mat.name]={'color':color,'roughness':rough,'specular':spec*2,'texture':sex+'-reference-hair-fibers.png','alphaCutoff':.32}
    if sex=='female':
        mat=bpy.data.objects['PLURR gathered pony bundle'].data.materials[0];bs=mat.node_tree.nodes['Principled BSDF']
        color=(.016,.0005,.004,1);bs.inputs['Base Color'].default_value=color;bs.inputs['Roughness'].default_value=.75
        values[mat.name]={'color':color,'roughness':.75}
    return values


def male(mapping, report):
    ob=bpy.data.objects['Luxury retained swept groom'];p=array(ob);q=p.copy()
    scalp=array(bpy.data.objects['Complete scalp']);top=float(scalp[:,2].max())
    for i,ids in enumerate(islands(ob)):
        r=p[ids].reshape(-1,2,3);tt=np.linspace(0,1,len(r));free=smooth(tt/.28)
        center=r.mean(1);half=(r[:,1]-r[:,0])*.5
        # Compress the tall squared-off crest while keeping every attached root.
        center[:,2]-=.32*np.maximum(0,center[:,2]-(top-.012))*free
        center[:,0]+=.004*np.sin(tt*math.pi*2.2+(i//12)*.6)*np.sin(tt*math.pi)*free
        # Soften blunt ends rather than growing a new cloud of fine geometry.
        half*= (1-.70*smooth((tt-.68)/.32))[:,None]
        new=np.stack([center-half,center+half],axis=1);new[0]=r[0]
        q[ids]=new.reshape(-1,3)
    apply_geometry(ob,q,mapping,report)


def scalp_finish():
    h,w=1024,1024;v,u=np.mgrid[0:h,0:w].astype(float);u=(u+.5)/w;v=(v+.5)/h
    flow=u+.11*(1-v)+.035*np.sin(v*math.pi)
    fibers=.5+.5*np.cos(flow*math.tau*185+.5*np.sin(flow*math.tau*41))
    pigment=.36+.34*fibers+.18*(.5+.5*np.cos(flow*math.tau*37))
    edge=.992+.002*np.sin(u*math.tau*193)
    rgba=np.ones((h,w,4));rgba[:,:,:3]=pigment[:,:,None];rgba[:,:,3]=np.clip((edge-v)/.006,0,1)
    tex_image=save_texture('reference-female-hairline',rgba)
    mat=bpy.data.objects['Complete scalp'].data.materials[0];tree=mat.node_tree;bs=tree.nodes['Principled BSDF']
    color=(.045,.019,.008,1)
    for socket in ['Base Color','Alpha']:
        for link in list(bs.inputs[socket].links):tree.links.remove(link)
    tex=tree.nodes.new('ShaderNodeTexImage');tex.image=tex_image
    mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=color
    tree.links.new(tex.outputs['Color'],mix.inputs[2]);tree.links.new(mix.outputs[0],bs.inputs['Base Color']);tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
    bs.inputs['Roughness'].default_value=.64;bs.inputs['Specular IOR Level'].default_value=.16
    return {mat.name:{'color':color,'roughness':.64,'specular':.32,'texture':'reference-female-hairline.png','alphaCutoff':.32}}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--sex',default='female',choices=['male','female'])
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);sex=args.sex
    bpy.ops.wm.open_mainfile(filepath=str(PASS/'before'/f'{sex}-runtime.blend'))
    rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST'
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks:k.value=0
    bpy.context.view_layer.update()
    removed=[]
    if sex=='female':
        for name in ['PLURR face gems -1','PLURR face gems 1']:
            ob=bpy.data.objects.get(name);assert ob is not None,name
            bpy.data.objects.remove(ob,do_unlink=True);removed.append(name)
    preserved={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.get('avatarSlot')!='hair'}
    mapping={};report={}
    additions=[]
    if sex=='female':
        female(mapping,report)
        from refine_female_crown import refine_crown
        additions=refine_crown(mapping,report,apply_geometry)
        from refine_loose_pony import loosen_pony
        loosen_pony(mapping,report,apply_geometry)
    else:male(mapping,report)
    atlas=strand_texture(sex);materials=finish_materials(sex,atlas)
    if sex=='female':
        materials.update(scalp_finish())
        from refine_loose_pony import carrier_finish
        materials.update(carrier_finish(save_texture))
    if additions:
        from refine_female_crown import export_additions
        additions,extra_materials=export_additions(additions,PASS,save_texture)
        materials.update(extra_materials)
    if sex=='female':
        from refine_loose_pony import finish_fiber_normals
        finish_fiber_normals(materials,save_texture)
    assert preserved=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.get('avatarSlot')!='hair'}
    rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(PASS/f'{sex}-hair-refined.blend'),compress=True)
    (PASS/f'{sex}-vertex-mapping.json').write_text(json.dumps(mapping)+'\n')
    (PASS/f'{sex}-native-validation.json').write_text(json.dumps({'meshes':report,'materials':materials,'additions':additions,'removedObjects':removed,'preservedNonHairMeshes':len(preserved)},indent=2)+'\n')
    print('REFERENCE_HAIR',sex,json.dumps(report),flush=True)


if __name__=='__main__':main()
