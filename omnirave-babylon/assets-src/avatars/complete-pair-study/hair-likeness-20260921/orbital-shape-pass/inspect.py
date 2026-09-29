import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'orbital-shape-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
rows={}
for name in ['AvatarEyebrows','AvatarEyelashes','AvatarBody','AvatarIris_l']:
 a=array(bpy.data.objects[name]);out=[]
 if name=='AvatarBody':a=a[(a[:,2]>1.595)&(a[:,2]<1.637)&(a[:,1]<-.11)]
 if name=='AvatarIris_l':out={'center':a.mean(0).tolist(),'min':a.min(0).tolist(),'max':a.max(0).tolist()}
 else:
  for x in [.01,.015,.020,.025,.030,.035,.040,.045,.050]:
   q=a[abs(abs(a[:,0])-x)<.0025]
   if len(q):out.append({'x':x,'count':len(q),'min':q.min(0).tolist(),'max':q.max(0).tolist()})
 rows[name]=out
(d/'inspection.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows),flush=True)
