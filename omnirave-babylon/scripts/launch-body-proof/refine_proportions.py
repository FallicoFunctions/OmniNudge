"""Body03 proportion candidate, with retained body02 controls.

Connection map: the continuous body, independently weighted garments and bone
endpoints receive the same smooth torso field. Shoulder/elbow/wrist chains then
receive bone-local axial arm extension; hands translate without scaling.
No primitives, hidden-body deletion or topology replacement are involved.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import sys
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_bodies import OUT, lengthen_arms, pose, review


def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def topology(obj):
    return hashlib.sha256(repr([tuple(p.vertices) for p in obj.data.polygons]).encode()).hexdigest()


def measure(body, rig):
    pose(rig, 'tpose')
    obj = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = obj.to_mesh()
    points = [body.matrix_world @ v.co for v in mesh.vertices]
    obj.to_mesh_clear()
    bounds = [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)]
    h = bounds[2][1] - bounds[2][0]
    shoulder = (rig.pose.bones['upperarm_l'].head.z + rig.pose.bones['upperarm_r'].head.z) / 2
    bands = {}
    for label, z in [('upper_chest', shoulder - .075), ('ribcage', shoulder - .15), ('lower_torso', shoulder - .28)]:
        band = [p for p in points if abs(p.z - z) < .012 and abs(p.x) < .25]
        bands[label] = {'height_m': z, 'sample_band_half_height_m': .012,
                        'width_m': max(p.x for p in band) - min(p.x for p in band)}
    waist_candidates = []
    for step in range(31):
        z = shoulder - .27 + step * .005
        band = [p for p in points if abs(p.z - z) < .008 and abs(p.x) < .25]
        waist_candidates.append((max(p.x for p in band) - min(p.x for p in band), z))
    width, z = min(waist_candidates)
    bands['waist'] = {'height_m': z, 'sample_band_half_height_m': .008, 'width_m': width, 'method': 'narrowest sampled torso band'}
    return {'bounds_m': bounds, 'height_m': h, 'span_height_ratio': (bounds[0][1] - bounds[0][0]) / h,
            'torso_bands': bands, 'vertices': len(points)}


def main(sex, replace_candidate=False):
    source = OUT / f'{sex}-body02.blend'
    destination = OUT / f'{sex}-body03.blend'
    if destination.exists() and not replace_candidate:
        raise FileExistsError(destination)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig, body = bpy.data.objects['AvatarSkeleton'], bpy.data.objects['AvatarBody']
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    initial_topology = topology(body)
    before = measure(body, rig)
    rig.animation_data_clear()
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    shoulder = (rig.data.bones['upperarm_l'].head_local.z + rig.data.bones['upperarm_r'].head_local.z) / 2
    # Small authored width hypotheses: clothing hides the anatomical shoulders.
    # These are candidate settings, not calibrated photo measurements.
    waist_height = before['torso_bands']['waist']['height_m']
    strength = {'male': (.055, .065, 0), 'female': (.025, .040, .025)}[sex]

    def field(p):
        x, y, z = p
        chest, deltoid, waist = strength
        lateral = 1 - smooth(.19, .30, abs(x))
        vertical = smooth(shoulder - .42, shoulder - .32, z) * (1 - smooth(shoulder + .02, shoulder + .12, z))
        amount = (chest * math.exp(-((z - shoulder + .12) / .12) ** 2)
                  + deltoid * math.exp(-((z - shoulder + .015) / .075) ** 2)
                  + waist * math.exp(-((z - waist_height) / .06) ** 2))
        return Vector((x * (1 + amount * lateral * vertical), y, z))

    for obj in meshes:
        to_rig = rig.matrix_world.inverted() @ obj.matrix_world
        to_obj = to_rig.inverted()
        for vertex in obj.data.vertices:
            vertex.co = to_obj @ field(to_rig @ vertex.co)
        obj.data.update()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone in rig.data.edit_bones:
        bone.head, bone.tail = field(bone.head.copy()), field(bone.tail.copy())
    bpy.ops.object.mode_set(mode='OBJECT')
    # Match an explicit experimental span target while preserving body height.
    # Reference images contain hair/footwear, so this target remains an estimate.
    target = {'male': 1.02, 'female': 1.00}[sex]
    middle = measure(body, rig)
    arm_length = sum(rig.data.bones[n + '_l'].length for n in ['upperarm', 'lowerarm'])
    gain = 1 + (target - middle['span_height_ratio']) * middle['height_m'] / (2 * arm_length)
    assert 1 <= gain <= 1.22, gain
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    lengthen_arms(rig, meshes, gain)
    after = measure(body, rig)
    assert abs(after['span_height_ratio'] - target) < .006
    assert abs(after['height_m'] - before['height_m']) < .001
    assert topology(body) == initial_topology and len(body.data.vertices) == 13380
    assert len(rig.data.bones) == 56
    for bone in rig.data.bones:
        if bone.use_connect:
            assert (bone.head_local - bone.parent.tail_local).length < 1e-5
    pose(rig, 'relaxed')
    bpy.context.scene['launchBodyStudy']['referenceBodyMatch'] = 'PENDING_BODY03_COMPARISON'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(destination), compress=True)
    report = {'character': sex, 'source': source.name, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'before': before, 'after': after, 'target_span_height_ratio': target,
              'arm_gain_relative_to_body02': gain, 'torso_field_parameters': strength,
              'body_topology_sha256': initial_topology, 'topology_unchanged': True, 'bone_count': 56,
              'reference_acceptance': 'PENDING', 'target_basis': 'authored estimate from supporting dressed views; hidden anatomy unverified'}
    (OUT / f'{sex}-body03.json').write_text(json.dumps(report, indent=2) + '\n')
    render(sex, rig, meshes)
    print('BODY03', sex, 'span', before['span_height_ratio'], '->', after['span_height_ratio'], 'arm_gain', gain)


def render(sex, rig, meshes):
    camera = review.configure_scene()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.3
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 768, 896
    clay = bpy.data.materials.new('Body03 clay')
    clay.use_nodes = True
    bs = clay.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (.30, .34, .38, 1)
    bs.inputs['Roughness'].default_value = .8
    scene.view_layers[0].material_override = clay
    for obj in meshes:
        obj.hide_render = obj.name not in ['AvatarBody', 'AvatarEye_l', 'AvatarEye_r']
    for label in ['tpose', 'relaxed', 'reach', 'crouch']:
        pose(rig, label)
        camera.data.ortho_scale = 2.65 if label == 'reach' else 2.3
        views = {'front': (0, -4, .93), 'profile': (4, 0, .93)} if label in ['tpose', 'relaxed'] else {'three-quarter': (2, -4, .93)}
        for view, xyz in views.items():
            camera.location = xyz
            review.look_at(camera, Vector((0, 0, .93)))
            scene.render.filepath = str(OUT / f'{sex}-body03-{label}-{view}.png')
            bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('sex', choices=['male', 'female'])
    parser.add_argument('--render-only', action='store_true')
    parser.add_argument('--replace-candidate', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if args.render_only:
        bpy.ops.wm.open_mainfile(filepath=str(OUT / f'{args.sex}-body03.blend'))
        render(args.sex, bpy.data.objects['AvatarSkeleton'], [o for o in bpy.data.objects if o.type == 'MESH'])
    else:
        main(args.sex, args.replace_candidate)
