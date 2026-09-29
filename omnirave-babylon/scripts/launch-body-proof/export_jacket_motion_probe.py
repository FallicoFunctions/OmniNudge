"""Create a temporary connected-jacket midsurface for local deformation tests.

The original body/top/skeleton and all saved models stay untouched. The
simulation mesh is reduced in T-pose; sub-0.5 mm point separations are merged
to remove cut slivers. Retained opening points remain exact, with the original
opening's maximum sampling deviation recorded. Only ribbing points are pinned: the internal
underarm seam and the plain front opening can move. Targets follow measured
source triangles in a local affine frame; all quad collider diagonals are
covered. This is a zero-thickness test surface, not a new playable jacket.
"""
# Connection map: one connected torso-and-two-sleeve surface. Collar, cuff
# and waistband opening rings retain their measured source positions. The
# inner sleeve joins the torso through shared vertices, with no pinned seam.
import argparse
import hashlib
from itertools import combinations
import json
from pathlib import Path
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_body05_tops import geometry, body_snapshot
from validate_body_contacts import bones_snapshot
from surface_crossings import strict_pairs

P = Path(__file__).resolve().parents[2] / 'assets-src/avatars/launch-body-proof'


def export(output, end_frame=1):
    source = P / 'male-outfit04.blend'
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    coat = bpy.data.objects['Luxury_Bomber rebuilt shell']
    body, top, rig = [bpy.data.objects[n] for n in
                      ['AvatarBody', 'AvatarTop_tailored', 'AvatarSkeleton']]
    snapshots = [body_snapshot(body), body_snapshot(top), bones_snapshot(rig)]
    scene.frame_set(31)
    bpy.context.view_layer.update()
    points, _ = geometry(coat)
    half = len(points) // 2
    mid = np.asarray([(points[i] + points[i + half]) * .5 for i in range(half)])
    polygons = [f for f in coat.data.polygons if max(f.vertices) < half]
    triangles = [tuple(f.vertices) for f in polygons]
    edges, ribbing = {}, set()
    for index, face in enumerate(triangles):
        if polygons[index].material_index:
            ribbing.update(face)
        for a, b in zip(face, face[1:] + face[:1]):
            edges.setdefault(tuple(sorted((a, b))), []).append(index)
    boundary = {v for edge, faces in edges.items() if len(faces) == 1 for v in edge}
    pinned_original = boundary & ribbing
    mesh = bpy.data.meshes.new('Connected jacket simulation midsurface')
    mesh.from_pydata(mid.tolist(), [], triangles)
    mesh.update()
    temporary = bpy.data.objects.new('Connected jacket simulation midsurface', mesh)
    scene.collection.objects.link(temporary)
    bpy.ops.object.select_all(action='DESELECT')
    temporary.select_set(True)
    bpy.context.view_layer.objects.active = temporary
    group = temporary.vertex_groups.new(name='Free interior reduction')
    group.add(sorted(set(range(half)) - boundary), 1., 'REPLACE')
    modifier = temporary.modifiers.new('Simulation surface budget', 'DECIMATE')
    modifier.ratio = .18
    modifier.use_collapse_triangulate = True
    modifier.vertex_group = group.name
    modifier.vertex_group_factor = 1000
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm = bmesh.new()
    bm.from_mesh(temporary.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0005)
    bm.to_mesh(temporary.data)
    bm.free()
    reduced_points, reduced_faces = geometry(temporary)
    reduced = np.asarray(reduced_points)
    tree = KDTree(len(reduced))
    for i, point in enumerate(reduced_points):
        tree.insert(point, i)
    tree.balance()
    lookup = {i: tree.find(Vector(mid[i])) for i in boundary}
    opening_error = max(value[2] for value in lookup.values())
    assert opening_error <= .00050001, 'Opening sampling moved beyond merge tolerance'
    retained = {i: value for i, value in lookup.items() if value[2] < 1e-8}
    assert len({value[1] for value in retained.values()}) == len(retained)
    anchors = sorted(retained[i][1] for i in pinned_original if i in retained)
    bm = bmesh.new()
    bm.from_mesh(temporary.data)
    topology = {'vertices': len(bm.verts), 'triangles': len(bm.faces),
                'boundary_edges': sum(e.is_boundary for e in bm.edges),
                'invalid_edges': sum(not (e.is_boundary or e.is_manifold) for e in bm.edges),
                'inconsistent_winding': sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
                'degenerate_faces': sum(f.calc_area() < 1e-12 for f in bm.faces)}
    bm.free()
    assert not any(topology[k] for k in ['invalid_edges', 'inconsistent_winding', 'degenerate_faces'])
    assert not strict_pairs(reduced_points, reduced_faces)

    # Encode each simulation vertex in a source triangle's tangent/normal
    # frame. This reproduces the reduced T-pose exactly without projecting
    # its new vertices onto a potentially different triangulation.
    surface = BVHTree.FromPolygons([Vector(p) for p in mid], triangles, all_triangles=True)
    ids = np.array([triangles[surface.find_nearest(p)[2]] for p in reduced_points])
    def frames(positions):
        a, b, c = [positions[ids[:, index]] for index in range(3)]
        u, v = b - a, c - a
        normal = np.cross(u, v)
        normal /= np.linalg.norm(normal, axis=1)[:, None]
        return a, np.stack([u, v, normal], axis=2)
    origin, basis = frames(mid)
    coefficients = np.linalg.solve(basis, (reduced - origin)[..., None])[..., 0]
    exact = {index: old for old, (_, index, _) in retained.items()}
    colliders = {'body': body, 'top': top}
    envelopes = {}
    for name, obj in colliders.items():
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        m = evaluated.to_mesh()
        assert all(len(f.vertices) in [3, 4] for f in m.polygons)
        envelopes[name] = sorted({tuple(sorted(t)) for f in m.polygons
                                 for t in combinations(f.vertices, 3)})
        evaluated.to_mesh_clear()
    samples, data = np.arange(31., end_frame - .01, -.5), {'panel': [], 'body': [], 'top': []}
    changes, first = {'body': 0, 'top': 0}, {}
    for frame in samples:
        scene.frame_set(int(frame), subframe=float(frame - int(frame)))
        bpy.context.view_layer.update()
        posed, _ = geometry(coat)
        midsurface = np.asarray([(posed[i] + posed[i + half]) * .5 for i in range(half)])
        origin, basis = frames(midsurface)
        target = origin + np.einsum('nij,nj->ni', basis, coefficients)
        for index, old in exact.items():
            target[index] = midsurface[old]
        data['panel'].append(target)
        for name, obj in colliders.items():
            vertices, faces = geometry(obj)
            keys = {tuple(sorted(f)) for f in faces}
            assert keys.issubset(set(envelopes[name]))
            if name not in first:
                first[name] = keys
            changes[name] += keys != first[name]
            data[name].append(vertices)
    assert np.max(abs(data['panel'][0] - reduced)) < 1e-8
    assert snapshots == [body_snapshot(body), body_snapshot(top), bones_snapshot(rig)]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
    meta = {'scope': __doc__, 'source_sha256': source_hash, 'topology': topology,
            'original_midsurface_vertices': half, 'original_midsurface_faces': len(triangles),
            'original_opening_vertices': len(boundary),
            'retained_opening_vertices_preserved_exactly': len(retained),
            'opening_sampling_max_deviation_m': opening_error,
            'simulation_merge_distance_m': .0005,
            'pinned_ribbing_opening_vertices': len(anchors),
            'free_simulation_vertices': len(reduced) - len(anchors),
            'body_top_bind_skeleton_and_source_preserved': True,
            'status': 'CONNECTED_MIDSURFACE_INPUT_ONLY'}
    np.savez_compressed(output, **{name: np.asarray(values) for name, values in data.items()},
                        faces=np.asarray(reduced_faces), anchors=np.asarray(anchors),
                        body_faces=np.asarray(envelopes['body']), top_faces=np.asarray(envelopes['top']),
                        source_sha256=source_hash, frames=samples, region='whole_jacket',
                        build_metadata=json.dumps(meta),
                        collider_policy='all triangle/quad diagonals; source meshes unchanged',
                        body_diagonal_change_samples=changes['body'], top_diagonal_change_samples=changes['top'])
    print('CONNECTED_JACKET_INPUT', json.dumps(meta), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--end-frame', type=int, default=1, choices=range(1, 31))
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    export(args.output, args.end_frame)
