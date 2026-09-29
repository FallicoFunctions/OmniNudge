"""Render isolated front/side hair layers and a matte finish candidate."""
import sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import review
from audit_complete_expressions import set_pose
f=Path('assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-silhouette-material-study-20260927')
bpy.ops.wm.open_mainfile(filepath=str(f/'before/male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({})
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.43
scene=bpy.context.scene;scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=16
target=Vector((0,-.025,1.686));camera.location=target+Vector((3,0,.03));review.look_at(camera,target)
hair=[o for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')=='hair']
main='Luxury retained swept groom'
for label,keep in [('main-only',{main}),('support-only',{o.name for o in hair if o.name!=main})]:
 for ob in hair:ob.hide_render=ob.name not in keep
 scene.render.filepath=str(f/('side-'+label+'.png'));bpy.ops.render.render(write_still=True)
for ob in hair:ob.hide_render=False
for ob in hair:
 for mat in ob.data.materials:
  if not mat.use_nodes:continue
  bs=mat.node_tree.nodes.get('Principled BSDF')
  if not bs:continue
  bs.inputs['Roughness'].default_value=.86
  bs.inputs['Specular IOR Level'].default_value=.045
  for node in mat.node_tree.nodes:
   if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.14
scene.render.filepath=str(f/'side-matte.png');bpy.ops.render.render(write_still=True)
camera.location=target+Vector((.9,-3,.035));review.look_at(camera,target)
scene.render.filepath=str(f/'oblique-matte.png');bpy.ops.render.render(write_still=True)
