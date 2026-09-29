"""Apply this silhouette pass to the archived preceding delivered source."""
import json,sys
from pathlib import Path
import bpy
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from refine_reference_hair import PASS,apply_geometry
from assemble_complete_pair import array
from refine_female_front_sweep import shape_front_sweep,refresh_front_addition
d=PASS/'front-sweep-pass';b=d/'before'
bpy.ops.wm.open_mainfile(filepath=str(b/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH' and ob.data.shape_keys:
  for key in ob.data.shape_keys.key_blocks:key.value=0
bpy.context.view_layer.update()
mapping=json.loads((b/'female-vertex-mapping.json').read_text())
native=json.loads((b/'female-native-validation.json').read_text())
before_front=array(bpy.data.objects['PLURR loose brunette front locks'])
shape_front_sweep(mapping,native['meshes'],apply_geometry)
refresh_front_addition(native,before_front)
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(PASS/'female-hair-refined.blend'),compress=True)
(PASS/'female-vertex-mapping.json').write_text(json.dumps(mapping)+'\n')
(PASS/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
print('FRONT_SWEEP',json.dumps(native['meshes']['frontSweep']),flush=True)

import runpy
runpy.run_path(str(d/'render-views.py'))
