"""Shape loose sleeve volumes and a folded collar before finish-map baking.

Connection map: jacket collar/front/hem and sleeve cuff boundaries stay exact.
The cloth between shoulder and cuff gathers around its measured arm axis.
Sewn jacket hardware follows the resulting shell displacement. The female
hood and its binding use one field; its inner neck attachment stays fixed.
All clothing retains the existing armature and corrective-shape ownership.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array,review
from complete_pair_geometry import skin_weights,smooth
from refine_complete_surfaces import posed_offset
from refine_complete_drape import adjacency,fit,offset_keys
import audit_rigged_jacket_sleeves as A


def refine_density(coat,rig):
    count=len(coat.data.vertices)
    keys={k.name:np.array([list(v.co) for v in k.data]) for k in coat.data.shape_keys.key_blocks}
    bm=bmesh.new();bm.from_mesh(coat.data)
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
    bm.to_mesh(coat.data);bm.free();coat.data.update()
    for key in coat.data.shape_keys.key_blocks:
        assert np.array_equal(keys[key.name],np.array([list(v.co) for v in key.data[:count]])),key.name
    names=list(rig.data.bones.keys());weights=skin_weights(coat,names)
    for i in range(count,len(coat.data.vertices)):
        row=weights[i];keep=np.argsort(row)[-4:];total=row[keep].sum()
        assert total>0
        for j,name in enumerate(names):
            group=coat.vertex_groups.get(name)
            if not group:continue
            if j in keep and row[j]>1e-8:group.add([i],float(row[j]/total),'REPLACE')
            else:group.remove([i])
    A.update()
    return {'verticesBefore':count,'verticesAfter':len(coat.data.vertices),'retainedCorrectiveKeys':len(keys),'originalKeyVerticesPreservedExactly':True}


def sleeves(coat,rig,sex):
    p=array(coat,True);q=p.copy();names=list(rig.data.bones.keys());weights=skin_weights(coat,names)
    _,_,_,boundary=adjacency(coat);report={}
    for side,sign in [('l',1),('r',-1)]:
        upper=rig.pose.bones['upperarm_'+side];lower=rig.pose.bones['lowerarm_'+side]
        shoulder=np.array(upper.head);elbow=np.array(lower.head);wrist=np.array(lower.tail)
        ua=(elbow-shoulder);ul=np.linalg.norm(ua);ua/=ul
        la=(wrist-elbow);ll=np.linalg.norm(la);la/=ll
        on_upper=(p-shoulder)@ua<ul
        arc=np.where(on_upper,(p-shoulder)@ua,ul+(p-elbow)@la)
        center=np.where(on_upper[:,None],shoulder+((p-shoulder)@ua)[:,None]*ua,elbow+((p-elbow)@la)[:,None]*la)
        radial=p-center;radius=np.linalg.norm(radial,axis=1);direction=radial/np.maximum(radius,1e-8)[:,None]
        arm=weights[:,names.index('upperarm_'+side)]+weights[:,names.index('lowerarm_'+side)]
        cuff=float(np.max(arc[arm>.7]));mask=smooth((arm-.25)/.50)*smooth((arc-.025)/.10)*smooth((cuff-arc)/.027)
        mask[list(boundary)]=0
        theta=np.arctan2(sign*direction[:,0],-direction[:,1])
        # Broad ease supports asymmetric folds instead of isolated ridge bands.
        ease=(.009 if sex=='male' else .018)*smooth((arc-.08)/.14)
        ease+=(.004 if sex=='male' else .009)*np.exp(-((arc-(cuff-.12))/.11)**2)
        ease+=(.004 if sex=='male' else .011)*smooth((arc-.025)/.08)*(1-smooth((arc-.20)/.12))
        displacement=ease.copy()
        for j,(distance,width,amp) in enumerate([( .032,.009,.010),(.074,.012,.013),(.119,.013,.014),(.171,.015,.011),(.230,.018,.008)]):
            phase=arc-(cuff-distance)+(.018+distance*.050)*np.sin(theta*(1 if j%2 else 2)+j*.9+sign*.35)
            phase+=.004*np.cos(theta*3-j)
            profile=np.exp(-(phase/width)**2)-.28*np.exp(-((phase+width*1.8)/(width*.75))**2)
            angle=(theta-[-.6,.8,-.35,1.0,-1.2][j]-sign*.25+math.pi)%math.tau-math.pi
            angular=.08+.92*np.exp(-(angle/1.45)**2)
            displacement+=(amp*(1.40 if sex=='female' else 1))*profile*angular
        delta=direction*(displacement*mask)[:,None]
        q+=delta
        report[side]={'sleeveVertices':int((arm>.7).sum()),'shoulderToCuffM':cuff,'maximumEaseAndFoldMm':float(np.linalg.norm(delta,axis=1).max()*1000)}
    arm=sum(weights[:,names.index(b+'_'+side)] for side in ['l','r'] for b in ['upperarm','lowerarm'])
    hem=float(np.min(p[np.abs(p[:,0])<.14,2]));torso=smooth((.45-arm)/.35)*smooth((p[:,2]-hem)/.03)*smooth((hem+.30-p[:,2])/.10)
    torso[list(boundary)]=0
    theta=np.arctan2(p[:,0],-(p[:,1]+.025));direction=np.c_[np.sin(theta),-np.cos(theta),np.zeros(len(p))]
    for j,dz in enumerate([.048,.105,.19]):
        phase=p[:,2]-hem-dz+.034*np.sin(theta*(j%2+1)+j*1.2)
        envelope=np.exp(-((np.abs(theta)-.72)/.65)**2)
        amplitude=(.0045 if sex=='male' else .006)*np.exp(-(phase/(.015+j*.004))**2)*envelope*torso
        q+=direction*amplitude[:,None]
    posed_offset(coat,rig,q-p)
    return report,boundary


def folded_collar(rig):
    report={};neck=rig.pose.bones['neck_01'].head.z
    for name in ['PLURR folded hood','PLURR hood binding']:
        ob=bpy.data.objects[name];p=array(ob,True);q=p.copy()
        fold=smooth((neck+.016-p[:,2])/.070)
        q[:,0]-=np.sign(p[:,0])*np.maximum(0,np.abs(p[:,0])-.065)*.30*fold
        theta=np.arctan2(p[:,0],p[:,1]+.025)
        q[:,2]-=.013*fold
        q[:,2]+=.006*np.sin(theta*6.5+.4)*fold
        q[:,1]+=.004*np.sin(theta*2)*fold
        posed_offset(ob,rig,q-p)
        report[name]={'maximumAdjustmentMm':float(np.linalg.norm(q-p,axis=1).max()*1000),'widthBeforeMm':float(np.ptp(p[:,0])*1000),'widthAfterMm':float(np.ptp(q[:,0])*1000)}
    return report


def run(sex,source,render):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and o.get('avatarSlot') in ['body','hair','shoes','bottoms','top']}
    coat=bpy.data.objects['Structured armhole jacket'];density=refine_density(coat,rig);initial=array(coat).copy();disabled=[]
    for ob in [coat]+[bpy.data.objects[n] for n in ['PLURR folded hood','PLURR hood binding'] if n in bpy.data.objects]:
        for mod in ob.modifiers:
            if mod.type!='ARMATURE':disabled.append((mod,mod.show_viewport));mod.show_viewport=False
    A.update();report={'source':source,'density':density};report['sleeves'],boundary=sleeves(coat,rig,sex)
    report['fit']=fit([coat],rig,{coat.name:boundary})
    ids=list(boundary);assert np.array_equal(initial[ids],array(coat)[ids]),'Jacket connections moved'
    delta=array(coat)-initial;tree=KDTree(len(delta))
    for i,point in enumerate(initial):tree.insert(Vector(point),i)
    tree.balance();report['hardwareFollowed']=[]
    for ob in scene.objects:
        if ob.type!='MESH' or not ob.get('jacketHardware'):continue
        offsets=[]
        for point in array(ob):
            near=tree.find_n(Vector(point),6);ids=[i for _,i,_ in near];w=np.array([1/(.005+d)**2 for _,_,d in near]);offsets.append(np.sum(delta[ids]*w[:,None],axis=0)/w.sum())
        offset_keys(ob,np.array(offsets));report['hardwareFollowed'].append(ob.name)
    if sex=='female':report['foldedCollar']=folded_collar(rig)
    for mod,visible in disabled:mod.show_viewport=visible
    A.update()
    for name,points in retained.items():assert np.array_equal(points,array(bpy.data.objects[name])),name
    report['unchangedBodyHairShoesBottomsTopMeshes']=len(retained)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-silhouette-refined.blend'),compress=True)
    (OUT/f'{sex}-silhouette-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=1.15
        scene.view_settings.exposure=-.8;scene.render.resolution_x=1000;scene.render.resolution_y=1000
        for label,pos in [('front',(.35,-4,1.18)),('back',(-.35,4,1.22)),('side',(3.8,-1.2,1.2))]:
            cam.location=pos;review.look_at(cam,Vector((0,-.01,1.19)))
            scene.render.filepath=str(OUT/f'{sex}-silhouette-{label}.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--source',default='drape-refined');p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.source,a.render)
