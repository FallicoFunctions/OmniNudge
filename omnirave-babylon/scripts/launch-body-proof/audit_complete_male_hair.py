"""Check male hair attachment and motion on the current exported native mesh."""
import sys,json
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from audit_complete_expressions import POSES,set_pose


def run():
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'male-runtime.blend'))
    rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
    rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
    hair=[o for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair']
    def head_local():
        inv=np.array((rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()).inverted())
        return {o.name:(np.c_[array(o,True),np.ones(len(o.data.vertices))]@inv.T)[:,:3] for o in hair}
    baseline=head_local();maximum=0
    for clip in ['idle','walk','run']:
        action=bpy.data.actions[clip];rig.animation_data.action=action
        for frame in np.linspace(*action.frame_range,9):
            scene.frame_set(int(frame),subframe=float(frame%1));bpy.context.view_layer.update()
            for name,p in head_local().items():
                assert np.isfinite(p).all();maximum=max(maximum,float(np.linalg.norm(p-baseline[name],axis=1).max()))
    assert maximum<.00001,maximum
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
    targets={'Luxury retained swept groom':12,'Polished male flyaways':10}
    roots={name:array(bpy.data.objects[name],True).reshape(-1,n,2,3)[:,0].mean(1) for name,n in targets.items()}
    rows={}
    for label,values in POSES.items():
        set_pose(values);scalp=Surface(rig,bpy.data.objects['Complete scalp']);rows[label]={}
        for name,n in targets.items():
            points=array(bpy.data.objects[name],True);assert np.isfinite(points).all()
            current=points.reshape(-1,n,2,3)[:,0].mean(1)
            drift=float(np.linalg.norm(current-roots[name],axis=1).max());dist=[];signed=[]
            for p in current:
                h,normal,_,d=scalp.tree.find_nearest(Vector(p));dist.append(d);signed.append(normal.dot(Vector(p)-h))
            assert drift<1e-7 and max(dist)<.002 and min(signed)>.001,(label,name,drift,max(dist),min(signed))
            rows[label][name]={'rootCount':len(current),'maximumRootDriftMm':drift*1000,'maximumRootScalpDistanceMm':max(dist)*1000,'minimumSignedRootClearanceMm':min(signed)*1000}
    report={'source':'male-runtime.blend','movementSamples':27,'maximumHeadRelativeDriftMm':maximum*1000,'expressionCombinations':rows,'scope':'All male hair vertices follow the head in 27 movement poses; main and flyaway roots stay outside the scalp in seven expression/hair combinations. No strand self-contact or continuous collision certification.'}
    (OUT/'male-hair-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)

if __name__=='__main__':run()
