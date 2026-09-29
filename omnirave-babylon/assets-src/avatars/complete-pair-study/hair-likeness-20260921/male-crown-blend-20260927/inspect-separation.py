import sys,json
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from assemble_complete_pair import review
from complete_pair_geometry import Surface
from audit_complete_expressions import set_pose
folder=PASS/'male-crown-blend-20260927'
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({})
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.43
target=Vector((0,-.025,1.686));camera.location=target+Vector((.65,-1.9,2.4));review.look_at(camera,target);bpy.context.view_layer.update()
rotation=camera.matrix_world.to_3x3();direction=rotation@Vector((0,0,-1))
mat=rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()
for name in ['Complete scalp','Luxury retained swept groom']:
 surf=Surface(rig,bpy.data.objects[name])
 for pixel in [(300,291),(317,297),(285,305),(262,319),(333,319),(300,330)]:
  origin=camera.location+rotation@Vector(((pixel[0]-325)/800*.43,(400-pixel[1])/800*.43,0))
  hit,normal,triangle,distance=surf.tree.ray_cast(origin,direction,10)
  print(name,pixel,'world',list(hit) if hit else None,'rest',list(mat.inverted()@hit) if hit else None,flush=True)
