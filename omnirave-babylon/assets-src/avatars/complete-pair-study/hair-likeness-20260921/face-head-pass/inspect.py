import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from audit_complete_expressions import set_pose
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-head-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
body=bpy.data.objects['AvatarBody'];q=array(body)
rows={}
for ob in bpy.context.scene.objects:
 if ob.type=='MESH' and ob.name.startswith('Avatar'):
  a=array(ob);rows[ob.name]={'vertices':len(a),'min':a.min(0).tolist(),'max':a.max(0).tolist(),'materials':[m.name for m in ob.data.materials]}
print('MESHES',json.dumps(rows),flush=True)
print('KEYS',[k.name for k in body.data.shape_keys.key_blocks],flush=True)
for z in np.arange(1.48,1.66,.01):
 a=q[(abs(q[:,2]-z)<.003)&(q[:,1]<-.03)]
 if len(a):print('SLICE',round(z,3),a.min(0).tolist(),a.max(0).tolist(),flush=True)
for obname in ['AvatarIris_l','AvatarIris_r','AvatarBody']:
 ob=bpy.data.objects[obname]
 for m in ob.data.materials:
  print('MATERIAL',obname,m.name,flush=True)
  if m.use_nodes:
   for n in m.node_tree.nodes:
    if n.type in ['BSDF_PRINCIPLED','TEX_IMAGE']:print(n.name,[(s.name,str(s.default_value[:]) if hasattr(s.default_value,'__len__') else str(s.default_value),s.is_linked) for s in n.inputs if s.name in ['Base Color','Roughness','Metallic']],n.image.name if n.type=='TEX_IMAGE' and n.image else '',flush=True)
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({})
scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.31
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
z=float(array(bpy.data.objects['AvatarIris_l'],True).mean(0)[2])
target=Vector((0,-.075,z-.024))
for label,offset in [('front',(0,-4,.015)),('oblique',(2,-3,.015)),('profile',(4,0,.015))]:
 cam.location=target+Vector(offset);review.look_at(cam,target);scene.render.filepath=str(d/('before-'+label+'.png'));bpy.ops.render.render(write_still=True)
(d/'inspection.json').write_text(json.dumps(rows,indent=2)+'\n')
