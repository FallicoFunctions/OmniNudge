# Read-only constraints for a bounded pose-corrective fit; source geometry intact.
import bpy,sys,numpy as np,json
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path.cwd()/'omnirave-babylon/scripts/launch-body-proof'))
import audit_rigged_jacket_sleeves as A
from build_rigged_shirt_neckband import weight_array
source=Path('omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-collar-deformation-study/male-rigged-collar-deformation.blend');bpy.ops.wm.open_mainfile(filepath=str(source));s,r,c,b,h=A.scene_objects();o=bpy.data.objects['Shirt detail - connected collar'];names=[g.name for g in o.vertex_groups];w=weight_array(o,names);r.animation_data.action=bpy.data.actions[s['riggedJacketOriginalLoweringAction']];A.sample(s,31);t=A.array(A.H.geometry(o)[0]);co=np.array([list(v.co)for v in o.data.vertices]);e=np.array([list(e.vertices)for e in o.data.edges])
for pose in ['overhead','forward']:
 r.animation_data.action=bpy.data.actions['Jacket review - '+pose+' reach'];A.sample(s,49);p=A.array(A.H.geometry(o)[0]);planes=[]
 for ob in [b,c,h]:
  vv,ff=A.H.geometry(ob);tree=BVHTree.FromPolygons(vv,ff,all_triangles=True);rows=[]
  for point in p:
   hit,n,face,dist=tree.find_nearest(point);rows.append([*hit,*n,dist])
  planes.append(rows)
 mats=np.asarray([r.matrix_world@r.pose.bones[n].matrix@r.data.bones[n].matrix_local.inverted()@r.matrix_world.inverted()for n in names]);np.savez_compressed(str(Path(sys.argv[sys.argv.index('--')+1])/(pose+'-constraints.npz')),reference_t=t,posed=p,coordinates=co,weights=w,skin_matrices=mats,edges=e,planes=np.asarray(planes));print(pose,'cached')
