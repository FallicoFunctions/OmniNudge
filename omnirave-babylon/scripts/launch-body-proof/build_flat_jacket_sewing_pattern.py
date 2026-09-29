"""Create actual flat panels and loose sewing edges from authored outlines.

The independently authored uniform X/Z triangulation is retained, but each
front/back panel starts flat. Torso width receives explicit material allowance;
sleeve widths retain their flat outline dimensions instead of rounded 3D arcs.
This construction hypothesis requires drape and motion validation.
"""

# Connection map: two front pieces join one back piece along duplicate side,
# shoulder and sleeve boundary vertices through loose sewing edges. The front,
# neck/hem and cuff openings are retained. Sewing is not an automatic weld.
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import numpy as np


def run(source, output, torso_allowance, sleeve_height_scale=1.0, cuff_scale=1.0):
    assert 0 <= torso_allowance <= 0.1
    assert 1 <= sleeve_height_scale <= 1.6 and 0.7 <= cuff_scale <= 1
    data = np.load(source)
    points, faces, labels = data["points"], data["faces"], data["panel_labels"]
    lookup = {}
    weld = []
    split_faces = []
    groups = []
    for face, label in zip(faces, labels):
        group = min(int(label), 2)
        indices = []
        for original in face:
            key = (group, int(original))
            if key not in lookup:
                lookup[key] = len(weld)
                weld.append(int(original))
                groups.append(group)
            indices.append(lookup[key])
        split_faces.append(indices)
    weld = np.asarray(weld)
    groups = np.asarray(groups)
    target = points[weld].copy()
    flat = target.copy()
    flat[:, 1] = np.where(groups == 2, 0.16, -0.20)
    t = np.clip((abs(flat[:, 0]) - 0.025) / 0.20, 0, 1)
    flat[:, 0] += np.sign(flat[:, 0]) * torso_allowance * t * t * (3 - 2 * t)
    sleeve = np.clip((abs(target[:, 0]) - 0.22) / 0.11, 0, 1)
    sleeve = sleeve * sleeve * (3 - 2 * sleeve)
    flat[:, 2] += (flat[:, 2] - 1.42929) * (sleeve_height_scale - 1) * sleeve
    for side in [-1, 1]:
        original_cuff = data["anchors"][points[data["anchors"], 0] * side > 0.70]
        center = points[original_cuff].mean(axis=0)
        cuff = np.isin(weld, original_cuff)
        target[cuff] = center + (target[cuff] - center) * cuff_scale
    copies = defaultdict(list)
    for index, original in enumerate(weld):
        copies[int(original)].append(index)
    assert (
        set(copies) == set(range(len(points))) and max(map(len, copies.values())) == 2
    )
    sewing = np.asarray([ids for ids in copies.values() if len(ids) == 2])
    split_faces = np.asarray(split_faces)
    used_edges = {
        tuple(sorted((int(a), int(b))))
        for face in split_faces
        for a, b in zip(face, np.roll(face, -1))
    }
    assert all(tuple(sorted(edge)) not in used_edges for edge in sewing)
    assert np.array_equal(weld[split_faces], faces)
    anchors = np.flatnonzero(np.isin(weld, data["anchors"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output,
        points=flat,
        faces=split_faces,
        sewing_edges=sewing,
        weld_map=weld,
        weld_faces=faces,
        anchors=anchors,
        target=target,
        source_anchors=data["anchors"],
        cuff_scale=cuff_scale,
    )
    normals = np.cross(
        flat[split_faces[:, 1]] - flat[split_faces[:, 0]],
        flat[split_faces[:, 2]] - flat[split_faces[:, 0]],
    )
    assert np.linalg.norm(normals, axis=1).min() > 1e-10
    report = {
        "scope": __doc__,
        "source": str(source.resolve()),
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "torso_allowance_per_half_m": torso_allowance,
        "sleeve_height_scale": sleeve_height_scale,
        "cuff_scale": cuff_scale,
        "flat_panel_y_m": {"front": -0.20, "back": 0.16},
        "vertices": len(flat),
        "triangles": len(split_faces),
        "panel_count": 3,
        "loose_sewing_edges": len(sewing),
        "split_anchors": len(anchors),
        "welded_vertices": len(points),
        "source_topology_recovered_exactly_after_weld": True,
        "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "accepted": False,
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print("FLAT_SEWING_PATTERN", report, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--torso-allowance", type=float, default=0.065)
    parser.add_argument("--sleeve-height-scale", type=float, default=1.0)
    parser.add_argument("--cuff-scale", type=float, default=1.0)
    args = parser.parse_args()
    run(
        args.source,
        args.output,
        args.torso_allowance,
        args.sleeve_height_scale,
        args.cuff_scale,
    )
