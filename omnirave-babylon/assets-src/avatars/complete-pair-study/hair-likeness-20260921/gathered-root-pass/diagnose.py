import bpy,sys
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import review
from audit_complete_expressions import set_pose
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'gathered-root-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);set_pose({})
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.30
scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=16
cam.location=(3,0,1.75);review.look_at(cam,Vector((-.015,.012,1.72)))
for label,hidden in [('profile-original',[]),('profile-no-core',['PLURR gathered pony bundle','PLURR gathered pony root']),('profile-no-inner',['PLURR pony surface fibers'])]:
 for n in hidden:bpy.data.objects[n].hide_render=True
 scene.render.filepath=str(d/(label+'.png'));bpy.ops.render.render(write_still=True)
 for n in hidden:bpy.data.objects[n].hide_render=False
colors={'PLURR gathered pony bundle':(1,0,0),'PLURR gathered pony root':(0,1,1),'PLURR pony surface fibers':(0,0,1),'Polished female flyaways':(1,1,0),'PLURR pony root tie':(0,1,0)}
colors.update({f'PLURR pony strands {i}':(1,0,1) for i in range(4)})
for n,col in colors.items():
 ob=bpy.data.objects[n]
 for j,mat in enumerate(list(ob.data.materials)):
  mat=mat.copy();ob.data.materials[j]=mat;tree=mat.node_tree;bs=tree.nodes['Principled BSDF']
  for socket in ['Base Color','Normal','Emission Color']:
   for link in list(bs.inputs[socket].links):tree.links.remove(link)
  bs.inputs['Base Color'].default_value=(*col,1);bs.inputs['Emission Color'].default_value=(*col,1);bs.inputs['Emission Strength'].default_value=.5;bs.inputs['Roughness'].default_value=1
scene.render.filepath=str(d/'profile-layer-colors.png');bpy.ops.render.render(write_still=True)
