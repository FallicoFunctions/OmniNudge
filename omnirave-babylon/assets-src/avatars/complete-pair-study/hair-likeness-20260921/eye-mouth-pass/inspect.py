import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'eye-mouth-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
bpy.data.objects['AvatarSkeleton'].data.pose_position='REST'
for name in ['AvatarBody','AvatarEyebrows','AvatarEyelashes']:
 ob=bpy.data.objects[name];a=array(ob);print(name,'matrix',list(map(list,ob.matrix_world)),flush=True)
 print('keys',[k.name for k in ob.data.shape_keys.key_blocks],flush=True)
 if name=='AvatarBody':
  g=ob.vertex_groups['lips'].index;ids=[v.index for v in ob.data.vertices if any(w.group==g and w.weight>.1 for w in v.groups)]
  print('LIP_BOUNDS',a[ids].min(0),a[ids].max(0),flush=True)
  for x in [0,.004,.008,.012,.018,.024]:
   q=a[(abs(a[:,0]-x)<.0013)&(a[:,2]>1.527)&(a[:,2]<1.562)&(a[:,1]<-.125)]
   print('LIPS',x,sorted(q.tolist(),key=lambda t:t[2]),flush=True)
 else:
  print('BOUNDS',a.min(0),a.max(0),flush=True)
  if name=='AvatarEyebrows':
   for x in [.010,.018,.026,.034,.042,.050]:
    q=a[abs(a[:,0]-x)<.004];print('BROW',x,q.tolist(),flush=True)
