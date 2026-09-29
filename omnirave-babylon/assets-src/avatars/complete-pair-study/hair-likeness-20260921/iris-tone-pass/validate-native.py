import bpy
import hashlib
import json
import sys
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root / 'scripts/launch-body-proof'))
from refine_complete_foil_finish import geometry_contract

study = root / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
pass_dir = study / 'iris-tone-pass'

def snapshot(file):
    bpy.ops.wm.open_mainfile(filepath=str(file))
    meshes = {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
    images = {image.name: hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
    rig = bpy.data.objects['AvatarSkeleton']
    bones = [(bone.name, tuple(bone.head_local), tuple(bone.tail_local)) for bone in rig.data.bones]
    actions = sorted(action.name for action in bpy.data.actions)
    materials = sorted(material.name for material in bpy.data.materials)
    tint = tuple(bpy.data.materials['Launch female iris'].node_tree.nodes['Reference warm iris tint'].inputs[2].default_value)
    return meshes, images, bones, actions, materials, tint

old = snapshot(pass_dir / 'before/female-hair-refined.blend')
now = snapshot(study / 'female-hair-refined.blend')
for index in range(5):
    assert old[index] == now[index], f'native contract {index} changed'
assert len(now[0]) == 62 and len(now[1]) == 93 and len(now[2]) == 56
assert all(abs(a - b) < 1e-7 for a, b in zip(old[5], (1, .46, .24, 1)))
assert all(abs(a - b) < 1e-7 for a, b in zip(now[5], (.48, .20, .12, 1)))
record = {
    'unchangedMeshContracts': len(now[0]),
    'unchangedPackedImages': len(now[1]),
    'unchangedBones': len(now[2]),
    'unchangedActions': len(now[3]),
    'unchangedMaterialSet': len(now[4]),
    'previousTint': old[5],
    'newTint': now[5],
}
(pass_dir / 'native-preservation.json').write_text(json.dumps(record, indent=2) + '\n')
print('IRIS_NATIVE_PRESERVED', json.dumps(record), flush=True)
