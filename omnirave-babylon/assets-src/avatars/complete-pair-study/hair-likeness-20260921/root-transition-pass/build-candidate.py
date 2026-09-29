"""Apply only this continuation to the archived preceding delivered source.

The main cumulative build invokes the same geometry/material functions after
the preceding stages. This bounded entry point avoids recomputing unrelated
pony clearance while evaluating hairline candidates.
"""
import json,sys
from pathlib import Path
import bpy
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from refine_reference_hair import PASS,apply_geometry,scalp_finish
from refine_female_root_transition import refine_roots
d=PASS/'root-transition-pass';b=d/'before'
bpy.ops.wm.open_mainfile(filepath=str(b/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST'
for ob in bpy.context.scene.objects:
 if ob.type=='MESH' and ob.data.shape_keys:
  for key in ob.data.shape_keys.key_blocks:key.value=0
bpy.context.view_layer.update()
mapping=json.loads((b/'female-vertex-mapping.json').read_text())
native=json.loads((b/'female-native-validation.json').read_text())
refine_roots(mapping,native['meshes'],apply_geometry)
old=bpy.data.images.get('reference-female-hairline')
if old:bpy.data.images.remove(old)
native['materials'].update(scalp_finish())
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(PASS/'female-hair-refined.blend'),compress=True)
(PASS/'female-vertex-mapping.json').write_text(json.dumps(mapping)+'\n')
(PASS/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
print('ROOT_TRANSITION',json.dumps(native['meshes']['PLURR swept scalp groom']['rootTransition']),flush=True)
