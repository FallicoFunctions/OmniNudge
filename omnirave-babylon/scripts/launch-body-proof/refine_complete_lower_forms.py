"""Gather trouser hems and shape shoe lasts on the retained rig.

Connection map: each trouser hem gathers around its measured calf surface.
Male hems overlap the sneaker shaft; female hems overlap the sock top.
The elastic band is part of the trouser mesh, with shared vertices and weights.
Sock folds grow outward from the measured body. Sneaker overlays are rebuilt
from the reshaped carrier, preserving the original sole's ground plane.
"""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array, material
from complete_pair_geometry import Surface, skin_weights, smooth


def body_distance(point,tree,bounds):
    """Resolve misleading nearest-face signs with bounds and ray containment.

    Concave soles can select an upward-facing toe triangle for a point below
    the body. A negative plane distance alone does not establish containment.
    Three non-axis-aligned rays disambiguate remaining negative candidates.
    """
    point=Vector(point);hit,normal,_,distance=tree.find_nearest(point)
    signed=(point-hit).dot(normal)
    if signed>=0:return signed,normal,False
    value=np.asarray(point)
    if np.any(value<bounds[0]) or np.any(value>bounds[1]):return distance,normal,True
    votes=0
    for direction in [(1,.371,.219),(-.283,1,.417),(.193,-.327,1)]:
        direction=Vector(direction).normalized();origin=point;crossings=0
        for _ in range(96):
            near,_,_,_=tree.ray_cast(origin,direction,4.)
            if near is None:break
            crossings+=1;origin=near+direction*.000002
        else:raise AssertionError('Body containment ray did not terminate')
        votes+=crossings%2
    return (signed,normal,False) if votes>=2 else (distance,normal,True)


def lower_trousers(rig, sex):
    ob=bpy.data.objects['AvatarBottoms_cargo-pants']
    assert ob.data.shape_keys is None
    mods=[(m,m.show_viewport) for m in ob.modifiers if m.type!='ARMATURE']
    for m,_ in mods:m.show_viewport=False
    bpy.context.view_layer.update()
    before=len(ob.data.vertices);posed=array(ob,True)
    bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table()
    edges=[e for e in bm.edges if all(posed[v.index,2]<.43 for v in e.verts)]
    bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
    bm.to_mesh(ob.data);bm.free();ob.data.update();bpy.context.view_layer.update()
    weights=skin_weights(ob,list(rig.data.bones.keys()))
    for i in range(before,len(ob.data.vertices)):
        row=weights[i];keep=np.argsort(row)[-4:];total=row[keep].sum();assert total>0
        for j,name in enumerate(rig.data.bones.keys()):
            group=ob.vertex_groups.get(name)
            if group:
                if j in keep and row[j]>1e-8:group.add([i],float(row[j]/total),'REPLACE')
                else:group.remove([i])
    bpy.context.view_layer.update();p=array(ob,True);q=p.copy()
    bm=bmesh.new();bm.from_mesh(ob.data)
    boundary={v.index for e in bm.edges if e.is_boundary for v in e.verts};bm.free()
    body=Surface(rig,bpy.data.objects['AvatarBody']);report={}
    for side,sign in [('l',1),('r',-1)]:
        calf=rig.pose.bones['calf_'+side]
        ids=np.flatnonzero((p[:,0]*sign>0)&(p[:,2]<.43))
        old_hem=float(p[ids,2].min());hem=.231 if sex=='male' else .228
        rim=[i for i in boundary if p[i,0]*sign>0 and p[i,2]<.35]
        angles=[]
        for i in rim:
            center=calf.head.lerp(calf.tail,(p[i,2]-calf.head.z)/(calf.tail.z-calf.head.z))
            angles.append(math.atan2((p[i,0]-center.x)*sign,-(p[i,1]-center.y)))
        order=np.argsort(angles);angles=np.array(angles)[order];heights=p[np.array(rim)[order],2]
        for i in ids:
            z=p[i,2]
            center=calf.head.lerp(calf.tail,(z-calf.head.z)/(calf.tail.z-calf.head.z))
            theta=math.atan2((p[i,0]-center.x)*sign,-(p[i,1]-center.y))
            local_hem=np.interp(theta,np.r_[angles[-1]-math.tau,angles,angles[0]+math.tau],np.r_[heights[-1],heights,heights[0]])
            h=max(0,z-local_hem)
            # A lift must fade over more than 1.5 times its distance, or the
            # smoothstep's derivative reverses the order of neighbouring rows.
            fade=max(.055,abs(hem-local_hem)*2+.020)
            z+=(hem-local_hem)*float(1-smooth(h/fade))
            h=max(0,z-hem)
            center=calf.head.lerp(calf.tail,(z-calf.head.z)/(calf.tail.z-calf.head.z));center.z=z
            radial=Vector((p[i,0]-center.x,p[i,1]-center.y,0));radius=radial.length;direction=radial.normalized()
            theta=math.atan2(direction.x*sign,-direction.y)
            hit,_,_,_=body.tree.ray_cast(center,direction,.18)
            assert hit is not None,(sex,side,z)
            required=(hit-center).length+.009
            band=float(1-smooth((h-.016)/.032))
            target=radius+(required-radius)*band
            # A raised, irregular gathering ridge meets the elastic band.
            target+=(.005 if sex=='male' else .009)*math.exp(-((h-.037-.006*math.sin(theta*3+sign))/.014)**2)
            for j,(height,width,amp) in enumerate([(.060,.011,.007),(.098,.015,.008),(.148,.017,.006)]):
                angle=(theta-[-.7,.6,-1.1][j]-sign*.22+math.pi)%math.tau-math.pi
                phase=h-height-.016*math.sin(theta*(1+j%2)+j+sign*.4)
                envelope=.12+.88*math.exp(-(angle/1.5)**2)
                profile=math.exp(-(phase/width)**2)-.25*math.exp(-((phase+width*1.6)/(width*.8))**2)
                target+=amp*(.6 if sex=='male' else 1.2)*profile*envelope*float(smooth((h-.02)/.03))
            target+=.0006*(.5+.5*math.cos(theta*36))*band
            q[i]=np.asarray(center+direction*target)
        report[side]={'originalHemM':old_hem,'hemM':hem,'vertices':len(ids)}
    # The original long trouser hems carried foot weights. A gathered hem sits
    # on the calf, so retaining those weights makes individual cuff vertices
    # follow the ankle bend and forces the clearance fitter to make spikes.
    names=list(rig.data.bones.keys());weights=skin_weights(ob,names)
    ids=np.flatnonzero(p[:,2]<.43)
    transferred=body.weights_at(q[ids]);blend=smooth((.43-p[ids,2])/.10)
    weights[ids]+=(transferred-weights[ids])*blend[:,None]
    for i in ids:
        keep=np.argsort(weights[i])[-4:];row=np.zeros(len(names));row[keep]=weights[i,keep];row/=row.sum();weights[i]=row
        for j,name in enumerate(names):
            group=ob.vertex_groups.get(name)
            if row[j]>1e-8:
                group=group or ob.vertex_groups.new(name=name);group.add([int(i)],float(row[j]),'REPLACE')
            elif group:group.remove([int(i)])
    bound=array(ob).copy();bound[ids]=body.bind(q[ids],weights[ids])
    ob.data.vertices.foreach_set('co',bound.astype(np.float32).ravel());ob.data.update();bpy.context.view_layer.update()
    band=material(f'Launch {sex} elastic trouser cuffs',(.012,.015,.018) if sex=='male' else (.008,.006,.013),.83)
    band.node_tree.nodes['Principled BSDF'].inputs['Sheen Weight'].default_value=.24
    band['launchSheenWeight']=.24
    ob.data.materials.append(band);material_id=len(ob.data.materials)-1
    band_faces=0
    for face in ob.data.polygons:
        points=q[list(face.vertices)]
        if points[:,2].mean()<(.252 if sex=='male' else .249):face.material_index=material_id;band_faces+=1
    for m,state in mods:m.show_viewport=state
    bpy.context.view_layer.update()
    report.update(verticesBefore=before,verticesAfter=len(ob.data.vertices),elasticBandFaces=band_faces,calfReboundVertices=len(ids),maximumDisplacementMm=float(np.linalg.norm(q-p,axis=1).max()*1000))
    return report


