"""Refine garment drape without changing body geometry or deformation owners.

Connection map: jacket collar, cuff and front opening boundaries retain exact
positions. The rear hem flares to clear the measured waistband and fittings.
Existing sewn hardware follows the measured jacket displacement
field. Trouser waist and cuffs stay fixed; regenerated cargo details use the
resulting surface later in the build. Existing corrective deltas are retained.
"""
import argparse,json,sys,math
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from complete_pair_geometry import Surface,skin_weights,smooth
import audit_rigged_jacket_sleeves as A


def adjacency(ob):
    edges=np.array([list(e.vertices) for e in ob.data.edges]);a=np.r_[edges[:,0],edges[:,1]];b=np.r_[edges[:,1],edges[:,0]]
    degree=np.bincount(a,minlength=len(ob.data.vertices))
    counts={tuple(sorted(e.vertices)):0 for e in ob.data.edges}
    for p in ob.data.polygons:
        for edge in p.edge_keys:counts[tuple(sorted(edge))]+=1
    boundary={i for e,count in counts.items() if count!=2 for i in e}
    return a,b,degree,boundary


def diffuse(p,ob,mask,iterations,limit):
    a,b,degree,boundary=adjacency(ob);mask=mask.copy();mask[list(boundary)]=0
    q=p.copy()
    for _ in range(iterations):
        average=np.zeros_like(q);np.add.at(average,a,q[b]);average/=np.maximum(degree,1)[:,None]
        q+=(average-q)*(.40*mask)[:,None]
    delta=q-p;length=np.linalg.norm(delta,axis=1)
    delta*=np.minimum(1,limit/np.maximum(length,1e-9))[:,None]
    return p+delta,boundary


def offset_keys(ob,delta):
    if ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:
            co=np.array([list(v.co) for v in key.data]);key.data.foreach_set('co',(co+delta).astype(np.float32).ravel())
    ob.data.vertices.foreach_set('co',(array(ob)+delta).astype(np.float32).ravel());ob.data.update();A.update()


