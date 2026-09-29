"""Give the remaining shirt crossings local coat clearance.

Connection map: translate corresponding inner/outer coat vertices together,
keeping the existing connected shell, 1.5 mm separation and skin weights.
The body and attached detail meshes are untouched. Changes are bounded to 20 mm.
"""
import itertools
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def repair(scene, body, rig, shirt, coat, triangles, reference_points=None, limit_m=.020, body_allowance=.00199):
    original = [v.co.copy() for v in coat.data.vertices]
    reference_points = original if reference_points is None else reference_points
    half = len(original) // 2
    faces = triangles(coat.data)
    shirt_faces = triangles(shirt.data)
    rings = [[] for _ in range(half)]
    for fi, face in enumerate(faces):
        for i in {i % half for i in face}: rings[i].append(fi)
    cache = []
    for frame in range(1, 152):
        scene.frame_set(frame); bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        bones = {b.name: b.matrix @ b.bone.matrix_local.inverted() for b in rig.pose.bones}
        matrices = []
        for v in coat.data.vertices[:half]:
            m = Matrix(((0, 0, 0, 0),) * 4)
            for g in v.groups: m += bones[coat.vertex_groups[g.group].name] * g.weight
            matrices.append(m)
        ev = coat.evaluated_get(dg); mesh = ev.to_mesh()
        points = [v.co.copy() for v in mesh.vertices]; ev.to_mesh_clear()
        assert max((matrices[i % half] @ original[i] - points[i]).length for i in range(len(points))) < 1e-5
        ev = shirt.evaluated_get(dg); mesh = ev.to_mesh()
        shirt_points = [v.co.copy() for v in mesh.vertices]; ev.to_mesh_clear()
        cache.append(dict(frame=frame, matrices=matrices, points=points,
                          body=BVHTree.FromObject(body, dg),
                          shirt=BVHTree.FromPolygons(shirt_points, shirt_faces)))

    def crossings(c): return BVHTree.FromPolygons(c['points'], faces).overlap(c['shirt'])
    def stats():
        counts = [len(crossings(c)) for c in cache]
        return dict(frames_with_crossings=sum(n > 0 for n in counts), maximum_pairs=max(counts), total_pairs=sum(counts))
    before = stats(); history = []; changes = []
    print('UNDERARM_BEFORE', before, flush=True)
    for pass_index in range(8):
        problem = set()
        for c in cache:
            for fi, _ in crossings(c): problem.update(i % half for i in faces[fi])
        adjusted = 0
        print('UNDERARM_PASS', pass_index + 1, 'vertices', len(problem), flush=True)
        for seq, index in enumerate(sorted(problem)):
            pair = [index, index + half]
            related = [faces[i] for i in rings[index]]
            ids = sorted({i for f in related for i in f}); mapping = {i: j for j, i in enumerate(ids)}
            local_faces = [[mapping[i] for i in f] for f in related]
            current = coat.data.vertices[index].co - original[index]
            def score(delta):
                for c in cache:
                    for i in pair:
                        p = c['matrices'][index] @ (original[i] + delta)
                        hit, normal, _, _ = c['body'].find_nearest(p)
                        if (p - hit).dot(normal) < -body_allowance: return None
                count = 0
                for c in cache:
                    pts = [c['points'][i] for i in ids]
                    for i in pair: pts[mapping[i]] = c['matrices'][index] @ (original[i] + delta)
                    count += len(BVHTree.FromPolygons(pts, local_faces).overlap(c['shirt']))
                return count, delta.length_squared
            best = current.copy(); best_score = score(best)
            if best_score is None or best_score[0] == 0: continue
            initial = best_score
            for step in [.010, .003, .001, .00025]:
                center = best.copy()
                for xyz in itertools.product([-step, 0, step], repeat=3):
                    candidate = center + Vector(xyz)
                    if any((original[i]+candidate-reference_points[i]).length > limit_m for i in pair): continue
                    result = score(candidate)
                    if result is not None and result < best_score: best = candidate; best_score = result
            if best_score[0] < initial[0]:
                for i in pair: coat.data.vertices[i].co = original[i] + best
                for c in cache:
                    for i in pair: c['points'][i] = c['matrices'][index] @ coat.data.vertices[i].co
                changes.append(dict(pass_number=pass_index+1, paired_vertices=pair,
                                    before_local_pairs=initial[0], after_local_pairs=best_score[0], rest_offset_m=list(best)))
                adjusted += 1
            if seq % 20 == 0: print('UNDERARM_PROGRESS', seq + 1, len(problem), 'adjusted', adjusted, flush=True)
        coat.data.update(); result = stats()
        history.append(dict(pass_number=pass_index + 1, adjusted_pairs=adjusted, **result))
        print('UNDERARM_RESULT', history[-1], flush=True)
        if result['total_pairs'] == 0 or not adjusted: break
    return dict(scope='Local paired garment vertex clearance, both quad diagonals, all 151 integer frames. No body or detail mesh edits. Independent validation required.',
                moving_object=coat.name, fixed_object=shirt.name, displacement_bound_m=limit_m, body_distance_allowance_m=body_allowance,
                before=before, history=history, changes=changes,
                maximum_rest_change_m=max((v.co-original[i]).length for i,v in enumerate(coat.data.vertices)))
