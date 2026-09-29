import bpy,sys,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_groom_finish import islands
p=Path.cwd()/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/pony-shape-pass'
bpy.ops.wm.open_mainfile(filepath=str(p/'before/female-hair-refined.blend'))
bpy.data.objects['AvatarSkeleton'].data.pose_position='REST'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH' and ob.data.shape_keys:
  for k in ob.data.shape_keys.key_blocks:k.value=0
bpy.context.view_layer.update()
for ob in bpy.context.scene.objects:
 if ob.type!='MESH' or ob.get('avatarSlot')!='hair':continue
 q=array(ob);cards=islands(ob);lens={len(c):sum(len(i)==len(c) for i in cards) for c in cards}
 print(ob.name,len(q),q.min(0).tolist(),q.max(0).tolist(),'islands',lens,flush=True)
 if ob.name.startswith('PLURR pony strands'):
  rr=np.array([q[ids].reshape(-1,2,3) for ids in cards if len(ids)==36]);roots=rr[:,:5].reshape(-1,3)
  print('roots',roots.min(0).tolist(),roots.max(0).tolist())
  for j in [4,8,12,16]:
   a=rr[:,j].reshape(-1,3);print('row',j,np.quantile(a,[0,.1,.5,.9,1],axis=0).tolist())
