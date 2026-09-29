import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'nose-lip-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
a=array(bpy.data.objects['AvatarBody']);rows=[]
for z in [1.536,1.540,1.544,1.548,1.552,1.562,1.568,1.574,1.580,1.590]:
 for x in [0,.007,.014,.021]:
  q=a[(abs(a[:,2]-z)<.002)&(abs(a[:,0]-x)<.003)&(a[:,1]<-.120)]
  if len(q):rows.append({'x':x,'z':z,'count':len(q),'front':q[q[:,1].argmin()].tolist()})
mat=bpy.data.objects['AvatarBody'].data.materials[0]
links=[(v.from_node.name,v.from_socket.name,v.to_node.name,v.to_socket.name) for v in mat.node_tree.links]
record={'points':rows,'material':mat.name,'links':links}
(d/'inspection.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
