"""Pose-sampled root attachment check for the lower rear groom candidate."""
from pathlib import Path
import json
import sys
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import array
from complete_pair_geometry import Surface
from audit_complete_expressions import POSES,set_pose
ROOT=Path(__file__).resolve().parents[2]
blend=ROOT/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-lower-rear-20260928/male-lower-rear-candidate.blend'
bpy.ops.wm.open_mainfile(filepath=str(blend))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE'
hair=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair']
maximum={}
for label,values in POSES.items():
    set_pose(values);scalp=Surface(rig,bpy.data.objects['Complete scalp'])
    for name,stride in [('Luxury retained swept groom',24),('Male layered side strands',24)]:
        ob=bpy.data.objects[name]
        roots=array(ob,True).reshape(-1,stride,3)[:,:2].mean(1)
        gap=max(scalp.tree.find_nearest(Vector(p))[3] for p in roots)
        maximum[name]=max(maximum.get(name,0),gap)
        print('ATTACH',label,name,round(gap*1000,3),flush=True)
set_pose({});assert all(v<.003 for v in maximum.values()),maximum
blend.parent.joinpath('candidate-validation.json').write_text(json.dumps({
    'poseSamples':len(POSES),'maxRootCapDistanceMm':{k:round(v*1000,3) for k,v in maximum.items()},
    'limits':'Finite expression pose samples; not a proof for every animation frame.'},indent=2)+'\n')
print('LOWER_REAR_CANDIDATE_VALIDATED',{k:round(v*1000,3) for k,v in maximum.items()},flush=True)
