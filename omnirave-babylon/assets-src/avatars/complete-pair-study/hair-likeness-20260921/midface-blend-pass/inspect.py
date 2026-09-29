import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'midface-blend-pass'
bpy.ops.wm.open_mainfile(filepath=str(p/'before/female-runtime.blend'))
rows={}
for name in ['AvatarEyelashes','AvatarEyebrows','AvatarBody']:
 a=array(bpy.data.objects[name])
 if name=='AvatarBody':a=a[(a[:,2]>1.565)&(a[:,2]<1.608)&(a[:,1]<-.09)&(abs(a[:,0])<.035)]
 rows[name]={'minimumAbsX':float(abs(a[:,0]).min()),'bounds':[a.min(0).tolist(),a.max(0).tolist()]}
(d/'inspection.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows),flush=True)
