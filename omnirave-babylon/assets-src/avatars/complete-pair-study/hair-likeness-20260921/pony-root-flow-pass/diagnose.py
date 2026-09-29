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

for obname in [f'PLURR pony strands {i}' for i in range(3)]:
 for mat in bpy.data.objects[obname].data.materials:
  bs=mat.node_tree.nodes['Principled BSDF'];bs.inputs['Specular IOR Level'].default_value=0.
scene.render.filepath=str(d/'profile-no-outer-specular.png');bpy.ops.render.render(write_still=True)
for obname in [f'PLURR pony strands {i}' for i in range(3)]:
 for mat in bpy.data.objects[obname].data.materials:
  bs=mat.node_tree.nodes['Principled BSDF']
  for link in list(bs.inputs['Normal'].links):mat.node_tree.links.remove(link)
scene.render.filepath=str(d/'profile-no-outer-normal.png');bpy.ops.render.render(write_still=True)
