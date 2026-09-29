import bpy,sys,json,numpy as np,math
from pathlib import Path
from mathutils import Quaternion,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path.cwd()/'omnirave-babylon/scripts/launch-body-proof'))
import audit_rigged_jacket_sleeves as A
bpy.ops.wm.open_mainfile(filepath='/tmp/omnirave-shirt-neckband-study/band-v5.blend');s,r,c,b,h=A.scene_objects();o=bpy.data.objects['Shirt detail - connected collar'];rows=[]
for frame,axis,deg in [(31,'Z',0),(1,'Z',0),(1,'X',-10),(1,'Z',20)]:
 r.animation_data.action=bpy.data.actions[s['riggedJacketOriginalLoweringAction']];A.sample(s,frame);bone=r.pose.bones['neck_01'];base=bone.matrix_basis.copy();r.animation_data.action=None;bone.matrix_basis=base@Quaternion((1,0,0)if axis=='X'else(0,0,1),math.radians(deg)).to_matrix().to_4x4();A.update();op,of=A.H.geometry(o);trees={name:BVHTree.FromPolygons(*A.H.geometry(ob),all_triangles=True) for name,ob in [('body',b),('coat',c)]};v=np.asarray(op);sel=list(range(1440,1551));result={}
 for name,tr in trees.items():
  d=[]
  for i in sel:
   pos,n,ix,dist=tr.find_nearest(op[i]);d.append([i,dist*1000,(op[i]-pos).dot(n)*1000])
  result[name]={'min':min(d,key=lambda x:x[1]),'max':max(d,key=lambda x:x[1]),'min_signed':min(d,key=lambda x:x[2])}
 rows.append({'frame':frame,'axis':axis,'degrees':deg,**result});bone.matrix_basis=base;A.update()
print(json.dumps(rows));Path('/tmp/omnirave-shirt-neckband-study/clearance-v5.json').write_text(json.dumps(rows,indent=2)+'\n')
