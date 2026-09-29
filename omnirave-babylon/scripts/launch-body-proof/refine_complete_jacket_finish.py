"""Author sharper cloth folds and distinct satin/foil responses.

Connection map: collar, front opening, hem and cuff boundary vertices stay
fixed. Folds terminate before those connections. Sewn zipper hardware follows
the measured shell displacement; female zipper material regions use the
retained matching construction topology. Body and all other garments stay exact.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review,material
from complete_pair_geometry import Surface,skin_weights,smooth
from build_rigged_jacket_hardware import barycentric
from refine_complete_drape import adjacency,diffuse,fit,offset_keys
from refine_complete_surfaces import posed_offset,Field,bake,set_value
import audit_rigged_jacket_sleeves as A


def fold_profile(d,width):
    # A narrow rounded crease between flatter fabric planes. The shallow
    # adjacent valley makes a crease, rather than an inflated ridge band.
    crest=np.exp(-np.sqrt((d/width)**2+.035))
    trough=.38*np.exp(-((d+width*1.8)/(width*.9))**2)
    return crest-trough


def sculpt(coat,rig,sex):
    p=array(coat,True);names=list(rig.data.bones.keys());w=skin_weights(coat,names)
    _,_,_,boundary=adjacency(coat)
    arm=sum(w[:,names.index(b+'_'+s)] for s in ['l','r'] for b in ['upperarm','lowerarm'])
    # Remove a little of the previous small rounded rippling first; retain
    # the established sleeve volume and all attachment boundaries.
    q,_=diffuse(p,coat,smooth((arm-.28)/.42),12,.007)
    report={}
    for side,sign in [('l',1),('r',-1)]:
        shoulder=np.array(rig.pose.bones['upperarm_'+side].head)
        elbow=np.array(rig.pose.bones['lowerarm_'+side].head)
        wrist=np.array(rig.pose.bones['lowerarm_'+side].tail)
        ua=elbow-shoulder;ul=np.linalg.norm(ua);ua/=ul
        la=wrist-elbow;ll=np.linalg.norm(la);la/=ll
        on_upper=(p-shoulder)@ua<ul
        arc=np.where(on_upper,(p-shoulder)@ua,ul+(p-elbow)@la)
        center=np.where(on_upper[:,None],shoulder+((p-shoulder)@ua)[:,None]*ua,elbow+((p-elbow)@la)[:,None]*la)
        radial=p-center;radial/=np.maximum(np.linalg.norm(radial,axis=1),1e-8)[:,None]
        theta=np.arctan2(sign*radial[:,0],-radial[:,1])
        amount=w[:,names.index('upperarm_'+side)]+w[:,names.index('lowerarm_'+side)]
        cuff=float(np.max(arc[amount>.7]));mask=smooth((amount-.24)/.54)*smooth((arc-.035)/.075)*smooth((cuff-arc)/.030)
        mask[list(boundary)]=0
        displacement=np.zeros(len(p))
        # Irregular diagonals concentrate at elbow/cuff, with longer quieter
        # runs above the elbow. Front/back creases have different directions.
        for j,(at,width,amp,slant,angle) in enumerate([
            (.14,.014,.006,.040,.3),(.225,.010,.013,-.032,-.4),
            (ul-.024,.010,.013,.040,.6),(ul+.029,.008,.016,-.032,-.25),
            (ul+.082,.010,.014,.033,.8),(cuff-.142,.009,.016,-.031,.2),
            (cuff-.082,.007,.013,.025,-.8),(cuff-.039,.006,.010,-.018,.45)]):
            d=arc-at+slant*np.sin(theta+sign*.35+j*.37)
            angle_delta=(theta-angle+math.pi)%math.tau-math.pi
            around=.10+.90*np.exp(-(angle_delta/(1.65 if j%2 else 1.2))**4)
            displacement+=fold_profile(d,width)*amp*around
        # Break the outer balloon contour into broad facets, not more volume.
        if sex=='female':displacement-=.0035*smooth((arc-.12)/.12)*smooth((cuff-.035-arc)/.06)
        delta=radial*(displacement*mask)[:,None];q+=delta
        report[side]={'cuffArcM':cuff,'maximumFoldDisplacementMm':float(np.linalg.norm(delta,axis=1).max()*1000)}
    hem=float(np.min(p[np.abs(p[:,0])<.14,2]));shoulder=float(np.mean([rig.pose.bones['upperarm_'+s].head.z for s in ['l','r']]))
    theta=np.arctan2(p[:,0],-(p[:,1]+.025));radial=np.c_[np.sin(theta),-np.cos(theta),np.zeros(len(p))]
    mask=smooth((.40-arm)/.32)*smooth((p[:,2]-hem-.012)/.040)*smooth((shoulder+.06-p[:,2])/.065)
    mask[list(boundary)]=0
    # Fold fans run diagonally from the hem and side seams across front/back.
    for j,(height,slope,width,amp) in enumerate([(.070,.35,.011,.007),(.155,-.40,.013,.009),(.235,.50,.016,.011),(.330,-.30,.019,.008),(.425,.55,.014,.009),(.485,-.35,.017,.006)]):
        d=p[:,2]-(hem+height)-slope*(np.abs(p[:,0])-.07)
        d+=.012*np.sin(theta*3+j*.7)
        envelope=np.exp(-((np.abs(theta)-(.65 if j%2 else 2.45))/.86)**4)
        q+=radial*(fold_profile(d,width)*amp*mask*envelope)[:,None]
    panel=mask*np.exp(-((np.abs(theta)-.68)/.65)**4)
    d=np.abs(p[:,0])-(.080+.018*np.sin((p[:,2]-hem)*9))
    q+=radial*(fold_profile(d,.010)*.005*panel)[:,None]
    posed_offset(coat,rig,q-p)
    return report,boundary


def surface_finish(ob,rig,sex,label='jacket-finish'):
    results=[];scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
    for i,old in enumerate(list(ob.data.materials)):
        if not any(k in old.name.lower() for k in ['pearl bomber','iridescent foil']):continue
        mat=old.copy();ob.data.materials[i]=mat;bs=mat.node_tree.nodes['Principled BSDF'];field=Field(mat)
        # High-frequency crinkle detail is separate from the authored mesh
        # folds. Its stretched fields make short facets instead of pebble noise.
        height=field.math('MULTIPLY',field.math('SUBTRACT',field.noise(200),.5),.000055 if sex=='male' else .000075)
        for side,sign in [('l',1),('r',-1)]:
            elbow=np.array(rig.pose.bones['lowerarm_'+side].head);wrist=np.array(rig.pose.bones['lowerarm_'+side].tail)
            axis=wrist-elbow;axis/=np.linalg.norm(axis);front=np.array([0.,-1.,0.]);along=np.cross(axis,front);along/=np.linalg.norm(along)
            for j,distance in enumerate([-.10,-.049,.014,.057,.102,.155,.205]):
                direction=axis+along*([.4,-.5,.3,-.3,.6,-.35,.4][j]);direction/=np.linalg.norm(direction)
                center=elbow+axis*distance+front*(.045 if sex=='male' else .065)
                height=field.math('ADD',height,field.ridge(center,direction,along,front,.0020+(j%2)*.0007,.064,.08,.0009 if sex=='male' else .0015))
        bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=1;bump.inputs['Strength'].default_value=.78
        # Replace old bump shading so the new folds remain readable.
        mat.node_tree.links.new(height,bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
        prefix=f'{sex}-{label}-{ob.name.replace(" ","_")}-{i}'
        if sex=='female':
            ramp=mat.node_tree.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='B_SPLINE'
            stops=[(.12,(.18,.018,.27,1)),(.36,(.55,.024,.19,1)),(.53,(.31,.032,.34,1)),(.70,(.025,.34,.30,1)),(.88,(.50,.025,.30,1))]
            for j,(pos,color) in enumerate(stops):
                el=ramp.color_ramp.elements[j] if j<2 else ramp.color_ramp.elements.new(pos);el.position=pos;el.color=color
            mat.node_tree.links.new(field.noise(10),ramp.inputs['Fac'])
            tex,_=bake(ob,mat,prefix+'-color',ramp.outputs['Color'],size=2048 if ob.name=='Structured armhole jacket' else 1024)
            mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
            set_value(mat,'Metallic',.76);set_value(mat,'Roughness',.23);set_value(mat,'Coat Weight',.18);set_value(mat,'Coat Roughness',.12)
            set_value(mat,'Specular IOR Level',.42)
            mat['launchFilmMinimumNm']=270.;mat['launchFilmMaximumNm']=650.;mat['launchFilmIOR']=1.45
            set_value(mat,'Thin Film IOR',1.45)
            for node in mat.node_tree.nodes:
                if node.type=='MAP_RANGE' and any(l.to_socket==bs.inputs['Thin Film Thickness'] for l in node.outputs['Result'].links):
                    node.inputs['To Min'].default_value=270;node.inputs['To Max'].default_value=650
        else:
            set_value(mat,'Roughness',.235);set_value(mat,'Coat Weight',.06);set_value(mat,'Specular IOR Level',.38)
            set_value(mat,'Sheen Weight',.12);mat['launchSheenWeight']=.12
        tex,uvname=bake(ob,mat,prefix+'-normal',normal=True,size=2048 if ob.name=='Structured armhole jacket' else 1024)
        n=mat.node_tree.nodes.new('ShaderNodeNormalMap');n.uv_map=uvname;mat.node_tree.links.new(tex.outputs['Color'],n.inputs['Color']);mat.node_tree.links.new(n.outputs['Normal'],bs.inputs['Normal'])
        results.append({'material':mat.name,'normalImage':tex.image.name,'roughness':float(bs.inputs['Roughness'].default_value),'coatWeight':float(bs.inputs['Coat Weight'].default_value)})
    return results


def female_zipper_materials():
    objects={o.name:o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('jacketHardware')}
    with bpy.data.libraries.load(str(OUT/'male-groom-refined.blend'),link=False) as (src,dst):dst.objects=list(objects)
    refs={name:ob for name,ob in zip(objects,dst.objects)}
    lime=bpy.data.materials['PLURR lime knit trim'];tape=material('PLURR graphite zipper tape',(.009,.007,.014),.48)
    metal=material('PLURR pale gold zipper teeth',(.52,.40,.21),.25,.82);report={}
    for name,ob in objects.items():
        ref=refs[name];assert len(ob.data.vertices)==len(ref.data.vertices) and len(ob.data.polygons)==len(ref.data.polygons),name
        for a,b in zip(ob.data.polygons,ref.data.polygons):assert tuple(a.vertices)==tuple(b.vertices),name
        indices=[f.material_index for f in ref.data.polygons];assert max(indices)<3
        ob.data.materials.clear()
        for m in [lime,tape,metal]:ob.data.materials.append(m)
        for face,index in zip(ob.data.polygons,indices):face.material_index=index
        report[name]={str(index):indices.count(index) for index in sorted(set(indices))}
    for ob in refs.values():bpy.data.objects.remove(ob,do_unlink=True)
    return report


def reattach_hardware(rig,coat):
    # Hip-adjacent samples may interpolate five influences. Pelvis and spine_01
    # have identical transforms in these clips, so combine them before keeping
    # four weights; otherwise the small, moving thigh influence is discarded.
    difference=0.
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range,9):
            A.sample(bpy.context.scene,float(frame))
            matrices=[np.array(rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()) for n in ['pelvis','spine_01']]
            difference=max(difference,float(np.abs(matrices[0]-matrices[1]).max()))
    assert difference<1e-5,('Pelvis/spine motion equivalence changed',difference)
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(bpy.context.scene,1)
    disabled=[(m,m.show_viewport) for m in coat.modifiers if m.type!='ARMATURE']
    for m,_ in disabled:m.show_viewport=False
    A.update();surface=Surface(rig,coat);keys=list(coat.data.shape_keys.key_blocks)
    source=np.array([[list(v.co) for v in k.data] for k in keys])
    coat_skin=np.einsum('vg,gij->vij',surface.weights,surface.mats)
    world_keys=np.einsum('vij,kvj->kvi',coat_skin,np.concatenate([source,np.ones((*source.shape[:2],1))],axis=2))[:,:,:3]
    report={}
    for ob in [o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('jacketHardware')]:
        assert [k.name for k in ob.data.shape_keys.key_blocks]==[k.name for k in keys],ob.name
        points=array(ob,True);ids=[];bc=[];offset=[]
        for p in points:
            hit,_,index,_=surface.tree.find_nearest(Vector(p));tri=surface.faces[index]
            bary=barycentric(np.array(hit),surface.array[tri]);ids.append(tri);bc.append(bary);offset.append(p-bary@surface.array[tri])
        ids=np.array(ids);bc=np.array(bc);offset=np.array(offset)
        weights=np.einsum('vi,vij->vj',bc,surface.weights[ids])
        pelvis=surface.names.index('pelvis');spine=surface.names.index('spine_01')
        weights[:,spine]+=weights[:,pelvis];weights[:,pelvis]=0
        keep=np.argsort(weights,axis=1)[:,-4:];bounded=np.zeros_like(weights)
        np.put_along_axis(bounded,keep,np.take_along_axis(weights,keep,axis=1),axis=1)
        dropped=float(np.max(weights.sum(1)-bounded.sum(1)));weights=bounded/bounded.sum(1)[:,None]
        assert dropped<.05,(ob.name,dropped)
        skin=np.einsum('vg,gij->vij',weights,surface.mats)
        target=np.einsum('vi,kvij->kvj',bc,world_keys[:,ids])+offset[None,:,:]
        bound=np.linalg.solve(skin[None,:,:,:],np.concatenate([target,np.ones((*target.shape[:2],1))],axis=2)[...,None])[:,:,:3,0]
        inv=np.linalg.inv(np.asarray(ob.matrix_world))
        bound=np.einsum('ij,kvj->kvi',inv,np.concatenate([bound,np.ones((*bound.shape[:2],1))],axis=2))[:,:,:3]
        for key,values in zip(ob.data.shape_keys.key_blocks,bound):key.data.foreach_set('co',values.astype(np.float32).ravel())
        ob.data.vertices.foreach_set('co',bound[0].astype(np.float32).ravel());ob.data.update()
        for name in surface.names:
            g=ob.vertex_groups.get(name)
            if g:ob.vertex_groups.remove(g)
        for j,name in enumerate(surface.names):
            selected=np.flatnonzero(weights[:,j]>1e-8)
            if len(selected):
                g=ob.vertex_groups.new(name=name)
                for i in selected:g.add([int(i)],float(weights[i,j]),'REPLACE')
        ob['jacketFinishAttachment']=coat.name;A.update()
        drift=float(np.linalg.norm(array(ob,True)-points,axis=1).max()*1000)
        assert drift<.01,(ob.name,drift)
        report[ob.name]={'maximumDroppedWeight':dropped,'maximumRestPoseChangeMm':drift,'correctiveKeys':len(keys),'combinedInfluences':['pelvis','spine_01'],'maximumSampledTransformDifference':difference}
    for m,state in disabled:m.show_viewport=state
    A.update();return report


def render_view(sex,label):
    scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.94
    scene.view_settings.exposure=-.8;scene.render.resolution_x=1000;scene.render.resolution_y=1050
    for view,x,y in [('front',.05,-4),('oblique',2.2,-4),('back',-.15,4)]:
        cam.location=(x,y,1.40);review.look_at(cam,Vector((0,-.015,1.27 if sex=='male' else 1.24)))
        scene.render.filepath=str(OUT/f'{sex}-jacket-{label}-{view}.png');bpy.ops.render.render(write_still=True)


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-groom-refined.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    if render:render_view(sex,'before')
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')!='jacket'}
    coat=bpy.data.objects['Structured armhole jacket'];initial=array(coat).copy();disabled=[]
    for mod in coat.modifiers:
        if mod.type!='ARMATURE':disabled.append((mod,mod.show_viewport,mod.show_render));mod.show_viewport=False;mod.show_render=False
    A.update();report={};report['folds'],boundary=sculpt(coat,rig,sex)
    report['fit']=fit([coat],rig,{coat.name:boundary})
    assert np.array_equal(array(coat)[list(boundary)],initial[list(boundary)])
    delta=array(coat)-initial;tree=KDTree(len(delta))
    for i,point in enumerate(initial):tree.insert(Vector(point),i)
    tree.balance();report['hardwareFollowed']=[]
    for ob in scene.objects:
        if ob.type!='MESH' or not ob.get('jacketHardware'):continue
        offsets=[]
        for point in array(ob):
            near=tree.find_n(Vector(point),6);ids=[i for _,i,_ in near];w=np.array([1/(.005+d)**2 for _,_,d in near]);offsets.append(np.sum(delta[ids]*w[:,None],axis=0)/w.sum())
        offset_keys(ob,np.array(offsets));report['hardwareFollowed'].append(ob.name)
    for mod,view,ren in disabled:mod.show_viewport=view;mod.show_render=ren
    A.update();report['hardwareRebinding']=reattach_hardware(rig,coat)
    report['materials']=surface_finish(coat,rig,sex)
    if sex=='female':
        report['materials']+=surface_finish(bpy.data.objects['PLURR folded hood'],rig,sex)
        report['zipperRegions']=female_zipper_materials()
    for name,p in retained.items():assert np.array_equal(p,array(bpy.data.objects[name])),name
    report['preservedNonJacketMeshes']=len(retained);report['preservedBoundaryVertices']=len(boundary)
    report['maximumShellChangeMm']=float(np.linalg.norm(array(coat)-initial,axis=1).max()*1000)
    report['jacketCageVertices']=len(coat.data.vertices)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-jacket-refined.blend'),compress=True)
    (OUT/f'{sex}-jacket-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:render_view(sex,'pilot')
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(args.sex,args.render)
