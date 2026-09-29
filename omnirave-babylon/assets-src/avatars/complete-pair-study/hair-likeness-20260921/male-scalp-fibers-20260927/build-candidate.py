"""Build and render the isolated male scalp finish from the archived source."""
import json,sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from assemble_complete_pair import review
from audit_complete_expressions import set_pose

folder=PASS/'male-scalp-fibers-20260927'
bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
cap=bpy.data.objects['Complete scalp'];material=cap.data.materials[0]
image_node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE')
image=bpy.data.images.load(str(PASS/'male-scalp-refined.png'),check_existing=False)
image.pack();image_node.image=image
bs=material.node_tree.nodes['Principled BSDF']
bs.inputs['Roughness'].default_value=1.0
bs.inputs['Specular IOR Level'].default_value=.02
report=json.loads((folder/'before/male-native-validation.json').read_text())
report['materials'][material.name]={'color':[1,1,1,1],'roughness':1.0,'specular':.04,
                                    'texture':'male-scalp-refined.png','alphaMode':'BLEND','doubleSided':True}
report['maleScalpFinish']={'material':material.name,'texture':'male-scalp-refined.png',
                           'meshUvWeightsGeometryAndColorExact':True}
(PASS/'male-native-validation.json').write_text(json.dumps(report,indent=2)+'\n')
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
scene=bpy.context.scene;scene.frame_set(1);set_pose({})
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(PASS/'male-hair-refined.blend'),compress=True)
print('MALE_SCALP_FINISH',report['maleScalpFinish'],flush=True)
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.43
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
target=Vector((0,-.025,1.686))
for label,offset in [('front',(0,-3,.03)),('oblique',(.9,-3,.035)),('side',(3,0,.03)),('upper',(.65,-1.9,2.4))]:
    camera.location=target+Vector(offset);review.look_at(camera,target)
    scene.render.filepath=str(folder/('male-'+label+'.png'))
    bpy.ops.render.render(write_still=True)
