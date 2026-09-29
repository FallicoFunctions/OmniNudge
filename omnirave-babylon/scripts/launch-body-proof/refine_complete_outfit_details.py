"""Author reference-led cargo construction, fittings and underbust mesh.

Connection map: pocket gussets run from the trouser surface to their bulged
panel edges; flaps overlap the upper 24 percent of each pocket. Chain links alternate
through one another and start at belt D-rings. Belt loops span the measured
belt edges. Mesh gussets meet the crop hem, with a central clasp on its band.
Small fittings use their measured wire widths, not a universal 5 mm overlap.
All added pieces inherit the measured carrier's skin weights.
"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,material,review
from complete_pair_geometry import Surface,create,tube,join
from refine_complete_surfaces import Field,bake,set_value
import audit_rigged_jacket_sleeves as A


def posed(ob):
    mods=[(m,m.show_viewport) for m in ob.modifiers if m.type!='ARMATURE']
    for m,_ in mods:m.show_viewport=False
    bpy.context.view_layer.update();p=array(ob,True)
    for m,state in mods:m.show_viewport=state
    bpy.context.view_layer.update()
    return p


class Assembly:
    def __init__(self,name,surface,mats,slot,option):
        self.name=name;self.surface=surface;self.mats=mats;self.slot=slot;self.option=option
        self.parts=[];self.materials=[]
    def add(self,part,material_id=0):
        self.parts.append(part);self.materials.extend([material_id]*len(part[1]))
    def wire(self,path,radius=.001,material_id=0,sides=6):
        self.add(tube(path,radius,sides),material_id)
    def finish(self):
        v,f,uv=join(self.parts)
        ob=create(self.name,v,f,self.mats,self.surface,weights=self.surface.weights_at(v),uv=uv,slot=self.slot,option=self.option)
        for p,m in zip(ob.data.polygons,self.materials):p.material_index=m
        ob['outfitDetailCarrier']=self.surface.body.name
        bpy.context.view_layer.update();q=array(ob,True)
        assert np.isfinite(q).all()
        return ob


def grid(fn,nu,nv):
    v=[fn(i/(nu-1),j/(nv-1)) for j in range(nv) for i in range(nu)]
    f=[(j*nu+i,j*nu+i+1,(j+1)*nu+i+1,(j+1)*nu+i) for j in range(nv-1) for i in range(nu-1)]
    uv=[(i/(nu-1),j/(nv-1)) for j in range(nv) for i in range(nu)]
    return v,f,uv


def rect_loop(center,right,up,width,height,radius=.002,steps=7):
    center=Vector(center);right=Vector(right).normalized();up=Vector(up).normalized()
    path=[]
    for x,z,start in [(1,1,0),(-1,1,math.pi/2),(-1,-1,math.pi),(1,-1,3*math.pi/2)]:
        c=center+right*x*(width/2-radius)+up*z*(height/2-radius)
        path += [c+right*radius*math.cos(a)+up*radius*math.sin(a) for a in np.linspace(start,start+math.pi/2,steps)]
    return path+[path[0]]


def chain(assembly,path,long_radius=.0045,short_radius=.0028,wire_radius=.00065,material_id=0):
    p=np.array(path);arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    count=max(4,int(arc[-1]/(long_radius*1.45)))
    samples=np.linspace(0,arc[-1],count)
    centers=np.stack([np.interp(samples,arc,p[:,a]) for a in range(3)],axis=1)
    for i,c in enumerate(centers):
        tangent=Vector(centers[min(i+1,count-1)]-centers[max(0,i-1)]).normalized()
        across=tangent.cross(Vector((0,-1,0))).normalized()
        if across.length<.1:across=tangent.cross(Vector((1,0,0))).normalized()
        normal=tangent.cross(across).normalized()
        across=across*math.cos((i%2)*math.pi/2)+normal*math.sin((i%2)*math.pi/2)
        loop=[Vector(c)+tangent*long_radius*math.cos(a)+across*short_radius*math.sin(a) for a in np.linspace(0,math.tau,19)]
        assembly.wire(loop,wire_radius,material_id,5)
    return count


def trousers_point(surf,rig,side,theta,z,offset=.004):
    sign=1 if side=='l' else -1
    bone=rig.pose.bones['thigh_'+side]
    t=(z-bone.head.z)/(bone.tail.z-bone.head.z)
    center=bone.head.lerp(bone.tail,t);center.z=z
    d=Vector((sign*math.sin(theta),-math.cos(theta),0))
    hit,n,_,_=surf.tree.ray_cast(center,d,.35)
    assert hit is not None,(side,theta,z)
    return hit+n*offset


def pockets(sex,rig,surf,cloth,edge,metal):
    reports={}
    cloth=cloth.copy();cloth.name='PLURR pocket splattered fabric' if sex=='female' else 'Luxury constructed cargo nylon'
    bs=cloth.node_tree.nodes['Principled BSDF']
    for link in list(bs.inputs['Normal'].links):cloth.node_tree.links.remove(link)
    set_value(cloth,'Base Color',(.008,.010,.015,1));set_value(cloth,'Roughness',.52)
    for side in ['l','r']:
        old=bpy.data.objects['Launch cargo pocket '+side];p=posed(old);low,high=p[:,2].min(),p[:,2].max()
        for name in [old.name,'Launch cargo pocket piping '+side]:
            bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
        panel=Assembly('Launch constructed cargo pocket '+side,surf,[cloth,edge,metal],'bottoms','luxury-cargo' if sex=='male' else 'plurr-cargo')
        def at(u,v,lift=0):
            bulge=.004+.010*math.sin(math.pi*u)**.7*math.sin(math.pi*v)**.7
            return trousers_point(surf,rig,side,.16+1.02*u,low+(high-low)*v,bulge+lift)
        panel.add(grid(lambda u,v:at(u,v),15,16),0)
        # Side and bottom gussets close the pouch against its carrier.
        for fixed in [0,1]:
            panel.add(grid(lambda u,v:at(fixed,v,.0005)*(1-u)+trousers_point(surf,rig,side,.16+1.02*fixed,low+(high-low)*v,.0015)*u,2,16),0)
        panel.add(grid(lambda u,v:at(u,0,.0005)*(1-v)+trousers_point(surf,rig,side,.16+1.02*u,low,.0015)*v,15,2),0)
        # Curved flap wraps over the upper pocket, with a lowered center point.
        panel.add(grid(lambda u,v:at(u,.76+.24*v,.004+.003*math.sin(math.pi*v)),15,5),0)
        for vv in [.02,.76,.99]:
            panel.wire([at(u,vv,.0015 if vv<.5 else .006) for u in np.linspace(0,1,30)],.0008,1,5)
        for uu in [.015,.985]:
            panel.wire([at(uu,v,.002) for v in np.linspace(0,1,22)],.0007,1,5)
        for uu in [.24,.76]:
            c=at(uu,.82,.008)
            right=(at(uu+.01,.82)-at(uu-.01,.82)).normalized();up=Vector((0,0,1))
            panel.wire(rect_loop(c,right,up,.009,.015,.0015),.001,2,6)
            panel.wire([c-up*.007,c+up*.007],.0008,2,5)
        ob=panel.finish();reports[side]={'vertices':len(ob.data.vertices),'heightMm':float((high-low)*1000),'flapOverlapMm':float((high-low)*.24*1000)}
    return reports


def belt_and_chains(sex,rig,surf,cloth,edge,metal):
    belt=bpy.data.objects['Launch cargo belt'];p=posed(belt).reshape(2,64,3)
    fittings=Assembly('Launch belt fittings and linked chains',surf,[cloth,edge,metal],'accessories','luxury-jewelry' if sex=='male' else 'plurr-belt')
    def at(t,v=.5,lift=.003):
        whole=(t%1)*64;i=int(whole)%64;a=whole-math.floor(whole)
        b=p[:,i]*(1-a)+p[:,(i+1)%64]*a;q=b[0]*(1-v)+b[1]*v
        radial=Vector((q[0],q[1]+.015,0)).normalized()
        return Vector(q)+radial*lift
    for t in [.055,.14,.38,.50,.62,.86,.945]:
        fittings.add(grid(lambda u,v,t=t:at(t+(u-.5)*.014,-.13+v*1.28,.004),3,5),1 if sex=='female' else 0)
        for v in [0,1]:
            fittings.wire([at(t-.006,v,.005),at(t+.006,v,.005)],.0006,2,5)
    center=at(0,.5,.007);width=.046 if sex=='female' else .037
    fittings.wire(rect_loop(center,(1,0,0),(0,0,1),width,.026,.004),.002,2,7)
    fittings.wire([center+Vector((-.001,0,-.012)),center+Vector((-.001,0,.012))],.0014,2)
    if sex=='female':
        fittings.add(grid(lambda u,v:at((u-.5)*.032,.14+.72*v,.005),6,3),1)
    links=0
    for ob in list(bpy.context.scene.objects):
        if ob.type!='MESH' or not ob.name.startswith('Launch hip chain '):continue
        path=posed(ob).reshape(-1,6,3).mean(1)
        links += chain(fittings,path,long_radius=.0047 if sex=='male' else .006,short_radius=.0029 if sex=='male' else .0036,wire_radius=.0008 if sex=='male' else .0011,material_id=2 if sex=='male' else 1)
        for endpoint in [path[0],path[-1]]:
            c=Vector(endpoint)+Vector((0,0,.005))
            fittings.wire(rect_loop(c,(1,0,0),(0,0,1),.010,.016,.004),.0011,2)
        bpy.data.objects.remove(ob,do_unlink=True)
    return {'chainLinks':links,'beltLoops':7},fittings.finish()


def seams_and_webbing(sex,rig,surf,cloth,edge,metal):
    details=Assembly('Launch cargo seams and strap hardware',surf,[cloth,edge,metal],'bottoms','luxury-cargo' if sex=='male' else 'plurr-cargo')
    pants=surf.array;waist=pants[:,2].max()
    bm=bmesh.new();bm.from_mesh(surf.body.data)
    boundary={v.index for e in bm.edges if e.is_boundary for v in e.verts};bm.free()
    for side in ['l','r']:
        sign=1 if side=='l' else -1
        cuff=[i for i in boundary if pants[i,2]<.4 and pants[i,0]*sign>0]
        low=max(pants[i,2] for i in cuff)+.007
        # Continuous trouser seam and welt contrast the soft cloth volumes.
        samples=np.linspace(low,waist-.045,72)
        details.wire([trousers_point(surf,rig,side,1.10,z,.004) for z in samples],.0010,1,5)
        if sex=='male' and side=='r':
            for z in [low+.17,low+.215,low+.26]:
                details.add(grid(lambda u,v,z=z:trousers_point(surf,rig,side,.23+1.12*u,z+.035*u+.007*(v-.5),.0045),20,3),1)
    for old in [o for o in bpy.context.scene.objects if o.name.startswith('Launch hanging strap ')]:
        path=posed(old).reshape(20,2,3);side='l' if path[:,:,0].mean()>0 else 'r'
        # Keep the webbing and its sewn fittings on the same refined skin field.
        weights=surf.weights_at(path.reshape(-1,3))
        old.vertex_groups.clear()
        for j,name in enumerate(surf.names):
            ids=np.flatnonzero(weights[:,j]>1e-8)
            if len(ids):
                group=old.vertex_groups.new(name=name)
                for i in ids:group.add([int(i)],float(weights[i,j]),'REPLACE')
        old.data.vertices.foreach_set('co',surf.bind(path.reshape(-1,3),weights).astype(np.float32).ravel());old.data.update()
        # Replace gold-sheet straps with woven webbing and fine edge stitching.
        old.data.materials[0]=cloth if sex=='male' else edge
        for i in [0,1]:
            details.wire([Vector(p)+Vector((0,-.0008,0)) for p in path[:,i]],.0006,1 if sex=='male' else 2,5)
        for j in [1,9]:
            c=Vector(path[j].mean(0))+Vector((0,-.002,0));across=Vector(path[j,1]-path[j,0]).normalized();along=Vector(path[max(0,j-1)].mean(0)-path[min(19,j+1)].mean(0)).normalized()
            details.wire(rect_loop(c,across,along,.018,.019,.002),.0011,2,6)
            details.wire([c-across*.009,c+across*.009],.001,2,5)
    return details.finish()


def underbust(surf,rig,cloth,metal,accent):
    top=bpy.data.objects['Launch fitted crop top'];ring=posed(top).reshape(18,80,3)[0]
    mesh=Assembly('PLURR underbust mesh and clasp',surf,[cloth,metal,accent],'top','plurr-crop')
    def hem_point(x):
        t=(x/.145*1.20/math.tau%1)*80;i=int(t)%80;f=t-math.floor(t)
        return Vector(ring[i]*(1-f)+ring[(i+1)%80]*f)
    def at(x,z,lift=.004):
        theta=x/.145*1.20;p=surf.radial(theta,z,lift);h=hem_point(x)
        on_skin=surf.radial(theta,h.z,lift)
        attachment=max(0,min(1,(z-(h.z-.052))/.052))
        return p+(h-on_skin)*attachment
    # Two tapered gussets connect to the actual irregular crop boundary.
    for sign in [-1,1]:
        def lower(x):return hem_point(sign*x).z-.050*math.sin(math.pi*(x-.025)/.115)
        average=float(np.mean(ring[:,2]))
        for slope in [-.9,.9]:
            for intercept in np.arange(average-.20,average+.20,.012):
                points=[]
                for x in np.linspace(.025,.14,60):
                    z=slope*(x-.08)+intercept
                    if lower(x)<=z<=hem_point(sign*x).z+.002:points.append(at(sign*x,z))
                if len(points)>1:mesh.wire(points,.00055,0,4)
        mesh.wire([at(sign*x,lower(x),.0045) for x in np.linspace(.025,.14,30)],.0013,0,6)
    mesh.add(grid(lambda u,v:hem_point(-.145+.29*u)+Vector((0,-.002,.002+.009*v)),42,3),0)
    center=hem_point(0)+Vector((0,-.006,.007))
    mesh.wire(rect_loop(center,(1,0,0),(0,0,1),.027,.018,.003),.0018,1,7)
    mesh.wire([center+Vector((-.002,0,-.008)),center+Vector((-.002,0,.008))],.0013,2,6)
    return mesh.finish()


def heart_pendant(surf,metal,accent):
    old=bpy.data.objects['Launch necklace pendant'];center=posed(old).mean(0);center[2]+=.004
    bpy.data.objects.remove(old,do_unlink=True)
    piece=Assembly('PLURR heart pendant and bail',surf,[metal,accent],'accessories','plurr-beads')
    points=[]
    for a in np.linspace(0,math.tau,49)[:-1]:
        x=16*math.sin(a)**3;z=13*math.cos(a)-5*math.cos(2*a)-2*math.cos(3*a)-math.cos(4*a)
        points.append(Vector(center)+Vector((x*.00058,-.001,z*.00058)))
    piece.wire(points+[points[0]],.0008,0,6)
    c=Vector(center)+Vector((0,-.003,0));vs=[c]+points
    piece.add((vs,[(0,i+1,(i+1)%48+1) for i in range(48)],[(.5,.5)]*49),1)
    peak=max(points,key=lambda p:p.z)
    piece.wire(rect_loop(peak+Vector((0,0,.003)),(1,0,0),(0,0,1),.004,.007,.001),.0007,0,6)
    return piece.finish()


def paint(sex,objects):
    if sex!='female':return []
    records=[];bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=1
    for ob in objects:
        if not ob.data.uv_layers:continue
        for i,original in enumerate(list(ob.data.materials)):
            if 'splatter' not in original.name.lower():continue
            mat=original.copy();ob.data.materials[i]=mat;f=Field(mat);bs=mat.node_tree.nodes['Principled BSDF']
            color=(.006,.007,.011,1)
            top=ob.get('avatarSlot')=='top'
            centers=([(-.105,-.103,1.29,.050,.045,.080,(.60,.003,.18,1)),(.085,-.106,1.345,.052,.045,.046,(.31,.67,.006,1))] if top else [
                (-.125,-.100,.77,.078,.078,.100,(.62,.003,.16,1)),
                (-.115,-.115,.60,.074,.060,.09,(.31,.68,.005,1)),
                (.155,-.06,.70,.071,.10,.12,(.008,.26,.50,1)),
                (.10,-.110,.41,.055,.060,.065,(.33,.008,.39,1))])
            if top: centers.append((.006,-.12,1.305,.032,.05,.048,(.62,.006,.18,1)))
            for index,(x,y,z,wx,wy,wz,pigment) in enumerate(centers):
                angle=[-.35,.65,-.45,.3][index%4];c,s=math.cos(angle),math.sin(angle)
                env=f.math('MULTIPLY',f.gaussian(f.dot((x,y,z),(c,0,-s)),wx*.70),f.gaussian(f.dot((x,y,z),(s,0,c)),wz*1.25))
                env=f.math('MULTIPLY',env,f.gaussian(f.dot((x,y,z),(0,1,0)),wy))
                noise=f.noise(36+index*9)
                patches=f.math('MINIMUM',1,f.math('MAXIMUM',0,f.math('MULTIPLY',f.math('SUBTRACT',f.math('MULTIPLY',env,noise),.29),22)))
                vor=mat.node_tree.nodes.new('ShaderNodeTexVoronoi');vor.inputs['Scale'].default_value=180+index*17
                mat.node_tree.links.new(f.position,vor.inputs['Vector'])
                drops=f.math('LESS_THAN',vor.outputs['Distance'],f.math('MULTIPLY',env,.29))
                erosion=f.math('MINIMUM',1,f.math('MAXIMUM',0,f.math('MULTIPLY',f.math('SUBTRACT',f.noise(115+index*11),.47),10)))
                mask=f.math('MAXIMUM',f.math('MULTIPLY',patches,erosion),drops)
                mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX'
                mat.node_tree.links.new(mask,mix.inputs[0])
                if isinstance(color,tuple):mix.inputs[1].default_value=color
                else:mat.node_tree.links.new(color,mix.inputs[1])
                mix.inputs[2].default_value=pigment;color=mix.outputs[0]
            tex,_=bake(ob,mat,f'{sex}-authored-paint-{ob.name.replace(" ","_")}-{i}',color,size=2048 if ob.name=='AvatarBottoms_cargo-pants' else 1024)
            mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
            records.append({'object':ob.name,'image':tex.image.name,'paintRegions':len(centers)})
    return records


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-footwear-refined.blend'))
    s=bpy.context.scene;r=bpy.data.objects['AvatarSkeleton'];r.animation_data.action=bpy.data.actions['idle'];A.sample(s,1)
    body=Surface(r,bpy.data.objects['AvatarBody']);pants=Surface(r,bpy.data.objects['AvatarBottoms_cargo-pants'])
    cloth=bpy.data.objects['AvatarBottoms_cargo-pants'].data.materials[0]
    webbing=material('Launch '+sex+' woven black webbing',(.010,.012,.018),.76)
    edge=material('Launch '+sex+' garment edge',(.49,.29,.075) if sex=='male' else (.30,.64,.008),.37,.66 if sex=='male' else .08)
    metal=material('Launch '+sex+' buckle metal',(.56,.34,.11) if sex=='male' else (.027,.031,.045),.23,.86)
    accent=material('PLURR candy pendant',(.65,.008,.18),.23,.25)
    initial={o.name:array(o).copy() for o in s.objects if o.type=='MESH' and o.get('avatarSlot') in ['body','hair','jacket','shoes']}
    report={'pockets':pockets(sex,r,pants,cloth,edge,metal)}
    report['belt'],_=belt_and_chains(sex,r,pants,webbing,edge,metal)
    seams_and_webbing(sex,r,pants,webbing,edge,metal)
    if sex=='female':underbust(body,r,webbing,metal,edge);heart_pendant(body,edge,accent)
    report['paint']=paint(sex,[o for o in s.objects if o.type=='MESH' and o.get('avatarSlot') in ['top','bottoms']])
    for name,points in initial.items():assert np.array_equal(points,array(bpy.data.objects[name])),name
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-outfit-refined.blend'),compress=True)
    (OUT/f'{sex}-outfit-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=1.58
        s.view_settings.exposure=-.8;s.render.resolution_x=950;s.render.resolution_y=1100
        cam.location=(.60,-4,1.13);review.look_at(cam,Vector((0,-.015,.90)))
        s.render.filepath=str(OUT/f'{sex}-outfit-refined.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
