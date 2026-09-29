import bpy,sys,json
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import OUT,review
from audit_complete_expressions import set_pose
folder=OUT/'hair-likeness-20260921'
bpy.ops.wm.open_mainfile(filepath=str(folder/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({})
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.52
scene=bpy.context.scene;scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
for name,loc in [('front',(0,-3,1.72)),('braid',(-1.8,-2.1,1.76)),('back',(-.7,3,1.72))]:
 camera.location=loc;review.look_at(camera,Vector((-.025,.005,1.65)))
 scene.render.filepath=str(folder/'root-transition-pass'/('female-'+name+'.png'));bpy.ops.render.render(write_still=True)
for name in ['Complete scalp','PLURR swept scalp groom']:
 mat=bpy.data.objects[name].data.materials[0];bs=mat.node_tree.nodes.get('Principled BSDF')
 print('MATERIAL',name,json.dumps({s.name:(s.default_value[:] if hasattr(s.default_value,'__len__') else s.default_value) for s in bs.inputs if hasattr(s,'default_value') and s.name in ['Metallic','Roughness','Specular IOR Level','Coat Weight','Sheen Weight','Emission Color']}),flush=True)
