"""Verify facet-contact proposals with positive and rejected sphere controls.

All triangle vertices start outside the sphere with more than 1 mm normal
separation, while their connecting triangle intersects it. Surface projection
at finitely many witnesses cannot replace the complete triangle contact gate.
"""

# Connection map: separate triangle and sphere deliberately intersect as a
# diagnostic fixture; no model assembly or production geometry is saved.
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from probe_pattern_contact_corrective import project_contacts
from validate_body05_tops import between, geometry


def run(output):
    cases = []
    for radius, span, height in [(0.03, 0.012, 0.029), (0.2, 0.06, 0.195)]:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=radius)
        body_points, body_faces = geometry(bpy.context.object)
        tree = BVHTree.FromPolygons(body_points, body_faces, all_triangles=True)
        points = np.asarray(
            [[-span, 0, height], [span, 0, height], [0, span, height]], dtype=float
        )
        faces = np.asarray([[0, 1, 2]])
        signed = []
        for point in points:
            hit, normal, _, _ = tree.find_nearest(Vector(point))
            signed.append((Vector(point) - hit).dot(normal))
        assert min(signed) > 0.001
        results = {}
        for label, facet_faces, balanced in [
            ("vertices", None, False),
            ("sequential_facets", faces, False),
            ("balanced_facets", faces, True),
        ]:
            candidate = points.copy()
            crossing_count = lambda p, f=faces, q=body_points, t=body_faces: len(
                between([Vector(v) for v in p], f, q, t)
            )
            history = [crossing_count(candidate)]
            assert history[0] > 0
            for _ in range(40):
                candidate = project_contacts(
                    candidate, np.asarray([1, 2]), [tree], 0.001, facet_faces, balanced
                )
                assert np.array_equal(candidate[0], points[0])
                history.append(crossing_count(candidate))
                if history[-1] == 0:
                    break
            results[label] = {
                "initial_crossings": history[0],
                "final_crossings": history[-1],
                "iterations": len(history) - 1,
                "maximum_displacement_m": float(
                    np.linalg.norm(candidate - points, axis=1).max()
                ),
                "fixed_vertex_exact": True,
                "history": history,
            }
        assert results["vertices"]["final_crossings"] > 0
        expected_clear = radius < 0.1
        assert (results["balanced_facets"]["final_crossings"] == 0) == expected_clear
        cases.append(
            {
                "sphere_radius_m": radius,
                "triangle_half_span_m": span,
                "triangle_height_m": height,
                "initial_vertex_signed_distance_m": signed,
                "balanced_proposal_expected_clear": expected_clear,
                "results": results,
            }
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps({"scope": __doc__, "cases": cases, "passed": True}, indent=2) + "\n"
    )
    print(
        "PROJECTION_CONTROLS",
        [
            {
                "radius": r["sphere_radius_m"],
                "expected_clear": r["balanced_proposal_expected_clear"],
                "balanced_crossings": r["results"]["balanced_facets"][
                    "final_crossings"
                ],
            }
            for r in cases
        ],
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.output)
