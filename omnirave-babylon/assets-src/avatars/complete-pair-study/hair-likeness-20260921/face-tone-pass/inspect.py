import bpy,json
from pathlib import Path
p=Path.cwd()/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
body=bpy.data.objects['AvatarBody'];mat=body.data.materials[0]
rows=[]
for n in mat.node_tree.nodes:
 rows.append({'name':n.name,'type':n.type,'image':n.image.name if n.type=='TEX_IMAGE' and n.image else None,'inputs':{s.name:{'links':[l.from_node.name+':'+l.from_socket.name for l in s.links],'value':list(s.default_value) if hasattr(s.default_value,'__len__') else s.default_value} for s in n.inputs if hasattr(s,'default_value')}})
j={'material':mat.name,'nodes':rows,'attributes':[(a.name,a.data_type,a.domain) for a in body.data.attributes],'groups':[g.name for g in body.vertex_groups]};(p/'face-tone-pass/inspection.json').write_text(json.dumps(j,indent=2)+'\n')
for name in ['Reference lip silhouette','Reference lip tone']:
 vals=[v.value for v in body.data.attributes[name].data];print(name,'max',max(vals),'positive vertices',sum(x>0 for x in vals))
print('Material',mat.name,'nodes',len(rows),'attributes',[(a.name,a.data_type) for a in body.data.attributes])
