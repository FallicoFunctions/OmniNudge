"""Inspect connected-jacket solves and transfer them to the original walls.

Coarse surface, reconstructed original walls, and actual rig colliders are
checked separately. Transfer uses one common coarse triangle frame for both
original wall vertices, preserving their original T-pose exactly. Passing the
simulation surface does not imply the transferred garment is clear. No model
is saved/exported; a render is only a diagnostic. Snapshot reports are never
treated as completed motion evidence.
"""
# Connection map: the torso, sleeves and ribbing retain the source jacket's
# shared wall/rim connectivity. A coarse surface drives the original paired
# walls through common triangle frames. Body/top/rig/source files stay fixed.
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_body05_tops import geometry, between
from surface_crossings import strict_pairs, crossing
from inspect_panel_ipc import minimum_linear_triangle_area

P = Path(__file__).resolve().parents[2] / 'assets-src/avatars/launch-body-proof'


class WallTransfer:
    def __init__(self, coarse, faces, original_points):
        self.half = len(original_points) // 2
        original = np.asarray(original_points, dtype=np.float64)
        mid = (original[:self.half] + original[self.half:]) * .5
        tree = BVHTree.FromPolygons([Vector(p) for p in coarse], faces.tolist(), all_triangles=True)
        self.ids = np.asarray([faces[tree.find_nearest(Vector(p))[2]] for p in mid])
        origin, basis = self.frames(coarse)
        self.coefficients = [np.linalg.solve(basis, (wall - origin)[..., None])[..., 0]
                             for wall in [original[:self.half], original[self.half:]]]
        error = np.max(abs(self.apply(coarse) - original))
        assert error < 1e-8, error
        self.tpose_error = float(error)

    def frames(self, points):
        points = np.asarray(points, dtype=np.float64)
        a, b, c = [points[self.ids[:, i]] for i in range(3)]
        u, v = b - a, c - a
        normals = np.cross(u, v)
        lengths = np.linalg.norm(normals, axis=1)
        assert lengths.min() > 1e-12, 'Collapsed simulation triangle in wall transfer'
        normals /= lengths[:, None]
        return a, np.stack([u, v, normals], axis=2)

    def apply(self, points):
        origin, basis = self.frames(points)
        return np.vstack([origin + np.einsum('nij,nj->ni', basis, c) for c in self.coefficients])


def normal_walls(transferred, full_faces, thickness=.001):
    """Rebuild paired walls from one common deformed midsurface and normals."""
    half = len(transferred) // 2
    middle = (transferred[:half] + transferred[half:]) * .5
    faces = np.asarray([f for f in full_faces if max(f) < half])
    normals = np.zeros_like(middle)
    triangle_normals = np.cross(middle[faces[:, 1]] - middle[faces[:, 0]],
                                middle[faces[:, 2]] - middle[faces[:, 0]])
    for corner in range(3):
        np.add.at(normals, faces[:, corner], triangle_normals)
    lengths = np.linalg.norm(normals, axis=1)
    assert lengths.min() > 1e-12
    normals /= lengths[:, None]
    return np.vstack([middle + normals * (thickness / 2),
                       middle - normals * (thickness / 2)]), middle, faces.tolist()


class CleanWallTransfer:
    """Weld source cut slivers in T-pose, then rebuild matched walls/rims."""
    def __init__(self, coarse, coarse_faces, original_points, full_faces):
        half = len(original_points) // 2
        original = np.asarray(original_points, dtype=np.float64)
        middle = (original[:half] + original[half:]) * .5
        faces = [f for f in full_faces if max(f) < half]
        mesh = bpy.data.meshes.new('Clean wall transfer reference')
        mesh.from_pydata(middle.tolist(), [], faces)
        mesh.update()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0005)
        bm.to_mesh(mesh)
        bm.free()
        clean = np.asarray([v.co for v in mesh.vertices], dtype=np.float64)
        outer = [tuple(f.vertices) for f in mesh.polygons]
        counts, directed = {}, {}
        for face in outer:
            for a, b in zip(face, face[1:] + face[:1]):
                key = tuple(sorted((a, b)))
                counts[key] = counts.get(key, 0) + 1
                directed[key] = (a, b)
        self.half = len(clean)
        self.faces = outer + [tuple(i + self.half for i in reversed(f)) for f in outer]
        for edge, count in counts.items():
            if count == 1:
                a, b = directed[edge]
                self.faces.extend([(b, a, a + self.half), (b, a + self.half, b + self.half)])
        self.transfer = WallTransfer(coarse, coarse_faces,
                                     [Vector(p) for p in np.vstack([clean, clean])])
        reference, _, _ = normal_walls(np.vstack([clean, clean]), self.faces)
        topology_mesh = bpy.data.meshes.new('Clean paired-wall topology check')
        topology_mesh.from_pydata(reference.tolist(), [], self.faces)
        bm = bmesh.new()
        bm.from_mesh(topology_mesh)
        self.topology = {'midsurface_vertices': self.half,
                         'closed_wall_triangles': len(self.faces),
                         'nonmanifold_edges': sum(not e.is_manifold for e in bm.edges),
                         'inconsistent_winding': sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
                         'degenerate_faces': sum(f.calc_area() < 1e-12 for f in bm.faces),
                         'source_merge_distance_m': .0005}
        bm.free()
        assert not any(self.topology[k] for k in ['nonmanifold_edges', 'inconsistent_winding', 'degenerate_faces'])

    def apply(self, coarse, thickness=.001):
        return normal_walls(self.transfer.apply(coarse), self.faces, thickness=thickness)[0]


