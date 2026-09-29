"""Shape the female scoop neckline and bake placed paint on retained UVs.

Connection map: the crop hem remains bit-identical where it meets the underbust
band and mesh gussets. Strap joins beyond |x|=.090 m remain unchanged, retaining
the measured overlap. The new front neckline follows the measured body with a
5 mm exterior offset. Its 6 mm binding is shaded on the same continuous mesh;
there is no detached trim. The body armature owns all crop deformation.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from complete_pair_geometry import Surface,skin_weights,smooth
from refine_complete_surfaces import Field,bake,set_value


def cage(ob):
    mods=[(m,m.show_viewport) for m in ob.modifiers if m.type!='ARMATURE']
    for m,_ in mods:m.show_viewport=False
    bpy.context.view_layer.update();p=array(ob,True)
    for m,state in mods:m.show_viewport=state
    bpy.context.view_layer.update()
    return p


def shape(ob,body):
    p=cage(ob);assert p.shape==(1440,3),p.shape
    q=p.copy();rows=p.reshape(18,80,3);amount=np.zeros(len(p))
    for j in range(18):
        for i in range(80):
            k=j*80+i;x,y,z=p[k]
            front=float(smooth((-.04-y)/.045))
            width=max(0,1-(x/.09)**2)**2
            vertical=float(smooth((j/17-.32)/.68))
            blend=front*width*vertical
            if blend<1e-9:continue
            q[k,2]-=.035*blend
            # Reproject to the visible chest at the new height, preserving the
            # original clearance below the shaped neckline and at its sides.
            old=body.ray(float(x),float(z),0);new=body.ray(float(x),float(q[k,2]),0)
            assert old is not None and new is not None
            gap=max(.005,float(old.y-y))
            fit=float(smooth((j/17-.48)/.52))*front*width
            margin=gap*(1-fit)+.005*fit
            q[k,1]=new.y-margin
            amount[k]=blend
    changed=np.flatnonzero(amount>0)
    w=skin_weights(ob,body.names);neww=body.weights_at(q[changed]);w[changed]=neww
    local=array(ob).copy();bind=body.bind(q[changed],w[changed])
    local[changed]=(np.c_[bind,np.ones(len(bind))]@np.linalg.inv(np.asarray(ob.matrix_world)).T)[:,:3]
    ob.data.vertices.foreach_set('co',local.astype(np.float32).ravel())
    for group in ob.vertex_groups:
        if group.name in body.names:group.remove(changed.tolist())
    for index,name in enumerate(body.names):
        ids=changed[w[changed,index]>1e-8]
        if not len(ids):continue
        group=ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        for idx in ids:group.add([int(idx)],float(w[idx,index]),'REPLACE')
    ob.data.update();bpy.context.view_layer.update()
    actual=cage(ob);assert np.max(np.abs(actual-q))<1e-6
    # Attributes are scalar distances in the authored neutral cloth, baked into
    # existing UVs so trim and paint follow the same skinning as the garment.
    edge=np.linalg.norm(q-q.reshape(18,80,3)[-1][np.arange(len(q))%80],axis=1)
    attr=ob.data.attributes.new('Crop neckline distance','FLOAT','POINT');attr.data.foreach_set('value',edge.astype(np.float32))
    return {'changedVertices':len(changed),'maximumDisplacementMm':float(np.linalg.norm(q-p,axis=1).max()*1000),'frontCenterNecklineHeightM':float(q[17*80,2]),'frontCenterHemHeightM':float(q[0,2]),'bindingWidthMm':6,'preservedHemVertices':80,'preservedStrapJoinVertices':int(((np.abs(p[:,0])>=.09)&(p[:,1]<0)).sum())},q


def paint(ob,points):
    mat=ob.data.materials[0].copy();ob.data.materials[0]=mat
    bs=mat.node_tree.nodes['Principled BSDF'];f=Field(mat)
    def clamp(value):return f.math('MINIMUM',1,f.math('MAXIMUM',0,value))
    def blend(source,mask,color):
        n=mat.node_tree.nodes.new('ShaderNodeMixRGB');mat.node_tree.links.new(mask,n.inputs[0])
        if isinstance(source,tuple):n.inputs[1].default_value=source
        else:mat.node_tree.links.new(source,n.inputs[1])
        n.inputs[2].default_value=color
        return n.outputs[0]
    # Placement derives from the current front neckline and hem, not a texture
    # copied from trousers. Each impact has a broad torn core and finer drops.
    hem=float(points[0,2]);neck=float(points[17*80,2]);span=neck-hem
    front_y=float(np.min(points[:,1]));color=(.006,.007,.011,1);coverage=0
    specs=[(-.046,hem+span*.66,.053,.070,-.45,(.65,.003,.17,1)),
           (.035,hem+span*.85,.055,.059,.70,(.26,.62,.004,1)),
           (-.016,hem+span*.24,.023,.037,-.65,(.17,.008,.31,1)),
           (.078,hem+span*.48,.025,.050,.25,(.004,.23,.40,1))]
    for i,(x,z,wx,wz,angle,pigment) in enumerate(specs):
        c,s=math.cos(angle),math.sin(angle)
        a=f.dot((x,front_y,z),(c,0,-s));b=f.dot((x,front_y,z),(s,0,c))
        env=f.math('MULTIPLY',f.gaussian(a,wx),f.gaussian(b,wz))
        env=f.math('MULTIPLY',env,f.gaussian(f.dot((0,front_y,0),(0,1,0)),.065))
        macro=f.noise(48+i*7)
        core=clamp(f.math('MULTIPLY',f.math('SUBTRACT',f.math('MULTIPLY',env,f.math('ADD',.30,f.math('MULTIPLY',macro,.70))),.35),18))
        tear=clamp(f.math('MULTIPLY',f.math('SUBTRACT',f.noise(145+i*23),.46),12))
        vor=mat.node_tree.nodes.new('ShaderNodeTexVoronoi');vor.inputs['Scale'].default_value=160+i*31
        mat.node_tree.links.new(f.position,vor.inputs['Vector'])
        drops=f.math('LESS_THAN',vor.outputs['Distance'],f.math('MULTIPLY',env,.30))
        mask=f.math('MAXIMUM',f.math('MULTIPLY',core,tear),drops)
        color=blend(color,mask,pigment);coverage=f.math('MAXIMUM',coverage,mask)
    a=mat.node_tree.nodes.new('ShaderNodeAttribute');a.attribute_name='Crop neckline distance'
    binding=clamp(f.math('MULTIPLY',f.math('SUBTRACT',.0065,a.outputs['Fac']),2000))
    color=blend(color,binding,(.009,.011,.017,1))
    rough=f.math('SUBTRACT',.61,f.math('MULTIPLY',coverage,.14))
    rough=f.math('ADD',f.math('MULTIPLY',rough,f.math('SUBTRACT',1,binding)),f.math('MULTIPLY',binding,.58))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
    tex,_=bake(ob,mat,'female-crop-finish-color',color,size=2048)
    mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    rt,_=bake(ob,mat,'female-crop-finish-roughness',rough,size=1024,linear=True,background=.61)
    mat.node_tree.links.new(rt.outputs['Color'],bs.inputs['Roughness']);set_value(mat,'Metallic',0)
    mat['launchCropFinish']=True
    return {'paintRegions':len(specs),'colorTexture':tex.image.name,'roughnessTexture':rt.image.name}


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-face-finished.blend'))
    rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
    scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and (sex=='male' or o.name!='Launch fitted crop top')}
    report={'changed':sex=='female'}
    if sex=='female':
        ob=bpy.data.objects['Launch fitted crop top'];original=array(ob).copy();body=Surface(rig,bpy.data.objects['AvatarBody'])
        report['shape'],points=shape(ob,body);report['paint']=paint(ob,points)
        assert np.array_equal(array(ob)[:80],original[:80]),'Crop hem moved'
        report['bodyAndOtherMeshesPreserved']=True
    for name,p in retained.items():assert np.array_equal(p,array(bpy.data.objects[name])),name
    report['preservedMeshes']=len(retained)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-crop-refined.blend'),compress=True)
    (OUT/f'{sex}-crop-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.62
        scene.view_settings.exposure=-.8;scene.render.resolution_x=scene.render.resolution_y=1000
        target=Vector((0,-.03,1.30))
        for label,offset in [('front',(0,-4,.08)),('oblique',(1.8,-4,.08))]:
            cam.location=target+Vector(offset);review.look_at(cam,target)
            scene.render.filepath=str(OUT/f'{sex}-crop-finish-{label}.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
