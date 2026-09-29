import sys,json
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_male_hair import group_paths
p=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-front-arc-20260927')
bpy.ops.wm.open_mainfile(filepath=str(p/'before/male-hair-refined.blend'))
paths=array(bpy.data.objects['Luxury retained swept groom']).reshape(-1,12,2,3).mean(2);groups=group_paths(paths,96)
for g in np.unique(groups):
 guide=paths[groups==g].mean(0)
 if guide[-1,1]<-.105 and guide[-1,0]<-.012:
  print('GUIDE',int(g),int((groups==g).sum()),np.round(guide,4).tolist(),flush=True)
