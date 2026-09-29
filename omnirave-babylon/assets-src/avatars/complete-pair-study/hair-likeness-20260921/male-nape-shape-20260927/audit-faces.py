"""Check neutral-pose triangle centers and edge midpoints on changed nape surfaces."""
import sys,json
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_reference_hair import PASS
from refine_male_nape_shape import NAMES
from complete_pair_geometry import Surface
from audit_complete_expressions import set_pose
from refine_male_loose_fringe import skin_gap
folder=PASS/'male-nape-shape-20260927'
def pose(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({});return rig
pose(folder/'before/male-hair-refined.blend');old={n:array(bpy.data.objects[n],True) for n in NAMES}
rig=pose(PASS/'male-hair-refined.blend');body=Surface(rig,bpy.data.objects['AvatarBody']);reports={}
for name in NAMES:
 ob=bpy.data.objects[name];p=array(ob,True);moved=np.linalg.norm(p-old[name],axis=1)>2e-7
 ob.data.calc_loop_triangles();indices=np.array([t.vertices[:] for t in ob.data.loop_triangles]);selection=moved[indices].any(1);tri=p[indices[selection]]
 for label,bary in [('center',(1/3,1/3,1/3)),('edge01',(.5,.5,0)),('edge12',(0,.5,.5)),('edge20',(.5,0,.5))]:
  points=(tri*np.array(bary)[None,:,None]).sum(1);gaps=np.array([skin_gap(body.tree,Vector(v))[0] for v in points]);key=name+' / '+label
  reports[key]={'samples':len(gaps),'minimumMm':float(gaps.min()*1000),'penetrating':int((gaps<0).sum()),'belowHalfMm':int((gaps<.0005).sum())};print(key,reports[key],flush=True)
  if (gaps<0).any():print('BAD_FACES',key,np.flatnonzero(selection)[gaps<0][:20].tolist(),flush=True)
(folder/'candidate-face-audit.json').write_text(json.dumps(reports,indent=2)+'\n')
assert all(v['penetrating']==0 for v in reports.values()),'A changed face crosses the skin'
