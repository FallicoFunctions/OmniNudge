"""Separate the swept male groom into coherent waves on the retained ribbons.

Connection map: each ribbon root is attached 1.4 mm above the measured scalp;
its first edge remains fixed during secondary motion. Neighboring fibers gather
into shared guides with tapered free ends. The scalp and hairline form the dark
underlayer. These are millimeter hair layers, not structural 5 mm overlaps.
All existing ribbon topology, UVs and rigid head weights are retained.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from complete_pair_geometry import Surface,smooth
from refine_launch_faces import replace_posed


def group_paths(paths,count=72):
    # Spatial and trajectory clustering separates locks that cross in front.
    features=np.concatenate([paths[:,0],paths[:,5],paths[:,-1]],axis=1)
    centers=[features[len(features)//2]]
    best=np.full(len(features),np.inf)
    for _ in range(count-1):
        best=np.minimum(best,((features-centers[-1])**2).sum(1))
        centers.append(features[int(np.argmax(best))])
    centers=np.array(centers)
    for _ in range(12):
        group=((features[:,None,:]-centers[None,:,:])**2).sum(2).argmin(1)
        for g in range(count):
            if np.any(group==g):centers[g]=features[group==g].mean(0)
    return group


def finish(surf):
    scalp_ob=bpy.data.objects['Complete scalp'];scalp=Surface(surf.rig,scalp_ob)
    center=np.mean(scalp.array,axis=0);center[2]-=.045
    sign=np.median([scalp.tree.find_nearest(Vector(p))[1].dot(Vector(p-center)) for p in scalp.array[::32]])
    if sign<0:
        bm=bmesh.new();bm.from_mesh(scalp_ob.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(scalp_ob.data);bm.free();scalp_ob.data.update()
        bpy.context.view_layer.update();scalp=Surface(surf.rig,scalp_ob)
    ob=bpy.data.objects['Luxury retained swept groom'];old=array(ob,True);r=old.reshape(-1,12,2,3);paths=r.mean(2)
    group=group_paths(paths);guides={g:paths[group==g].mean(0) for g in np.unique(group)}
    t=np.linspace(0,1,12);free=smooth((t-.10)/.90)
    output=np.empty_like(r);root_distances=[];highlight_count=0
    eye=np.mean([array(bpy.data.objects['AvatarEye_'+s],True).mean(0) for s in ['l','r']],axis=0)
    for i,path in enumerate(paths):
        g=int(group[i]);guide=guides[g];root=path[0];top=float(smooth((root[2]-(scalp.array[:,2].max()-.075))/.045))
        q=path+(guide-path)*(.74*free)[:,None]
        phase=(g*2.399963)%math.tau
        # A shared rolled crest and changing bend direction create open gaps
        # between locks, rather than high-frequency displacement on every fiber.
        arch=np.sin(math.pi*t)**1.25
        q[:,2]+=(.012+.012*(.5+.5*math.sin(phase)))*arch*top
        q[:,0]+=(.009*math.sin(phase)*np.sin(1.8*math.pi*t))*free*top
        q[:,1]-=(.008*np.sin(1.55*math.pi*t+phase))*free*top
        q[:,2]+=.006*np.sin(2.3*math.pi*t+phase)*free*top
        # Keep the curled tips short enough to leave both eyes clear.
        front=smooth((-.055-q[:,1])/.035)*smooth((.055-np.abs(q[:,0]))/.020)
        q[:,2]+=np.maximum(0,eye[2]+.022-q[:,2])*front*free
        for j,p in enumerate(q):
            hit,n,_,_=scalp.tree.find_nearest(Vector(p));signed=n.dot(Vector(p)-hit)
            if signed<.002 and p[2]>scalp.array[:,2].min()+.015:q[j]=np.array(Vector(p)+n*(.002-signed))
        hit,n,_,_=scalp.tree.find_nearest(Vector(root));q[0]=np.array(hit+n*.0014)
        half=(r[i,:,1]-r[i,:,0])*.5
        # Preserve widths and tapered tips while recomputing the ribbon frame
        # around its new path; this avoids twisted flat cards on rolled locks.
        for j,p in enumerate(q):
            tangent=Vector(q[min(j+1,11)]-q[max(j-1,0)]).normalized()
            normal=Vector(p-center).normalized();across=tangent.cross(normal).normalized()
            if across.length<.1:across=Vector((1,0,0))
            half[j]=np.array(across)*np.linalg.norm(half[j])
        output[i,:,0]=q-half;output[i,:,1]=q+half
        root_distances.append(scalp.tree.find_nearest(Vector(q[0]))[3])
        # Only selected exposed locks carry caramel strands; their dark fibers
        # still read as a continuous brown base between those streaks.
        highlight=top>.35 and (g%9 in [2,6]) and i%5<2
        shade=3 if highlight else ([0,1,2,4][(g+i%3)%4])
        highlight_count+=int(highlight)
        for face in ob.data.polygons[i*11:(i+1)*11]:face.material_index=shade
    replace_posed(ob,output.reshape(-1,3),surf)
    palette=[(.012,.006,.003),(.023,.011,.005),(.043,.023,.010),(.19,.104,.043),(.018,.008,.003)]
    for i,oldmat in enumerate(list(ob.data.materials)):
        mat=oldmat.copy();ob.data.materials[i]=mat;bs=mat.node_tree.nodes['Principled BSDF']
        bs.inputs['Base Color'].default_value=(*palette[i],1);bs.inputs['Roughness'].default_value=.46;bs.inputs['Specular IOR Level'].default_value=.23
    # Root fine hairs remain as a dark coverage layer. Flyaway roots are moved
    # to the corrected outward surface, keeping their original paths and count.
    for name in ['Complete scalp','Polished male rooted hairline','Polished male flyaways']:
        item=bpy.data.objects[name]
        for j,oldmat in enumerate(list(item.data.materials)):
            mat=oldmat.copy();item.data.materials[j]=mat;bs=mat.node_tree.nodes['Principled BSDF']
            for link in list(bs.inputs['Base Color'].links):mat.node_tree.links.remove(link)
            bs.inputs['Base Color'].default_value=(.012,.006,.003,1);bs.inputs['Roughness'].default_value=.60;bs.inputs['Specular IOR Level'].default_value=.18
    under=bpy.data.objects['Polished male rooted hairline'];up=array(under,True);uq=up.reshape(-1,12,2,3).copy()
    for strand in uq:
        path=strand.mean(1);half=(strand[:,1]-strand[:,0])*.5
        for j,p in enumerate(path):
            hit,n,_,_=scalp.tree.find_nearest(Vector(p));path[j]=np.array(hit+n*(.0018+.0012*math.sin(math.pi*j/11)))
        for j,p in enumerate(path):
            tangent=Vector(path[min(j+1,11)]-path[max(j-1,0)]).normalized();normal=scalp.tree.find_nearest(Vector(p))[1]
            across=tangent.cross(normal).normalized()
            if across.length<.1:across=Vector((1,0,0))
            h=np.array(across)*np.linalg.norm(half[j])*1.6
            strand[j,0]=p-h;strand[j,1]=p+h
    replace_posed(under,uq.reshape(-1,3),surf)
    capbs=scalp_ob.data.materials[0].node_tree.nodes['Principled BSDF']
    capbs.inputs['Roughness'].default_value=.86;capbs.inputs['Specular IOR Level'].default_value=.08
    # UV columns wrap the scalp and rows run crown-to-hairline. Fine directional
    # pigment and a strand-shaped edge fade replace the solid cap boundary.
    u,v=np.meshgrid(np.arange(1024)/1024,np.arange(512)/511)
    flow=u+.011*np.sin(v*6+u*math.tau*3)
    fiber=.5+.5*np.sin(flow*math.tau*380+.75*np.sin(flow*math.tau*93))
    fine=.5+.5*np.sin(flow*math.tau*491+v*19)
    pigment=.52+.34*fiber+.14*fine
    pixels=np.ones((512,1024,4),np.float32)
    pixels[:,:,:3]=pigment[:,:,None]*np.array([.022,.011,.005])[None,None,:]
    pixels[:,:,3]=np.clip((.997-v)/(.022+.025*fiber),0,1)
    tex=bpy.data.images.new('Luxury scalp fiber coverage',width=1024,height=512,alpha=True)
    tex.pixels.foreach_set(pixels.ravel());tex.filepath_raw=str(OUT/'male-scalp-fibers.png');tex.file_format='PNG';tex.save();tex.pack()
    mat=scalp_ob.data.materials[0];node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=tex
    mat.node_tree.links.new(node.outputs['Color'],capbs.inputs['Base Color']);mat.node_tree.links.new(node.outputs['Alpha'],capbs.inputs['Alpha']);mat.surface_render_method='DITHERED'
    fly=bpy.data.objects['Polished male flyaways'];fp=array(fly,True);fq=fp.reshape(-1,10,2,3).copy();ft=np.linspace(0,1,10)
    for strand in fq:
        root=strand[0].mean(0);hit,n,_,_=scalp.tree.find_nearest(Vector(root));delta=np.array(hit+n*.0014)-root
        strand+=delta[None,None,:]*(1-ft)[:,None,None]**2
        strand[:,:,2]+=(.013*np.sin(math.pi*ft))[:,None]
    replace_posed(fly,fq.reshape(-1,3),surf);bpy.context.view_layer.update()
    actual=array(ob,True);assert np.isfinite(actual).all() and np.max(np.abs(actual-output.reshape(-1,3)))<1e-6
    assert max(root_distances)<.002
    return {'ribbons':len(paths),'waveGuides':len(guides),'highlightRibbons':highlight_count,'topologyAndUVsPreserved':True,'correctedInwardScalpWinding':bool(sign<0),'maximumRootScalpDistanceMm':max(root_distances)*1000,'maximumDisplacementMm':float(np.linalg.norm(actual-old,axis=1).max()*1000),'bounds':[actual.min(0).tolist(),actual.max(0).tolist()]}


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-crop-refined.blend'))
    rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and (sex=='female' or o.get('avatarSlot')!='hair')}
    report={'changed':sex=='male'}
    hair=[o for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair']
    def contract(o):
        return (tuple(tuple(sorted(f.vertices)) for f in o.data.polygons),
                tuple(tuple(tuple(sorted((int(v),tuple(layer.data[l].uv)) for v,l in zip(f.vertices,f.loop_indices))) for f in o.data.polygons) for layer in o.data.uv_layers),
                tuple(tuple((g.group,g.weight) for g in v.groups) for v in o.data.vertices))
    contracts={o.name:contract(o) for o in hair}
    if sex=='male':report['groom']=finish(Surface(rig,bpy.data.objects['AvatarBody']))
    for o in hair:assert contract(o)==contracts[o.name],o.name+' topology, UV or skin weights changed'
    for name,p in retained.items():assert np.array_equal(p,array(bpy.data.objects[name])),name
    report['preservedMeshes']=len(retained)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-hair-refined.blend'),compress=True)
    (OUT/f'{sex}-hair-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.40;scene.view_settings.exposure=-.8;scene.render.resolution_x=scene.render.resolution_y=900
        target=Vector((0,-.04,1.745))
        for label,offset in [('front',(0,-4,.06)),('oblique',(2,-4,.06)),('back',(0,4,.06))]:
            cam.location=target+Vector(offset);review.look_at(cam,target);scene.render.filepath=str(OUT/f'{sex}-hair-finish-{label}.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
