import bpy,sys,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_groom_finish import islands
p=Path.cwd()/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/temple-flow-pass'
bpy.ops.wm.open_mainfile(filepath=str(p/'before/female-hair-refined.blend'))
bpy.data.objects['AvatarSkeleton'].data.pose_position='REST';bpy.context.view_layer.update()
for name in ['PLURR loose brunette front locks','PLURR swept scalp groom']:
 o=bpy.data.objects[name];p=array(o);cards=islands(o)
 for i,ids in enumerate(cards):
  r=p[ids].reshape(-1,3 if 'locks' in name else 2,3)
  if name.endswith('groom') and r[0,:,1].mean()>-.075:continue
  if name.endswith('groom') and i%3:continue
  if name.endswith('locks') and i%5:continue
  print(name,i,'center samples',r.mean(1)[[0,2,5,10,15,-1]].tolist(),'widthmm',np.linalg.norm(r[:,-1]-r[:,0],axis=1).max()*1000)
