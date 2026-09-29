"""Loosen the male reference hairstyle without replacing its rigged cards.

Connection map: each ribbon's first two pairs retain their exact scalp
attachment. Free fringe overlaps the retained dark hairline and falls toward
the eyebrow; temple locks overlap the scalp above the ears. Hair uses 2.5 mm
skin clearance, not structural assembly overlap. Origins, topology, UVs,
weights and relative secondary-motion shapes stay intact.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface, smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from audit_complete_expressions import POSES, set_pose


RAY_DIRECTIONS = [Vector(v).normalized() for v in [(1,.137,.071),(-.173,1,.091),(.113,-.137,1),(-1,.283,-.197),(.319,-1,-.271)]]


def point_inside(tree, point):
    """Majority parity for an enclosed skin; avoids concave-edge normal signs."""
    votes = []
    for direction in RAY_DIRECTIONS:
        origin = point.copy(); crossings = 0
        for _ in range(40):
            hit,_,_,_=tree.ray_cast(origin,direction,3)
            if hit is None: break
            crossings += 1; origin=hit+direction*.000002
        else: raise AssertionError('Skin ray did not leave the body')
        votes.append(crossings % 2)
    return sum(votes)>=3


def skin_gap(tree, point):
    hit,n,_,distance=tree.find_nearest(point)
    # Nearest triangle normals are not reliable signs when the nearest point
    # lies on an edge (especially folded ears). Resolve those signs by rays.
    plane=(point-hit).dot(n)
    inside = point_inside(tree,point) if plane<0 else False
    return (-distance if inside else distance), plane


def fit_motion_envelope(ob, original, revised, rig):
    """Fit free edges over the authored shape corners, retaining their deltas.

    Ear folds are concave: a single nearest-face push can cross a neighboring
    fold. Resolve a failed edge from outside the head along a radial ray, then
    verify it again against each sampled expression and hair shape.
    """
    poses = {**POSES,
             'hair-mixed-left': {'Secondary_HairSide': -1, 'Secondary_HairBack': 1},
             'hair-mixed-right': {'Secondary_HairSide': 1, 'Secondary_HairBack': -1}}
    # Fit in the same evaluated idle pose used by the independent validator.
    # Convert corrections back into retained mesh coordinates before saving.
    previous_position = rig.data.pose_position
    rig.data.pose_position = 'POSE'; rig.animation_data.action = bpy.data.actions['idle']
    bpy.context.scene.frame_set(1); set_pose({})
    matrix = rig.matrix_world @ rig.pose.bones['head'].matrix @ rig.data.bones['head'].matrix_local.inverted() @ rig.matrix_world.inverted()
    rotation = np.asarray(matrix)[:3,:3]; translation = np.asarray(matrix)[:3,3]
    inverse_rotation = np.linalg.inv(rotation)
    world_original = original @ rotation.T + translation
    samples = []
    for label, values in poses.items():
        set_pose(values)
        samples.append((label, Surface(rig, bpy.data.objects['AvatarBody']), array(ob, True)-world_original))
    set_pose({})
    changed = np.flatnonzero(np.linalg.norm(revised-original, axis=1)>2e-7)
    # Measured eye center anchors the radial directions inside the head.
    center = np.mean([array(bpy.data.objects['AvatarEye_'+side], True).mean(0) for side in ['l','r']],axis=0)
    center[1] += .065; center[2] += .023
    adjusted = set()
    for iteration in range(12):
        failures = 0
        for label, body, delta in samples:
            for index in changed:
                point=Vector(revised[index] @ rotation.T + translation + delta[index])
                gap,_=skin_gap(body.tree,point)
                if gap >= .0016: continue
                direction=(point-Vector(center)).normalized()
                outer,_,_,_=body.tree.ray_cast(Vector(center)+direction*.32, -direction, .64)
                assert outer is not None, (label,index)
                step=max(.0007, .0022-(point-outer).dot(direction))
                revised[index] += inverse_rotation @ (np.array(direction)*step)
                adjusted.add(int(index)); failures += 1
        print('MALE_ENVELOPE', iteration, failures, flush=True)
        if not failures: break
    assert not failures, 'Skin fitting failed to converge'
    set_pose({}); rig.data.pose_position = previous_position; bpy.context.view_layer.update()
    return len(adjusted)


def fit_evaluated_edges(ob, original, rig, mapping, report, apply):
    """Recheck the actual float32, skinned result after writing the shape keys."""
    previous_position=rig.data.pose_position
    poses={**POSES,'hair-mixed-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},
           'hair-mixed-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
    fixed=0
    for iteration in range(5):
        current=array(ob); changed=np.flatnonzero(np.linalg.norm(current-original,axis=1)>2e-7)
        rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
        bpy.context.scene.frame_set(1);set_pose({})
        matrix=rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()
        inverse=np.linalg.inv(np.asarray(matrix)[:3,:3])
        center=np.mean([array(bpy.data.objects['AvatarEye_'+side],True).mean(0) for side in ['l','r']],axis=0)
        center[1]+=.065;center[2]+=.023
        corrections={}
        for label,values in poses.items():
            set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']);evaluated=array(ob,True)
            for index in changed:
                point=Vector(evaluated[index]);gap,_=skin_gap(body.tree,point)
                if gap>=.0011:continue
                direction=(point-Vector(center)).normalized()
                outer,_,_,_=body.tree.ray_cast(Vector(center)+direction*.32,-direction,.64)
                assert outer is not None
                correction=inverse@(np.array(direction)*max(.001,.0022-(point-outer).dot(direction)))
                pair=int(index)//2*2
                assert pair%24>=4,'A fixed root pair needed adjustment'
                if pair not in corrections or np.linalg.norm(correction)>np.linalg.norm(corrections[pair]):corrections[pair]=correction
                print('MALE_EVALUATED_EDGE',iteration,label,int(index),float(gap*1000),flush=True)
        set_pose({});rig.data.pose_position=previous_position;bpy.context.view_layer.update()
        if not corrections:return fixed
        for pair,delta in corrections.items():current[pair:pair+2]+=delta
        apply(ob,current,mapping,report);fixed+=len(corrections)
    raise AssertionError('Evaluated hair edge fitting failed to converge')


def loosen(mapping, report, apply):
    rig = bpy.data.objects['AvatarSkeleton']
    body = Surface(rig, bpy.data.objects['AvatarBody'])
    eye_z = np.mean([array(bpy.data.objects['AvatarEye_' + side], True)[:, 2].mean()
                     for side in ['l', 'r']])
    ob = bpy.data.objects['Luxury retained swept groom']
    original = array(ob)
    revised = original.copy()
    components = islands(ob)
    ribbons = np.array([original[ids].reshape(12, 2, 3) for ids in components])
    paths = ribbons.mean(2)
    groups = group_paths(paths, 96)
    guides = {g: paths[groups == g].mean(0) for g in np.unique(groups)}
    t = np.linspace(0, 1, 12)
    free = smooth((t - 1 / 11) / .65)
    late = smooth((t - .27) / .73)
    counts = {'fallingFringeRibbons': 0, 'sweptCrestRibbons': 0, 'templeRibbons': 0}
    for i, (ids, ribbon) in enumerate(zip(components, ribbons)):
        g = int(groups[i]); phase = g * 2.399963
        guide = guides[g]; root = guide[0]; tip = guide[-1]
        c = paths[i].copy()
        front = float(smooth((-root[1] - .090) / .024))
        falling = front * float(smooth((1.785 - tip[2]) / .026)) * float(smooth((.022 - tip[0]) / .028))
        crest = front * (1 - falling) * float(smooth((-tip[0] + .015) / .045))
        temple = float(smooth((abs(root[0]) - .043) / .023)) * float(smooth((root[1] + .117) / .042))
        # Separate the ends of neighboring locks slightly. The paths remain
        # broad curves with twelve samples, rather than tiny angular zigzags.
        weight = max(falling, crest, temple)
        c += (paths[i] - guide) * (.22 * free * weight)[:, None]
        drop = (.023 + .008 * (.5 + .5 * math.sin(phase + .6)))
        c[:, 2] -= falling * drop * late
        c[:, 1] -= falling * .006 * free * np.sin(math.pi * t * .8)
        # Roll outward through the belly and turn inward at the free end.
        # Slight phase variation gives neighboring locks different endpoints.
        curl = .78 + .22 * math.sin(phase + .4)
        c[:, 0] += falling * (-.012 * np.sin(math.pi * late) * curl
                              + (.011 + .005 * math.sin(phase)) * late**3)
        c[:, 2] += falling * .006 * late**4 * curl
        # Retain lift at the roots but turn the crest over into a relaxed sweep.
        c[:, 2] += crest * (.005 * np.sin(math.pi * t) * free - .015 * late)
        c[:, 1] -= crest * .005 * late
        c[:, 0] -= crest * .004 * late
        # Restore layered temple coverage removed by the previous short crop.
        c[:, 2] -= temple * (.013 + .006 * (.5 + .5 * math.sin(phase))) * late
        c[:, 0] += np.sign(root[0]) * temple * .004 * free * np.sin(math.pi * t * .85)
        c[:, 1] += temple * .003 * np.sin(t * math.pi * 1.5 + phase) * free
        c[:, 0] += weight * .002 * math.sin(phase + .9) * np.sin(math.pi * t) * free
        # A small relaxation removes kinks between the authored guide samples.
        relaxed = .16 * c[:-2] + .68 * c[1:-1] + .16 * c[2:]
        c[2:-1] = relaxed[1:]
        c[:2] = paths[i, :2]
        # The falling tips stop above the eyes, including their thin edges.
        if falling > .1:
            c[:, 2] = np.maximum(c[:, 2], eye_z + .016)
        half = (ribbon[:, 1] - ribbon[:, 0]) * .5
        for j in range(2, 12):
            before_tangent = Vector(paths[i, min(j+1, 11)] - paths[i, j-1]).normalized()
            after_tangent = Vector(c[min(j+1, 11)] - c[j-1]).normalized()
            half[j] = np.array(before_tangent.rotation_difference(after_tangent) @ Vector(half[j]))
        rr = np.stack([c - half, c + half], axis=1)
        # Actual free edges are fitted across all sampled shapes below.
        rr[:2] = ribbon[:2]
        revised[ids] = rr.reshape(-1, 3)
        counts['fallingFringeRibbons'] += int(falling > .3)
        counts['sweptCrestRibbons'] += int(crest > .3)
        counts['templeRibbons'] += int(temple > .3)
    clearance_vertices = fit_motion_envelope(ob, original, revised, rig)
    old_meta = report.get(ob.name, {}).copy()
    added_uv = mapping.get(ob.name, {}).get('addedUv')
    apply(ob, revised, mapping, report)
    evaluated_pairs = fit_evaluated_edges(ob, original, rig, mapping, report, apply)
    if added_uv is not None: mapping[ob.name]['addedUv'] = added_uv
    report[ob.name] = {**old_meta, **report[ob.name], **counts, 'looseFringePass': True}
    return {'eyeHeightM': float(eye_z), **counts,
            'ribbons': len(components), 'fixedRootPairsPerRibbon': 2,
            'motionClearanceAdjustedVertices': clearance_vertices,
            'evaluatedClearanceAdjustedPairs': evaluated_pairs,
            'maxMovementMm': float(np.linalg.norm(revised-original, axis=1).max()*1000)}
