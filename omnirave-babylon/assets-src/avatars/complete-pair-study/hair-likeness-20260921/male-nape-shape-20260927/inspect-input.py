import sys,json
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from audit_complete_expressions import set_pose
folder=Path.cwd()/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-nape-shape-20260927'
bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
cap=bpy.data.objects['Complete scalp'];p=array(cap);uv=np.zeros((len(p),2))
for loop in cap.data.loops:uv[loop.vertex_index]=cap.data.uv_layers.active.data[loop.index].uv
ids=np.flatnonzero(uv[:,1]>.999)
for i in ids[::3]:print('EDGE',int(i),'uv',np.round(uv[i],3).tolist(),'point',np.round(p[i],5).tolist(),flush=True)
np.savez(folder/'input-cap.npz',points=p,uv=uv)
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({})
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.39
scene=bpy.context.scene;scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
target=Vector((0,-.025,1.686));cam.location=target+Vector((0,3,.03));review.look_at(cam,target)
for label,hidden in [('full',[]),('outer-only',['Complete scalp','Polished male rooted hairline']),('support-only',['Luxury retained swept groom','Polished male flyaways'])]:
 for name in ['Complete scalp','Polished male rooted hairline','Luxury retained swept groom','Polished male flyaways']:bpy.data.objects[name].hide_render=name in hidden
 scene.render.filepath=str(folder/('diagnostic-'+label+'.png'));bpy.ops.render.render(write_still=True)
