"""Apply the accepted outer sweep to the native male source."""
from pathlib import Path
import json
import shutil
import sys
import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
from refine_reference_hair import apply_geometry
from refine_male_outer_wave import release_outer_wave

ROOT=Path(__file__).resolve().parents[2]
PASS=ROOT/'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
OUT=PASS/'male-outer-wave-20260928';BEFORE=OUT/'before';BEFORE.mkdir(parents=True,exist_ok=True)
for name in ['male-hair-refined.blend','male-vertex-mapping.json','male-native-validation.json']:
    shutil.copy2(PASS/name,BEFORE/name)
for suffix in ['', '-lod1', '-lod2']:
    name=f'male{suffix}.glb';shutil.copy2(ROOT/'public/assets/avatars/complete-pair'/name,BEFORE/name)
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST'
for ob in bpy.context.scene.objects:
    if ob.type=='MESH' and ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:key.value=0
bpy.context.view_layer.update()
mapping=json.loads((PASS/'male-vertex-mapping.json').read_text())
native=json.loads((PASS/'male-native-validation.json').read_text())
report={};change=release_outer_wave(mapping,report,apply_geometry)
native['meshes'].update(report);native['maleOuterWave']=change
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(PASS/'male-hair-refined.blend'),compress=True)
(PASS/'male-vertex-mapping.json').write_text(json.dumps(mapping)+'\n')
(PASS/'male-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
(OUT/'authoring-report.json').write_text(json.dumps(change,indent=2)+'\n')
print('MALE_OUTER_WAVE_NATIVE_SAVED',json.dumps(change),flush=True)
