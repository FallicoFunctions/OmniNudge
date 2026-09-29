"""Probe constructed shoes against their retained shells in 27 motion samples.

An initial closest-triangle attachment is transported with the shell. Compare
actual detail vertices to that moving attachment, including the skinned offset.
This catches incorrect parenting, weights or inverse binding in the final file.
"""
import json
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array
from complete_pair_geometry import Surface, skin_weights
from refine_complete_lower_forms import body_distance
from build_rigged_jacket_hardware import barycentric
import audit_rigged_jacket_sleeves as A

report = {}
for sex in ['male','female']:
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-runtime.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton']
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1.)
    attachments={}
    names=[b.name for b in rig.data.bones]
    for side in ['l','r']:
        shell=bpy.data.objects['Launch high-top sneaker '+side]
        detail=bpy.data.objects['Launch constructed sneaker details '+side]
        surface=Surface(rig,shell);points=array(detail,True)
        indices=[];coordinates=[];offsets=[]
        for p in points:
            hit,normal,index,distance=surface.tree.find_nearest(Vector(p))
            ids=surface.faces[index];bc=np.clip(barycentric(np.array(hit),surface.array[ids]),0,1);bc/=bc.sum()
            indices.append(ids);coordinates.append(bc);offsets.append(p-bc@surface.array[ids])
        w=skin_weights(detail,names);skin=np.einsum('vg,gij->vij',w,surface.mats)
        local_offsets=np.linalg.solve(skin[:,:3,:3],np.asarray(offsets)[...,None])[:,:,0]
        assert np.allclose(w.sum(1),1,atol=1e-5)
        attachments[side]=(shell,detail,np.array(indices),np.array(coordinates),local_offsets,w)
    rows=[];clearance=[]
    for clip in ['idle','walk','run']:
        action=bpy.data.actions[clip];rig.animation_data.action=action
        for frame in np.linspace(*action.frame_range,9):
            A.sample(scene,float(frame))
            mats=np.asarray([rig.matrix_world@rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()@rig.matrix_world.inverted() for n in names])
            bp,bf=A.H.geometry(bpy.data.objects['AvatarBody']);body_tree=BVHTree.FromPolygons(bp,bf,all_triangles=True)
            bounds=(np.array(bp).min(0),np.array(bp).max(0))
            for ob in [o for o in scene.objects if o.name.startswith(('Launch high-top sneaker ','Launch neon sock '))]:
                points,_=A.H.geometry(ob);distances=[];outside=0
                for point in points:
                    distance,_,rejected=body_distance(point,body_tree,bounds);distances.append(distance);outside+=int(rejected)
                distances=np.asarray(distances)
                row={'clip':clip,'frame':float(frame),'object':ob.name,'minimumBodyClearanceMm':float(distances.min()*1000),'bodyPenetrationsOver2mm':int((distances<-.002).sum()),'negativePlaneDistancesOutsideBody':outside}
                assert row['bodyPenetrationsOver2mm']==0,(sex,row)
                clearance.append(row)
            for side,(shell,detail,indices,bc,offset,w) in attachments.items():
                p=array(shell,True);q=array(detail,True)
                skin=np.einsum('vg,gij->vij',w,mats)
                expected=np.einsum('vi,vij->vj',bc,p[indices])+np.einsum('vij,vj->vi',skin[:,:3,:3],offset)
                drift=np.linalg.norm(q-expected,axis=1)
                assert np.isfinite(q).all()
                assert drift.max()<.001, (sex,side,clip,frame,drift.max())
                rows.append({'clip':clip,'frame':float(frame),'side':side,'vertices':len(q),'maximumAttachmentDriftMm':float(drift.max()*1000)})
    report[sex]={'samplesPerFoot':27,'maximumAttachmentDriftMm':max(r['maximumAttachmentDriftMm'] for r in rows),'minimumBodyClearanceMm':min(r['minimumBodyClearanceMm'] for r in clearance),'bodyPenetrationsOver2mm':sum(r['bodyPenetrationsOver2mm'] for r in clearance),'bodyClearanceRows':clearance,'rows':rows}
(OUT/'footwear-motion-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({s:{k:v for k,v in r.items() if k not in ['rows','bodyClearanceRows']} for s,r in report.items()}),flush=True)
