"""Finite neutral-pose face samples over revised crown and retained fringe."""
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
folder=PASS/'male-crown-profile-20260927';current='--current' in sys.argv
def evaluated_input(path):
 bpy.ops.wm.open_mainfile(filepath=str(path))
 rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
 bpy.context.scene.frame_set(1);set_pose({})
 return array(bpy.data.objects['Luxury retained swept groom'],True)
old=evaluated_input(folder/'before/male-hair-refined.blend')
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend' if current else folder/'before/male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
bpy.context.scene.frame_set(1);set_pose({})
ob=bpy.data.objects['Luxury retained swept groom'];p=array(ob,True)
ob.data.calc_loop_triangles();indices=np.array([f.vertices[:] for f in ob.data.loop_triangles])
tri=p[indices];c=tri.mean(1)
authored=json.loads((folder/'authoring-report.json').read_text())
edited=np.zeros(len(p),dtype=bool);edited.reshape(-1,24)[authored['editedRibbonIndices']]=True
moved=np.linalg.norm(p-old,axis=1)>2e-7
regions={'changed-crown':moved[indices].any(1),'unchanged-selected-ribbons':edited[indices].any(1)&~moved[indices].any(1),'retained-fringe':(c[:,1]<-.110)&(c[:,2]<1.775)}
body=Surface(rig,bpy.data.objects['AvatarBody']);reports={}
for region,selection in regions.items():
 for label,bary in [('center',(1/3,1/3,1/3)),('edge01',(.5,.5,0)),('edge12',(0,.5,.5)),('edge20',(.5,0,.5))]:
  points=(tri[selection]*np.array(bary)[None,:,None]).sum(1)
  gaps=np.array([skin_gap(body.tree,Vector(v))[0] for v in points])
  key=region+'-'+label
  reports[key]={'samples':len(gaps),'minimumMm':float(gaps.min()*1000),'penetrating':int((gaps<0).sum()),'belowHalfMm':int((gaps<.0005).sum())}
  print(key,reports[key],flush=True)
  if (gaps<0).any():
   bad=np.flatnonzero(selection)[gaps<0];print('BAD_FACES',key,[(int(i),int(indices[i,0]//24),c[i].tolist(),bool(moved[indices[i]].any())) for i in bad[:12]],flush=True)
(folder/('candidate-fringe-face-audit.json' if current else 'fringe-face-audit.json')).write_text(json.dumps(reports,indent=2)+'\n')
assert all(v['penetrating']==0 for k,v in reports.items() if not k.startswith('unchanged-selected')),'A sampled hair face crosses the skin'