def sculpt(ob,rig,sex):
    surf=Surface(rig,bpy.data.objects['AvatarBody']);raw=array(ob).copy();p=array(ob,True);coat=ob.name=='Structured armhole jacket'
    if coat:
        shoulder=np.mean([rig.pose.bones['upperarm_'+side].head.z for side in ['l','r']])
        mask=smooth((np.abs(p[:,0])-.105)/.060)*smooth((p[:,2]-(shoulder-.16))/.075)*smooth((shoulder+.14-p[:,2])/.055)
        wrist=np.mean([rig.pose.bones['lowerarm_'+side].tail.z for side in ['l','r']])
        sleeve=.40*smooth((np.abs(p[:,0])-.145)/.065)*smooth((p[:,2]-wrist-.035)/.055)*smooth((shoulder-.08-p[:,2])/.055)
        mask=np.maximum(mask,sleeve)
        q,boundary=diffuse(p,ob,mask,20,.014)
        pants=Surface(rig,bpy.data.objects['AvatarBottoms_cargo-pants']);waist=pants.array[:,2].max()
        belt=bpy.data.objects['Launch cargo belt'];mods=[(m,m.show_viewport) for m in belt.modifiers if m.type!='ARMATURE']
        for m,_ in mods:m.show_viewport=False
        A.update();belt_ring=array(belt,True).reshape(2,64,3).mean(axis=0)
        for m,state in mods:m.show_viewport=state
        A.update()
        angles=np.arctan2(belt_ring[:,0],-(belt_ring[:,1]+.025))%math.tau
        radii=np.sqrt(belt_ring[:,0]**2+(belt_ring[:,1]+.025)**2);order=np.argsort(angles)
        angles,radii=angles[order],radii[order]
        flared=[]
        for i,point in enumerate(q):
            if abs(point[0])>.19 or point[2]>waist+.10 or point[2]<waist-.18:continue
            amount=float(smooth((point[1]+.04)/.05)*smooth((waist+.10-point[2])/.08))
            if amount<=0:continue
            origin=Vector((0,-.025,min(point[2],waist-.025)))
            direction=Vector((point[0],point[1]+.025,0)).normalized()
            hit,_,_,_=pants.tree.ray_cast(origin,direction,.35)
            theta=math.atan2(direction.x,-direction.y)%math.tau
            belt_radius=np.interp(theta,np.r_[angles[-1]-math.tau,angles,angles[0]+math.tau],np.r_[radii[-1],radii,radii[0]])
            target=max(belt_radius+.012,(hit-origin).dot(direction)+.006 if hit is not None else 0)
            required=target-Vector((point[0],point[1]+.025,0)).length
            if required>0:
                q[i]+=np.array(direction)*min(.035,required)*amount
                if i in boundary:flared.append(i)
        boundary=boundary-set(flared)
    else:
        pants_surface=Surface(rig,ob)
        knee=np.mean([rig.pose.bones['calf_'+side].head.z for side in ['l','r']])
        ankle=np.mean([rig.pose.bones['calf_'+side].tail.z for side in ['l','r']])
        mask=smooth((p[:,2]-(ankle+.095))/.070)*smooth((knee+.28-p[:,2])/.10)
        q,boundary=diffuse(p,ob,mask,10,.006)
        # A measured loft bridges the posterior fold region. Its endpoints
        # come from the existing upper-thigh and calf cross sections.
        for i,point in enumerate(q):
            if i in boundary:continue
            side='l' if point[0]>0 else 'r';thigh=rig.pose.bones['thigh_'+side];calf=rig.pose.bones['calf_'+side]
            low=calf.head.z-.18;high=calf.head.z+.20;z=point[2]
            if not low<z<high:continue
            def axis(h):
                bone=thigh if h>calf.head.z else calf
                return bone.head.lerp(bone.tail,(h-bone.head.z)/(bone.tail.z-bone.head.z))
            center=axis(z);direction=Vector((point[0]-center.x,point[1]-center.y,0)).normalized()
            amount=float(smooth((direction.y-.05)/.65)*smooth((z-low)/.045)*smooth((high-z)/.045))
            if amount<=0:continue
            radii=[]
            for height in [low,high]:
                origin=axis(height);hit,_,_,_=pants_surface.tree.ray_cast(origin,direction,.4)
                if hit is None:break
                radii.append((hit-origin).length)
            if len(radii)!=2:continue
            t=(z-low)/(high-low);radius=radii[0]*(1-t)+radii[1]*t+.003*math.sin(math.pi*t)
            hit,_,_,_=surf.tree.ray_cast(center,direction,.4)
            if hit is not None:radius=max(radius,(hit-center).length+.012)
            target=np.array(center+direction*radius);target[2]=z
            q[i]+=(target-q[i])*amount
        for side,sign in [('l',1),('r',-1)]:
            thigh=rig.pose.bones['thigh_'+side];calf=rig.pose.bones['calf_'+side]
            kz=calf.head.z;az=calf.tail.z
            for i,point in enumerate(p):
                if point[0]*sign<0 or i in boundary:continue
                z=point[2];bone=thigh if z>kz else calf
                center=bone.head.lerp(bone.tail,(z-bone.head.z)/(bone.tail.z-bone.head.z))
                radial=point[:2]-np.array(center)[:2];length=np.linalg.norm(radial)
                if length<.01:continue
                theta=math.atan2(radial[0]*sign,-radial[1])
                amount=0
                # Each fold has a broad crest and shallower trough, fades round
                # the leg and ends before forming a uniform horizontal ring.
                for j,(height,slope,width,amp) in enumerate([(kz-.082,.036,.024,.006),(kz+.024,-.030,.029,.0045),(az+.18,-.027,.024,.0055),(az+.255,.020,.028,.004)]):
                    phase=z-height-slope*math.sin(theta+(.7 if side=='l' else -.4))
                    envelope=math.exp(-(theta/(1.55 if j%2 else 1.8))**4)
                    crest=math.exp(-(phase/width)**2)-.45*math.exp(-((phase+width*1.55)/(width*.72))**2)
                    amount+=amp*crest*envelope
                q[i,:2]+=radial/length*amount*mask[i]
    weights=skin_weights(ob,surf.names);weight_change=0
    if not coat:
        assert ob.data.shape_keys is None,'Trouser rebinding precedes corrective authoring.'
        hits=[]
        for point in q:
            side='l' if point[0]>0 else 'r';thigh=rig.pose.bones['thigh_'+side];calf=rig.pose.bones['calf_'+side]
            bone=thigh if point[2]>calf.head.z else calf
            center=bone.head.lerp(bone.tail,(point[2]-bone.head.z)/(bone.tail.z-bone.head.z))
            if point[2]>thigh.head.z-.04:center=Vector((0,-.025,point[2]))
            direction=Vector((point[0]-center.x,point[1]-center.y,0)).normalized()
            hit,_,_,_=surf.tree.ray_cast(center,direction,.4);hits.append(np.array(hit) if hit is not None else point)
        new_weights=surf.weights_at(hits)
        # Spread the knee blend across neighbouring cloth rows so sewn seams
        # and the carrier interpolate together through the running bend.
        aa,bb,degree,_=adjacency(ob)
        knee_z=np.mean([rig.pose.bones['calf_'+side].head.z for side in ['l','r']])
        blend=smooth((.20-np.abs(q[:,2]-knee_z))/.07);blend[list(boundary)]=0
        for _ in range(8):
            average=np.zeros_like(new_weights);np.add.at(average,aa,new_weights[bb]);average/=np.maximum(degree,1)[:,None]
            new_weights+=(average-new_weights)*(.40*blend)[:,None]
        keep=np.argsort(new_weights,axis=1)[:,-4:];bounded=np.zeros_like(new_weights)
        np.put_along_axis(bounded,keep,np.take_along_axis(new_weights,keep,axis=1),axis=1)
        new_weights=bounded/bounded.sum(axis=1)[:,None]
        # Boundary weights retain their proven cuff and waistband behavior.
        ids=list(boundary);new_weights[ids]=weights[ids]
        weight_change=float(np.abs(new_weights-weights).sum(axis=1).max())
        for j,name in enumerate(surf.names):
            group=ob.vertex_groups.get(name)
            if group:group.remove(list(range(len(q))))
            indices=np.flatnonzero(new_weights[:,j]>1e-8)
            if len(indices):
                group=group or ob.vertex_groups.new(name=name)
                for i in indices:group.add([int(i)],float(new_weights[i,j]),'REPLACE')
        bound=surf.bind(q,new_weights);bound[ids]=raw[ids]
        ob.data.vertices.foreach_set('co',bound.astype(np.float32).ravel());ob.data.update();A.update()
    else:
        delta=surf.bind(q,weights)-surf.bind(p,weights);offset_keys(ob,delta)
    return {'maximumSculptDisplacementMm':float(np.linalg.norm(q-p,axis=1).max()*1000),'verticesChanged':int((np.linalg.norm(q-p,axis=1)>1e-7).sum()),'preservedBoundaryVertices':len(boundary),'flaredRearHemVertices':len(flared) if coat else 0,'maximumSkinWeightL1Change':weight_change},boundary


