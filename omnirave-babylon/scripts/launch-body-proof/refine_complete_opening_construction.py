"""Fit separated main zipper tracks to the measured jacket opening.

Connection map: each tape follows its opening boundary, spanning 1 mm into
opening and 9 mm onto cloth, with 1.8 mm mid-surface backing clearance.
Teeth embed 0.08 mm into the tape top. At the positive-X hem the slider
straddles the first tooth; the pull overlaps its hinge by 0.2 mm. Sub-mm
hardware overlaps are intentional at garment scale. Coat geometry, existing
pockets and every other mesh remain exact; new parts inherit 14 correctives.
"""
import argparse,json,sys,math
from collections import Counter,defaultdict,deque
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from refine_complete_pocket_construction import Support,pull
from build_rigged_jacket_hardware import Writer,box,barycentric
from refine_complete_jacket_finish import reattach_hardware
import audit_rigged_jacket_sleeves as A

class Opening:
    def __init__(self,coat,at,sign):
        p=at.mid;self.at=at;self.sign=sign;self.lift=0.;self.depth_cache={}
        f=at.surface.faces;tri=p[f];normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
        self.front_faces=f[(normals[:,1]<0)&(tri[:,:,1].mean(1)<-.04)]
        self.front_tree=BVHTree.FromPolygons(p.tolist(),self.front_faces.tolist(),all_triangles=True)
        edges=Counter(tuple(sorted(e)) for f in coat.data.polygons for e in f.edge_keys)
        boundary=[e for e,n in edges.items() if n==1]
        # Opening is the continuous front boundary between hem and collar;
        # the lateral hem and neck circumference are outside this front strip.
        allowed=set(i for e in boundary for i in e if 0<sign*p[i,0]<.095 and p[i,1]<-.055)
        graph=defaultdict(list)
        for a,b in boundary:
            if a in allowed and b in allowed:graph[a].append(b);graph[b].append(a)
        low=min(allowed,key=lambda i:(round(float(p[i,2]),3),abs(p[i,0])))
        high=max(allowed,key=lambda i:p[i,2]);queue=deque([low]);parents={low:None}
        while queue:
            v=queue.popleft()
            for j in graph[v]:
                if j not in parents:parents[j]=v;queue.append(j)
        assert high in parents,(sign,low,high)
        path=[];i=high
        while i is not None:path.append(i);i=parents[i]
        path.reverse();self.ids=np.array(path);self.points=p[self.ids]
        self.arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(self.points,axis=0),axis=1))]
        assert self.arc[-1]>.4
        self.length=float(self.arc[-1]);self.normal=np.array([0.,-1.,0.])
    def point_at(self,u):
        u=np.clip(u,0,self.length);j=min(len(self.arc)-2,max(0,int(np.searchsorted(self.arc,u,side='right')-1)))
        t=(u-self.arc[j])/(self.arc[j+1]-self.arc[j]);return self.points[j]*(1-t)+self.points[j+1]*t
    def location(self,u):
        point=self.point_at(u);direction=self.point_at(u+.004)-self.point_at(u-.004);direction/=np.linalg.norm(direction)
        normal=np.array([0.,-1.,0.]);side=np.cross(normal,direction);side/=np.linalg.norm(side)
        if side[0]*self.sign<0:side=-side
        return point,direction,side,normal
    def carrier(self,u,v):
        point,axis,side,n=self.location(u);goal=point+side*v
        hit,normal,index,_=self.front_tree.ray_cast(Vector((goal[0],-1,goal[2])),Vector((0,1,0)))
        if hit is not None:goal=np.array(hit)
        else:
            hit,normal,index,_=self.front_tree.find_nearest(Vector(goal))
            if v>=0:goal=np.array(hit)
        ids=self.front_faces[index];bc=barycentric(np.array(hit),self.at.mid[ids])
        return (ids,bc,goal,np.array(normal),bc@self.at.mid[ids])
    def anchor(self,u,v):
        ids,bc,goal,n,mid=self.carrier(u,v);key=round(float(u),8)
        if key not in self.depth_cache:
            # A sewn tape bridges fine folds across its 10-mm width. Use the
            # frontmost carrier in a 4-mm longitudinal neighborhood so the
            # flat tape backing and rigid teeth share a continuous support.
            self.depth_cache[key]=min(self.carrier(np.clip(u+du,0,self.length),dv)[2][1]
                for du in [-.002,0,.002] for dv in np.linspace(0,.009,7))
        goal=goal.copy();goal[1]=min(goal[1],self.depth_cache[key])
        return ids,bc,goal,n,mid
    def frame(self,u,v):
        a=self.anchor(u,v);_,axis,side,n=self.location(u);return a,axis,side,n