def reshape_last(shoe,rig,sex,side):
    p=array(shoe,True);assert len(p)==480
    rings=p.reshape(10,48,3);q=rings.copy()
    body=Surface(rig,bpy.data.objects['AvatarBody']);calf=rig.pose.bones['calf_'+side]
    # Keep the sole footprint. Bring the vamp towards the ankle much earlier,
    # leaving a low rounded toe instead of a tall vertical toe wall.
    blends=[0,0,0,0,0,.04,.43,.84,1,1]
    base=rings[4]
    for j in range(5,10):
        z=float(rings[j,:,2].mean())
        center=calf.head.lerp(calf.tail,(z-calf.head.z)/(calf.tail.z-calf.head.z));center.z=z
        for i in range(48):
            a=i*math.tau/48;direction=Vector((math.sin(a),-math.cos(a),0))
            hit,_,_,_=body.tree.ray_cast(center,direction,.18);assert hit is not None
            shaft=np.asarray(hit+direction*.006)
            t=blends[j];q[j,i,:2]=base[i,:2]*(1-t)+shaft[:2]*t
            # The padded collar dips at the sides and rises over the tongue.
            q[j,i,2]=rings[j,i,2]-.006*math.sin(a)**2*float(smooth((j-7)/2))
    target=q.reshape(-1,3);names=list(rig.data.bones.keys())
    weights=skin_weights(shoe,names);body_weights=body.weights_at(target)
    blend=smooth((target[:,2]-.080)/.065)
    weights+=(body_weights-weights)*blend[:,None]
    for i,row in enumerate(weights):
        keep=np.argsort(row)[-4:];bounded=np.zeros(len(names));bounded[keep]=row[keep];bounded/=bounded.sum();weights[i]=bounded
        for j,name in enumerate(names):
            group=shoe.vertex_groups.get(name)
            if bounded[j]>1e-8:
                group=group or shoe.vertex_groups.new(name=name);group.add([i],float(bounded[j]),'REPLACE')
            elif group:group.remove([i])
    shoe.data.vertices.foreach_set('co',body.bind(target,weights).astype(np.float32).ravel());shoe.data.update();bpy.context.view_layer.update()
    return {'originalBoundsM':[p.min(0).tolist(),p.max(0).tolist()],
            'reshapedBoundsM':[q.reshape(-1,3).min(0).tolist(),q.reshape(-1,3).max(0).tolist()],
            'maximumDisplacementMm':float(np.linalg.norm(q.reshape(-1,3)-p,axis=1).max()*1000),
            'soleVerticesUnchanged':bool(np.array_equal(q[:5],rings[:5]))}
