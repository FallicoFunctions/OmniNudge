import bpy
from pathlib import Path

pass_dir = Path.cwd() / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
bpy.ops.wm.open_mainfile(filepath=str(pass_dir / 'male-hair-refined.blend'))
mesh = bpy.data.objects['Complete scalp'].data
seen = set()
for loop in mesh.loops:
    vi = loop.vertex_index
    if vi in seen:
        continue
    seen.add(vi)
    p = mesh.vertices[vi].co
    uv = mesh.uv_layers.active.data[loop.index].uv
    if p.y < -.08 and p.z < 1.8:
        print('CAP_UV', vi, *(round(x, 5) for x in p), *(round(x, 5) for x in uv))
