import bpy
import hashlib
import json
import numpy as np
import sys
from pathlib import Path
from mathutils import Vector

root=Path.cwd()
sys.path.insert(0,str(root/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from audit_complete_expressions import POSES,set_pose

study=root/'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
pass_dir=study/'cheek-frame-pass'
new_name='PLURR right cheek frame'
def contract(file):
    bpy.ops.wm.open_mainfile(filepath=str(file))
    meshes={ob.name:geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type=='MESH' and ob.name!=new_name}
    images={image.name:hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
    bones=[(bone.name,tuple(bone.head_local),tuple(bone.tail_local)) for bone in bpy.data.objects['AvatarSkeleton'].data.bones]
    actions=sorted(action.name for action in bpy.data.actions)
    return meshes,images,bones,actions

before=contract(pass_dir/'before/female-hair-refined.blend')
after=contract(study/'female-hair-refined.blend')
assert before==after,'Original mesh, image, bone or action data changed'
assert len(after[0])==62 and len(after[1])==93 and len(after[2])==56 and len(after[3])==3
ob=bpy.data.objects[new_name]
ob.data.calc_loop_triangles()
assert len(ob.data.vertices)==504 and len(ob.data.loop_triangles)==648
assert ob.data.materials[0].name=='PLURR loose brunette front locks'
assert ob.parent==bpy.data.objects['AvatarSkeleton']
assert ob.get('avatarSlot')=='hair' and ob.get('avatarOptionId')=='plurr-pony'
assert all(abs(ob.vertex_groups['head'].weight(index)-1)<1e-8 for index in range(504))
rig=bpy.data.objects['AvatarSkeleton']
body=bpy.data.objects['AvatarBody']
earrings=bpy.data.objects['PLURR neon ear drops']
rig.data.pose_position='POSE'
scene=bpy.context.scene
rig.animation_data.action=bpy.data.actions['idle']
scene.frame_set(1)
set_pose({})
def head_local(points):
    head=rig.pose.bones['head']
    matrix=rig.matrix_world@head.matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()
    inv=matrix.inverted()
    return np.array([list(inv@Vector(point)) for point in points])
neutral=head_local(array(ob,True))
samples=[]
minimum_skin=float('inf')
minimum_earring=float('inf')
maximum_drift=0
def check(label):
    global minimum_skin,minimum_earring,maximum_drift
    points=array(ob,True)
    skin=Surface(rig,body).tree
    ear=Surface(rig,earrings).tree
    gaps=[];ear_gaps=[]
    for point in points:
        hit,normal,_,_=skin.find_nearest(Vector(point))
        gaps.append((Vector(point)-hit).dot(normal))
        ear_gaps.append(ear.find_nearest(Vector(point))[3])
    skin_gap=min(gaps);ear_gap=min(ear_gaps)
    drift=float(np.linalg.norm(head_local(points)-neutral,axis=1).max())
    minimum_skin=min(minimum_skin,skin_gap)
    minimum_earring=min(minimum_earring,ear_gap)
    maximum_drift=max(maximum_drift,drift)
    assert skin_gap>.0005,(label,'skin',skin_gap)
    assert ear_gap>.003,(label,'earring',ear_gap)
    assert drift<.00001,(label,'head drift',drift)
    samples.append({'pose':label,'skinGapMm':skin_gap*1000,'earringGapMm':ear_gap*1000,'headRelativeDriftMm':drift*1000})

for clip in ['idle','walk','run']:
    action=bpy.data.actions[clip]
    rig.animation_data.action=action
    for step,frame in enumerate(np.linspace(*action.frame_range,9)):
        scene.frame_set(int(frame),subframe=float(frame%1))
        bpy.context.view_layer.update()
        check(f'{clip}-{step}')
rig.animation_data.action=bpy.data.actions['idle']
scene.frame_set(1)
for label,values in POSES.items():
    set_pose(values)
    check('expression-'+label)
set_pose({})
record={
    'unchangedOtherMeshContracts':len(after[0]),'unchangedPackedImages':len(after[1]),
    'unchangedBones':len(after[2]),'unchangedActions':len(after[3]),
    'newMesh':new_name,'vertices':504,'triangles':648,'headWeight':1,
    'movementSamples':27,'expressionSamples':len(POSES),
    'minimumSkinClearanceMm':minimum_skin*1000,
    'minimumEarringClearanceMm':minimum_earring*1000,
    'maximumHeadRelativeDriftMm':maximum_drift*1000,
    'samples':samples,
    'scope':'Finite clip frames and named expressions; not continuous collision proof.',
}
(pass_dir/'native-preservation.json').write_text(json.dumps(record,indent=2)+'\n')
print('CHEEK_FRAME_NATIVE',json.dumps({key:value for key,value in record.items() if key!='samples'}),flush=True)
