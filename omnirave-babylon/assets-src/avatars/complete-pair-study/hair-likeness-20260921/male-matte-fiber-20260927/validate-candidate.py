"""Prove native male hair material changes stay within the seven fiber materials."""
import sys,json,hashlib
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from refine_complete_foil_finish import geometry_contract
from validate_reference_hair import run as validate_motion
folder=PASS/'male-matte-fiber-20260927'
def image_contract():
 return {im.name:(im.colorspace_settings.name,tuple(im.size),[(p.filepath,hashlib.sha256(p.packed_file.data).hexdigest()) for p in im.packed_files],None if im.packed_files else im.filepath) for im in bpy.data.images}
def nodes():
 return {m.name:(tuple((n.name,n.type) for n in m.node_tree.nodes),tuple((l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name) for l in m.node_tree.links)) for m in bpy.data.materials if m.use_nodes}
def mat_values():
 out={}
 for m in bpy.data.materials:
  if not m.use_nodes or 'Principled BSDF' not in m.node_tree.nodes:continue
  bs=m.node_tree.nodes['Principled BSDF'];norm=[n for n in m.node_tree.nodes if n.type=='NORMAL_MAP']
  out[m.name]={'roughness':float(bs.inputs['Roughness'].default_value),
   'specular':float(bs.inputs['Specular IOR Level'].default_value),
   'normalStrength':[float(n.inputs['Strength'].default_value) for n in norm],
   'color':tuple(bs.inputs['Base Color'].default_value),
   'alpha':float(bs.inputs['Alpha'].default_value) if not bs.inputs['Alpha'].is_linked else 'linked'}
 return out
bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
geometry={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
old_images=image_contract();old_nodes=nodes();old_mats=mat_values()
old_mapping=(folder/'before/male-vertex-mapping.json').read_bytes()
old_report=json.loads((folder/'before/male-native-validation.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
assert geometry=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
assert old_images==image_contract(),'Packed or external hair textures changed'
assert old_nodes==nodes(),'Material node topology changed'
assert old_mapping==(PASS/'male-vertex-mapping.json').read_bytes(),'Vertex mapping changed'
author=json.loads((folder/'authoring-report.json').read_text())
new_mats=mat_values();new_report=json.loads((PASS/'male-native-validation.json').read_text())
assert {k:v for k,v in old_report.items() if k!='materials'}=={k:v for k,v in new_report.items() if k not in ['materials','maleFiberFinish']}
assert set(author['materials'])==set(new_report['materials'])
for name,before in old_mats.items():
 after=new_mats[name]
 if name not in author['materials']:assert before==after,name
 else:
  assert abs(after['roughness']-.86)<1e-6 and abs(after['specular']-.045)<1e-6 and len(after['normalStrength'])==1 and abs(after['normalStrength'][0]-.14)<1e-6
  assert before['color']==after['color'] and before['alpha']==after['alpha']
  assert {k:v for k,v in old_report['materials'][name].items() if k not in ['roughness','specular','normalScale']}=={k:v for k,v in new_report['materials'][name].items() if k not in ['roughness','specular','normalScale']}
  assert new_report['materials'][name]['roughness']==.86 and new_report['materials'][name]['specular']==.09 and new_report['materials'][name]['normalScale']==.14
(folder/'native-checks.json').write_text(json.dumps({'geometryAndRigExact':True,'exactMeshCount':len(geometry),'materialNodeTopologyExact':True,'texturesAndVertexMappingExact':True,'changedMaterials':author['materials'],'otherMaterialsExact':True,'expectedMaterialValuesExact':True},indent=2)+'\n')
validate_motion('male',False)
print('MALE_MATTE_NATIVE_CHECKS_PASSED',flush=True)
