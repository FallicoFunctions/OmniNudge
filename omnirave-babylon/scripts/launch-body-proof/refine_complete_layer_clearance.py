"""Fit the covered shoulder/underarm panels over their actual underlayers.

Connection map: all jacket boundary vertices stay exact. Only the measured
covered shoulder region (male) and underarm region (female) may move. Existing
corrective deltas and skin weights are retained; sewn hardware follows the
resulting shell. The shirts, jewelry, hood, body and other garments stay exact.
Clearance samples include evaluated underlayer vertices and triangle interiors.
"""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from refine_complete_drape import adjacency
from refine_complete_surfaces import posed_offset
from refine_complete_jacket_shape import follow_hardware
from refine_complete_jacket_finish import reattach_hardware
import audit_rigged_jacket_sleeves as A

LAYERS={'male':['AvatarTop_tailored','Launch constructed neck jewelry'],'female':['Launch fitted crop top']}
CLEARANCE=.0025

def patch(coat,sex):
    p=array(coat,True);a,b,degree,boundary=adjacency(coat)
    mask=(np.abs(p[:,0])>.075)&(np.abs(p[:,0])<.25)&(p[:,2]>(1.425 if sex=='male' else 1.235))&(p[:,2]<(1.575 if sex=='male' else 1.40))
    if sex=='female':mask &= (np.abs(p[:,0])<.16)&(p[:,1]<-.035)&(p[:,1]>-.11)&(p[:,2]>1.285)&(p[:,2]<1.355)
    mask[list(boundary)]=False
    if coat.get('layerClearancePatchVertices') is not None:
        mask[:]=False;mask[list(coat['layerClearancePatchVertices'])]=True
    else:coat['layerClearancePatchVertices']=np.flatnonzero(mask).tolist()
    faces=np.array([list(f.vertices) for f in coat.data.polygons]);assert faces.shape[1]==3
    return mask,faces[np.all(mask[faces],axis=1)],(a,b,degree,boundary)

def samples(name):
    p,f=A.H.geometry(bpy.data.objects[name]);p=np.asarray(p);tri=p[np.asarray(f)]
    return np.concatenate([p,tri.mean(1),(tri[:,0]+tri[:,1])*.5,(tri[:,1]+tri[:,2])*.5,(tri[:,2]+tri[:,0])*.5])

def measure(coat,faces,sex,margin=CLEARANCE):
    p=array(coat,True)
    if sex=='female':
        tri=p[faces];normal=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);normal/=np.maximum(np.linalg.norm(normal,axis=1),1e-10)[:,None]
        faces=faces[normal[:,0]*np.sign(tri.mean(1)[:,0])>.65]
    tree=BVHTree.FromPolygons([Vector(q) for q in p],faces.tolist(),all_triangles=True)
    delta=np.zeros_like(p);depth=np.zeros(len(p));rows=[]
    for name in LAYERS[sex]:
        close=0;bad=0;maximum=-1.;pts=samples(name)
        if sex=='female':pts=pts[json.loads(coat['layerClearanceUnderlayerSamples'])]
        for pt in pts:
            hit,n,index,d=tree.find_nearest(Vector(pt),.009)
            if hit is None:continue
            # Reject samples whose closest point lies at the artificial patch
            # perimeter: these are beside the patch, not underneath its panel.
            offset=Vector(pt)-hit;signed=offset.dot(n)
            if (offset-n*signed).length>.00002:continue
            close+=1;maximum=max(maximum,signed)
            if signed>-margin:
                bad+=1;required=signed+margin+.0004
                for v in faces[index]:
                    if required>depth[v]:depth[v]=required;delta[v]=np.array(n)*required
        rows.append({'layer':name,'samples':len(pts),'nearPanelSamples':close,'clearanceFailures':bad,'maximumSignedDistanceMm':maximum*1000 if close else None})
    return delta,rows

