import json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from assemble_complete_pair import array
from complete_pair_geometry import Surface
from audit_complete_expressions import set_pose
from refine_male_loose_fringe import skin_gap
folder=PASS/'male-swept-crest-20260926'
current='--current' in sys.argv
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend' if current else folder/'before/male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
bpy.context.scene.frame_set(1);set_pose({})
ob=bpy.data.objects['Luxury retained swept groom'];p=array(ob,True)
ob.data.calc_loop_triangles();indices=np.array([f.vertices[:] for f in ob.data.loop_triangles])
tri=p[indices];c=tri.mean(1)
selection=(c[:,1]<-.110)&(c[:,2]<1.775)
body=Surface(rig,bpy.data.objects['AvatarBody']);reports={}
for label,bary in [('center',(1/3,1/3,1/3)),('edge01',(.5,.5,0)),('edge12',(0,.5,.5)),('edge20',(.5,0,.5))]:
 points=(tri[selection]*np.array(bary)[None,:,None]).sum(1)
 gaps=np.array([skin_gap(body.tree,Vector(v))[0] for v in points])
 reports[label]={'samples':len(gaps),'minimumMm':float(gaps.min()*1000),'penetrating':int((gaps<0).sum()),'belowHalfMm':int((gaps<.0005).sum())}
 print(label,reports[label],flush=True)
(folder/('candidate-fringe-face-audit.json' if current else 'fringe-face-audit.json')).write_text(json.dumps(reports,indent=2)+'\n')
assert all(v['penetrating']==0 for v in reports.values()), 'A sampled fringe face crosses the skin'
