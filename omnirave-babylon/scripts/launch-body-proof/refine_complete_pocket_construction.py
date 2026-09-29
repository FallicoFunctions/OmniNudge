"""Rebuild regular zipper tapes and hardware over the finished coat.

Connection map: closed pocket tapes follow the measured coat surface with
1.8 mm backing clearance; their 0.6 mm thickness carries raised outer welts.
Teeth embed 0.08 mm into the tape top. Sliders sit over the final tooth pair;
their pull tabs overlap the slider hinge by 0.2 mm. Small textile connections
use these measured sub-mm overlaps, rather than a furniture-scale overlap.
Coat, body, hood and all other non-hardware geometry stay exact. The coat's
14 corrective channels and the existing armature own the six rebuilt parts.
The existing main-opening slider retains its geometry and binding.
"""
import argparse,json,sys,math
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from complete_pair_geometry import Surface
from build_rigged_jacket_hardware import Attachment,Writer,barycentric,box,octagon
from refine_complete_jacket_finish import reattach_hardware
import audit_rigged_jacket_sleeves as A

class Support(Attachment):
    def __init__(self,rig,coat):
        self.rig=rig;self.coat=coat;self.scene=bpy.context.scene
        self.surface=Surface(rig,coat);self.mid=self.surface.array
        self.group_names=self.surface.names;self.weights=self.surface.weights.copy();self.bone_matrices=self.surface.mats
        # These two transforms are checked equivalent across all three clips
        # by the final attachment step; merge them before four-weight binding.
        pelvis=self.group_names.index('pelvis');spine=self.group_names.index('spine_01')
        self.weights[:,spine]+=self.weights[:,pelvis];self.weights[:,pelvis]=0
        source=np.array([[p.co[:] for p in k.data] for k in coat.data.shape_keys.key_blocks])
        skin=np.einsum('vg,gij->vij',self.weights,self.bone_matrices)
        self.world_shapes=np.einsum('vij,kvj->kvi',skin,np.concatenate([source,np.ones((*source.shape[:2],1))],axis=2))[:,:,:3]
        self.maximum_dropped_weight=0.;self.maximum_condition=0.
        assert np.max(np.abs(np.array(coat.matrix_world)-np.eye(4)))<1e-8

    def project(self,point,normal):
        hit,n,index,d=self.surface.tree.ray_cast(Vector(point+normal*.08),Vector(-normal),.16)
        assert hit is not None,('Missing coat support',point.tolist())
        assert n.dot(Vector(normal))>.15,('Wrong coat side',point.tolist(),list(n))
        ids=self.surface.faces[index];bc=barycentric(np.array(hit),self.mid[ids])
        return ids,bc,np.array(hit),np.array(n),bc@self.mid[ids]

