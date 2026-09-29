"""Finish continuous cuff/hem knit without changing the jacket surface.

Connection map: knit and shell share the same mesh, weights and 14 corrective
shapes, so their join has zero geometric gap. All transitions use retained
TailorRest coordinates. Rib relief is shading only, with no displacement.
"""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from refine_complete_surfaces import Field,bake,posed_offset
from complete_pair_geometry import smooth,Surface,skin_weights
import audit_rigged_jacket_sleeves as A


def finish(coat,sex):
    mat=coat.data.materials[0].copy();coat.data.materials.clear();coat.data.materials.append(mat)
    for face in coat.data.polygons:face.material_index=0
    tree=mat.node_tree;bs=tree.nodes['Principled BSDF'];field=Field(mat)
    attr=tree.nodes.new('ShaderNodeAttribute');attr.attribute_name='TailorRest'
    split=tree.nodes.new('ShaderNodeSeparateXYZ');tree.links.new(attr.outputs['Vector'],split.inputs[0]);x,y,z=split.outputs
    def mix(mask,a,b):
        node=tree.nodes.new('ShaderNodeMixRGB');field.input(node.inputs[0],mask)
        for socket,value in [(node.inputs[1],a),(node.inputs[2],b)]:
            if isinstance(value,(tuple,list)):socket.default_value=value
            elif isinstance(value,(int,float)):socket.default_value=(value,value,value,1)
            else:tree.links.new(value,socket)
        return node.outputs[0]
    def smooth_mask(value,edge,rising=False):
        node=tree.nodes.new('ShaderNodeMapRange');node.interpolation_type='SMOOTHERSTEP';node.clamp=True
        tree.links.new(value,node.inputs['Value']);node.inputs['From Min'].default_value=edge-.0006;node.inputs['From Max'].default_value=edge+.0006
        node.inputs['To Min'].default_value=0 if rising else 1;node.inputs['To Max'].default_value=1 if rising else 0
        return node.outputs['Result']
    hem=smooth_mask(z,1.05 if sex=='male' else 1.027)
    cuff=smooth_mask(field.math('ABSOLUTE',x),.691 if sex=='male' else .707,True)
    knit=field.math('MAXIMUM',hem,cuff)
    if sex=='male':
        # Replace the old binary hem/cuff masks throughout the original gold
        # stripe and embroidery network. Its collar attribute stays intact.
        for name,source in [('Math.001',hem),('Math.003',cuff)]:
            for link in list(tree.nodes[name].outputs[0].links):tree.links.new(source,link.to_socket)
        knit=tree.nodes['Math.005'].outputs[0]
        color=tree.nodes['Mix (Legacy).003'].outputs[0];metal=tree.nodes['Math.099'].outputs[0]
    else:
        # The retained procedural color ramp covers newly reassigned faces;
        # sampling the old bake would retain black pixels from the old slots.
        ramp=[n for n in tree.nodes if n.type=='VALTORGB'][-1]
        color=mix(knit,ramp.outputs['Color'],(.34,.61,.012,1))
        metal=mix(knit,.76,.05)
    roughness=mix(knit,float(bs.inputs['Roughness'].default_value),.68)
    coat_weight=mix(knit,float(bs.inputs['Coat Weight'].default_value),0)
    angle=field.math('ARCTAN2',field.math('SUBTRACT',z,1.428),field.math('ADD',y,.022))
    phase=field.math('ADD',field.math('MULTIPLY',cuff,field.math('MULTIPLY',angle,72)),field.math('MULTIPLY',field.math('SUBTRACT',1,cuff),field.math('MULTIPLY',x,1900)))
    relief=field.math('MULTIPLY',field.math('MULTIPLY',knit,field.math('SINE',phase)),.00009)
    bump=tree.nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=1;bump.inputs['Strength'].default_value=.65
    tree.links.new(relief,bump.inputs['Height']);tree.links.new(bs.inputs['Normal'].links[0].from_socket,bump.inputs['Normal']);tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    # All outputs are direct portable texture inputs; expression export does
    # not silently re-unwrap these retained garment UVs.
    images={};scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
    for label,socket,source in [('color','Base Color',color),('metal','Metallic',metal),('roughness','Roughness',roughness),('coat','Coat Weight',coat_weight)]:
        tex,_=bake(coat,mat,f'{sex}-knit-{label}',source,size=2048,linear=label!='color',background=(.235 if sex=='male' else .23) if label=='roughness' else None)
        tree.links.new(tex.outputs['Color'],bs.inputs[socket]);images[socket]=tex.image.name
    tex,uvname=bake(coat,mat,f'{sex}-knit-normal',normal=True,size=2048)
    normal=tree.nodes.new('ShaderNodeNormalMap');normal.uv_map=uvname;tree.links.new(tex.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],bs.inputs['Normal']);images['Normal']=tex.image.name
    if sex=='female':
        # R is film coverage, G is the existing film thickness. Knit has no
        # thin-film coating in either the native shader or glTF extension.
        filmnode=next(n for n in tree.nodes if n.type=='MAP_RANGE' and any(l.to_socket==bs.inputs['Thin Film Thickness'] for l in n.outputs['Result'].links))
        film=filmnode.inputs['Value'].links[0].from_socket
        coverage=field.math('SUBTRACT',1,knit);combine=tree.nodes.new('ShaderNodeCombineColor');combine.mode='RGB'
        tree.links.new(coverage,combine.inputs['Red']);tree.links.new(film,combine.inputs['Green'])
        tex,_=bake(coat,mat,'female-knit-film',combine.outputs[0],size=1024)
        mat['launchFilmTexture']='female-knit-film.png';mat['launchFilmMask']=True
        thickness=field.math('MULTIPLY',coverage,filmnode.outputs['Result']);tree.links.new(thickness,bs.inputs['Thin Film Thickness'])
        images['Film']=tex.image.name
    coat['knitFinish']='continuous-rest-mask-v1'
    return {'images':images,'transitionWidthMm':1.2,'hemRestZ':1.05 if sex=='male' else 1.027,'cuffRestAbsX':.691 if sex=='male' else .707,'ribAmplitudeMm':.09,'trimRoughness':.68,'coatMaterials':len(coat.data.materials)}