def fit(objects,rig,boundaries):
    scene=bpy.context.scene;body=bpy.data.objects['AvatarBody'];names=list(rig.data.bones)
    names=[n.name for n in names];weights={o.name:skin_weights(o,names) for o in objects}
    history=[]
    for iteration in range(32):
        count=0;deepest=0
        for clip in ['idle','walk','run']:
            rig.animation_data.action=bpy.data.actions[clip]
            for frame in np.linspace(*rig.animation_data.action.frame_range,9):
                A.sample(scene,float(frame));bp,bf=A.H.geometry(body);tree=BVHTree.FromPolygons(bp,bf,all_triangles=True)
                mats=np.array([rig.matrix_world@rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()@rig.matrix_world.inverted() for n in names])
                for ob in objects:
                    q=array(ob,True);delta=np.zeros_like(q)
                    for i,point in enumerate(q):
                        if i in boundaries[ob.name]:continue
                        hit,n,_,_=tree.find_nearest(Vector(point));distance=(Vector(point)-hit).dot(n)
                        if distance<.003:
                            delta[i]=np.array(n)*min(.007,.0038-distance);count+=1;deepest=min(deepest,distance)
                    if np.any(delta):
                        skin=np.einsum('vg,gij->vij',weights[ob.name],mats)
                        offset_keys(ob,np.linalg.solve(skin[:,:3,:3],delta[...,None])[:,:,0])
        row={'iteration':iteration,'adjustedVertexSamples':count,'deepestBeforeAdjustmentMm':deepest*1000};history.append(row);print('DRAPE_FIT',row,flush=True)
        if count==0:break
    assert count==0,history[-1]
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    return history


def run(sex,source,render):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and o.get('avatarSlot') in ['body','hair','shoes']}
    objects=[bpy.data.objects[n] for n in ['Structured armhole jacket','AvatarBottoms_cargo-pants']]
    initial={o.name:array(o).copy() for o in objects};disabled=[]
    for ob in objects:
        for mod in ob.modifiers:
            if mod.type!='ARMATURE':disabled.append((mod,mod.show_viewport));mod.show_viewport=False
    A.update();report={'source':source,'sculpt':{}};boundaries={}
    for ob in objects:report['sculpt'][ob.name],boundaries[ob.name]=sculpt(ob,rig,sex)
    report['fit']=fit(objects,rig,boundaries)
    for ob in objects:
        ids=list(boundaries[ob.name]);assert np.array_equal(array(ob)[ids],initial[ob.name][ids]),ob.name
    coat=objects[0];delta=array(coat)-initial[coat.name];tree=KDTree(len(delta))
    for i,point in enumerate(initial[coat.name]):tree.insert(Vector(point),i)
    tree.balance();report['hardwareFollowed']=[]
    for ob in scene.objects:
        if ob.type!='MESH' or not ob.get('jacketHardware'):continue
        offsets=[]
        for point in array(ob):
            near=tree.find_n(Vector(point),6);ids=[i for _,i,_ in near];w=np.array([1/(.005+d)**2 for _,_,d in near]);offsets.append(np.sum(delta[ids]*w[:,None],axis=0)/w.sum())
        offset_keys(ob,np.array(offsets));report['hardwareFollowed'].append(ob.name)
    for mod,visible in disabled:mod.show_viewport=visible
    A.update()
    for name,points in retained.items():assert np.array_equal(points,array(bpy.data.objects[name])),name
    report['preservedBodyHairShoeMeshes']=len(retained)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-drape-refined.blend'),compress=True)
    (OUT/f'{sex}-drape-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=1.08
        scene.view_settings.exposure=-.8;scene.render.resolution_x=950;scene.render.resolution_y=1100
        cam.location=(.50,-4,1.34);review.look_at(cam,Vector((0,-.02,1.12)))
        scene.render.filepath=str(OUT/f'{sex}-drape-refined.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--source',default='head-refined');p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.source,a.render)
