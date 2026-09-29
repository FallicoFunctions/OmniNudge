import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from refine_reference_hair import PASS
from refine_female_pony_sheen import soften_pony_sheen
from refine_female_dye import NAMES
from refine_complete_groom_finish import islands
from refine_complete_foil_finish import geometry_contract
from audit_complete_expressions import set_pose
p=PASS;d=p/'pony-sheen-pass';b=d/'before'
bpy.ops.wm.open_mainfile(filepath=str(b/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
all_meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
contracts={o.name:geometry_contract(o) for o in all_meshes}
normals={o.name:np.array([v.normal[:] for v in o.data.vertices]) for o in all_meshes}
def color_arrays(ob):return {a.name:np.array([v.color[:] for v in a.data]) for a in ob.data.color_attributes}
colors={o.name:color_arrays(o) for o in all_meshes}
mapping=json.loads((b/'female-vertex-mapping.json').read_text());old=json.loads((b/'female-native-validation.json').read_text());native=json.loads(json.dumps(old))
old_mapping=json.loads(json.dumps(mapping));soften_pony_sheen(mapping,native['meshes'],native['materials'])
record=native['meshes']['ponySheen'];color_checks={}
for o in all_meshes:
 assert geometry_contract(o)==contracts[o.name],o.name
 assert np.array_equal(normals[o.name],np.array([v.normal[:] for v in o.data.vertices]))
 after=color_arrays(o)
 if o.name not in NAMES:
  for name,arr in colors[o.name].items():assert np.array_equal(arr,after[name]),(o.name,name)
  continue
 before=colors[o.name]['ReferenceHairTint'];now=after['ReferenceHairTint'];fixed=[];cheeks=[]
 for ids in islands(o):
  if len(ids)==36:fixed.extend(ids[:4]+ids[16:])
  else:fixed.extend(ids);cheeks.extend(ids)
 assert np.array_equal(before[fixed],now[fixed]),o.name
 assert np.all(now[:,3]==before[:,3]),o.name
 color_checks[o.name]={'fixedRootLowerAndCheekVertices':len(fixed),'unchangedCheekVertices':len(cheeks)}
 # Every geometry, UV, relative shape and normal export array stays exact.
 assert {k:v for k,v in mapping[o.name].items() if k!='addedColors'}=={k:v for k,v in old_mapping[o.name].items() if k!='addedColors'}
 mat=o.data.materials[0];spec=native['materials'][mat.name];bs=mat.node_tree.nodes['Principled BSDF']
 assert abs(bs.inputs['Roughness'].default_value-spec['roughness'])<1e-7
 assert abs(bs.inputs['Specular IOR Level'].default_value*2-spec['specular'])<1e-7
changed=set(record['changedMaterials'])
assert {k:v for k,v in old['materials'].items() if k not in changed}=={k:v for k,v in native['materials'].items() if k not in changed}
assert old['additions']==native['additions'] and old['faceContour']==native['faceContour']
record.update(unchangedMeshContracts=len(contracts),unchangedOtherMeshColors=len(all_meshes)-len(NAMES),unchangedOtherHairMaterials=len(native['materials'])-len(changed),colorChecks=color_checks)
scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.52
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({});bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
(p/'female-vertex-mapping.json').write_text(json.dumps(mapping)+'\n');(p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
(d/'native-pony-sheen-validation.json').write_text(json.dumps(record,indent=2)+'\n');print('PONY_SHEEN',json.dumps(record),flush=True)
for name,loc in [('front',(0,-3,1.72)),('oblique',(-1.8,-2.1,1.76)),('profile',(3,0,1.72))]:
 cam.location=loc;review.look_at(cam,Vector((-.025,.005,1.65)));scene.render.filepath=str(d/('after-'+name+'.png'));bpy.ops.render.render(write_still=True)
cam.data.ortho_scale=.30;scene.render.resolution_x=scene.render.resolution_y=700
cam.location=(3,0,1.75);review.look_at(cam,Vector((-.015,.012,1.72)));scene.render.filepath=str(d/'after-close-profile.png');bpy.ops.render.render(write_still=True)
