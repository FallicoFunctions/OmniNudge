"""Build coherent ring targets for offline shoulder and elbow corrective shapes.

Targets follow the structured ring coordinates, measuring torso and limb
sections separately so opposite limbs cannot become torso fitting surfaces.
This offline construction control must pass complete wall checks before any
targets are converted into a finite set of rigged corrective shape keys.
"""

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from validate_body05_tops import geometry


class RingTargets:
    def __init__(self, points, construction, body, top, rig):
        self.points = np.asarray(points).copy()
        self.records = construction["vertex_records"]
        self.holes = construction["armholes"]
        self.body, self.top, self.rig = body, top, rig
        self.initial_skin = {
            b.name: b.matrix @ b.bone.matrix_local.inverted() for b in rig.pose.bones
        }
        bp, bf = geometry(body)
        bp = np.asarray(bp)
        self.torso_faces = [
            f for f in bf if np.max(np.abs(bp[f, 0])) < 0.20 and np.min(bp[f, 2]) > 0.95
        ]

    def evaluate(self):
        bp, bf = geometry(self.body)
        tp, tf = geometry(self.top)
        body_tree = BVHTree.FromPolygons(bp, bf, all_triangles=True)
        top_tree = BVHTree.FromPolygons(tp, tf, all_triangles=True)
        torso_tree = BVHTree.FromPolygons(bp, self.torso_faces, all_triangles=True)
        transforms = {
            b.name: (b.matrix @ b.bone.matrix_local.inverted())
            @ self.initial_skin[b.name].inverted()
            for b in self.rig.pose.bones
        }
        result = self.points.copy()
        misses = []

        def with_ease(hit, direction, ease):
            for tree in [body_tree, top_tree]:
                again, _, _, gap = tree.ray_cast(
                    hit + direction * 0.0001, direction, 0.05
                )
                if again is not None:
                    ease = min(ease, 0.35 * (gap + 0.0001))
            return hit + direction * ease

        for i, (point, record) in enumerate(zip(self.points, self.records)):
            if record["region"] == "sleeve":
                continue
            center = Vector((0, -0.02, float(point[2])))
            direction = Vector(point) - center
            direction.normalize()
            transform = transforms["spine_02" if point[2] < 1.2 else "spine_03"]
            center = transform @ center
            direction = (transform.to_3x3() @ direction).normalized()
            candidates = []
            for tree in [torso_tree, top_tree]:
                hit, _, _, distance = tree.ray_cast(
                    center + direction * 0.4, -direction, 0.4
                )
                if hit is not None:
                    candidates.append((0.4 - distance, hit))
            if candidates:
                hit = max(candidates, key=lambda x: x[0])[1]
                result[i] = with_ease(hit, direction, 0.015)
            else:
                misses.append(i)
        for i, (point, record) in enumerate(zip(self.points, self.records)):
            if record["region"] != "sleeve" or record["ring"] < 2:
                continue
            side = record["side"]
            x = float(point[0])
            center = Vector((x, -0.02222, 1.42929))
            fraction = float(np.clip((abs(x) - 0.43) / (0.48 - 0.43), 0, 1))
            fraction = fraction * fraction * (3 - 2 * fraction)
            upper = transforms["upperarm_" + side]
            lower = transforms["lowerarm_" + side]
            posed_center = (upper @ center) * (1 - fraction) + (
                lower @ center
            ) * fraction
            rotation = upper.to_quaternion().slerp(lower.to_quaternion(), fraction)
            direction = (rotation @ (Vector(point) - center)).normalized()
            hit, _, _, distance = body_tree.ray_cast(posed_center, direction, 0.15)
            if hit is None:
                misses.append(i)
                result[i] = posed_center + direction * (Vector(point) - center).length
            else:
                result[i] = with_ease(hit, direction, 0.006)
        for side in ["l", "r"]:
            full = {
                r["radial"]: i
                for i, r in enumerate(self.records)
                if r["region"] == "sleeve" and r["side"] == side and r["ring"] == 2
            }
            start_center = np.mean(result[self.holes[side]], axis=0)
            end_center = np.mean(result[list(full.values())], axis=0)
            for i, r in enumerate(self.records):
                if r["region"] == "sleeve" and r["side"] == side and r["ring"] < 2:
                    blend = [0.33, 0.67][r["ring"]]
                    start = result[self.holes[side][r["radial"]]]
                    end = result[full[r["radial"]]]
                    point = start * (1 - blend) + end * blend
                    center = Vector(start_center * (1 - blend) + end_center * blend)
                    direction = Vector(point) - center
                    length = direction.length
                    direction.normalize()
                    hit, _, _, distance = body_tree.ray_cast(center, direction, 0.2)
                    if hit is not None and distance + 0.006 > length:
                        point = with_ease(hit, direction, 0.006)
                    result[i] = point
        self.last_cap_statistics = {
            "missed_rays": len(misses),
            "missed_vertices": misses,
        }
        return result
