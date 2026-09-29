"""Refine the pale holographic jacket coating without altering fitted geometry.

Connection map: the polymer shell and ribbed trim retain their shared vertices,
weights and jacket correctives. All finish changes are texture shading on the
retained UVs; knit coverage and zipper materials remain authored separately.
The folded hood receives the same coating response as the shell.
"""
import argparse,json,sys,hashlib
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from refine_complete_surfaces import Field,bake,set_value


def geometry_contract(ob):
    h=hashlib.sha256();h.update(array(ob).tobytes())
    for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
    for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
    for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
    if ob.data.shape_keys:
        for k in ob.data.shape_keys.key_blocks:h.update(np.asarray([v.co[:] for v in k.data],dtype=np.float32).tobytes())
    return h.hexdigest()


def finish(ob,rig):
    mat=ob.data.materials[0].copy();ob.data.materials[0]=mat;tree=mat.node_tree;bs=tree.nodes['Principled BSDF'];f=Field(mat)
    original_color=bs.inputs['Base Color'].links[0].from_socket
    if ob.name=='Structured armhole jacket':
        film=next(n for n in tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.name=='female-knit-film')
        split=tree.nodes.new('ShaderNodeSeparateColor');tree.links.new(film.outputs['Color'],split.inputs[0]);coverage=split.outputs['Red']
    else:coverage=1
    def mix(mask,a,b):
        n=tree.nodes.new('ShaderNodeMixRGB');f.input(n.inputs[0],mask)
        for socket,value in [(n.inputs[1],a),(n.inputs[2],b)]:
            if isinstance(value,(tuple,list)):socket.default_value=value
            elif isinstance(value,(int,float)):socket.default_value=(value,value,value,1)
            else:tree.links.new(value,socket)
        return n.outputs[0]
    # The base pigment stays pale and restrained. Thin-film reflection supplies
    # the saturated angle-dependent color rather than a dark metallic base.
    ramp=tree.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='B_SPLINE'
    stops=[(.15,(.12,.38,.49,1)),(.37,(.58,.13,.34,1)),(.55,(.72,.29,.52,1)),(.72,(.56,.53,.19,1)),(.89,(.42,.16,.53,1))]
    for i,(pos,color) in enumerate(stops):
        e=ramp.color_ramp.elements[i] if i<2 else ramp.color_ramp.elements.new(pos);e.position=pos;e.color=color
    tree.links.new(f.math('SUBTRACT',f.math('MULTIPLY',f.noise(22),2.1),.55),ramp.inputs['Fac'])
    tint=mix(.16,(.48,.21,.39,1),ramp.outputs['Color'])
    color=mix(coverage,original_color,tint)
    metal=mix(coverage,.05,.48);coat=mix(coverage,0,.28)
    # Fine crinkles produce small reflected facets. The existing larger folds
    # and knit normal map stay underneath this localized shell-only field.
    height=f.math('MULTIPLY',f.math('SUBTRACT',f.noise(240),.5),.000055)
    for side in ['l','r']:
        elbow=np.array(rig.pose.bones['lowerarm_'+side].head);wrist=np.array(rig.pose.bones['lowerarm_'+side].tail)
        axis=wrist-elbow;axis/=np.linalg.norm(axis);front=np.array([0.,-1.,0.]);along=np.cross(axis,front);along/=np.linalg.norm(along)
        for j,d in enumerate([-.15,-.105,-.055,-.012,.032,.075,.116,.160,.204]):
            direction=axis+along*([.55,-.7,.35,-.45,.7,-.35,.6,-.55,.3][j]);direction/=np.linalg.norm(direction)
            height=f.math('ADD',height,f.ridge(elbow+axis*d+front*.065,direction,along,front,.0014+(j%3)*.0004,.055,.10,.00050))
    height=f.math('MULTIPLY',height,coverage)
    bump=tree.nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=1;bump.inputs['Strength'].default_value=.70
    tree.links.new(bs.inputs['Normal'].links[0].from_socket,bump.inputs['Normal']);tree.links.new(height,bump.inputs['Height']);tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
    label='coat' if ob.name=='Structured armhole jacket' else 'hood';size=2048 if label=='coat' else 1024;images={}
    for name,socket,value in [('color','Base Color',color),('metal','Metallic',metal),('coat','Coat Weight',coat)]:
        tex,_=bake(ob,mat,f'female-foil-{label}-{name}',value,size=size,linear=name!='color',background=.48 if name=='metal' else .28 if name=='coat' else None)
        tree.links.new(tex.outputs['Color'],bs.inputs[socket]);images[socket]=tex.image.name
    tex,uvname=bake(ob,mat,f'female-foil-{label}-normal',normal=True,size=size)
    normal=tree.nodes.new('ShaderNodeNormalMap');normal.uv_map=uvname;tree.links.new(tex.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],bs.inputs['Normal']);images['Normal']=tex.image.name
    set_value(mat,'Specular IOR Level',.36);set_value(mat,'Coat Roughness',.10)
    set_value(mat,'Thin Film IOR',1.65);mat['launchFilmIOR']=1.65
    mat['launchPolymerFinish']=True
    return {'images':images,'shellMetallic':.48,'shellCoatWeight':.28,'shellRoughness':.23,'retainedFilmRangeNm':[mat['launchFilmMinimumNm'],mat['launchFilmMaximumNm']],'retainedFilmMask':bool(mat.get('launchFilmMask',False))}


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-hair-refined.blend'))
    rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
    retained={o.name:geometry_contract(o) for o in scene.objects if o.type=='MESH'}
    report={'changed':sex=='female','materials':{}}
    if sex=='female':
        for name in ['Structured armhole jacket','PLURR folded hood']:report['materials'][name]=finish(bpy.data.objects[name],rig)
    for name,h in retained.items():assert geometry_contract(bpy.data.objects[name])==h,name
    report['preservedGeometryUVWeightsAndShapes']=len(retained)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-foil-refined.blend'),compress=True)
    (OUT/f'{sex}-foil-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.92;scene.view_settings.exposure=-.8;scene.render.resolution_x=scene.render.resolution_y=1000;target=Vector((0,-.015,1.25))
        for label,offset in [('front',(.03,-4,.08)),('oblique',(2.1,-4,.08)),('back',(-.15,4,.08))]:
            cam.location=target+Vector(offset);review.look_at(cam,target);scene.render.filepath=str(OUT/f'{sex}-foil-finish-{label}.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