def fit_covered_belt(rig):
    """Tuck the front-side belt into the measured space behind the jacket.

    Connection map: belt loops and chain anchors receive the same continuous
    displacement field as the belt beneath them; buckle and rear belt stay
    exact. The field peaks only at the protruding upper front-side corners.
    """
    result={}
    for name in ['Launch cargo belt','Launch belt fittings and linked chains']:
        ob=bpy.data.objects[name];mods=[(m,m.show_viewport) for m in ob.modifiers if m.type!='ARMATURE']
        for m,_ in mods:m.show_viewport=False
        A.update();p=array(ob,True);assert len(p)==len(ob.data.vertices)
        front=smooth((-.012-p[:,1])/.025);side=smooth((np.abs(p[:,0])-.078)/.020)
        upper=smooth((p[:,2]-1.065)/.023);corner=smooth((np.abs(p[:,0])-.128)/.025)
        height=smooth((p[:,2]-1.035)/.020)
        delta=np.zeros_like(p);delta[:,1]=front*side*height*(.0055+.028*upper*corner)
        delta[:,0]=-np.sign(p[:,0])*.008*smooth((np.abs(p[:,0])-.132)/.026)*front*height
        posed_offset(ob,rig,delta)
        if ob.get('outfitDetailCarrier'):
            # The tucked loop tops now sit over a different part of the
            # trouser waist; transfer that carrier's weights at their new
            # locations while retaining the visible resting shape.
            surface=Surface(rig,bpy.data.objects[ob['outfitDetailCarrier']]);points=array(ob,True)
            selected=np.flatnonzero(delta[:,1]>1e-9);weights=skin_weights(ob,surface.names)
            weights[selected]=surface.weights_at(points[selected])
            bind=surface.bind(points,weights);ob.data.vertices.foreach_set('co',bind.astype(np.float32).ravel())
            for j,n in enumerate(surface.names):
                group=ob.vertex_groups.get(n)
                if group:group.remove(selected.tolist())
                ids=selected[weights[selected,j]>1e-8]
                if len(ids):
                    group=group or ob.vertex_groups.new(name=n)
                    for i in ids:group.add([int(i)],float(weights[i,j]),'REPLACE')
            ob.data.update();A.update()
            assert np.max(np.linalg.norm(array(ob,True)-points,axis=1))<1e-6
        for m,state in mods:m.show_viewport=state
        result[name]={'changedVertices':int((np.linalg.norm(delta,axis=1)>1e-9).sum()),'maximumDisplacementMm':float(np.linalg.norm(delta,axis=1).max()*1000)}
        ob['hemBeltFit']='covered-front-side-v1'
    A.update();return result


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-opening-refined.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH'}
    coat=bpy.data.objects['Structured armhole jacket'];report=finish(coat,sex)
    belt=fit_covered_belt(rig) if sex=='male' else {};report['beltFit']=belt
    for name,points in retained.items():
        if name not in belt:assert np.array_equal(points,array(bpy.data.objects[name])),name
    report['unchangedMeshGeometry']=len(retained)-len(belt)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-knit-refined.blend'),compress=True)
    (OUT/f'{sex}-knit-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report),flush=True)
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.80;scene.view_settings.exposure=-.8;scene.render.resolution_x=1000;scene.render.resolution_y=1000
        center=Vector((0,-.1,1.24 if sex=='male' else 1.18));cam.location=center+Vector((.35,-4,.08));review.look_at(cam,center);scene.render.filepath=str(OUT/f'{sex}-knit-current.png');bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
