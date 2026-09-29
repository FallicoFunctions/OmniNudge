"""Check sewn jacket fittings against their evaluated carrier in 27 poses."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface,skin_weights
from build_rigged_jacket_hardware import barycentric
import audit_rigged_jacket_sleeves as A


def run(sex,source):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Structured armhole jacket']
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    names=list(rig.data.bones.keys());surface=Surface(rig,coat);attachments={}
    for ob in [o for o in scene.objects if o.type=='MESH' and o.get('jacketHardware')]:
        ids=[];coords=[];offsets=[]
        for point in array(ob,True):
            hit,n,index,d=surface.tree.find_nearest(Vector(point));tri=surface.faces[index]
            bc=barycentric(np.array(hit),surface.array[tri]);ids.append(tri);coords.append(bc);offsets.append(point-bc@surface.array[tri])
        weights=skin_weights(ob,names);skin=np.einsum('vg,gij->vij',weights,surface.mats)
        offsets=np.linalg.solve(skin[:,:3,:3],np.array(offsets)[...,None])[:,:,0]
        attachments[ob.name]=(ob,np.array(ids),np.array(coords),offsets,weights)
    rows=[]
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range,9):
            A.sample(scene,float(frame));cp=array(coat,True)
            mats=np.array([rig.matrix_world@rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()@rig.matrix_world.inverted() for n in names])
            for name,(ob,ids,bc,offset,w) in attachments.items():
                actual=array(ob,True);skin=np.einsum('vg,gij->vij',w,mats)
                expected=np.einsum('vi,vij->vj',bc,cp[ids])+np.einsum('vij,vj->vi',skin[:,:3,:3],offset)
                assert np.isfinite(actual).all()
                drift=np.linalg.norm(actual-expected,axis=1);peak=int(drift.argmax())
                rows.append({'clip':clip,'frame':float(frame),'object':name,'maximumAttachmentDriftMm':float(drift.max()*1000),'peakVertex':peak,'peakBoneWeights':{n:float(v) for n,v in zip(names,w[peak]) if v>1e-6}})
    return {'source':source,'objects':len(attachments),'samplesPerObject':27,'maximumAttachmentDriftMm':max(r['maximumAttachmentDriftMm'] for r in rows),'rows':rows}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='runtime');p.add_argument('--diagnostic',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    result={s:run(s,a.source) for s in ['male','female']}
    (OUT/('jacket-motion-diagnostic.json' if a.diagnostic else 'jacket-motion-validation.json')).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({s:{k:v for k,v in d.items() if k!='rows'} for s,d in result.items()}),flush=True)
    if not a.diagnostic:
        for s,d in result.items():assert d['maximumAttachmentDriftMm']<1,(s,max(d['rows'],key=lambda r:r['maximumAttachmentDriftMm']))
