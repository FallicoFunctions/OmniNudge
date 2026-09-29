"""Export temporary meter-space panel/collider arrays for a local IPC probe.

Run with Blender, passing --output /tmp/NAME.npz. No model is saved. All
body/top triangles are retained; the solver may not silently omit colliders.
The motion is 61 evaluated source poses from frame 31 to 1. Linear paths
between these samples are a diagnostic approximation, not exact rig motion.
"""
# Connection map: panel boundary is shared with the original jacket edges.
# This exporter captures the midsurface attachment locations without changing
# body, top, jacket boundary, skeleton, animation or source files.
import argparse
import hashlib
from itertools import combinations
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rebuild_bomber_underarm import P, rebuild
from validate_body05_tops import geometry


def export(output):
    source = P / 'male-outfit04.blend'
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    state = rebuild(.14)
    scene = state['scene']
    maps = state['maps']
    # A posed nonplanar quad can choose a different diagonal in Blender.
    # Cover BOTH alternatives with a conservative union of its four triangles.
    # Obstacle-obstacle collision is disabled by the probe, so the internal
    # overlap of these alternatives is intentional. The source is untouched.
    envelopes = {}
    for name in ['body', 'top']:
        evaluated = state[name].evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        assert all(len(face.vertices) in [3, 4] for face in mesh.polygons)
        envelopes[name] = sorted({tuple(sorted(triangle)) for face in mesh.polygons
                                 for triangle in combinations(face.vertices, 3)})
        evaluated.to_mesh_clear()
    first_triangles = {}
    changes = {'body': 0, 'top': 0}
    poses, bodies, tops = [], [], []
    for sample in range(61):
        frame = 31 - sample * .5
        scene.frame_set(int(frame), subframe=frame - int(frame))
        bpy.context.view_layer.update()
        coat, _ = geometry(state['coat'])
        body, body_faces = geometry(state['body'])
        top, top_faces = geometry(state['top'])
        for name, faces in [('body', body_faces), ('top', top_faces)]:
            keys = {tuple(sorted(face)) for face in faces}
            assert keys.issubset(set(envelopes[name])), 'Collider envelope misses evaluated triangles'
            if name not in first_triangles:
                first_triangles[name] = keys
            changes[name] += keys != first_triangles[name]
        poses.append([(coat[maps[0][i]] + coat[maps[1][i]]) * .5
                      for i in range(len(state['panel_points_tpose']))])
        bodies.append(body)
        tops.append(top)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
    np.savez_compressed(
        output, panel=np.asarray(poses), body=np.asarray(bodies),
        top=np.asarray(tops), body_faces=np.asarray(envelopes['body']),
        top_faces=np.asarray(envelopes['top']), faces=np.asarray(state['panel_faces']),
        anchors=np.asarray(sorted(state['anchors'])),
        source_sha256=source_hash, frames=np.linspace(31, 1, 61),
        collider_policy='all triangle/quad diagonals; source meshes unchanged',
        body_diagonal_change_samples=changes['body'],
        top_diagonal_change_samples=changes['top'],
    )
    print('PANEL_MOTION_EXPORTED', output, 'source preserved', source_hash,
          'diagonal change samples', changes, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    export(args.output)
