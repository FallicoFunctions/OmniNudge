import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from audit_complete_expressions import set_pose
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'cheek-volume-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
body=bpy.data.objects['AvatarBody'];a=array(body);rows=[]
for z in [1.515,1.530,1.545,1.560,1.575,1.590]:
 for x in [.025,.035,.045,.055]:
  q=a[(abs(a[:,2]-z)<.003)&(abs(a[:,0]-x)<.004)&(a[:,1]<-.04)]
  if len(q):rows.append({'x':x,'z':z,'vertices':len(q),'min':q.min(0).tolist(),'max':q.max(0).tolist()})
(d/'inspection.json').write_text(json.dumps(rows,indent=2)+'\n')
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({})
scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.31
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
eye=array(bpy.data.objects['AvatarIris_l'],True).mean(0);target=Vector((0,-.075,float(eye[2]-.024)))
clay=bpy.data.materials.new('Temporary face inspection clay');clay.use_nodes=True
bsdf=clay.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.32,.32,.32,1);bsdf.inputs['Roughness'].default_value=.8
body.data.materials[0]=clay
for label,offset in [('front',(0,-4,.015)),('oblique',(2,-3,.015))]:
 cam.location=target+Vector(offset);review.look_at(cam,target);scene.render.filepath=str(d/('before-clay-'+label+'.png'));bpy.ops.render.render(write_still=True)
print('Saved clay inspection views; source file untouched.',flush=True)
