"""Independent Blender triangle check and optional diagnostic of an IPC panel.

Checks every stored solved panel against itself and all body/top triangles,
using the interpolated collider arrays actually supplied to the solver.
Separately checks the body's evaluated rig at those times: linear vertex
motion and skeletal interpolation must not be conflated. Strict tests omit
adjacent and coplanar self-contact. This does not validate fabric thickness,
the remaining jacket, a GLB, arbitrary motion, or appearance acceptance.
"""
# Connection map for the optional diagnostic: green midsurface sits at the
# measured jacket panel boundary. The surrounding shell is shown as context.
# No model is saved or exported; body/top source data are not modified.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rebuild_bomber_underarm import P, rebuild
from surface_crossings import crossing, strict_pairs
from validate_body05_tops import between, geometry


def minimum_linear_triangle_area(start, end, faces):
    """Minimize squared triangle area exactly along each linear vertex path."""
    minimum = float('inf')
    for a, b, c in faces:
        u, v = start[b] - start[a], start[c] - start[a]
        du, dv = end[b] - end[a] - u, end[c] - end[a] - v
        cross = [np.cross(u, v), np.cross(du, v) + np.cross(u, dv), np.cross(du, dv)]
        coefficients = np.zeros(5)
        for i in range(3):
            for j in range(3):
                coefficients[i + j] += np.dot(cross[i], cross[j])
        roots = np.polynomial.polynomial.polyroots(np.arange(1, 5) * coefficients[1:])
        samples = [0., 1.] + [float(root.real) for root in roots
                             if abs(root.imag) < 1e-8 and 0 < root.real < 1]
        value = min(np.polynomial.polynomial.polyval(t, coefficients) for t in samples)
        minimum = min(minimum, .5 * np.sqrt(max(0., value)))
    return float(minimum)


