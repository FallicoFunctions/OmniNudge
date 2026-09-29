"""Reference crown details, in the retained character's measured rest space.

Connection map:
* Crown tuft -> existing pony core: retain its exact first vertex pair.
* Scalp cap -> swept cards: displace both by the same surface projection.
* Side braid -> scalp: 0.4–6 mm fiber clearance; tapered ends enter the groom.
* Loose front locks -> the frontal scalp under the goggles: rooted 1 mm over
  the cap, rounded through the middle, tapering beside the temple.
  These are thin hair layers; 5 mm structural overlap would bury the braid.
All new vertices are explicit, with identity object transforms and head weights.
"""
import math, bpy, numpy as np
from mathutils import Vector
from assemble_complete_pair import array, material
from complete_pair_geometry import Surface, create, join, smooth
from add_launch_reference_details import rigid
from refine_complete_groom_finish import islands


def bezier(points,t):
    a,b,c,d=np.asarray(points);t=np.asarray(t)[:,None]
    return a*(1-t)**3+3*b*(1-t)**2*t+3*c*(1-t)*t*t+d*t**3


def refine_crown(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody'])
    # Tighten the broad arch as one coherent volume, including its carrier and
    # inner fibers. The field is exactly zero around all attached root pairs.
    # Moving only the outer cards would expose the old solid core from behind.
    for name in ['PLURR gathered pony bundle','PLURR pony surface fibers',
                 'PLURR pony strands 0','PLURR pony strands 1','PLURR pony strands 2','Polished female flyaways']:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy()
        pull=smooth((-p[:,0]-.035)/.115)
        # Face tendrils share two pony meshes, but occupy the front of the head.
        pull*=smooth((p[:,1]+.015)/.04)
        q[:,0]+=.038*pull;q[:,1]-=.050*pull
        apply(ob,q,mapping,report)
    ob=bpy.data.objects['PLURR pony strands 3'];p=array(ob);q=p.copy()
    for i,ids in enumerate(islands(ob)):
        r=p[ids].reshape(-1,2,3);t=np.linspace(0,1,len(r));root=r[0].mean(0)
        phase=i*2.399963
        tip=root+np.array([.030+.024*math.sin(phase),-.019+.014*math.cos(phase),.012+.024*(.5+.5*math.cos(phase+.5))])
        center=bezier([root,root+[.003,-.012,.026],tip+[-.012,-.006,.012],tip],t)
        center[:,0]+=.0015*math.sin(i*1.7)*np.sin(t*math.pi)
        tangent=np.gradient(center,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
        across=np.cross(tangent,np.tile([0,-1,0],(len(t),1)));across/=np.linalg.norm(across,axis=1)[:,None]
        width=(.0010+.0004*math.sin(i*2.1))*(.3+.7*np.sin(math.pi*t)**.6)*(1-.96*t**3)
        rr=np.stack([center-across*width[:,None],center+across*width[:,None]],axis=1);rr[0]=r[0]
        q[ids]=rr.reshape(-1,3)
    # The new tuft is short. Its secondary motion must shrink with it instead
    # of inheriting the former shoulder-length ponytail's tip displacement.
    apply(ob,q,mapping,report,np.full(len(p),.18))

    for name in ['Complete scalp','PLURR swept scalp groom']:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy()
        for i,point in enumerate(p):
            front=float(smooth((-point[1]-.055)/.045))
            edge=float(smooth((1.699-point[2])/.048))
            dz=front*edge*(.012*math.exp(-((point[0]-.023)/.037)**2)-.006*math.exp(-((point[0]+.049)/.025)**2))
            temple=float(smooth((abs(point[0])-.045)/.020))*math.exp(-((point[1]+.063)/.026)**2)*float(smooth((1.679-point[2])/.035))
            dz-=.012*temple
            if abs(dz)<1e-7:continue
            hit,n,_,_=body.tree.find_nearest(Vector(point));gap=max(.0025,(Vector(point)-hit).dot(n))
            probe=point.copy();probe[2]+=dz
            hit,n,_,_=body.tree.find_nearest(Vector(probe));q[i]=hit+n*gap
        if name.endswith('groom'):
            # Existing front cards receive a common side sweep with a few
            # low rounded locks; their attached root pairs remain on the cap.
            for i,ids in enumerate(islands(ob)):
                r=q[ids].reshape(-1,2,3);t=np.linspace(0,1,len(r));center=r.mean(1);half=(r[:,1]-r[:,0])*.5
                front=float(smooth((-center[0,1]-.08)/.045));arch=np.sin(math.pi*t)**1.4
                for j,point in enumerate(center):
                    if j==0:continue
                    probe=point.copy();probe[0]-=.019*front*arch[j]
                    hit,n,_,_=body.tree.find_nearest(Vector(probe))
                    clearance=.0027+(.004+.0015*math.sin((i//6)*2.4))*front*arch[j]
                    center[j]=hit+n*clearance
                q[ids]=np.stack([center-half,center+half],axis=1).reshape(-1,3)
        apply(ob,q,mapping,report)

    # Three distinct locks at each temple. Their upper sweep comes from the
    # same retained roots; a second curve turns the free ends back toward the
    # cheek. Shared guides keep neighboring fibers together without making
    # all 18 cards on a side collapse into one vertical bar.
    for name in ['PLURR pony strands 0','PLURR pony strands 2']:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy()
        for i,ids in enumerate(islands(ob)):
            if len(ids)!=34:continue
            r=p[ids].reshape(-1,2,3);t=np.linspace(0,1,len(r));old=r.mean(1);root=old[0].copy();half=(r[:,1]-r[:,0])*.5
            side=np.sign(root[0]);order=int(round((abs(root[0])-.014)/.001));group=min(2,order//6)
            spread=(order%6-2.5)*.00030
            # Left locks are longer and sweep further across the temple;
            # the right side opens up around the cheekbone.
            mid=np.array([side*(.056+.004*group)+spread,-.130+.0015*group,1.632+.006*group])
            tip_z=([1.541,1.564,1.584] if side<0 else [1.575,1.554,1.597])[group]
            tip=np.array([side*([.048,.061,.070][group]),-.136+.005*group,tip_z+.003*(order%6)])
            upper=bezier([root,root+[side*.019,-.014,-.006],mid+[-side*.006,-.003,.026],mid],np.minimum(t/.43,1))
            lower=bezier([mid,mid+[side*.013,-.011,-.028],tip+[-side*.014,-.004,.019],tip],np.maximum((t-.43)/.57,0))
            c=np.where((t<=.43)[:,None],upper,lower)
            # The visible length stays in front of the actual face. A ray
            # column avoids ambiguous normals around the concave ear.
            minimum_y=np.full(len(t),np.inf)
            for j in range(1,len(c)):
                hit,_,_,_=body.tree.ray_cast(Vector((c[j,0],-.5,c[j,2])),Vector((0,1,0)),1)
                if hit is not None:minimum_y[j]=hit.y-.004
            c[:,1]=np.minimum(c[:,1],minimum_y)
            widths=[]
            for j in range(len(t)):
                a=Vector(old[min(j+1,len(t)-1)]-old[max(j-1,0)]).normalized()
                b=Vector(c[min(j+1,len(t)-1)]-c[max(j-1,0)]).normalized()
                taper=(1-.70*smooth((t[j]-.28)/.65))*(.65 if group==2 else 1)
                widths.append(np.array(a.rotation_difference(b)@Vector(half[j]))*taper)
            half=np.array(widths)
            rr=np.stack([c-half,c+half],axis=1);rr[0]=r[0];q[ids]=rr.reshape(-1,3)
        apply(ob,q,mapping,report)

    from refine_female_contour import shape_scalp
    shape_scalp(mapping,report,apply)
    scalp=Surface(rig,bpy.data.objects['Complete scalp'])
    # Retained cheek locks are correctly rooted, but their first curved
    # sections arched in front of the goggle lenses. Keep roots and tips exact;
    # tuck only the offending upper pairs behind the measured lens surface.
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    fitted_cards=0
    for name in ['PLURR pony strands 0','PLURR pony strands 2']:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy()
        for ids in islands(ob):
            if len(ids)!=34:continue
            rr=p[ids].reshape(17,2,3).copy();offset=np.zeros(17)
            for j,pair in enumerate(rr):
                if j==0:continue
                for point in pair:
                    hit,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                    if hit is not None:offset[j]=max(offset[j],hit.y+.0015-point[1])
            if offset.max()<=0:continue
            fitted_cards+=1;spread=offset.copy()
            for j in range(1,16):
                spread[j]=max(offset[j],.40*offset[j-1],.40*offset[j+1])
            for j in range(1,17):
                for point in rr[j]:
                    point[1]+=spread[j]
                    hit,_,_,_=body.tree.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                    if hit is not None:point[1]=min(point[1],hit.y-.003)
            q[ids]=rr.reshape(-1,3)
        apply(ob,q,mapping,report)
    report['faceLensFit']={'cards':fitted_cards,'rootPairsRetained':True,'clearanceMm':1.5}
    # Landmark curve wraps the exposed left temple behind the goggle edge and
    # enters the existing crown. Projection derives depth from the real scalp.
    guides=bezier([[-.067,-.066,1.641],[-.083,-.089,1.681],[-.045,-.063,1.731],[-.011,.014,1.722]],np.linspace(0,1,97))
    base=[];normals=[]
    for point in guides:
        hit,n,_,_=scalp.tree.find_nearest(Vector(point));base.append(hit);normals.append(n)
    base=np.array(base);normals=np.array(normals);t=np.linspace(0,1,len(base))
    tangent=np.gradient(base,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
    across=np.cross(tangent,normals);across/=np.linalg.norm(across,axis=1)[:,None]
    parts=[]
    for strand in range(3):
        phase=t*math.tau*6+strand*math.tau/3
        taper=.28+.72*np.sin(math.pi*t)**.38
        centers=base+across*(.0036*np.sin(phase)*taper)[:,None]+normals*(.0038+.0015*np.sin(2*phase)*taper)[:,None]
        vs=[];fs=[];uv=[];sides=6
        for j,c in enumerate(centers):
            along=centers[min(j+1,len(t)-1)]-centers[max(j-1,0)];along/=np.linalg.norm(along)
            a=np.cross(along,normals[j]);a/=np.linalg.norm(a);b=np.cross(a,along)
            radius=.00165*taper[j]
            for k in range(sides):
                angle=k*math.tau/sides;point=c+radius*(math.cos(angle)*a+math.sin(angle)*b)
                hit,n,_,_=scalp.tree.find_nearest(Vector(point));gap=(Vector(point)-hit).dot(n)
                if gap<.0004:point=np.array(hit+n*.0004)
                vs.append(point);uv.append((k/sides,t[j]))
            if j:
                for k in range(sides):
                    a0=(j-1)*sides+k;b0=(j-1)*sides+(k+1)%sides
                    fs.append((a0,a0+sides,b0+sides,b0))
        fs.append(tuple(range(sides)));fs.append(tuple((len(t)-1)*sides+k for k in reversed(range(sides))))
        parts.append((vs,fs,uv))
    vs,fs,uv=join(parts);mat=material('PLURR reference temple braid',(.20,.075,.022),.57)
    ob=create('PLURR reference temple braid',vs,fs,mat,body,weights=rigid(body,vs,'head'),uv=uv,slot='hair',option='plurr-pony')
    ob['launchCharacter']='female';p=array(ob);gaps=[]
    for point in p:
        hit,n,_,_=scalp.tree.find_nearest(Vector(point));gaps.append((Vector(point)-hit).dot(n))
    assert min(gaps)>-.00001 and max(gaps)<.008,(min(gaps),max(gaps))
    report[ob.name]={'vertices':len(p),'bounds':[p.min(0).tolist(),p.max(0).tolist()],
        'scalpClearanceMm':[min(gaps)*1000,max(gaps)*1000],'headWeight':1}
    braid=ob
    # Connection map: the original roots remain under the goggles, with the
    # free length curving across the forehead and turning toward the temple.
    # Three overlapping families share a sweep, with unequal tapered ends.
    # All card edges clear skin by 2 mm and sit behind any projected lens.
    parts=[]
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    fitted_vertices=0
    for lock in range(7):
        shift=(lock-3)*.0020
        family=[0,0,0,1,1,2,2][lock]
        offset=[-.0014,0,.0014,-.0008,.0008,-.0008,.0008][lock]
        ends=[[-.060,-.119,1.621],[-.071,-.100,1.641],[-.066,-.108,1.654]]
        end=np.array(ends[family]);end[2]+=offset
        guides=bezier([[.028+shift,-.13,1.674+shift],
            [.003-.001*family,-.153,1.676+.003*family+offset],
            [-.045-.004*family,-.143,1.646+.006*family+offset],end],np.linspace(0,1,28))
        for layer in range(5):
            center=[];normal=[];t=np.linspace(0,1,len(guides))
            for j,point in enumerate(guides):
                hit,n,_,_=body.tree.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                if hit is None:hit,n,_,_=body.tree.find_nearest(Vector(point))
                lift=.003+(.005+.001*family)*math.sin(math.pi*t[j])+.00028*layer
                center.append(np.array(hit+n*lift));normal.append(np.array(n))
            center=np.array(center);normal=np.array(normal)
            tangent=np.gradient(center,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
            across=np.cross(tangent,normal);across/=np.linalg.norm(across,axis=1)[:,None]
            center+=across*((layer-2)*.00065*np.sin(math.pi*t)+.0007*np.sin(t*math.pi*2+lock*.6)*np.sin(math.pi*t))[:,None]
            width=(.0028+.00025*math.sin(lock*3.1+layer))*(.20+.80*np.sin(math.pi*t)**.5)*(1-.97*t**2.1)
            vs=[];fs=[];uv=[]
            for j in range(len(t)):
                for k,u in enumerate([0,.5,1]):
                    point=center[j]+across[j]*width[j]*(2*u-1)+normal[j]*(.0005 if k==1 else 0)*math.sin(math.pi*t[j])
                    # Fit actual edges: a clear centerline can still let the
                    # wide edge cross the curved forehead or goggle outline.
                    skin,n,_,_=body.tree.find_nearest(Vector(point));gap=(Vector(point)-skin).dot(n)
                    if gap<.002:point=np.array(skin+n*.002)
                    front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                    if front is not None and point[1]<front.y+.001:
                        point[1]=front.y+.001;fitted_vertices+=1
                    vs.append(point);uv.append((u,t[j]))
                if j:
                    for k in range(2):
                        a=(j-1)*3+k;fs.append((a,a+1,a+4,a+3))
            parts.append((vs,fs,uv))
    vs,fs,uv=join(parts);mat=material('PLURR loose brunette front locks',(.045,.018,.008),.60)
    ob=create('PLURR loose brunette front locks',vs,fs,mat,body,weights=rigid(body,vs,'head'),uv=uv,slot='hair',option='plurr-pony')
    ob['launchCharacter']='female';p=array(ob)
    report[ob.name]={'vertices':len(p),'bounds':[p.min(0).tolist(),p.max(0).tolist()],'headWeight':1,
        'frontWaveFamilies':3,'lensFittedVertices':fitted_vertices}
    return [braid,ob]


def export_additions(objects,folder,save_texture):
    # Longitudinal brown/caramel fibers; pigmentation only, without a baked
    # shiny strip. The braid stays opaque at distance instead of disappearing.
    h,w=512,128;v,u=np.mgrid[0:h,0:w].astype(float);u=(u+.5)/w;v=(v+.5)/h
    fiber=.5+.5*np.cos(u*math.tau*23+.4*np.sin(v*18))
    shade=.48+.42*fiber;rgba=np.ones((h,w,4));rgba[:,:,:3]=shade[:,:,None]
    image=save_texture('female-braid-fibers',rgba);materials={};output=[]
    for ob in objects:
        is_braid='braid' in ob.name
        mat=ob.data.materials[0];tree=mat.node_tree;bs=tree.nodes['Principled BSDF'];color=(.20,.075,.022,1) if is_braid else (.045,.018,.008,1)
        for socket in ['Base Color','Alpha']:
            for link in list(bs.inputs[socket].links):tree.links.remove(link)
        tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image if is_braid else bpy.data.images['female-reference-hair-fibers']
        mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=color
        tree.links.new(tex.outputs['Color'],mix.inputs[2]);tree.links.new(mix.outputs[0],bs.inputs['Base Color']);bs.inputs['Alpha'].default_value=1
        if not is_braid:tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
        bs.inputs['Specular IOR Level'].default_value=.18;bs.inputs['Roughness'].default_value=.57
        materials[mat.name]={'color':color,'roughness':.57,'specular':.36,'texture':'female-braid-fibers.png' if is_braid else 'female-reference-hair-fibers.png','opaque':is_braid,'alphaCutoff':.32}
        me=ob.data;me.calc_loop_triangles();me.update();uvs=me.uv_layers.active.data
        positions=[];normals=[];uv=[];indices=[];lookup={}
        for tri in me.loop_triangles:
            for vi,li in zip(tri.vertices,tri.loops):
                texuv=tuple(uvs[li].uv);key=(vi,texuv)
                if key not in lookup:
                    lookup[key]=len(positions);p=me.vertices[vi].co;n=me.vertices[vi].normal
                    positions.append([p.x,p.z,-p.y]);normals.append([n.x,n.z,-n.y]);uv.append([texuv[0],1-texuv[1]])
                indices.append(lookup[key])
        output.append({'name':ob.name,'material':mat.name,'positions':positions,'normals':normals,'uv':uv,'indices':indices,'extras':dict(ob.items())})
    return output,materials
