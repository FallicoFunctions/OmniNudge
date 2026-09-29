import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path.cwd()/'omnirave-babylon/scripts/launch-body-proof'))
import audit_rigged_jacket_sleeves as A
from build_rigged_jacket_collar import radial_surface_radii
src=Path('omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-shirt-detail-study/male-rigged-shirt-detailed.blend').resolve()
bpy.ops.wm.open_mainfile(filepath=str(src));s,r,c,b,h=A.scene_objects();r.animation_data.action=bpy.data.actions[s['riggedJacketOriginalLoweringAction']];A.sample(s,31)
geos={k:A.H.geometry(o) for k,o in [('body',b),('shirt',h),('coat',c)]}
rows=[]
for z in [1.477,1.49,1.505,1.52,1.535,1.55]:
 for deg in [20,30,40,50,60,75,90,120,150,180]:
  th=np.deg2rad(deg);direction=Vector((np.sin(th),-np.cos(th)))
  d={k:[round(x,6) for x in radial_surface_radii(*geo,z,Vector((0,.005)),direction)] for k,geo in geos.items()}
  rows.append({'z':z,'deg':deg,**d})
extra={}
for name in ['Shirt detail - left collar','Shirt detail - right collar']:
 p,f=A.H.geometry(bpy.data.objects[name]);v=A.array(p);ids=np.flatnonzero(v[:,2]>1.47699);extra[name]={'ids':ids.tolist(),'points':v[ids].tolist()}
out={'samples':rows,'collar_endpoints':extra}
Path('/tmp/omnirave-shirt-neckband-study/surface-map.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