def inspect(data, result, report, render_path=None):
    fixture = json.loads((P / 'top01-diagonal-control.json').read_text())
    detected = sum(crossing(*[[Vector(p) for p in tri] for tri in x['points']])
                   for x in fixture['examples'])
    assert detected == 8
    flat = np.array([[0., 0, 0], [1, 0, 0], [0, 1, 0]])
    inverted = flat.copy()
    inverted[2, 1] = -1
    assert abs(minimum_linear_triangle_area(flat, flat, [[0, 1, 2]]) - .5) < 1e-12
    assert minimum_linear_triangle_area(flat, inverted, [[0, 1, 2]]) < 1e-12
    state = rebuild(.14)
    scene = state['scene']
    faces = data['faces'].tolist()
    rows = []
    for panel, frame in zip(result['panels'], report['result_source_frames'], strict=True):
        index = (31 - frame) * 2
        low = int(np.floor(index + 1e-9))
        high = min(low + 1, 60)
        fraction = max(0., index - low)
        points = [Vector(p) for p in panel]
        row = {'source_frame': frame, 'self_pairs': len(strict_pairs(points, faces))}
        scene.frame_set(int(frame), subframe=frame - int(frame))
        bpy.context.view_layer.update()
        for name in ['body', 'top']:
            obstacle = (1 - fraction) * data[name][low] + fraction * data[name][high]
            triangles = data[name + '_faces'].tolist()
            row[name + '_linear_pairs'] = len(between(
                points, faces, [Vector(p) for p in obstacle], triangles))
            actual, actual_triangles = geometry(state[name])
            envelope_keys = {tuple(sorted(t)) for t in triangles}
            assert all(tuple(sorted(t)) in envelope_keys for t in actual_triangles), (
                'Collider envelope misses an evaluated rig triangle', name, frame)
            row[name + '_rig_pairs'] = len(between(points, faces, actual, actual_triangles))
            row[name + '_rig_vs_linear_max_m'] = float(np.max(np.linalg.norm(
                np.asarray(actual) - obstacle, axis=1)))
        rows.append(row)
    diagnostic = {'scope': __doc__, 'recorded_crossing_controls_detected': detected,
                  'samples': rows,
                  'linear_sample_contact_failures': [r['source_frame'] for r in rows if any(
                      r[k] for k in ['self_pairs', 'body_linear_pairs', 'top_linear_pairs'])],
                  'rig_sample_contact_failures': [r['source_frame'] for r in rows if any(
                      r[k] for k in ['self_pairs', 'body_rig_pairs', 'top_rig_pairs'])],
                  'source_sha256': hashlib.sha256((P / 'male-outfit04.blend').read_bytes()).hexdigest(),
                  'status': 'ISOLATED_MIDSURFACE_DIAGNOSTIC_NOT_PROMOTED'}
    minimum_area = min(minimum_linear_triangle_area(a, b, faces)
                       for a, b in zip(result['panels'][:-1], result['panels'][1:]))
    diagnostic['linear_triangle_area'] = {
        'stationary_and_inversion_controls_passed': True,
        'minimum_m2': minimum_area,
        'above_1e_12_m2': minimum_area > 1e-12,
        'scope': 'Analytic quartic squared-area minimum on stored linear panel transitions only',
    }
    edges = np.array(sorted({tuple(sorted((face[i], face[(i + 1) % 3])))
                             for face in faces for i in range(3)}))
    edges = edges[np.isin(edges, data['anchors']).all(axis=1)]
    lengths = np.linalg.norm(data['panel'][:, edges[:, 0]]
                             - data['panel'][:, edges[:, 1]], axis=2)
    ratios = lengths / lengths[0]
    sample, edge = np.unravel_index(ratios.argmax(), ratios.shape)
    diagnostic['prescribed_boundary_strain'] = {
        'scope': 'Measured attachment motion, independent of free-panel fitting; T-pose baseline',
        'edge_count': len(edges), 'max_length_ratio': float(ratios[sample, edge]),
        'source_frame': float(data['frames'][sample]),
        'edge_vertices': edges[edge].tolist(),
        'tpose_length_m': float(lengths[0, edge]),
        'posed_length_m': float(lengths[sample, edge]),
        'relaxed_95th_percentile_absolute_strain': float(np.percentile(abs(ratios[-1] - 1), 95)),
    }
    if render_path:
        from build_bodies import review
        coat = state['coat']
        # Remove only the temporary panel faces from the in-memory display.
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(coat.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=list(bm.faces)[state['panel_start_face']:], context='FACES_ONLY')
        bm.to_mesh(coat.data)
        bm.free()
        mesh = bpy.data.meshes.new('IPC panel diagnostic midsurface')
        mesh.from_pydata(result['panels'][-1].tolist(), [], faces)
        mesh.update()
        obj = bpy.data.objects.new('IPC panel diagnostic', mesh)
        scene.collection.objects.link(obj)
        green = bpy.data.materials.new('Collision tested panel diagnostic green')
        green.use_nodes = True
        shader = green.node_tree.nodes['Principled BSDF']
        shader.inputs['Base Color'].default_value = (.025, .30, .09, 1)
        shader.inputs['Roughness'].default_value = .7
        mesh.materials.append(green)
        for face in mesh.polygons:
            face.use_smooth = True
        camera = review.configure_scene()
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = .72
        camera.location = (3, -4, 1.38)
        review.look_at(camera, Vector((.12, 0, 1.37)))
        scene.render.resolution_x = scene.render.resolution_y = 900
        scene.render.filepath = str(render_path)
        bpy.ops.render.render(write_still=True)
    return diagnostic


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--solver-report', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--render', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    output = inspect(np.load(args.input), np.load(args.result),
                     json.loads(args.solver_report.read_text()), args.render)
    args.report.write_text(json.dumps(output, indent=2) + '\n')
    print('IPC_PANEL_INDEPENDENT_REPORT', args.report, flush=True)
