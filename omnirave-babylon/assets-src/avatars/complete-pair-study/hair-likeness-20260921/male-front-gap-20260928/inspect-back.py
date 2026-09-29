import bpy
import numpy as np
from pathlib import Path

base = Path.cwd() / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
bpy.ops.wm.open_mainfile(filepath=str(base / 'male-hair-refined.blend'))
p = np.array([v.co[:] for v in bpy.data.objects['Complete scalp'].data.vertices])
for zlo, zhi in [(1.69, 1.72), (1.72, 1.75), (1.75, 1.78)]:
    for ylo, yhi in [(.02, .05), (.05, .08), (.08, .12)]:
        q = p[(p[:,2]>zlo)&(p[:,2]<zhi)&(p[:,1]>ylo)&(p[:,1]<yhi)]
        if len(q): print('BACK_CAP',zlo,zhi,ylo,yhi,len(q),q.min(0),q.max(0),flush=True)
