import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_groom_finish import islands
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/crown-accent-pass'
bpy.ops.wm.open_mainfile(filepath=str(p/'before/female-hair-refined.blend'))
record={}
for name in ['PLURR pony strands 3','Polished female flyaways']:
 ob=bpy.data.objects[name];pts=array(ob);records=[]
 for i,ids in enumerate(islands(ob)):
  if name=='Polished female flyaways' and i%3:continue
  r=pts[ids].reshape(-1,2,3);c=r.mean(1);width=np.linalg.norm(r[:,1]-r[:,0],axis=1)
  records.append({'index':i,'firstVertex':ids[0],'root':c[0].tolist(),'second':c[1].tolist(),'tip':c[-1].tolist(),'maxWidthMm':float(width.max()*1000),'maxZ':float(c[:,2].max()),'positions':c.tolist()})
 record[name]={'cards':len(records),'colorAttributes':[a.name for a in ob.data.color_attributes],'bounds':[pts.min(0).tolist(),pts.max(0).tolist()],'records':records}
 print(name,'cards',len(records),'bounds',record[name]['bounds'],'sample',records[0],flush=True)
(p/'inspection.json').write_text(json.dumps(record,indent=2)+'\n')
