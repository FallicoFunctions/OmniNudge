"""Refine the female swept scalp and wavy pony while retaining the body/outfit.

Connection map: scalp ribbon root centers sit 1.4 mm above the measured scalp;
their inner layers meet that same scalp envelope. Pony ribbon roots retain their
measured attachment to the core. Existing core/root/tie overlap is retained.
Hair ribbons use submillimeter-to-millimeter coverage, not structural 5 mm joints.
All geometry is authored in evaluated world space and rigidly rebound to head.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array, review
from complete_pair_geometry import Surface, create, join, smooth
from add_launch_reference_details import rigid, ribbon, strand_mat
from refine_launch_faces import replace_posed


def islands(ob):
    parent=list(range(len(ob.data.vertices)))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    for f in ob.data.polygons:
        first=find(f.vertices[0])
        for i in f.vertices[1:]:parent[find(i)]=first
    groups={}
    for i in range(len(parent)):groups.setdefault(find(i),[]).append(i)
    return list(groups.values())


def bounds(ob):
    p=array(ob,True);assert np.isfinite(p).all()
    b=np.stack([p.min(0),p.max(0)]).tolist()
    print(ob.name, 'bounds',b,flush=True)
    return b


def darken(ob, color, rough=.66, spec=.16):
    for i,old in enumerate(list(ob.data.materials)):
        m=old.copy();ob.data.materials[i]=m
        bs=m.node_tree.nodes['Principled BSDF']
        for name,value in [('Base Color',(*color,1)),('Roughness',rough),('Specular IOR Level',spec)]:
            for link in list(bs.inputs[name].links):m.node_tree.links.remove(link)
            bs.inputs[name].default_value=value


def scalp_sweep(surf):
    cap=bpy.data.objects['Complete scalp']
    # The retained open scalp grid winds inward. Correct its measured winding
    # before using normals to place the replacement exterior hair layer.
    scalp=Surface(surf.rig,cap)
    probe_center=Vector((0,-.032,float(scalp.array[:,2].max()-.08)))
    signs=[float(n.dot(p-probe_center)) for p,n in [(scalp.tree.find_nearest(Vector(v))[:2]) for v in scalp.array[::32]]]
    reversed_winding=float(np.median(signs))<0
    if reversed_winding:
        bm=bmesh.new();bm.from_mesh(cap.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(cap.data);bm.free();cap.data.update()
        bpy.context.view_layer.update();scalp=Surface(surf.rig,cap)
    eye=np.mean([array(bpy.data.objects['AvatarEye_'+s],True).mean(0) for s in ['l','r']],axis=0)
    center=np.array([0,-.032,eye[2]+.039])
    root=array(bpy.data.objects['PLURR gathered pony root'],True).mean(0)
    target=(root-center);target/=np.linalg.norm(target)
    rng=np.random.default_rng(909081)
    parts=[];rootpoints=[]
    # Sample actual scalp vertices, including the frontal boundary. Each path
    # follows a projected arc towards the measured gathered attachment.
    edges={}
    for f in cap.data.polygons:
        ids=list(f.vertices)
        for a,b in zip(ids,ids[1:]+ids[:1]):
            key=tuple(sorted((a,b)));edges[key]=edges.get(key,0)+1
    boundary=sorted({v for edge,n in edges.items() if n==1 for v in edge})
    assert boundary
    sources=np.r_[rng.choice(boundary,240),rng.integers(0,len(scalp.array),220)]
    for i,idx in enumerate(sources):
        start=scalp.array[idx];direction=(start-center);direction/=np.linalg.norm(direction)
        path=[]
        phase=math.sin(float(start[0])*110+float(start[1])*35)
        for t in np.linspace(0,1,24):
            d=direction*(1-t*.92)+target*(t*.92)
            # Open a small diagonal part and sweep neighbouring locks together.
            d[0]+=.20*math.sin(math.pi*t)*(1 if start[0]>.008 else -1)
            d/=np.linalg.norm(d)
            hit,n,_,_=scalp.tree.ray_cast(Vector(center+d*.35),Vector(-d),.70)
            if hit is None:hit,n,_,_=scalp.tree.find_nearest(Vector(center+d*.10))
            lift=.0014+(.0034+.0012*phase)*math.sin(math.pi*t)**1.2
            path.append(np.array(hit+n*lift))
        hit,n,_,_=scalp.tree.find_nearest(Vector(start))
        path[0]=np.array(hit+n*.0014)
        width=float(rng.uniform(.0032,.0055))
        v,f,u=ribbon(path,width,Vector(center))
        rootpoints.append(path[0]);parts.append((v,f,u))
    # Replace two earlier fine layers with one denser swept layer, limiting cost.
    for name in ['Complete scalp strands','Polished female rooted hairline']:
        bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
    mat=strand_mat('PLURR swept dark scalp hair',(.012,.0045,.009))
    bs=mat.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.58
    bs.inputs['Specular IOR Level'].default_value=.14
    v,f,u=join(parts)
    ob=create('PLURR swept scalp groom',v,f,mat,surf,weights=rigid(surf,v,'head'),uv=u,slot='hair',option='plurr-pony')
    ob['groomRootStride']=48;ob['groomRootCarrier']='Complete scalp'
    darken(cap,(.006,.0025,.005),.82,.10)
    distances=[scalp.tree.find_nearest(Vector(p))[3] for p in rootpoints]
    assert max(distances)<.002
    return {'ribbons':len(parts),'vertices':len(v),'correctedInwardScalpWinding':reversed_winding,'maximumRootScalpDistanceMm':max(distances)*1000,'bounds':bounds(ob)}


def pony_waves(surf):
    rows=[];original={}
    for i in range(4):
        ob=bpy.data.objects[f'PLURR pony strands {i}'];p=array(ob,True)
        # The earlier 13-sample scalp cards duplicate the new sweep and leave
        # broad blunt tips. Retain only the pony and cheek tendril components.
        components=islands(ob)
        if any(len(ids)==26 for ids in components):
            pieces=[]
            for ids in components:
                if len(ids)==26:continue
                r=p[ids].reshape(-1,2,3);n=len(r)
                pieces.append((r.reshape(-1,3),[(j*2,j*2+1,j*2+3,j*2+2) for j in range(n-1)],[(u,j/(n-1)) for j in range(n) for u in [0,1]]))
            name=ob.name;mats=list(ob.data.materials);bpy.data.objects.remove(ob,do_unlink=True)
            v,f,u=join(pieces);ob=create(name,v,f,mats,surf,weights=rigid(surf,v,'head'),uv=u,slot='hair',option='plurr-pony')
            p=array(ob,True)
        original[ob.name]=p
        for ids in islands(ob):
            if len(ids)==36:rows.append((ob,ids,p[ids].reshape(18,2,3)))
    assert len(rows)==870,len(rows)
    # Group adjacent final paths into shared locks. Root samples are kept exact.
    key=np.array([math.atan2(r[-1,:,1].mean()-.14,r[-1,:,0].mean()+.13) for _,_,r in rows])
    order=np.argsort(key);groups=np.empty(len(rows),int)
    groups[order]=np.arange(len(rows))*24//len(rows)
    guides={g:np.mean([rows[i][2].mean(1) for i in range(len(rows)) if groups[i]==g],axis=0) for g in range(24)}
    output={n:p.copy() for n,p in original.items()};t=np.linspace(0,1,18);free=smooth((t-.10)/.90)
    for i,(ob,ids,r) in enumerate(rows):
        path=r.mean(1);g=int(groups[i]);half=(r[:,1]-r[:,0])*.5
        path+=(guides[g]-path)*(.68*free)[:,None]
        phase=g*.63
        # Coherent S bends across neighbouring fibers, with tapered free ends.
        path[:,0]+=.017*np.sin(t*math.pi*3.3+phase)*free
        path[:,1]+=.010*np.sin(t*math.pi*3.3+phase+.7)*free
        half*=1.70
        new=np.stack([path-half,path+half],axis=1)
        new[0]=r[0]
        output[ob.name][ids]=new.reshape(-1,3)
    for name,q in output.items():replace_posed(bpy.data.objects[name],q,surf)
    # The fine silhouette hairs follow the same broad bend and taper closer to
    # the main bundle, preserving a few flyaways instead of a separate cloud.
    ob=bpy.data.objects['Polished female flyaways'];p=array(ob,True);q=p.copy()
    core=Surface(surf.rig,bpy.data.objects['PLURR gathered pony bundle'])
    root_shift=0
    for ids in islands(ob):
        r=p[ids].reshape(-1,2,3);path=r.mean(1);t=np.linspace(0,1,len(r));free=smooth((t-.12)/.88)
        hit,n,_,_=core.tree.find_nearest(Vector(path[0]));delta=np.array(hit+n*.0013)-path[0]
        root_shift=max(root_shift,float(np.linalg.norm(delta)))
        path+=delta[None,:]*(1-t[:,None])**3
        path[:,0]+=.012*np.sin(t*math.pi*3.3+float(r[0,:,0].mean())*24)*free
        path[:,1]+=.006*np.sin(t*math.pi*3.3+.7)*free
        half=(r[:,1]-r[:,0])*.5
        q[ids]=np.stack([path-half,path+half],axis=1).reshape(-1,3)
    replace_posed(ob,q,surf)
    # Reduce the neon white glare while retaining magenta and violet color.
    darken(bpy.data.objects['PLURR pony strands 1'],(.48,.004,.12),.58,.16)
    darken(ob,(.50,.004,.13),.63,.15)
    return {'ribbons':len(rows),'coherentLocks':24,'maximumOriginalPonyRootDriftMm':max(float(np.linalg.norm(output[o.name][ids][:2]-r.reshape(-1,3)[:2],axis=1).max()) for o,ids,r in rows)*1000,'flyawayRootReattachmentMm':root_shift*1000,'bounds':{n:bounds(bpy.data.objects[n]) for n in output}}


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-upper-refined.blend'))
    rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
    bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
    retained={o.name:array(o).copy() for o in bpy.context.scene.objects if o.type=='MESH' and (sex=='male' or o.get('avatarSlot')!='hair')}
    report={'changed':sex=='female'}
    if sex=='female':
        surf=Surface(rig,bpy.data.objects['AvatarBody'])
        report['scalp']=scalp_sweep(surf);report['pony']=pony_waves(surf)
    for name,p in retained.items():assert np.array_equal(p,array(bpy.data.objects[name])),name
    report['preservedMeshes']=len(retained)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-groom-refined.blend'),compress=True)
    (OUT/f'{sex}-groom-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.59
        scene.view_settings.exposure=-.8;scene.render.resolution_x=850;scene.render.resolution_y=950
        for label,x,y in [('front',.02,-4),('oblique',2.5,-4),('back',-.2,4)]:
            cam.location=(x,y,1.63);review.look_at(cam,Vector((-.05,.025,1.58)))
            scene.render.filepath=str(OUT/f'{sex}-groom-pilot-{label}.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(args.sex,args.render)
