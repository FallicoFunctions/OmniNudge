"""Check prescribed garment edges against body/top before a long fit.

The entire input motion is audited with the existing conservative finite-gap
bounds. This is a necessary attachment-feasibility check, not a garment or
actual-wall acceptance test. All pinned vertices must belong to audited edges.
"""

import argparse
import hashlib
import json
import time
from pathlib import Path

import ipctk
import numpy as np
from finite_clearance_bounds import clearance_bound

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
D = np.load(args.input)
A = D["anchors"]
n = len(A)
e = ipctk.edges(D["faces"])
e = e[np.isin(e, A).all(axis=1)]
lookup = {int(v): i for i, v in enumerate(A)}
pin_edges = np.array([[lookup[int(a)], lookup[int(b)]] for a, b in e])
faces = np.vstack([D["body_faces"] + n, D["top_faces"] + n + len(D["body"][0])])
edges = np.vstack([pin_edges, ipctk.edges(faces)])


def x(i):
    return np.vstack([D["panel"][i, A], D["body"][i], D["top"][i]]).astype(np.float64)


start = x(0)
mesh = ipctk.CollisionMesh(start, edges, faces)
assert mesh.num_vertices == len(start)
assert len(np.unique(pin_edges)) == n, (
    "Isolated prescribed vertices require a separate audit"
)
mesh.can_collide = ipctk.make_static_obstacle_filter(
    n
) & ipctk.make_vertex_patches_filter(
    np.r_[np.zeros(n, dtype=int), np.ones(len(start) - n, dtype=int)]
)
c = ipctk.NormalCollisions()
rows = []
trans = []
previous = None
t0 = time.monotonic()
for i, frame in enumerate(D["frames"]):
    p = x(i)
    c.build(mesh, p, 0.01)
    distance = float(np.sqrt(c.compute_minimum_distance(mesh, p)))
    assert np.isfinite(distance)
    rows.append(
        {
            "source_frame": float(frame),
            "minimum_prescribed_edge_or_vertex_body_top_gap_m": distance,
            "above_0_7mm": distance > 0.0007,
        }
    )
    if previous is not None:
        clear, stats = clearance_bound(
            mesh, previous, p, 0.0007, relative_motion=True, batch_planes=True
        )
        trans.append(
            {
                "source_frames": [float(D["frames"][i - 1]), float(frame)],
                "finite_bound_clear": clear,
                "statistics": stats,
            }
        )
    previous = p
    print(
        "ATTACHMENT",
        frame,
        distance,
        trans[-1]["finite_bound_clear"] if trans else None,
        flush=True,
    )
r = {
    "scope": "Prescribed midsurface ribbing vertices AND their connecting boundary edges against all body/top triangles, across the complete input lowering motion. Necessary constraint feasibility only; no free cloth, fabric walls, nonlinear between-sample rig or full garment acceptance.",
    "input_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
    "source_sha256": str(D["source_sha256"]),
    "pinned_vertices": n,
    "pinned_edges": len(pin_edges),
    "all_pinned_vertices_incident_to_audited_edges": True,
    "poses": rows,
    "transitions": trans,
    "minimum_measured_gap_m": min(
        v["minimum_prescribed_edge_or_vertex_body_top_gap_m"] for v in rows
    ),
    "all_sampled_gaps_above_0_7mm": all(v["above_0_7mm"] for v in rows),
    "all_piecewise_linear_paths_bounded_clear": all(
        v["finite_bound_clear"] for v in trans
    ),
    "elapsed_seconds": time.monotonic() - t0,
}
args.output.write_text(json.dumps(r, indent=2) + "\n")