class Patch:
    def __init__(self,old,support,sex):
        metadata=json.loads(old['attachmentComponents'])[0]
        count=json.loads(old['attachmentComponents'])[1]['first_vertex'];assert count%32==0
        line=array(old,True)[:count].reshape(count//32,2,16,3).mean((1,2))
        self.length=float(np.linalg.norm(line[-1]-line[0]));self.axis=(line[-1]-line[0])/self.length
        self.start=line[0].copy();self.support=support
        shift=np.zeros(3)
        if 'sleeve' in old.name:
            bone=support.rig.pose.bones['upperarm_l'];elbow=np.array(support.rig.pose.bones['lowerarm_l'].head)
            arm=elbow-np.array(bone.head);arm/=np.linalg.norm(arm)
            # Keep the utility zipper above the swept forearm-fold zone, where
            # the oversized forearm folds sweep across its former lower end.
            clearance=.125 if sex=='female' else .045
            shift=-arm*max(0,float(np.max((line-elbow)@arm))+clearance)
        elif sex=='female':
            # Measured running forearm/hip contact needs 12 mm medial release.
            shift[0]=-np.sign(self.start[0])*.012
        self.start+=shift;self.shift=shift
        normals=[np.array(support.surface.tree.find_nearest(Vector(p))[1]) for p in line]
        n=np.mean(normals,axis=0);n-=self.axis*np.dot(n,self.axis);self.normal=n/np.linalg.norm(n)
        self.side=np.cross(self.normal,self.axis);self.side/=np.linalg.norm(self.side)
        self.width=.020 if 'sleeve' in old.name else .014
        self.old_width=metadata['width_m']
        self.lift=0.
    def anchor(self,u,v):return self.support.project(self.start+self.axis*u+self.side*v,self.normal)
    def frame(self,u,v):
        anchor=self.anchor(u,v);a=self.anchor(u-.0003,v)[2];b=self.anchor(u+.0003,v)[2]
        direction=b-a;direction/=np.linalg.norm(direction)
        across=self.side-direction*np.dot(self.side,direction);across/=np.linalg.norm(across)
        normal=np.cross(direction,across)
        if np.dot(normal,self.normal)<0:across=-across;normal=-normal
        return anchor,direction,across,normal


def pocket(name,patch,at,mats):
    w=Writer(name,at,mats);length=patch.length;width=patch.width
    def emit(u,v,h):
        anchor=patch.anchor(u,v);return w.vertex(anchor,anchor[2]+patch.normal*(h+patch.lift))
    w.begin('panel',length_m=length,width_m=width)
    rows=int(math.ceil(length/.002));cross=np.array([-1,-.85,-.68,-.55,-.30,0,.30,.55,.68,.85,1])
    top=[];bottom=[]
    for i in range(rows+1):
        u=i/rows*length
        # Rounded/tapered ends; both longitudinal welt borders share one grid.
        taper=.80+.20*min(1,min(u,length-u)/.0025)
        top.append([emit(u,v*width/2*taper,.0024+(.00035 if abs(v)>.68 else 0)) for v in cross])
        bottom.append([emit(u,v*width/2*taper,.0018) for v in cross])
    for i in range(rows):
        for j in range(len(cross)-1):
            mat=0 if abs((cross[j]+cross[j+1])/2)>.68 else 1
            w.face([top[i][j],top[i+1][j],top[i+1][j+1],top[i][j+1]],mat)
            w.face([bottom[i][j+1],bottom[i+1][j+1],bottom[i+1][j],bottom[i][j]],0)
    edge=top[0]+[r[-1] for r in top[1:]]+list(reversed(top[-1][:-1]))+[r[0] for r in reversed(top[1:-1])]
    lower=bottom[0]+[r[-1] for r in bottom[1:]]+list(reversed(bottom[-1][:-1]))+[r[0] for r in reversed(bottom[1:-1])]
    for j in range(len(edge)):
        k=(j+1)%len(edge);w.face([edge[j],lower[j],lower[k],edge[k]],0)
    pitch=.0025;teeth=int((length-.017)/pitch)
    # The last tooth center lies 1.25 mm inside the slider along the track,
    # providing contact at the shared 2.8–3.1 mm height interval.
    patch.slider_u=.005+(teeth-1+.75)*pitch+.0020
    for i in range(teeth):
        for sign in [-1,1]:
            u=.005+(i+(.25 if sign<0 else .75))*pitch;v=sign*.0007
            anchor,axis,side,normal=patch.frame(u,v)
            w.begin('tooth',along_m=u,side=sign)
            def emit_tooth(du,dv,h,anchor=anchor,axis=axis,side=side):
                return w.vertex(anchor,anchor[2]+axis*du+side*dv+patch.normal*(h+patch.lift))
            box(w,emit_tooth,(0,0),.00105,.00155,.00232,.00078)
    return w,{'lengthMm':length*1000,'widthBeforeMm':patch.old_width*1000,'widthAfterMm':width*1000,'teeth':teeth*2,'rows':rows,'additionalBackingClearanceMm':patch.lift*1000,'placementShiftMm':(patch.shift*1000).tolist(),'lastToothCenterInsideSliderMm':1.25}


def pull(name,patch,at,mats,u=None):
    w=Writer(name,at,mats);u=patch.slider_u if u is None else u
    anchor,axis,side,normal=patch.frame(u,0)
    def emit(a,b,h):return w.vertex(anchor,anchor[2]+axis*a+side*b+patch.normal*(h+patch.lift))
    w.begin('slider');box(w,emit,(0,0),.0065,.005,.0028,.0020)
    w.begin('pull');outer=octagon(.016,.0045,.0008);inner=octagon(.010,.002,.00045)
    rings=[]
    for h in [.0046,.0055]:
        for loop in [outer,inner]:rings.append([emit(a-.0055,b,h+max(0,-a)*.18) for a,b in loop])
    lo,li,hi,inside=rings
    for j in range(8):
        k=(j+1)%8
        for face in [[lo[j],lo[k],hi[k],hi[j]],[li[k],li[j],inside[j],inside[k]],[hi[j],hi[k],inside[k],inside[j]],[lo[k],lo[j],li[j],li[k]]]:w.face(face,2)
    return w


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-layer-refined.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Structured armhole jacket'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and (not o.get('jacketHardware') or o.name=='Jacket detail - main zipper pull')}
    old={o.name:o for o in scene.objects if o.type=='MESH' and o.get('jacketHardware') and o.name!='Jacket detail - main zipper pull'};before_triangles=sum(len(o.data.polygons) for o in old.values())
    # Use the coat mid-surface for shape/weight correspondence; final checks
    # include its Solidify modifier as rendered and exported.
    disabled=[(m,m.show_viewport) for m in coat.modifiers if m.type!='ARMATURE']
    for m,_ in disabled:m.show_viewport=False
    A.update();at=Support(rig,coat);writers=[];report={'source':'layer-refined','pockets':{}};properties={n:dict(o.items()) for n,o in old.items()}
    for name in ['left hip pocket','right hip pocket','left sleeve utility pocket']:
        ob=old['Jacket detail - '+name];patch=Patch(ob,at,sex);mats=list(ob.data.materials)
        w,info=pocket(name,patch,at,mats);writers.append(w);report['pockets'][name]=info
        writers.append(pull(name+' pull',patch,at,mats))
    for ob in old.values():bpy.data.objects.remove(ob,do_unlink=True)
    built=[]
    for w in writers:
        ob,part,_=w.finish();props=properties[ob.name]
        for key,value in props.items():
            if key not in ['attachmentComponents']:ob[key]=value
        ob['pocketConstruction']='regular-closed-tape-v1';part['renderCenter']=array(ob,True).mean(0).tolist();built.append(part)
    main=bpy.data.objects['Jacket detail - main zipper pull'];main['jacketHardware']=False
    try:report['attachment']=reattach_hardware(rig,coat)
    finally:main['jacketHardware']=True
    for m,state in disabled:m.show_viewport=state
    A.update()
    for name,p in retained.items():assert np.array_equal(p,array(bpy.data.objects[name])),name
    report['preservedOtherMeshes']=len(retained);report['parts']=built
    report['trianglesBefore']=before_triangles;report['trianglesAfter']=sum(len(bpy.data.objects[p['name']].data.polygons) for p in built)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-pocket-refined.blend'),compress=True)
    (OUT/f'{sex}-pocket-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ['parts','attachment']}),flush=True)
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.25;scene.view_settings.exposure=-.8;scene.render.resolution_x=1000;scene.render.resolution_y=1000
        before=json.loads((OUT/f'{sex}-hardware-inspection.json').read_text());parts={p['name']:p for p in built}
        for name,offset in [('left sleeve utility pocket',(1.1,-4,.2)),('left hip pocket',(.7,-4,.1))]:
            # The before camera centered all panel + tooth vertices, including
            # their slight material-dependent bias. Recover that exact center.
            full='Jacket detail - '+name
            center=(Vector(before[full]['renderCenter'])+Vector(parts[full]['renderCenter']))*.5
            cam.data.ortho_scale=.35 if 'sleeve' in name else .25
            cam.location=center+Vector(offset);review.look_at(cam,center);scene.render.filepath=str(OUT/f'{sex}-hardware-after-{name.replace(" ","-")}.png');bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
