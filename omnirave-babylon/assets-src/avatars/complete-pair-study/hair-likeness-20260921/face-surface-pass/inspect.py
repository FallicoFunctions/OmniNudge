import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-surface-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
b=bpy.data.objects['AvatarBody'];a=array(b);group=b.vertex_groups['lips'].index;ids=[v.index for v in b.data.vertices if any(g.group==group and g.weight>.1 for g in v.groups)];q=a[ids]
mat=b.data.materials[0];bs=mat.node_tree.nodes.get('Principled BSDF');im=bs.inputs['Base Color'].links[0].from_node.image;pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4)
uv=b.data.uv_layers.active.data
samples={}
for label,mask in [('lip',np.isin(np.arange(len(a)),ids)),('skin-side',(abs(a[:,0])>.024)&(abs(a[:,0])<.036)&(a[:,2]>1.535)&(a[:,2]<1.556)&(a[:,1]<-.11)),('chin',(abs(a[:,0])<.014)&(a[:,2]>1.517)&(a[:,2]<1.528)&(a[:,1]<-.11))]:
 colors=[]
 for l in b.data.loops:
  if mask[l.vertex_index]:
   u,v=uv[l.index].uv;colors.append(pixels[min(int(v*im.size[1]),im.size[1]-1),min(int(u*im.size[0]),im.size[0]-1),:3])
 samples[label]={'count':len(colors),'mean':np.mean(colors,axis=0).tolist(),'min':np.min(colors,axis=0).tolist(),'max':np.max(colors,axis=0).tolist()}
record={'lipCount':len(ids),'lipMin':q.min(0).tolist(),'lipMax':q.max(0).tolist(),'samples':samples,'images':[{'name':n.image.name,'size':list(n.image.size),'colorspace':n.image.colorspace_settings.name,'users':n.image.users} for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]}
(d/'inspection.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
