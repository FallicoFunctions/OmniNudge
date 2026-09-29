"""Localized mouth shaping and portable facial finish on retained body UVs.

Brow cards retain their alpha fibers and skin binding. Body edits are confined
to the mouth, leaving eyelids and all points below the facial region unchanged.
Cosmetics are baked on the neutral skin surface before expression authoring.
"""
import argparse, json, sys
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array, review
from complete_pair_geometry import Surface, smooth
from refine_launch_faces import replace_posed
from refine_complete_surfaces import Field, bake, set_value


def mix(mat, source, mask, color):
    n=mat.node_tree.nodes.new('ShaderNodeMixRGB')
    mat.node_tree.links.new(mask,n.inputs[0]);mat.node_tree.links.new(source,n.inputs[1])
    n.inputs[2].default_value=(*color,1)
    return n.outputs[0]


def finish(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-knit-refined.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE'
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);bpy.context.view_layer.update()
    body=bpy.data.objects['AvatarBody'];surf=Surface(rig,body)
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and o.name not in ['AvatarBody','AvatarEyebrows']}
    p=array(body,True);q=p.copy()
    eye=array(bpy.data.objects['AvatarEye_l'],True).mean(0)
    lipid=body.vertex_groups['lips'].index
    ids=[v.index for v in body.data.vertices if any(g.group==lipid and g.weight>.1 for g in v.groups)]
    center=p[ids].mean(0)
    front=smooth((-p[:,1]+center[1]+.004)/.010)
    region=np.exp(-((p[:,0]/.036)**6+((p[:,2]-center[2])/.020)**6))*front
    region*=((p[:,2]>eye[2]-.115)&(p[:,2]<eye[2]-.035))
    q[:,0]+=p[:,0]*region*(.075 if sex=='male' else .035)
    q[:,2]+=(p[:,2]-center[2])*region*(-.04 if sex=='male' else -.16)
    q[:,1]+=region*(.0002 if sex=='male' else .0014)
    corner=np.exp(-((abs(p[:,0])-.024)/.009)**2-((p[:,2]-center[2])/.008)**2)*region
    q[:,2]+=.0012*corner
    # Only write affected bind vertices, keeping all other source floats exact.
    original=array(body).copy();replace_posed(body,q,surf);local=array(body)
    unchanged=np.linalg.norm(q-p,axis=1)<1e-10;local[unchanged]=original[unchanged]
    body.data.vertices.foreach_set('co',local.astype(np.float32).ravel());body.data.update();bpy.context.view_layer.update()
    assert np.array_equal(array(body)[unchanged],original[unchanged])
    report={'mouthAdjustedVertices':int((~unchanged).sum()),'maximumMouthDisplacementMm':float(np.linalg.norm(q-p,axis=1).max()*1000),'unchangedBodyVertices':int(unchanged.sum())}
    # Darken brow fibers without changing the alpha cutout or its attachment.
    brow=next(o for o in scene.objects if o.type=='MESH' and 'eyebrow' in o.name.lower())
    for ob,color in [(brow,(.024,.011,.008) if sex=='male' else (.012,.005,.007)),(next(o for o in scene.objects if o.type=='MESH' and 'eyelash' in o.name.lower()),(.008,.004,.005))]:
        for i,old in enumerate(list(ob.data.materials)):
            mat=old.copy();ob.data.materials[i]=mat
            set_value(mat,'Base Color',(*color,1));set_value(mat,'Roughness',.62);set_value(mat,'Specular IOR Level',.16)
    mat=body.data.materials[0].copy();body.data.materials[0]=mat
    bs=mat.node_tree.nodes['Principled BSDF'];source=bs.inputs['Base Color'].links[0].from_socket
    f=Field(mat);x=f.math('ABSOLUTE',f.dot((0,0,0),(1,0,0)))
    z=f.dot((0,0,eye[2]),(0,0,1));y=f.dot((0,eye[1],0),(0,-1,0))
    gate=f.math('GREATER_THAN',y,.001)
    def gauss(value,center,width):return f.gaussian(f.math('SUBTRACT',value,center),width)
    def mask(a,b,strength):return f.math('MULTIPLY',f.math('MULTIPLY',a,b),f.math('MULTIPLY',gate,strength))
    # Semantic lip membership excludes the skin around the vermilion border.
    attr=body.data.attributes.new('Face finish lip membership','FLOAT','POINT')
    weights=np.zeros(len(p),np.float32);weights[ids]=1;attr.data.foreach_set('value',weights)
    node=mat.node_tree.nodes.new('ShaderNodeAttribute');node.attribute_name=attr.name
    lip=f.math('MULTIPLY',node.outputs['Fac'],gate)
    source=mix(mat,source,f.math('MULTIPLY',lip,.18 if sex=='male' else .28),(.28,.085,.062) if sex=='male' else (.24,.045,.040))
    rough=f.math('SUBTRACT',.46,f.math('MULTIPLY',lip,.12))
    if sex=='female':
        # Soft plum at the orbital crease and pink on the outer lid/cheek.
        arch=f.math('SUBTRACT',z,f.math('MULTIPLY',f.math('SUBTRACT',x,.028),.10))
        shadow=mask(gauss(x,.032,.019),gauss(arch,.008,.006),.64)
        source=mix(mat,source,shadow,(.11,.017,.076))
        cheek=mask(gauss(x,.045,.018),gauss(z,-.018,.009),.22)
        source=mix(mat,source,cheek,(.42,.030,.13))
        rough=f.math('SUBTRACT',rough,f.math('MULTIPLY',shadow,.075))
    scene.render.engine='CYCLES';scene.cycles.samples=1
    tex,_=bake(body,mat,f'{sex}-face-finish-color',source,size=2048)
    mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    rt,_=bake(body,mat,f'{sex}-face-finish-roughness',rough,size=1024,linear=True,background=.46)
    mat.node_tree.links.new(rt.outputs['Color'],bs.inputs['Roughness'])
    set_value(mat,'Specular IOR Level',.30)
    mat['launchFaceFinish']=True
    for name,v in retained.items():assert np.array_equal(v,array(bpy.data.objects[name])),name
    report['preservedOtherMeshes']=len(retained);report['colorTexture']=tex.image.name;report['roughnessTexture']=rt.image.name
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-face-finished.blend'),compress=True)
    (OUT/f'{sex}-face-finish.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.36
        scene.view_settings.exposure=-.8;scene.render.resolution_x=scene.render.resolution_y=850
        target=Vector((0,-.04,float(eye[2]-.025)))
        for label,offset in [('front',(0,-3,.02)),('oblique',(1.5,-3,.02))]:
            cam.location=target+Vector(offset);review.look_at(cam,target)
            scene.render.filepath=str(OUT/f'{sex}-face-finish-{label}.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);finish(a.sex,a.render)