def paired_faces(faces, count):
    """Join matching outer/inner surfaces at their shared opening edges."""
    output = [tuple(f) for f in faces]
    output += [tuple(int(i) + count for i in reversed(f)) for f in faces]
    edges = {}
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            key = tuple(sorted((int(a), int(b))))
            edges.setdefault(key, []).append((int(a), int(b)))
    for directions in edges.values():
        if len(directions) == 1:
            a, b = directions[0]
            output.extend([(b, a, a + count), (b, a + count, b + count)])
    return output


def surface_quality(rest, points, faces, anchors):
    """Measure strain and fold angles without treating them as acceptance."""
    faces = np.asarray(faces)
    edge_faces = {}
    for index, face in enumerate(faces):
        for a, b in zip(face, np.roll(face, -1)):
            edge_faces.setdefault(tuple(sorted((int(a), int(b)))), []).append(index)
    edges = np.asarray(list(edge_faces))
    lengths = np.linalg.norm(points[edges[:, 0]] - points[edges[:, 1]], axis=1)
    baseline = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
    ratios = lengths / baseline
    pinned = np.isin(edges, anchors).all(axis=1)
    normals = np.cross(points[faces[:, 1]] - points[faces[:, 0]],
                       points[faces[:, 2]] - points[faces[:, 0]])
    areas = np.linalg.norm(normals, axis=1)
    assert areas.min() > 1e-12
    normals /= areas[:, None]
    adjacent = np.asarray([x for x in edge_faces.values() if len(x) == 2])
    angles = np.degrees(np.arccos(np.clip(np.sum(normals[adjacent[:, 0]] *
                                                normals[adjacent[:, 1]], axis=1), -1, 1)))
    largest = int(np.argmax(ratios))
    return {'edge_ratio_percentiles_0_50_95_100': np.percentile(ratios, [0, 50, 95, 100]).tolist(),
            'absolute_edge_strain_p95': float(np.percentile(abs(ratios - 1), 95)),
            'largest_ratio_edge_rest_and_posed_m': [float(baseline[largest]), float(lengths[largest])],
            'pinned_absolute_edge_strain_p95': float(np.percentile(abs(ratios[pinned] - 1), 95)),
            'adjacent_normal_angle_degrees_p50_p95_max': np.percentile(angles, [50, 95, 100]).tolist(),
            'fold_edges_over_150_degrees': int(np.sum(angles > 150)),
            'minimum_triangle_area_m2': float(areas.min() / 2)}


