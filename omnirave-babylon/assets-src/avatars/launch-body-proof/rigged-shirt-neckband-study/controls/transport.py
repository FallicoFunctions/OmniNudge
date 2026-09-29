import bpy,sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'omnirave-babylon/scripts/launch-body-proof'))
import audit_rigged_jacket_sleeves as A
src=Path('/tmp/omnirave-shirt-neckband-study/band-v1.blend');pr=np.load(src.with_suffix('.npz'));bpy.ops.wm.open_mainfile(filepath=str(src));s,r,c,b,h=A.scene_objects();o=bpy.data.objects['Shirt detail - connected collar'];r.animation_data.action=bpy.data.actions[s['riggedJacketOriginalLoweringAction']]
rows=[]
for frame in [31,1]:
 A.sample(s,frame);bp,bf=A.H.geometry(b);op,of=A.H.geometry(o);bp=A.array(bp);op=A.array(op)[1152:];an=pr['body_anchors'];ba=pr['body_barycentrics'];anchor=(bp[an]*ba[:,:,None]).sum(1);d=op-anchor
 if frame==31:td=d.copy();t=op.copy()
 else:
  err=np.linalg.norm(d-td,axis=1);order=np.argsort(-err)[:12]
  for i in order:
   v=o.data.vertices[i+1152];rows.append({'index':int(i+1152),'t':t[i].tolist(),'down':op[i].tolist(),'body_anchor_down':anchor[i].tolist(),'offset_t_mm':(td[i]*1000).tolist(),'offset_down_mm':(d[i]*1000).tolist(),'anchor':an[i].tolist(),'bary':ba[i].tolist(),'weights':{o.vertex_groups[g.group].name:g.weight for g in v.groups},'bodyblend':float(pr['body_weight_blends'][i])})
Path('/tmp/omnirave-shirt-neckband-study/transport.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows[:5]))
