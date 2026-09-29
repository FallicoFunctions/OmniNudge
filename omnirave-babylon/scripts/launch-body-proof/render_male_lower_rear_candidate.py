from pathlib import Path
import sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import review
from refine_reference_hair import apply_geometry
from refine_male_lower_rear_hair import lower_rear_hair
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-lower-rear-20260928'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST'
mapping={};report={};print('LOWER_REAR',lower_rear_hair(mapping,report,apply_geometry),flush=True)
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
scene=bpy.context.scene;camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.51
scene.render.resolution_x=700;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.exposure=-.8
for name,location,target in [
    ('front',(0,-3,1.70),(0,-.02,1.69)),
    ('three-quarter',(.85,-2.9,1.74),(0,-.02,1.69)),
    ('side',(3,0,1.70),(0,-.02,1.69)),
    ('back',(0,3,1.70),(0,-.02,1.69)),
]:
    camera.location=location;review.look_at(camera,Vector(target))
    scene.render.filepath=str(OUT/f'candidate-{name}.png');bpy.ops.render.render(write_still=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'male-lower-rear-candidate.blend'),compress=True)
