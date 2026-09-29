"""Read-only body reference baseline; render current body shapes without wardrobe.
Connection map: continuous body mesh; inherited head/neck and limb joints remain
shared topology. Eyes remain in source sockets. No primitive anatomy is added.
"""
from pathlib import Path
import bpy,json,sys,hashlib
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-src/avatars/launch-body-proof'
sys.path.insert(0,str(ROOT/'scripts/avatar-modular-v1'))
import render_lean_body_review as review
sources={'base':ROOT/'assets-src/avatars/modular-v1/avatar-modular-v1.blend','editorial':ROOT/'assets-src/avatars/modular-v1/fashion-v18/avatar-modular-v1-fashion-v18.blend'}
reports=[]
for label,path in sources.items():
 bpy.ops.wm.open_mainfile(filepath=str(path))
 camera=review.configure_scene();scene=bpy.context.scene
 scene.render.resolution_x=768;scene.render.resolution_y=896
 camera.data.type='ORTHO';camera.data.ortho_scale=2.15
 rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data_clear()
 for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
 for ob in bpy.data.objects:
  if ob.type=='MESH':ob.hide_render=ob.name not in ['AvatarBody','AvatarEyes','AvatarEyebrows','AvatarEyelashes']
  if ob.type=='MESH' and ob.data.shape_keys:ob.data.shape_keys.animation_data_clear()
 clay=bpy.data.materials.new('DiagnosticClay');clay.diffuse_color=(.46,.49,.52,1);clay.use_nodes=True
 clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.46,.49,.52,1)
 clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
 scene.view_layers[0].material_override=clay
 body=bpy.data.objects['AvatarBody']
 for mod in body.modifiers:
  if mod.type=='MASK':mod.show_viewport=False;mod.show_render=False
 for sex in ['male','female']:
  review.set_morph(sex,1.0 if label=='editorial' else 0)
  bpy.context.view_layer.update();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();pts=[body.matrix_world@v.co for v in mesh.vertices]
  bounds=[[min(v[i] for v in pts),max(v[i] for v in pts)] for i in range(3)]
  ev.to_mesh_clear()
  report={'source':label,'sex':sex,'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bounds':bounds,'vertices':len(body.data.vertices),'shape_keys':[(k.name,k.value) for k in body.data.shape_keys.key_blocks],'actions':[a.name for a in bpy.data.actions], 'bones':{b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'parent':b.parent.name if b.parent else None} for b in rig.data.bones},'body_modifiers':[(m.name,m.type) for m in body.modifiers]}
  reports.append(report)
  for view,xyz in {'front':(0,-4,.92),'profile':(4,0,.92)}.items():
   camera.location=xyz;review.look_at(camera,Vector((0,0,.92)))
   scene.render.filepath=str(OUT/f'{label}-{sex}-{view}.png');bpy.ops.render.render(write_still=True)
 (OUT/'source-inspection.json').write_text(json.dumps(reports,indent=2)+'\n')
print('SOURCE_BODY_INSPECTED',[(r['source'],r['sex'],r['bounds']) for r in reports])
