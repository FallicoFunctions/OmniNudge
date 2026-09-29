import bpy
import hashlib
import json
import sys
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root / 'scripts/launch-body-proof'))
from refine_complete_foil_finish import geometry_contract

study = root / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
out = study / 'complexion-pass'
def snapshot(file):
    bpy.ops.wm.open_mainfile(filepath=str(file))
    meshes = {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
    images = {image.name: hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
    rig = bpy.data.objects['AvatarSkeleton']
    bones = [(bone.name, tuple(bone.head_local), tuple(bone.tail_local)) for bone in rig.data.bones]
    actions = sorted((action.name, tuple(action.frame_range)) for action in bpy.data.actions)
    return meshes, images, bones, actions

before = snapshot(out / 'before/female-hair-refined.blend')
after = snapshot(study / 'female-hair-refined.blend')
assert before[0] == after[0]
assert before[2:] == after[2:]
assert len(before[0]) == 63 and len(before[2]) == 56 and len(before[3]) == 3
for name, digest in before[1].items():
    assert after[1][name] == digest, name
assert len(set(after[1]) - set(before[1])) == 1
assert next(iter(set(after[1]) - set(before[1]))).startswith('female-face-complexion-color')
record = {'unchangedMeshContracts': len(before[0]), 'unchangedPackedImages': len(before[1]), 'unchangedBones': len(before[2]), 'unchangedActions': len(before[3]), 'addedPackedBakedImage': list(set(after[1]) - set(before[1])), 'scope': 'Exact retained mesh, image, bone and action contracts; one new packed authoring image replaces the face color at runtime.'}
(out / 'native-preservation.json').write_text(json.dumps(record, indent=2) + '\n')
print('COMPLEXION_NATIVE_OK', json.dumps(record), flush=True)
