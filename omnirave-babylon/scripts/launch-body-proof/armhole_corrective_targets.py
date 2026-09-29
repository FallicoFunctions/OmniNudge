"""Construct surface-following targets for offline jacket corrective sculpting.

Each rest vertex stores coordinates in one body or outer-shirt triangle frame.
The posed frame retains normal offset instead of collapsing it through linear
bone blending. This is an offline target feasibility control, not a runtime
deformation owner or accepted corrective-key set.
"""

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from validate_body05_tops import geometry


class SurfaceTargets:
    def __init__(self, points, body, top, cap_offsets=False):
        self.cap_offsets = cap_offsets
        self.objects = [body, top]
        self.faces = []
        self.bindings = []
        sources = []
        for index, obj in enumerate(self.objects):
            p, f = geometry(obj)
            if index == 1:
                f = [t for t in f if max(t) < len(p) // 2]
            self.faces.append(np.asarray(f))
            sources.append(
                (np.asarray(p), BVHTree.FromPolygons(p, f, all_triangles=True))
            )
        for point in points:
            hits = [tree.find_nearest(Vector(point)) for _, tree in sources]
            index = min(range(2), key=lambda j: hits[j][3])
            hit, _normal, face, _distance = hits[index]
            a, b, c = sources[index][0][self.faces[index][face]]
            n = np.cross(b - a, c - a)
            n /= np.linalg.norm(n)
            transform = np.column_stack([b - a, c - a, n])
            local = np.linalg.solve(transform, point - a)
            anchor = np.linalg.solve(transform, np.asarray(hit) - a)
            self.bindings.append((index, face, local, anchor))
        self.rest_points = np.asarray(points).copy()
        if not cap_offsets:
            assert np.max(abs(self.evaluate() - points)) < 1e-10

    def evaluate(self):
        geometry_sets = [geometry(obj) for obj in self.objects]
        sources = [np.asarray(p) for p, _ in geometry_sets]
        trees = (
            [BVHTree.FromPolygons(p, f, all_triangles=True) for p, f in geometry_sets]
            if self.cap_offsets
            else []
        )
        result = []
        reductions = []
        for index, face, local, anchor in self.bindings:
            a, b, c = sources[index][self.faces[index][face]]
            n = np.cross(b - a, c - a)
            n /= np.linalg.norm(n)
            point = a + (b - a) * local[0] + (c - a) * local[1] + n * local[2]
            if self.cap_offsets:
                start = a + (b - a) * anchor[0] + (c - a) * anchor[1]
                offset = point - start
                length = np.linalg.norm(offset)
                if length > 1e-6:
                    direction = offset / length
                    cap = length
                    for tree in trees:
                        hit, _, _, distance = tree.ray_cast(
                            Vector(start + direction * 0.0001), Vector(direction), 0.2
                        )
                        if hit is not None:
                            cap = min(cap, 0.4 * (distance + 0.0001))
                    point = start + direction * cap
                    reductions.append(length - cap)
            result.append(point)
        self.last_cap_statistics = {
            "reduced_vertices": int(sum(v > 1e-7 for v in reductions)),
            "maximum_offset_reduction_m": float(max(reductions, default=0)),
        }
        return np.asarray(result)
