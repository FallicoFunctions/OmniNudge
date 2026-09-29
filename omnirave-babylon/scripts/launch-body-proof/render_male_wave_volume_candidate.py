"""Render the male wave-volume candidate at fixed comparison views."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import review
from refine_reference_hair import apply_geometry
from refine_male_wave_volume import lift_wave_volume

ROOT=Path(__file__).resolve().parents[2]
PASS=ROOT/'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
amount=float(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 1.0
OUT=PASS/f'male-wave-volume-study/amount-{amount:g}'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST'
mapping={};report={};print('WAVE_VOLUME',lift_wave_volume(mapping,report,apply_geometry,amount),flush=True)
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
scene=bpy.context.scene;camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.51
scene.render.resolution_x=700;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
for name,location,target in [
    ('front',(0,-3,1.70),(0,-.02,1.69)),
    ('three-quarter',(.85,-2.9,1.74),(0,-.02,1.69)),
    ('side',(3,0,1.70),(0,-.02,1.69)),
    ('back',(0,3,1.70),(0,-.02,1.69)),
]:
    camera.location=location;review.look_at(camera,Vector(target))
    scene.render.filepath=str(OUT/f'candidate-{name}.png');bpy.ops.render.render(write_still=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'male-wave-volume-candidate.blend'),compress=True)
