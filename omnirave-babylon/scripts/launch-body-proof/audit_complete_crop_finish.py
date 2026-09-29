"""Check the shaped crop and its retained attachments in sampled native poses."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from refine_complete_crop_finish import cage
from complete_pair_geometry import skin_weights
import audit_rigged_jacket_sleeves as A


def run(source):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'female-face-finished.blend'))
    baseline=bpy.data.objects['Launch fitted crop top'];original=array(baseline).copy()
    names=[b.name for b in bpy.data.objects['AvatarSkeleton'].data.bones]
    weights=skin_weights(baseline,names);faces=[tuple(p.vertices) for p in baseline.data.polygons]
    preserved={o.name:array(o).copy() for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='Launch fitted crop top'}
    # Prove preservation at the crop-refinement boundary. Later jacket and hair
    # passes have their own boundary checks and legitimately change those parts.
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'female-crop-refined.blend'))
    for name,p in preserved.items():assert np.array_equal(array(bpy.data.objects[name]),p),name
    finished=array(bpy.data.objects['Launch fitted crop top']).copy()
    finished_weights=skin_weights(bpy.data.objects['Launch fitted crop top'],names)
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'female-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody'];top=bpy.data.objects['Launch fitted crop top']
    assert [tuple(p.vertices) for p in top.data.polygons]==faces
    assert np.array_equal(array(top)[:80],original[:80]),'Hem geometry changed'
    assert np.array_equal(skin_weights(top,names)[:80],weights[:80]),'Hem weights changed'
    # Verify the final artifact still carries that exact crop and neutral body.
    assert np.array_equal(array(top),finished),'Crop changed after its checked refinement'
    assert np.array_equal(skin_weights(top,names),finished_weights),'Crop weights changed after refinement'
    assert np.array_equal(array(body),preserved[body.name]),'Neutral body changed'
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    neutral=cage(top);edge=neutral.reshape(18,80,3)[-1]
    idx=17*80+np.flatnonzero((np.abs(edge[:,0])<.09)&(edge[:,1]<-.05))
    assert len(idx)>=20
    assert edge[0,2]<np.mean(edge[[10,70],2])-.02,'Scoop silhouette missing'
    rows=[]
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range,9):
            A.sample(scene,float(frame));p,f=A.H.geometry(body);tree=BVHTree.FromPolygons(p,f,all_triangles=True)
            tp,tf=A.H.geometry(top);tp=np.asarray(tp);tri=tp[np.asarray(tf)]
            samples=np.concatenate([tp,tri.mean(1),(tri[:,0]+tri[:,1])*.5,(tri[:,1]+tri[:,2])*.5,(tri[:,2]+tri[:,0])*.5])
            signed=[]
            for q in samples:
                hit,n,_,_=tree.find_nearest(Vector(q));signed.append(float((Vector(q)-hit).dot(n)))
            signed=np.asarray(signed)
            boundary=[]
            # Solidify preserves the source vertex order in each thickness side.
            assert len(tp)==len(original)*2
            for i in np.r_[idx,idx+len(original)]:
                q=Vector(tp[i]);hit,n,_,_=tree.find_nearest(q);boundary.append(float((q-hit).dot(n)))
            row={'clip':clip,'frame':float(frame),'surfaceSamples':len(samples),'bodyPenetrationsOver2mm':int((signed<-.002).sum()),'minimumBodySignedClearanceMm':float(signed.min()*1000),'necklineSamples':len(boundary),'minimumNecklineBodyClearanceMm':float(min(boundary)*1000)}
            assert row['bodyPenetrationsOver2mm']==0,row
            assert row['minimumNecklineBodyClearanceMm']>1,row
            rows.append(row)
    report={'source':source,'sampledPoses':len(rows),'bodyPenetrationsOver2mm':sum(r['bodyPenetrationsOver2mm'] for r in rows),'minimumNecklineBodyClearanceMm':min(r['minimumNecklineBodyClearanceMm'] for r in rows),'minimumBodySignedClearanceMm':min(r['minimumBodySignedClearanceMm'] for r in rows),'hemGeometryAndWeightsUnchanged':True,'otherMeshesUnchangedDuringCropRefinement':len(preserved),'runtimeCropAndBodyPreserved':True,'topologyUnchanged':True,'scope':'Evaluated vertices, triangle centers and edge midpoints against the body in 27 poses. Both thickness sides of the shaped front neckline are checked. The crop phase preserves other meshes; the final artifact preserves its crop coordinates, weights and neutral body. Not continuous or arbitrary-animation contact certification.','rows':rows}
    (OUT/'crop-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='runtime');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);run(a.source)
