import bpy,sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_male_hair import group_paths
p=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-fringe-locks-20260926')
bpy.ops.wm.open_mainfile(filepath=str(p/'before/male-hair-refined.blend'))
r=array(bpy.data.objects['Luxury retained swept groom']).reshape(-1,12,2,3);c=r.mean(2);g=group_paths(c,96);data=[]
for k in np.unique(g):
 guide=c[g==k].mean(0); root=guide[0];tip=guide[-1]
 if tip[1]<-.102 and tip[2]<1.765:
  w=np.linalg.norm(r[g==k,:,1]-r[g==k,:,0],axis=2)*1000
  data.append({'guide':int(k),'ribbons':int((g==k).sum()),'root':root.tolist(),'tip':tip.tolist(),'widthMedianMm':np.median(w,axis=0).tolist(),'tipRangeMm':np.ptp(c[g==k,-1],axis=0).tolist()})
(p/'fringe-input-measurements.json').write_text(json.dumps(data,indent=2))
print(json.dumps(data),flush=True)