def inspect(data, result, solver, render=None, all_samples=False, simulation_only=False,
            render_wall_construction='original'):
    source = P / 'male-outfit04.blend'
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    assert str(data['source_sha256']) == source_hash
    fixture = json.loads((P / 'top01-diagonal-control.json').read_text())
    positive = sum(crossing(*[[Vector(p) for p in tri] for tri in x['points']])
                   for x in fixture['examples'])
    assert positive == 8
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    coat = bpy.data.objects['Luxury_Bomber rebuilt shell']
    body, top = [bpy.data.objects[n] for n in ['AvatarBody', 'AvatarTop_tailored']]
    scene.frame_set(31)
    bpy.context.view_layer.update()
    original, full_faces = geometry(coat)
    coarse_faces = data['faces'].tolist()
    coarse_wall_faces = paired_faces(coarse_faces, len(data['panel'][0]))
    transfer = WallTransfer(data['panel'][0], data['faces'], original)
    clean_transfer = CleanWallTransfer(data['panel'][0], data['faces'], original, full_faces)
    frames = solver['result_source_frames']
    assert len(frames) == len(result['panels'])
    # A snapshot checks one pose. A completed solve can check every stored pose
    # or an explicit six-pose screen before the more expensive full pass.
    indices = (list(range(len(frames))) if all_samples else
               sorted({int(i) for i in np.linspace(0, len(frames) - 1, min(6, len(frames)))}))
    rows = []
    for index in indices:
        frame = frames[index]
        coarse = result['panels'][index]
        dense = transfer.apply(coarse)
        rebuilt, middle, middle_faces = normal_walls(dense, full_faces)
        cleaned_walls = clean_transfer.apply(coarse)
        thin_walls = clean_transfer.apply(coarse, thickness=.0002)
        scene.frame_set(int(frame), subframe=frame - int(frame))
        bpy.context.view_layer.update()
        row = {'source_frame': frame,
               'simulation_quality': surface_quality(data['panel'][0], coarse, coarse_faces, data['anchors'])}
        variants = [('simulation', coarse, coarse_faces)]
        if not simulation_only:
            variants += [
                                   ('transferred_walls', dense, full_faces),
                                   ('transferred_midsurface', middle, middle_faces),
                                   ('normal_rebuilt_1mm_walls', rebuilt, full_faces),
                                   ('clean_rebuilt_1mm_walls', cleaned_walls, clean_transfer.faces),
                                   ('clean_rebuilt_0_2mm_walls', thin_walls, clean_transfer.faces)]
            for thickness in [.001, .0002]:
                direct = normal_walls(np.vstack([coarse, coarse]), coarse_wall_faces, thickness)[0]
                variants.append((f'direct_coarse_{thickness * 1000:g}mm_walls', direct, coarse_wall_faces))
        for name, points, faces in variants:
            vectors = [Vector(p) for p in points]
            pairs = strict_pairs(vectors, faces)
            row[name] = {'self_pairs': len(pairs)}
            if name == 'direct_coarse_1mm_walls':
                # Positive triangle area alone does not detect an offset face
                # reversing relative to its driving midsurface triangle.
                ids = np.asarray(coarse_faces)
                middle_normals = np.cross(coarse[ids[:, 1]] - coarse[ids[:, 0]],
                                          coarse[ids[:, 2]] - coarse[ids[:, 0]])
                orientation = []
                for wall_name, offset in [('outer', 0), ('inner', len(coarse))]:
                    wall_triangles = points[ids + offset]
                    wall_normals = np.cross(wall_triangles[:, 1] - wall_triangles[:, 0],
                                           wall_triangles[:, 2] - wall_triangles[:, 0])
                    ratios = np.sum(wall_normals * middle_normals, axis=1) / np.sum(middle_normals**2, axis=1)
                    orientation.append({'wall': wall_name,
                                        'minimum_projected_area_ratio': float(ratios.min()),
                                        'reversed_offset_faces': np.flatnonzero(ratios <= 0).tolist()})
                row['direct_wall_offset_orientation'] = orientation
                row['direct_wall_contact_examples'] = [
                    {'wall_face_ids': [int(a), int(b)],
                     'wall_vertex_ids': np.asarray([faces[a], faces[b]]).tolist(),
                     'coarse_vertex_ids': (np.asarray([faces[a], faces[b]]) % len(coarse)).tolist(),
                     'wall_points_m': points[np.asarray([faces[a], faces[b]])].tolist()}
                    for a, b in pairs[:4]]
            if name == 'transferred_walls' and pairs:
                def wall(face):
                    return ('outer' if max(face) < transfer.half else
                            'inner' if min(face) >= transfer.half else 'rim')
                counts = {}
                for a, b in pairs:
                    key = '/'.join(sorted([wall(faces[a]), wall(faces[b])]))
                    counts[key] = counts.get(key, 0) + 1
                contact_points = points[sorted({v for a, b in pairs for i in [a, b] for v in faces[i]})]
                row['wall_contact_classification'] = counts
                row['wall_contact_bounds_m'] = [contact_points.min(axis=0).tolist(), contact_points.max(axis=0).tolist()]
                row['wall_contact_examples'] = []
                for a, b in pairs[:4]:
                    ids = np.asarray([faces[a], faces[b]])
                    midsurface_ids = ids % transfer.half
                    coefficients = np.asarray([
                        transfer.coefficients[int(v >= transfer.half)][v % transfer.half]
                        for v in ids.ravel()]).reshape(2, 3, 3)
                    row['wall_contact_examples'].append({
                        'face_ids': [int(a), int(b)], 'vertex_ids': ids.tolist(),
                        'tpose_points_m': np.asarray(original)[ids].tolist(),
                        'posed_points_m': points[ids].tolist(),
                        'driving_coarse_triangles': transfer.ids[midsurface_ids].tolist(),
                        'triangle_frame_coefficients': coefficients.tolist(),
                        'barycentric_weights': np.stack([
                            1 - coefficients[..., 0] - coefficients[..., 1],
                            coefficients[..., 0], coefficients[..., 1]], axis=-1).tolist()})
            for label, obj in [('body', body), ('top', top)]:
                row[name][label + '_pairs'] = len(between(vectors, faces, *geometry(obj)))
        span = dense[transfer.half:] - dense[:transfer.half]
        thickness = np.linalg.norm(span, axis=1)
        row['transferred_wall_separation_m'] = [float(thickness.min()), float(thickness.max())]
        rows.append(row)
        print('JACKET_INDEPENDENT_POSE', json.dumps(row), flush=True)
    minimum_area = None
    if all_samples and len(result['panels']) > 1:
        minimum_area = min(minimum_linear_triangle_area(a, b, coarse_faces)
                           for a, b in zip(result['panels'][:-1], result['panels'][1:]))
    output = {'scope': __doc__, 'source_sha256': source_hash,
              'recorded_crossing_controls_detected': positive,
              'tpose_wall_transfer_max_error_m': transfer.tpose_error,
              'clean_rebuilt_wall_topology': clean_transfer.topology,
              'source_frames_checked': [row['source_frame'] for row in rows],
              'every_stored_pose_checked': all_samples,
              'minimum_simulation_linear_triangle_area_m2': minimum_area,
              'poses': rows,
              'simulation_pose_failures': [r['source_frame'] for r in rows if any(r['simulation'].values())],
              'variant_pose_failures': {name: [r['source_frame'] for r in rows if any(r[name].values())]
                                        for name, _, _ in variants},
              'simulation_only': simulation_only,
              'status': 'DIAGNOSTIC_ONLY_NOT_PROMOTED'}
    if render:
        from build_bodies import review
        # Freeze the last inspected transfer for this in-memory diagnostic.
        for modifier in list(coat.modifiers):
            coat.modifiers.remove(modifier)
        inverse_world = coat.matrix_world.inverted()
        if render_wall_construction == 'reduced':
            # This is the selected temporary wall construction, in diagnostic
            # clay. Do not render the rejected detailed transfer in its place.
            direct = normal_walls(np.vstack([coarse, coarse]), coarse_wall_faces, .001)[0]
            mesh = bpy.data.meshes.new('Diagnostic reduced 1mm jacket walls')
            mesh.from_pydata([inverse_world @ Vector(p) for p in direct], [], coarse_wall_faces)
            mesh.update()
            coat.data = mesh
            material = bpy.data.materials.new('Diagnostic cloth clay - not final tailoring')
            material.diffuse_color = (.18, .42, .32, 1)
            material.use_nodes = True
            shader = material.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Base Color'].default_value = material.diffuse_color
            shader.inputs['Roughness'].default_value = .8
            mesh.materials.append(material)
        else:
            for vertex, point in zip(coat.data.vertices, dense, strict=True):
                vertex.co = inverse_world @ Vector(point)
        coat.data.update()
        camera = review.configure_scene()
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = 1.22
        camera.location = (2, -4, 1.40)
        review.look_at(camera, Vector((0, 0, 1.29)))
        scene.render.resolution_x = 1100
        scene.render.resolution_y = 950
        scene.render.filepath = str(render)
        bpy.ops.render.render(write_still=True)
        output['diagnostic_render_wall_construction'] = render_wall_construction
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--solver-report', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--render', type=Path)
    parser.add_argument('--all-samples', action='store_true')
    parser.add_argument('--simulation-only', action='store_true')
    parser.add_argument('--render-wall-construction', choices=['original', 'reduced'], default='original')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    report = inspect(np.load(args.input), np.load(args.result),
                     json.loads(args.solver_report.read_text()), args.render, args.all_samples,
                     args.simulation_only, args.render_wall_construction)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
