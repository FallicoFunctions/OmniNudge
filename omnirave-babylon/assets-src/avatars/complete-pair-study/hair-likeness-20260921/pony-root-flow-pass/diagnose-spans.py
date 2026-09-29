import bpy,sys
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import review
from audit_complete_expressions import set_pose
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'pony-root-flow-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);set_pose({})
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.30
scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=16
cam.location=(3,0,1.75);review.look_at(cam,Vector((-.015,.012,1.72)))


from refine_complete_groom_finish import islands
for name in [f'PLURR pony strands {i}' for i in range(3)]:
 ob=bpy.data.objects[name];attr=ob.data.color_attributes.new(name='DebugSpan',type='FLOAT_COLOR',domain='POINT')
 for ids in islands(ob):
  for j,idx in enumerate(ids):
   color=(0,1,0,1) if j<4 else ((1,0,0,1) if j<16 else (0,0,1,1))
   attr.data[idx].color=color
 for mat in ob.data.materials:
  bs=mat.node_tree.nodes['Principled BSDF'];tree=mat.node_tree
  for socket in ['Base Color','Normal','Emission Color']:
   for link in list(bs.inputs[socket].links):tree.links.remove(link)
  node=tree.nodes.new('ShaderNodeAttribute');node.attribute_name='DebugSpan'
  tree.links.new(node.outputs['Color'],bs.inputs['Base Color']);tree.links.new(node.outputs['Color'],bs.inputs['Emission Color'])
  bs.inputs['Emission Strength'].default_value=.2;bs.inputs['Specular IOR Level'].default_value=0
scene.render.filepath=str(d/'profile-span-colors.png');bpy.ops.render.render(write_still=True)
