"""Give the front sweep layered relief and a few longer forehead wisps.

Connection map: swept scalp cards retain their first three pairs and rear
half; loose front cards retain their first three rows under the goggles.
Existing free surfaces follow the cap/skin with millimeter clearance and stay
behind the lenses. Braid, pony, rig origins, UVs and weights remain unchanged.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands

NAMES=['PLURR swept scalp groom','PLURR loose brunette front locks']


def shape_front_sweep(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton']
    body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    cap=Surface(rig,bpy.data.objects['Complete scalp']).tree
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    braid=Surface(rig,bpy.data.objects['PLURR reference temple braid']).tree
    counts={};fitted=0
    def fit(point,skin_margin=.003):
        nonlocal fitted
        old=point.copy()
        for _ in range(2):
            skin,n,_,dist=body.find_nearest(Vector(point))
            if (Vector(point)-skin).dot(n)<skin_margin:point[:]=skin+n*skin_margin
            hit,_,_,_=cap.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
            if hit is not None:point[1]=min(point[1],hit.y-.0015)
            front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
            if front is not None:point[1]=max(point[1],front.y+.0015)
        fitted+=int(np.linalg.norm(point-old)>1e-8)
        return point
    for name in NAMES:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy();attr=ob.data.color_attributes['ReferenceHairTint']
        colors=np.array([v.color[:] for v in attr.data]);old_colors=colors.copy();selected=[]
        for i,ids in enumerate(islands(ob)):
            if name==NAMES[0]:
                r=p[ids].reshape(24,2,3);old=r.mean(1)
                front=float(smooth((-old[0,1]-.065)/.038))
                # Leave the plait's channel alone; relief is for the exposed
                # forehead sweep, fading out before the gathered crown.
                if front<.04:continue
                free=smooth((np.arange(24)-2)/4)*(1-smooth((np.arange(24)-7)/5))
                for j in range(3,12):
                    point=old[j];hit,n,_,_=cap.find_nearest(Vector(point))
                    _,_,_,bd=braid.find_nearest(Vector(point));clear=float(smooth((bd-.009)/.015))
                    lift=(.0010+.0022*(.5+.5*math.sin(i*2.399963)))*front*free[j]*clear
                    if lift>1e-8:
                        for k in range(2):q[ids[j*2+k]]=fit(r[j,k]+np.array(n)*lift)
                    gain=1+.30*front*free[j]*(.55+.45*math.sin(i*2.399963)**2)
                    colors[ids[j*2:j*2+2],:3]=np.minimum(old_colors[ids[j*2:j*2+2],:3]*gain,1)
                selected.append(ids[0])
            else:
                r=p[ids].reshape(28,3,3);old=(r[:,0]+r[:,2])*.5;half=(r[:,2]-r[:,0])*.5
                relief=r[:,1]-old;lock=i//5;layer=i%5
                u=np.clip((np.arange(28)-2)/25,0,1);free=smooth(u);bell=np.sin(math.pi*u)**2
                length=[.014,.010,.006,.010,.007,.008,.004][lock]+.0007*(layer-2)
                c=old.copy();c[:,2]-=length*free;c[:,0]+=(.0025*math.sin(lock*1.7)+.0005*(layer-2))*free
                c[:,0]+=.0013*(layer-2)*bell
                c[:,1]-=.0025*bell
                h=half.copy();rel=relief.copy()
                for j in range(3,28):
                    a=Vector(old[min(j+1,27)]-old[j-1]).normalized();b=Vector(c[min(j+1,27)]-c[j-1]).normalized()
                    rotation=a.rotation_difference(b);h[j]=(rotation@Vector(half[j]))*(1-.58*smooth(u[j]/.5));rel[j]=rotation@Vector(relief[j])
                rr=np.stack([c-h,c+rel,c+h],axis=1);rr[:3]=r[:3]
                for j in range(3,28):
                    for k in range(3):rr[j,k]=fit(rr[j,k])
                    colors[ids[j*3:j*3+3],:3]=np.minimum(old_colors[ids[j*3:j*3+3],:3]*(1+.16*free[j]),1)
                q[ids]=rr.reshape(-1,3);selected.append(ids[0])
        previous=dict(report[name]);old_map=mapping.get(name);saved_uv=old_map.get('addedUv') if old_map else None
        apply(ob,q,mapping,report)
        if saved_uv is not None:mapping[name]['addedUv']=saved_uv
        if old_map is None:mapping.pop(name)
        attr.data.foreach_set('color',colors.astype(np.float32).ravel())
        if name in mapping:mapping[name]['addedColors']=colors.tolist()
        report[name].update({k:v for k,v in previous.items() if k not in report[name]})
        counts[name]={'selectedCardFirstVertices':selected,'cards':len(selected),
            'changedVertices':int(np.count_nonzero(np.linalg.norm(q-p,axis=1)>1e-7)),
            'maximumMovementMm':float(np.linalg.norm(q-p,axis=1).max()*1000)}
    report['frontSweep']={'meshes':counts,'fittedVertices':fitted,'retainedScalpRootPairs':3,
        'retainedFrontRootRows':3,'retainedScalpRowsFrom':12,'addedGeometry':0,'textureBytesRetained':True}


def refresh_front_addition(native,before):
    """Refresh the existing addition's buffers without rebuilding materials."""
    from mathutils.kdtree import KDTree
    ob=bpy.data.objects[NAMES[1]];me=ob.data;me.update()
    layer=me.uv_layers.active.data;tint=me.color_attributes['ReferenceHairTint']
    uv=np.zeros((len(me.vertices),2))
    for loop in me.loops:uv[loop.vertex_index]=layer[loop.index].uv[:]
    tree=KDTree(len(before))
    for i,v in enumerate(before):tree.insert(Vector(v),i)
    tree.balance();positions=[];normals=[];colors=[];maximum=0
    addition=next(a for a in native['additions'] if a['name']==NAMES[1])
    # Blender may choose a different diagonal when a quad bends. Transfer
    # through the preceding source so the delivered index/UV order is exact.
    for old,texuv in zip(addition['positions'],addition['uv']):
        point=Vector((old[0],-old[2],old[1]));candidates=tree.find_range(point,.000002)
        candidates=[c for c in candidates if np.max(np.abs(uv[c[1]]-[texuv[0],1-texuv[1]]))<1e-6]
        assert candidates,(old,texuv)
        _,vi,distance=min(candidates,key=lambda c:c[2]);maximum=max(maximum,distance)
        v=me.vertices[vi].co;n=me.vertices[vi].normal
        positions.append([v.x,v.z,-v.y]);normals.append([n.x,n.z,-n.y]);colors.append(list(tint.data[vi].color))
    addition.update(positions=positions,normals=normals,colors=colors)
    print('FRONT_ADDITION_TRANSFER_MAX_MM',maximum*1000,flush=True)
