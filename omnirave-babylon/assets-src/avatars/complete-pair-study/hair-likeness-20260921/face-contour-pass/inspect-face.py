import bpy,sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/face-contour-pass/before/female-hair-refined.blend'))
bpy.data.objects['AvatarSkeleton'].data.pose_position='REST'
for o in bpy.context.scene.objects:
 if o.type=='MESH' and o.data.shape_keys:
  for k in o.data.shape_keys.key_blocks:k.value=0
bpy.context.view_layer.update()
o=bpy.data.objects['AvatarBody'];p=array(o)
print('BODY_MATRIX',list(map(list,o.matrix_world)))
print('BODY_GROUPS',[g.name for g in o.vertex_groups])
for n in ['lips','head','neck_01']:
 gi=o.vertex_groups.get(n)
 if gi:
  ids=[v.index for v in o.data.vertices if any(g.group==gi.index and g.weight>.1 for g in v.groups)];q=p[ids]
  print(n,len(q),q.min(0),q.max(0),q.mean(0))
for ob in bpy.context.scene.objects:
 if ob.type=='MESH' and (ob.name.startswith('Avatar') or 'earring' in ob.name):
  q=array(ob);print(ob.name,len(q),q.min(0),q.max(0))
for z in np.arange(1.48,1.76,.01):
 q=p[(abs(p[:,2]-z)<.005)&(p[:,1]<-.02)]
 if len(q):print('SLICE',round(z,3),len(q),q.min(0).tolist(),q.max(0).tolist())
