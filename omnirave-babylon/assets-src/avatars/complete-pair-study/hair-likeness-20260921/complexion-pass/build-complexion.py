"""Warm the existing female face finish on retained UVs, without mesh edits."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

root = Path.cwd()
sys.path.insert(0, str(root / 'scripts/launch-body-proof'))
from assemble_complete_pair import array, review
from audit_complete_expressions import set_pose
from refine_complete_foil_finish import geometry_contract
import refine_complete_surfaces as baking

study = root / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
out = study / 'complexion-pass'
bpy.ops.wm.open_mainfile(filepath=str(out / 'before/female-hair-refined.blend'))
before = {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
body = bpy.data.objects['AvatarBody']
mat = body.data.materials[0]
tree = mat.node_tree
nodes, links = tree.nodes, tree.links
bs = nodes['Principled BSDF']
original = bs.inputs['Base Color'].links[0].from_socket
assert original.node.type == 'TEX_IMAGE' and original.node.image.name.startswith('female-face-surface-color')

# The finish is already baked. Shade from that image once, preserving all
# authored eye/lip makeup and the original color variation underneath.
position = nodes.new('ShaderNodeNewGeometry')
position.name = 'Complexion placement'
separate = nodes.new('ShaderNodeSeparateXYZ')
links.new(position.outputs['Position'], separate.inputs[0])

def math(op, left, right, name):
    node = nodes.new('ShaderNodeMath')
    node.name = name
    node.operation = op
    for value, socket in [(left, node.inputs[0]), (right, node.inputs[1])]:
        if isinstance(value, (int, float)):
            socket.default_value = value
        else:
            links.new(value, socket)
    return node.outputs[0]

# Soft twin lobes follow the outer cheek and temple. They leave the nose,
# mouth, eye makeup, ear and neck largely untouched.
x = math('ABSOLUTE', separate.outputs['X'], 0, 'Complexion |x|')
dx = math('DIVIDE', math('SUBTRACT', x, .055, 'Complexion x center'), .047, 'Complexion x radius')
dy = math('DIVIDE', math('ADD', separate.outputs['Y'], .087, 'Complexion y center'), .064, 'Complexion y radius')
dz = math('DIVIDE', math('SUBTRACT', separate.outputs['Z'], 1.597, 'Complexion z center'), .077, 'Complexion z radius')
squares = [math('MULTIPLY', value, value, f'Complexion {axis}²') for value, axis in [(dx,'x'),(dy,'y'),(dz,'z')]]
distance = math('ADD', math('ADD', squares[0], squares[1], 'Complexion xy'), squares[2], 'Complexion xyz')
negative = math('MULTIPLY', distance, -.88, 'Complexion falloff')
falloff = math('POWER', 2.718281828, negative, 'Complexion soft mask')
strength = math('MULTIPLY', falloff, .47, 'Complexion strength')
blend = nodes.new('ShaderNodeMixRGB')
blend.name = 'Reference warm cheek and temple finish'
blend.blend_type = 'MULTIPLY'
links.new(strength, blend.inputs[0])
links.new(original, blend.inputs[1])
blend.inputs[2].default_value = (.79, .71, .65, 1)
links.new(blend.outputs[0], bs.inputs['Base Color'])

assert before == {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
scene = bpy.context.scene
rig = bpy.data.objects['AvatarSkeleton']
rig.animation_data.action = bpy.data.actions['idle']
rig.data.pose_position = 'REST'
scene.frame_set(1)
set_pose({})
baking.OUT = out
retained_engine = scene.render.engine
scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
texture, _ = baking.bake(body, mat, 'female-face-complexion-color', blend.outputs[0], size=2048)
links.new(texture.outputs['Color'], bs.inputs['Base Color'])
scene.render.engine = retained_engine

rig.data.pose_position = 'POSE'
scene.frame_set(1)
set_pose({})
cam = review.configure_scene()
cam.data.type = 'ORTHO'
cam.data.ortho_scale = .31
scene.render.resolution_x = 650
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.view_settings.exposure = -.8
if scene.render.engine == 'CYCLES':
    scene.cycles.samples = 24
eye = array(bpy.data.objects['AvatarIris_l'], True).mean(0)
target = Vector((0, -.075, float(eye[2] - .024)))
for label, offset in [('front', (0, -4, .015)), ('oblique', (2, -3, .015)), ('profile', (4, 0, .015))]:
    cam.location = target + Vector(offset)
    review.look_at(cam, target)
    scene.render.filepath = str(out / f'after-{label}.png')
    bpy.ops.render.render(write_still=True)

assert before == {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
texture_file = out / 'female-face-complexion-color.png'
record = json.loads((out / 'before/female-native-validation.json').read_text())
complexion = {'sourceTexture': 'complexion-pass/female-face-complexion-color.png', 'texture': 'female-face-finish-color', 'sourceTextureSha256': hashlib.sha256(texture_file.read_bytes()).hexdigest(), 'outerCheekCenterX': .055, 'centerY': -.087, 'centerZ': 1.597, 'radii': [.047, .064, .077], 'maximumStrength': .47, 'multiplyColor': [.79, .71, .65], 'addedRuntimeTextures': 0, 'unchangedMeshContracts': len(before), 'scope': 'Material-only warmer outer cheeks and temples on the existing skin map; geometry, UVs, rig and clips unchanged.'}
record['complexionFinish'] = complexion
(out / 'native-complexion-validation.json').write_text(json.dumps({'unchangedMeshContracts': len(before), 'unchangedBones': len(rig.data.bones), 'unchangedActions': len(bpy.data.actions), **complexion}, indent=2) + '\n')
(study / 'female-native-validation.json').write_text(json.dumps(record, indent=2) + '\n')
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(study / 'female-hair-refined.blend'), compress=True)
print('COMPLEXION_BUILD_OK', complexion['sourceTextureSha256'], flush=True)