def run(sex,audit=False,source=None):
    source=source or ('runtime' if audit else 'jacket-shape-refined')
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Structured armhole jacket'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')!='jacket'}
    initial=array(coat).copy();keys=np.array([[v.co[:] for v in k.data] for k in coat.data.shape_keys.key_blocks]);disabled=[(m,m.show_viewport) for m in coat.modifiers if m.type!='ARMATURE']
    for m,_ in disabled:m.show_viewport=False
    A.update();mask,faces,graph=patch(coat,sex);aa,bb,degree,boundary=graph
    if sex=='female' and not coat.get('layerClearanceUnderlayerSamples'):
        pts=samples(LAYERS[sex][0]);region=(np.abs(pts[:,0])>.110)&(np.abs(pts[:,0])<.143)&(pts[:,1]>-.085)&(pts[:,1]<-.040)&(pts[:,2]>1.295)&(pts[:,2]<1.342)
        coat['layerClearanceUnderlayerSamples']=json.dumps(np.flatnonzero(region).tolist())
    history=[]
    for iteration in range(1 if audit else 14):
        rows=[]
        for clip in ['idle','walk','run']:
            rig.animation_data.action=bpy.data.actions[clip]
            for frame in np.linspace(*rig.animation_data.action.frame_range,9):
                A.sample(scene,float(frame));delta,stats=measure(coat,faces,sex)
                rows.append({'clip':clip,'frame':float(frame),'layers':stats})
                if not audit and np.any(delta):
                    # Spread corrections into nearby free cloth without reducing
                    # their measured required lift or moving a sewn boundary.
                    for _ in range(4):
                        average=np.zeros_like(delta);np.add.at(average,aa,delta[bb]);average/=np.maximum(degree,1)[:,None]
                        use=np.linalg.norm(average,axis=1)>np.linalg.norm(delta,axis=1)
                        delta[use]=average[use];delta[~mask]=0
                    posed_offset(coat,rig,delta)
        failures=sum(s['clearanceFailures'] for r in rows for s in r['layers'])
        row={'iteration':iteration,'clearanceFailures':failures,'maximumSignedDistanceMm':max(s['maximumSignedDistanceMm'] for r in rows for s in r['layers'] if s['nearPanelSamples'])};history.append(row);print(sex,'LAYER_CLEARANCE',row,flush=True)
        if failures==0:break
    report={'source':source,'minimumMidSurfaceClearanceMm':CLEARANCE*1000,'jacketThicknessMm':max(getattr(m,'thickness',0) for m in coat.modifiers)*1000,'sampledPoses':len(rows),'history':history,'rows':rows,'scope':'Evaluated underlayer vertices, triangle centers and edge midpoints beneath the covered shoulder/underarm patch in 27 poses; not continuous collision certification.'}
    assert all(stat['nearPanelSamples']>0 for row in rows for stat in row['layers']), 'A layer lost contact with the audited panel region'
    assert failures==0,report['history']
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    if not audit:
        assert np.array_equal(array(coat)[list(boundary)],initial[list(boundary)])
        after=np.array([[v.co[:] for v in k.data] for k in coat.data.shape_keys.key_blocks]);assert np.max(np.abs((after-after[:1])-(keys-keys[:1])))<1e-6
        report['maximumBindDisplacementMm']=float(np.linalg.norm(array(coat)-initial,axis=1).max()*1000)
        assert report['maximumBindDisplacementMm']<15,report['maximumBindDisplacementMm']
        report['hardwareFollowed']=follow_hardware(coat,initial);report['hardwareRebinding']=reattach_hardware(rig,coat)
        for name,p in retained.items():assert np.array_equal(p,array(bpy.data.objects[name])),name
        report['preservedOtherMeshes']=len(retained);report['preservedBoundaryVertices']=len(boundary)
    for m,state in disabled:m.show_viewport=state
    A.update()
    if not audit:
        bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-layer-refined.blend'),compress=True)
    (OUT/f'{sex}-layer-{"validation" if audit else "refinement"}.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--audit',action='store_true');p.add_argument('--source');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.audit,a.source)
