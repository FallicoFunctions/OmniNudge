import sys,json
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from audit_complete_expressions import set_pose
from refine_complete_male_hair import group_paths
folder=Path.cwd()/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-side-layers-20260927'
bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
for name in ['Complete scalp','Polished male rooted hairline','Luxury retained swept groom','Polished male flyaways']:
 p=array(bpy.data.objects[name]);print('BOUNDS',name,len(p),p.min(0),p.max(0),flush=True)
p=array(bpy.data.objects['Luxury retained swept groom']).reshape(-1,12,2,3).mean(2)
groups=group_paths(p,96)
fringe=set(json.loads((folder/'protected-fringe-ribbons.json').read_text()))
for g in np.unique(groups):
 ids=np.flatnonzero(groups==g);c=p[ids].mean(0)
 if c[-1,2]<1.773 and c[-1,1]>-.10:
  print('LOW',int(g),'n',len(ids),'root',np.round(c[0],4).tolist(),'tip',np.round(c[-1],4).tolist(),'protected',len(fringe&set(ids)), 'lastdir',np.round(c[-1]-c[-3],4).tolist(),flush=True)
np.savez(folder/'input-ribbons.npz',paths=p,groups=groups)
