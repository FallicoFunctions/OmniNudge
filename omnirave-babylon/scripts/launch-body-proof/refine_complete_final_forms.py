"""Resolve the remaining broad sleeve bands and stray ponytail silhouette.

Connection map: sleeve cuffs, shoulder joins, opening and hem keep their exact
vertices. Only sleeve interiors move; the existing skin and corrective deltas
own them. Pony ribbons and flyaways keep their two root-edge vertices attached
to the same measured core. These thin hair layers use millimeter clearances,
not structural overlaps. Body, faces and all other fitted pieces stay exact.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from complete_pair_geometry import Surface,skin_weights,smooth
from refine_complete_drape import adjacency,diffuse,fit
from refine_complete_surfaces import posed_offset
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
from refine_launch_faces import replace_posed
import audit_rigged_jacket_sleeves as A


def sleeves(coat,rig):
    p=array(coat,True);weights=skin_weights(coat,list(rig.data.bones.keys()))
    names=list(rig.data.bones.keys());fields=[];combined=np.zeros(len(p))
    _,_,_,boundary=adjacency(coat)
    for side,sign in [('l',1),('r',-1)]:
        upper=rig.pose.bones['upperarm_'+side];lower=rig.pose.bones['lowerarm_'+side]
        shoulder=np.array(upper.head);elbow=np.array(lower.head);wrist=np.array(lower.tail)
        ua=elbow-shoulder;ul=np.linalg.norm(ua);ua/=ul
        la=wrist-elbow;la/=np.linalg.norm(la)
        on_upper=(p-shoulder)@ua<ul
        arc=np.where(on_upper,(p-shoulder)@ua,ul+(p-elbow)@la)
        center=np.where(on_upper[:,None],shoulder+((p-shoulder)@ua)[:,None]*ua,elbow+((p-elbow)@la)[:,None]*la)
        radial=p-center;radial/=np.maximum(np.linalg.norm(radial,axis=1),1e-8)[:,None]
        theta=np.arctan2(sign*radial[:,0],-radial[:,1])
        arm=weights[:,names.index('upperarm_'+side)]+weights[:,names.index('lowerarm_'+side)]
        cuff=float(np.max(arc[arm>.7]))
        mask=smooth((arm-.55)/.35)*smooth((arc-(ul-.11))/.095)*smooth((cuff-.025-arc)/.055)
        mask[list(boundary)]=0;combined=np.maximum(combined,mask)
        fields.append((side,sign,arc,theta,radial,mask,ul,cuff))
    q,_=diffuse(p,coat,combined,90,.024)
    for side,sign,arc,theta,radial,mask,ul,cuff in fields:
        for j,(at,angle,slope,amplitude) in enumerate([
                (ul-.035,-.65,.048,.006),(ul+.030,.50,-.047,.008),
                (cuff-.115,-.25,.041,.009),(cuff-.066,.95,-.034,.006)]):
            delta=(theta-angle-sign*.18+math.pi)%math.tau-math.pi
            along=arc-at+slope*np.sin(theta+j*.6+sign*.3)
            width=.011 if j%2 else .014
            profile=np.exp(-(along/width)**2)-.35*np.exp(-((along+width*1.6)/(width*.8))**2)
            envelope=np.exp(-(delta/.95)**4)
            q+=radial*(amplitude*profile*envelope*mask)[:,None]
    # Leave the unmoved carrier exact so cuffs and existing fittings keep their
    # sampled attachment. The fit may only correct the selected sleeve region.
    fixed=set(np.flatnonzero(combined==0))|boundary
    q[list(fixed)]=p[list(fixed)]
    original=array(coat).copy();posed_offset(coat,rig,q-p)
    report={'selectedVertices':int((combined>0).sum()),'maximumSculptMm':float(np.linalg.norm(q-p,axis=1).max()*1000)}
    report['fit']=fit([coat],rig,{coat.name:fixed})
    assert np.array_equal(array(coat)[list(fixed)],original[list(fixed)])
    report['fixedVertices']=len(fixed)
    return report


def pony(surf):
    core=Surface(surf.rig,bpy.data.objects['PLURR gathered pony bundle']);report={}
    for name in ['PLURR pony strands '+str(i) for i in range(4)]+['Polished female flyaways']:
        ob=bpy.data.objects[name];p=array(ob,True);q=p.copy();raw=array(ob).copy();root_ids=[];count=0
        for ids in islands(ob):
            if not name.startswith('Polished') and len(ids)!=36:continue
            r=p[ids].reshape(-1,2,3);path=r.mean(1);half=(r[:,1]-r[:,0])*.5
            t=np.linspace(0,1,len(r));free=smooth((t-.10)/.90)
            amount=.64 if name.startswith('Polished') else .23
            for j,point in enumerate(path):
                hit,n,_,distance=core.tree.find_nearest(Vector(point))
                if distance>.008:
                    path[j]+=(np.array(hit+n*.006)-point)*amount*free[j]
            q[ids]=np.stack([path-half,path+half],axis=1).reshape(-1,3)
            root_ids.extend(ids[:2]);count+=1
        replace_posed(ob,q,surf)
        # Inverse skinning roundoff must not change the proven root attachment.
        local=array(ob);local[root_ids]=raw[root_ids]
        unchanged=np.linalg.norm(q-p,axis=1)<1e-10;local[unchanged]=raw[unchanged]
        ob.data.vertices.foreach_set('co',local.astype(np.float32).ravel());ob.data.update();A.update()
        assert np.array_equal(array(ob)[root_ids],raw[root_ids])
        report[name]={'ribbons':count,'fixedRootVertices':len(root_ids),'maximumDisplacementMm':float(np.linalg.norm(q-p,axis=1).max()*1000),'boundsMin':array(ob,True).min(0).tolist(),'boundsMax':array(ob,True).max(0).tolist()}
    return report


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-transmission-refined.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    before={o.name:geometry_contract(o) for o in scene.objects if o.type=='MESH'}
    changed=set();report={'source':'transmission-refined','changed':sex=='female'}
    if sex=='female':
        coat=bpy.data.objects['Structured armhole jacket'];disabled=[]
        for mod in coat.modifiers:
            if mod.type!='ARMATURE':disabled.append((mod,mod.show_viewport,mod.show_render));mod.show_viewport=False;mod.show_render=False
        A.update();report['sleeves']=sleeves(coat,rig);changed.add(coat.name)
        for mod,view,ren in disabled:mod.show_viewport=view;mod.show_render=ren
        A.update();report['pony']=pony(Surface(rig,bpy.data.objects['AvatarBody']));changed.update(report['pony'])
    for name,contract in before.items():
        if name not in changed:assert geometry_contract(bpy.data.objects[name])==contract,name
    report['unchangedMeshes']=len(before)-len(changed)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-final-forms.blend'),compress=True)
    (OUT/f'{sex}-final-forms.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=1.10
        scene.view_settings.exposure=-.8;scene.render.resolution_x=800;scene.render.resolution_y=900;scene.cycles.samples=16
        for label,offset in [('front',(0,-4,.04)),('oblique',(2.0,-4,.04))]:
            target=Vector((0,-.015,1.30));cam.location=target+Vector(offset);review.look_at(cam,target)
            scene.render.filepath=str(OUT/f'{sex}-final-forms-{label}.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
