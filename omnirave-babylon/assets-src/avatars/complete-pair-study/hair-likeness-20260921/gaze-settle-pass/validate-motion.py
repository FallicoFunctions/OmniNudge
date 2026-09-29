"""Check the native hair edit, retained morph deltas and evaluated attachments."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import OUT,array,review
from refine_complete_groom_finish import islands
from complete_pair_geometry import Surface
from audit_complete_expressions import POSES,set_pose
from refine_complete_foil_finish import geometry_contract

PASS=OUT/'hair-likeness-20260921'

def run(sex,render):
    native=json.loads((PASS/f'{sex}-native-validation.json').read_text())
    removed=set(native.get('removedObjects',[]))
    assert removed<=set(['PLURR face gems -1','PLURR face gems 1'])
    bpy.ops.wm.open_mainfile(filepath=str(PASS/'gaze-settle-pass/before/female-hair-refined.blend'))
    originals={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.get('avatarSlot')!='hair' and o.name not in removed and o.name not in {'AvatarBody','AvatarEyebrows','AvatarEyelashes'}}
    deltas={}
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and o.get('avatarSlot')=='hair' and o.data.shape_keys:
            basis=np.array([v.co[:] for v in o.data.shape_keys.key_blocks[0].data])
            deltas[o.name]={k.name:np.array([v.co[:] for v in k.data])-basis for k in o.data.shape_keys.key_blocks[1:]}
    bpy.ops.wm.open_mainfile(filepath=str(PASS/f'{sex}-hair-refined.blend'))
    mapping=json.loads((PASS/f'{sex}-vertex-mapping.json').read_text())
    assert all(bpy.data.objects.get(name) is None for name in removed)
    assert originals=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.get('avatarSlot')!='hair' and o.name not in {'AvatarBody','AvatarEyebrows','AvatarEyelashes'}}
    max_delta=0
    for name,shapes in deltas.items():
        keys=bpy.data.objects[name].data.shape_keys.key_blocks
        basis=np.array([v.co[:] for v in keys[0].data])
        for key,delta in shapes.items():
            scale=1
            max_delta=max(max_delta,float(np.abs(np.array([v.co[:] for v in keys[key].data])-basis-delta*scale).max()))
    assert max_delta<3e-7,max_delta
    rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
    rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
    hair=[o for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair']
    def local():
        inv=(rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()).inverted()
        return {o.name:np.array([list(inv@Vector(p)) for p in array(o,True)]) for o in hair}
    base=local();drift=0
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*bpy.data.actions[clip].frame_range,9):
            scene.frame_set(int(frame),subframe=float(frame%1));bpy.context.view_layer.update()
            for name,p in local().items():
                assert np.isfinite(p).all();drift=max(drift,float(np.linalg.norm(p-base[name],axis=1).max()))
    assert drift<.00001,drift
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
    attachments={}
    for label,values in POSES.items():
        set_pose(values);scalp=Surface(rig,bpy.data.objects['Complete scalp'])
        groom=bpy.data.objects['PLURR swept scalp groom' if sex=='female' else 'Luxury retained swept groom']
        stride=24 if sex=='female' else 12
        roots=array(groom,True).reshape(-1,stride,2,3)[:,0].mean(1)
        distance=max(scalp.tree.find_nearest(Vector(p))[3] for p in roots)
        assert distance<.003,(label,distance)
        pony_distance=0
        if sex=='female':
            core=Surface(rig,bpy.data.objects['PLURR gathered pony bundle'])
            for ob in hair:
                if not (ob.name.startswith('PLURR pony strands') or ob.name=='Polished female flyaways'):continue
                p=array(ob,True)
                for ids in islands(ob):
                    if ob.name.startswith('PLURR pony strands') and len(ids)!=36:continue
                    pony_distance=max(pony_distance,core.tree.find_nearest(Vector(p[ids[:2]].mean(0)))[3])
            assert pony_distance<.002,(label,pony_distance)
        attachments[label]={'maxScalpRootDistanceMm':distance*1000,'maxPonyRootDistanceMm':pony_distance*1000}
        braid=bpy.data.objects.get('PLURR reference temple braid')
        if braid:
            gaps=[]
            for p in array(braid,True):
                hit,n,_,_=scalp.tree.find_nearest(Vector(p));gaps.append((Vector(p)-hit).dot(n))
            assert min(gaps)>-.00002 and max(gaps)<.008,(label,min(gaps),max(gaps))
            attachments[label]['braidClearanceMm']=[min(gaps)*1000,max(gaps)*1000]
        fringe=bpy.data.objects.get('PLURR loose brunette front locks')
        if fringe:
            body=Surface(rig,bpy.data.objects['AvatarBody']);p=array(fringe,True);gaps=[]
            roots=[p[ids[:3]].mean(0) for ids in islands(fringe)]
            root_gap=max(scalp.tree.find_nearest(Vector(root))[3] for root in roots)
            for point in p:
                hit,n,_,_=body.tree.find_nearest(Vector(point));gaps.append((Vector(point)-hit).dot(n))
            assert root_gap<.006 and min(gaps)>.0005,(label,root_gap,min(gaps))
            attachments[label]['frontLockRootDistanceMm']=root_gap*1000
            attachments[label]['frontLockSkinClearanceMm']=[min(gaps)*1000,max(gaps)*1000]
    set_pose({})
    report={'preservedNonHairMeshes':len(originals),'validatedFaceContour':native.get('faceContour'),'removedObjects':sorted(removed),'maxMorphDeltaChangeMm':max_delta*1000,
        'movementSamples':27,'maxHeadRelativeDriftMm':drift*1000,'attachments':attachments,
        'scope':'Finite pose/shape samples and attachment distances; no continuous collision or strand self-contact guarantee.'}
    (PASS/f'{sex}-motion-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print('HAIR_VALIDATED',sex,json.dumps(report),flush=True)
    if render:
        camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.51
        camera.location=(.16,-3,1.72);review.look_at(camera,Vector((-.015,.005,1.65)))
        scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100
        scene.view_settings.exposure=-.8;scene.render.filepath=str(PASS/f'{sex}-blender-oblique.png')
        bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
