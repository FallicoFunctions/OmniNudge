"""Add woven tops and layered neck jewelry to the retained complete outfits.

Connection map: chain links overlap adjacent links along measured necklace
paths; fine backing cords run through those paths. Female beads surround the
cords with sub-mm spacing. The male pendant bail spans the actual chain and
pendant tip. Jewelry follows the body surface; top geometry stays unchanged.
Small jewelry connections use wire-scale overlap rather than furniture sizes.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,material,review
from complete_pair_geometry import Surface,create,tube,join
from add_launch_reference_details import sphere
from refine_complete_surfaces import Field,bake,set_value
from build_rigged_jacket_hardware import barycentric
import audit_rigged_jacket_sleeves as A


def ring(center,along,across,long_radius,short_radius,wire,segments=10,sides=4):
    center=Vector(center);along=Vector(along).normalized()
    across=Vector(across);across=(across-along*across.dot(along)).normalized()
    normal=along.cross(across).normalized();v=[];f=[];uv=[]
    for i in range(segments):
        a=math.tau*i/segments;c=center+along*(long_radius*math.cos(a))+across*(short_radius*math.sin(a))
        outward=(along*(math.cos(a)/long_radius)+across*(math.sin(a)/short_radius)).normalized()
        for j in range(sides):
            b=math.tau*j/sides;v.append(c+wire*(outward*math.cos(b)+normal*math.sin(b)));uv.append((i/segments,j/sides))
    for i in range(segments):
        for j in range(sides):f.append((i*sides+j,((i+1)%segments)*sides+j,((i+1)%segments)*sides+(j+1)%sides,i*sides+(j+1)%sides))
    return v,f,uv


def sampled(path,spacing):
    p=np.array(path);arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    distances=np.linspace(0,arc[-1],max(3,round(arc[-1]/spacing)),endpoint=False)
    return np.stack([np.interp(distances,arc,p[:,i]) for i in range(3)],axis=1)


def jewelry_weights(body,points):
    # The neck boundary can interpolate five influences. Head and neck have
    # identical skin transforms in these clips; combine them before the
    # four-influence limit rather than dropping a moving upper-arm influence.
    rig=body.rig;difference=0.
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range,9):
            A.sample(bpy.context.scene,float(frame))
            transforms=[np.array(rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()) for n in ['head','neck_01']]
            difference=max(difference,float(np.abs(transforms[0]-transforms[1]).max()))
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(bpy.context.scene,1.)
    assert difference<.00001,('Head/neck transforms are no longer equivalent in the retained clips',difference)
    output=[];dropped=0.;head=body.names.index('head');neck=body.names.index('neck_01')
    for point in points:
        hit,_,index,_=body.tree.find_nearest(Vector(point));ids=body.faces[index]
        row=barycentric(np.array(hit),body.array[ids])@body.weights[ids]
        row[neck]+=row[head];row[head]=0
        keep=np.argsort(row)[-4:];bounded=np.zeros_like(row);bounded[keep]=row[keep]
        dropped=max(dropped,float(row.sum()-bounded.sum()));bounded/=bounded.sum();output.append(bounded)
    return np.array(output),{'combinedInfluences':['head','neck_01'],'maximumSampledTransformDifference':difference,'maximumDroppedWeight':dropped}


def neck_jewelry(sex,rig):
    body=Surface(rig,bpy.data.objects['AvatarBody'])
    paths=[]
    for layer in range(3):
        ob=bpy.data.objects[f'Launch necklace {layer}'];p=array(ob,True)
        assert p.shape==(485,3),p.shape
        paths.append(p.reshape(97,5,3).mean(1));bpy.data.objects.remove(ob,do_unlink=True)
    if sex=='female':
        for layer in range(2):bpy.data.objects.remove(bpy.data.objects[f'PLURR necklace beads {layer}'],do_unlink=True)
    gold=material(f'Launch {sex} linked necklace gold',(.61,.38,.13),.26,.88)
    plastic=material('PLURR polished kandi beads',(.8,.8,.8),.29)
    node=plastic.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='Bead pigment'
    plastic.node_tree.links.new(node.outputs['Color'],plastic.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    parts=[];materials=[];colors=[];report={'chainLinks':0,'beads':0,'layers':3}
    def add(part,index,color=(1,1,1)):
        parts.append(part);materials.extend([index]*len(part[1]));colors.extend([(*color,1)]*len(part[0]))
    palette=[(.66,.007,.22),(.36,.72,.008),(.012,.30,.68),(.48,.24,.014),(.22,.035,.44)]
    for layer,path in enumerate(paths):
        add(tube(path,.00055 if sex=='male' else .00050,5),0)
        if sex=='male' or layer==2:
            centers=sampled(path,.0052 if sex=='male' else .0046)
            for i,c in enumerate(centers):
                # The back sits beneath the jacket. Keep its thin continuous
                # cord and concentrate linked geometry on the visible front.
                if c[1]>-.025:continue
                along=Vector(centers[(i+1)%len(centers)]-centers[(i-1)%len(centers)]).normalized()
                _,normal,_,_=body.tree.find_nearest(Vector(c))
                across=normal.cross(along).normalized()
                angle=(i%2)*math.pi*.38;across=across*math.cos(angle)+normal*math.sin(angle)
                add(ring(c,along,across,.0035 if sex=='male' else .0030,.0016 if sex=='male' else .00135,.00052,segments=8),0)
                report['chainLinks']+=1
        else:
            centers=sampled(path,.0076 if layer==0 else .0080)
            for i,c in enumerate(centers):
                radius=(.00325 if layer==0 else .00345)*(1+.045*math.sin(i*2.3+layer))
                add(sphere(c,radius),1,palette[(i+layer*2)%len(palette)]);report['beads']+=1
    if sex=='male':
        pendant=array(bpy.data.objects['Launch necklace pendant'],True);tip=Vector(pendant[np.argmax(pendant[:,2])])
        chain=Vector(paths[2][0]);axis=chain-tip
        add(ring((chain+tip)*.5,axis,(1,0,0),axis.length*.5+.0012,.0018,.0005,segments=12),0)
        report['pendantBailSpanMm']=axis.length*1000
    v,f,uv=join(parts)
    weights,weight_report=jewelry_weights(body,v)
    ob=create('Launch constructed neck jewelry',v,f,[gold,plastic],body,weights=weights,uv=uv,slot='accessories',option='luxury-jewelry' if sex=='male' else 'plurr-beads')
    for face,index in zip(ob.data.polygons,materials):face.material_index=index
    attr=ob.data.color_attributes.new(name='Bead pigment',type='FLOAT_COLOR',domain='POINT');attr.data.foreach_set('color',np.array(colors,np.float32).ravel())
    ob['outfitDetailCarrier']='AvatarBody';ob['neckJewelryLayers']=3
    report.update(vertices=len(v),faces=len(f),weights=weight_report)
    return report


def fabric(sex):
    name='AvatarTop_tailored' if sex=='male' else 'Launch fitted crop top'
    ob=bpy.data.objects[name];report=[];scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
    for index,original in enumerate(list(ob.data.materials)):
        mat=original.copy();ob.data.materials[index]=mat;bs=mat.node_tree.nodes['Principled BSDF'];field=Field(mat)
        phase=field.math('MULTIPLY',field.dot((0,0,0),(1,0,0)),math.tau/(.0024 if sex=='male' else .0032))
        phase=field.math('ADD',phase,field.math('MULTIPLY',field.noise(38),.7))
        rib=field.math('MULTIPLY',field.math('SINE',phase),.000045 if sex=='male' else .000080)
        cross=field.math('MULTIPLY',field.math('SINE',field.math('MULTIPLY',field.dot((0,0,0),(0,0,1)),math.tau/.0016)),.000015)
        height=field.math('ADD',rib,cross)
        bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=1;bump.inputs['Strength'].default_value=.72
        if bs.inputs['Normal'].is_linked:mat.node_tree.links.new(bs.inputs['Normal'].links[0].from_socket,bump.inputs['Normal'])
        mat.node_tree.links.new(height,bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
        tex,uvname=bake(ob,mat,f'{sex}-upper-woven-{index}',normal=True,size=2048)
        normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.uv_map=uvname
        mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        set_value(mat,'Roughness',.39 if sex=='male' else .61);set_value(mat,'Specular IOR Level',.27 if sex=='male' else .20)
        set_value(mat,'Sheen Weight',.18 if sex=='male' else .24);mat['launchSheenWeight']=.18 if sex=='male' else .24
        report.append({'material':mat.name,'normalImage':tex.image.name,'ribPitchMm':2.4 if sex=='male' else 3.2})
    return report


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-outfit-refined.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and o.get('avatarSlot') in ['body','hair','top','jacket','bottoms','shoes']}
    report={'jewelry':neck_jewelry(sex,rig),'fabric':fabric(sex)}
    for name,p in retained.items():assert np.array_equal(p,array(bpy.data.objects[name])),name
    report['preservedBodyHairAndGarmentMeshes']=len(retained)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-upper-refined.blend'),compress=True)
    (OUT/f'{sex}-upper-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.76
        scene.view_settings.exposure=-.8;scene.render.resolution_x=1000;scene.render.resolution_y=1000
        cam.location=(.5,-4,1.48);review.look_at(cam,Vector((0,-.035,1.42 if sex=='male' else 1.40)))
        scene.render.filepath=str(OUT/f'{sex}-upper-refined.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