def tracks(at,coat,mats):
    w=Writer('main zipper tracks',at,mats);patches={};report={}
    for sign in [-1,1]:
        patch=Opening(coat,at,sign);patches[sign]=patch;first_face=len(w.faces)
        w.begin('panel',side=sign,length_m=patch.length,width_m=.010)
        def emit(u,v,h):
            anchor=patch.anchor(u,v);normal=patch.location(u)[3]
            return w.vertex(anchor,anchor[2]+normal*h)
        rows=int(math.ceil(patch.length/.002));cross=[-.001,0,.0015,.003,.005,.0075,.009]
        top=[];bottom=[]
        for i in range(rows+1):
            u=i/rows*patch.length
            top.append([emit(u,v,.0024) for v in cross]);bottom.append([emit(u,v,.0018) for v in cross])
        for i in range(rows):
            for j in range(len(cross)-1):
                mat=0 if j==len(cross)-2 else 1
                w.face([top[i][j],top[i+1][j],top[i+1][j+1],top[i][j+1]],mat)
                w.face([bottom[i][j+1],bottom[i+1][j+1],bottom[i+1][j],bottom[i][j]],1)
        edge=top[0]+[r[-1] for r in top[1:]]+list(reversed(top[-1][:-1]))+[r[0] for r in reversed(top[1:-1])]
        lower=bottom[0]+[r[-1] for r in bottom[1:]]+list(reversed(bottom[-1][:-1]))+[r[0] for r in reversed(bottom[1:-1])]
        for j in range(len(edge)):
            k=(j+1)%len(edge);w.face([edge[j],lower[j],lower[k],edge[k]],1)
        teeth=int((patch.length-.012)/.0027)
        for i in range(teeth):
            u=.007+i*.0027;anchor,axis,side,n=patch.frame(u,.0009)
            w.begin('tooth',side=sign,along_m=u)
            def tooth(a,b,h):return w.vertex(anchor,anchor[2]+axis*a+side*b+n*h)
            box(w,tooth,(0,0),.00135,.0020,.00232,.00085)
        # End stops cover the final teeth and are seated into the backing.
        for u in [.004, .007+(teeth-1)*.0027+.0010]:
            anchor,axis,side,n=patch.frame(u,.0009);w.begin('stop',side=sign)
            def stop(a,b,h):return w.vertex(anchor,anchor[2]+axis*a+side*b+n*h)
            box(w,stop,(0,0),.003,.0032,.00232,.0012)
        if np.dot(np.cross(patch.location(.01)[1],patch.location(.01)[2]),patch.location(.01)[3])<0:
            w.faces[first_face:]=[tuple(reversed(f)) for f in w.faces[first_face:]]
        report[str(sign)]={'lengthMm':patch.length*1000,'teeth':teeth,'boundaryVertices':patch.ids.tolist()}
    # Adapt the pull helper to a local normal at the hem; its entire small
    # rigid assembly shares this local surface frame and anchor.
    patch=patches[1];patch.slider_u=.009;patch.normal=patch.location(patch.slider_u)[3]
    original=patch.frame
    patch.frame=lambda u,v:original(u,v+.0009)
    slider=pull('main zipper pull',patch,at,mats)
    if np.dot(np.cross(patch.location(.01)[1],patch.location(.01)[2]),patch.location(.01)[3])<0:slider.faces=[tuple(reversed(f)) for f in slider.faces]
    return [w,slider],report


def remove_painted_zipper(coat):
    from refine_complete_surfaces import bake
    mat=coat.data.materials[0].copy();coat.data.materials[0]=mat;tree=mat.node_tree;bs=tree.nodes['Principled BSDF']
    # Recover the retained original textile network. Only the shared front
    # zipper mask is disabled: collar/cuff/hem knit, stripes and embroidery
    # remain in the original graph, with the current finish tint and normals.
    mask=tree.nodes['Math.041'];assert mask.operation=='MULTIPLY'
    assert mask.inputs[0].links[0].from_node.name=='Math.039'
    assert len(mask.outputs[0].links)==3
    for link in list(mask.outputs[0].links):
        socket=link.to_socket;tree.links.remove(link);socket.default_value=0
    tint=tree.nodes['Mix (Legacy).003'];assert tint.blend_type=='MULTIPLY'
    tree.links.new(tree.nodes['Mix (Legacy).002'].outputs[0],tint.inputs[1])
    bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=1
    report={}
    for label,socket,source in [('color','Base Color',tint.outputs[0]),('metal','Metallic',tree.nodes['Math.099'].outputs[0])]:
        tex,_=bake(coat,mat,'male-opening-'+label,source,size=2048);tree.links.new(tex.outputs['Color'],bs.inputs[socket]);report[socket]=tex.image.name
    return report


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-pocket-refined.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Structured armhole jacket'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    old=bpy.data.objects['Jacket detail - main zipper pull'];retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and o!=old}
    mats=list(bpy.data.objects['Jacket detail - left hip pocket'].data.materials)
    disabled=[(m,m.show_viewport) for m in coat.modifiers if m.type!='ARMATURE']
    for m,_ in disabled:m.show_viewport=False
    A.update();at=Support(rig,coat);writers,info=tracks(at,coat,mats);bpy.data.objects.remove(old,do_unlink=True)
    built=[]
    for w in writers:
        ob,part,_=w.finish();ob['mainOpeningConstruction']='separated-tracks-v1';built.append(part)
    preserved_hardware=[o for o in scene.objects if o.get('jacketHardware') and not o.get('mainOpeningConstruction')]
    for ob in preserved_hardware:ob['jacketHardware']=False
    try:attachment=reattach_hardware(rig,coat)
    finally:
        for ob in preserved_hardware:ob['jacketHardware']=True
    for m,state in disabled:m.show_viewport=state
    A.update()
    for name,points in retained.items():assert np.array_equal(points,array(bpy.data.objects[name])),name
    materials=remove_painted_zipper(coat) if sex=='male' else {}
    report={'materialUpdates':materials,'source':'pocket-refined','tracks':info,'parts':built,'attachment':attachment,'preservedOtherMeshes':len(retained)}
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-opening-refined.blend'),compress=True)
    (OUT/f'{sex}-opening-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    print(sex,{k:{x:v for x,v in d.items() if x not in ['boundaryVertices','bounds']} for k,d in info.items()},flush=True)
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.80;scene.view_settings.exposure=-.8;scene.render.resolution_x=1000;scene.render.resolution_y=1000
        center=Vector((0,-.1,1.24 if sex=='male' else 1.18));cam.location=center+Vector((.35,-4,.08));review.look_at(cam,center);scene.render.filepath=str(OUT/f'{sex}-opening-after.png');bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
