import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path.cwd() / 'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_reference_hair import PASS

bpy.ops.wm.open_mainfile(filepath=str(PASS / 'male-hair-refined.blend'))
ob = bpy.data.objects['Luxury retained swept groom']
cards = array(ob).reshape(-1, 12, 2, 3)
paths = cards.mean(2)
front = (paths[:, -1, 1] < -.105) & (paths[:, 0, 1] < -.095)
rows = []
for lo, hi in zip(np.arange(-.075, .076, .015)[:-1], np.arange(-.075, .076, .015)[1:]):
    selected = front & (paths[:, -1, 0] >= lo) & (paths[:, -1, 0] < hi)
    tips = paths[selected, -1]
    if len(tips):
        rows.append({'xMm': [round(lo*1000), round(hi*1000)], 'count': len(tips),
                     'tipZPercentilesMm': np.percentile(tips[:, 2], [0, 10, 25, 50, 75, 90, 100]).tolist(),
                     'tipYPercentilesMm': np.percentile(tips[:, 1], [0, 50, 100]).tolist(),
                     'rootYMedianMm': float(np.median(paths[selected, 0, 1]) * 1000)})
print('FRONT_LOCKS', json.dumps(rows), flush=True)
