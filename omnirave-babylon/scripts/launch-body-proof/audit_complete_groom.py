"""Sample final female groom attachment across movement and secondary controls."""
import sys,json
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_groom_finish import islands
from audit_complete_expressions import POSES,set_pose


def run():
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'female-runtime.blend'))
    rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
    rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
    hair=[o for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair']
    def head_local():
        inv=(rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()).inverted()
        return {o.name:np.array([list(inv@Vector(p)) for p in array(o,True)]) for o in hair}
    baseline=head_local();maximum=0
    for clip in ['idle','walk','run']:
        action=bpy.data.actions[clip];rig.animation_data.action=action
        for frame in np.linspace(*action.frame_range,9):
            scene.frame_set(int(frame),subframe=float(frame%1));bpy.context.view_layer.update()
            now=head_local()
            for name,p in now.items():
                assert np.isfinite(p).all()
                maximum=max(maximum,float(np.linalg.norm(p-baseline[name],axis=1).max()))
    assert maximum<.00001,maximum
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
    scalp_ob=bpy.data.objects['PLURR swept scalp groom']
    scalp_roots=array(scalp_ob,True).reshape(-1,24,2,3)[:,0].mean(1)
    pony_roots={}
    for o in hair:
        if o.name.startswith('PLURR pony strands'):
            pony_roots[o.name]=[ids[:2] for ids in islands(o) if len(ids)==36]
        elif o.name=='Polished female flyaways':
            pony_roots[o.name]=[ids[:2] for ids in islands(o)]
    rows={}
    for label,values in POSES.items():
        set_pose(values)
        scalp=Surface(rig,bpy.data.objects['Complete scalp'])
        roots=array(scalp_ob,True).reshape(-1,24,2,3)[:,0].mean(1)
        scalp_drift=float(np.linalg.norm(roots-scalp_roots,axis=1).max())
        scalp_distance=max(scalp.tree.find_nearest(Vector(p))[3] for p in roots)
        signed_distances=[]
        for p in roots:
            hit,normal,_,_=scalp.tree.find_nearest(Vector(p))
            signed_distances.append(normal.dot(Vector(p)-hit))
        assert scalp_drift<1e-7 and scalp_distance<.002 and min(signed_distances)>.001,(label,scalp_drift,scalp_distance,min(signed_distances))
        core=Surface(rig,bpy.data.objects['PLURR gathered pony bundle'])
        root_distances=[]
        for name,groups in pony_roots.items():
            p=array(bpy.data.objects[name],True)
            for ids in groups:root_distances.append(core.tree.find_nearest(Vector(p[ids].mean(0)))[3])
        assert max(root_distances)<.002,(label,max(root_distances))
        rows[label]={'scalpRootCount':len(roots),'maximumScalpRootDriftMm':scalp_drift*1000,'maximumScalpRootDistanceMm':scalp_distance*1000,'minimumSignedScalpRootClearanceMm':min(signed_distances)*1000,'ponyAndFlyawayRoots':len(root_distances),'maximumPonyRootCoreDistanceMm':max(root_distances)*1000}
    report={'source':'female-runtime.blend','movementSamples':27,'maximumHeadRelativeDriftMm':maximum*1000,'expressionCombinations':rows,'scope':'Head-relative rigidity in 27 movement samples; scalp and core root attachments in seven expression/secondary-hair combinations. No strand self-contact or continuous collision certification.'}
    (OUT/'groom-motion-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)

if __name__=='__main__':run()
