import sys,json,bpy,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
p=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-rear-transition-20260926');bpy.ops.wm.open_mainfile(filepath=str(p/'before/male-hair-refined.blend'))
data={}
for name in ['Complete scalp','Polished male rooted hairline','Luxury retained swept groom']:
 ob=bpy.data.objects[name];vertices=array(ob);layers={}
 for m in ob.data.materials:
  bs=m.node_tree.nodes.get('Principled BSDF')
  layers[m.name]={'color':list(bs.inputs['Base Color'].default_value),'roughness':bs.inputs['Roughness'].default_value,'specular':bs.inputs['Specular IOR Level'].default_value,'links':{k:[(l.from_node.name,l.from_socket.name) for l in bs.inputs[k].links] for k in ['Base Color','Alpha']},'images':[(n.image.name,n.image.filepath,list(n.image.size)) for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]}
 uv=np.zeros((len(vertices),2))
 for loop in ob.data.loops:uv[loop.vertex_index]=ob.data.uv_layers.active.data[loop.index].uv
 data[name]={'vertices':len(vertices),'materials':layers,'uvRange':[uv.min(0).tolist(),uv.max(0).tolist()],'colorAttributes':[a.name for a in ob.data.color_attributes]}
 if name=='Complete scalp':
  np.savez(p/'scalp-geometry.npz',vertices=vertices,uv=uv,edges=np.array([e.vertices[:] for e in ob.data.edges]))
print(json.dumps(data,indent=2),flush=True);(p/'input-materials.json').write_text(json.dumps(data,indent=2)+'\n')
