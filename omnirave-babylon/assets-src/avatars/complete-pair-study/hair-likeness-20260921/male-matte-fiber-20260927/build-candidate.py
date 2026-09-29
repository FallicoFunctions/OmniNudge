"""Apply reference-matched dark, matte male hair without changing geometry."""
import sys,json
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from assemble_complete_pair import review
from audit_complete_expressions import set_pose
folder=PASS/'male-matte-fiber-20260927'
bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
report=json.loads((folder/'before/male-native-validation.json').read_text())
changed=[]
for name,value in report['materials'].items():
 mat=bpy.data.materials[name];bs=mat.node_tree.nodes['Principled BSDF']
 bs.inputs['Roughness'].default_value=.86
 bs.inputs['Specular IOR Level'].default_value=.045
 normal=[node for node in mat.node_tree.nodes if node.type=='NORMAL_MAP']
 assert len(normal)==1,name
 normal[0].inputs['Strength'].default_value=.14
 value['roughness']=.86;value['specular']=.09;value['normalScale']=.14
 changed.append(name)
result={'materials':changed,'roughness':.86,'nativeSpecularIORLevel':.045,'exportSpecularFactor':.09,'normalScale':.14,
        'geometryColorsRigUVsAndTexturesUnchanged':True}
report['maleFiberFinish']=result
(folder/'authoring-report.json').write_text(json.dumps(result,indent=2)+'\n')
(PASS/'male-native-validation.json').write_text(json.dumps(report,indent=2)+'\n')
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
scene=bpy.context.scene;scene.frame_set(1);set_pose({})
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(PASS/'male-hair-refined.blend'),compress=True)
print('MALE_MATTE_FINISH',json.dumps(result),flush=True)
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.43
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
target=Vector((0,-.025,1.686))
for label,offset in [('front',(0,-3,.03)),('oblique',(.9,-3,.035)),('side',(3,0,.03)),('back',(0,3,.03)),('upper',(.65,-1.9,2.4))]:
 camera.location=target+Vector(offset);review.look_at(camera,target)
 scene.render.filepath=str(folder/('male-'+label+'.png'));bpy.ops.render.render(write_still=True)
