import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from audit_complete_expressions import set_pose
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-surface-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
body=bpy.data.objects['AvatarBody'];mat=body.data.materials[0];nodes=mat.node_tree.nodes;bs=nodes.get('Principled BSDF');nm=bs.inputs['Normal'].links[0].from_node
print('NORMAL',nm.name,nm.inputs['Strength'].default_value,nm.inputs['Color'].links[0].from_node.image.name,flush=True)
print('SURFACE',[(i.name,i.default_value if isinstance(i.default_value,(float,int)) else str(i.default_value),i.links[0].from_node.name if i.is_linked else None) for i in bs.inputs if i.name in ['Specular IOR Level','Roughness','Base Color']],flush=True)
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene=bpy.context.scene;scene.frame_set(1);set_pose({})
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.31;scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
eye=array(bpy.data.objects['AvatarIris_l'],True).mean(0);target=Vector((0,-.075,float(eye[2]-.024)));cam.location=target+Vector((0,-4,.015));review.look_at(cam,target)
for label,normal,rough in [('reduced-normal',.35,None),('reduced-normal-satin',.35,.47)]:
 nm.inputs['Strength'].default_value=normal
 if rough:
  for l in list(bs.inputs['Roughness'].links):mat.node_tree.links.remove(l)
  bs.inputs['Roughness'].default_value=rough
 scene.render.filepath=str(d/('diagnose-'+label+'.png'));bpy.ops.render.render(write_still=True)
print('Diagnosis renders only; source untouched',flush=True)
