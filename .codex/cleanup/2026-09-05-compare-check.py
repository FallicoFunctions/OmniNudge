import bpy,numpy as np,json,hashlib
from pathlib import Path
ROOT=Path('/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave')
ASSETS=ROOT/'omnirave-babylon/assets-src/avatars/astra-male-proof'
def capture(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();items={}
 for ob in bpy.data.objects:
  if ob.hide_render or ob.type not in ['MESH','CURVES']:continue
  if ob.type=='MESH':
   ev=ob.evaluated_get(dg);mesh=ev.to_mesh();a=np.array([ob.matrix_world@v.co for v in mesh.vertices]);topo=hashlib.sha256(np.asarray([v for f in mesh.polygons for v in f.vertices],dtype=np.int32).tobytes()).hexdigest();ev.to_mesh_clear();radius=None
  else:
   a=np.array([ob.matrix_world@p.vector for p in ob.data.attributes['position'].data]);topo=[len(c.points) for c in ob.data.curves];radius=np.array([r.value for r in ob.data.attributes['radius'].data])
  items[ob.name]=(a,topo,radius)
 return items
before=capture(ASSETS/'face19.blend');after=capture(Path('/tmp/omni-cleanup-rebuilt-face19.blend'))
assert set(before)==set(after),(set(before)-set(after),set(after)-set(before))
results=[]
for name,(a,t,r) in before.items():
 b,u,s=after[name];assert a.shape==b.shape and t==u,name
 delta=float(np.max(np.abs(a-b)));assert delta<2e-6,(name,delta)
 dr=float(np.max(np.abs(r-s))) if r is not None else 0;assert dr<1e-10,(name,dr)
 results.append({'name':name,'max_coordinate_difference_m':delta,'max_radius_difference_m':dr,'topology_matches':True})
report={'source':'face19.blend','rebuilt_from':'fit05.blend + rebuild_current.py + two landmark JSON files','objects':results,'passed':True,'scope':'visible evaluated geometry equivalence; likeness remains unaccepted'}
(ROOT/'.codex/cleanup/2026-09-05-rebuild-check.json').write_text(json.dumps(report,indent=2)+'\n')
print('REBUILD_EQUIVALENCE_PASS',len(results),max(x['max_coordinate_difference_m'] for x in results))
