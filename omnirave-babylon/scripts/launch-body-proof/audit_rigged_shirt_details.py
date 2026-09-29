"""Read-only finite-motion audit for native shirt placket, collar and buttons."""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion

S = Path(__file__).resolve().parent
sys.path.insert(0, str(S))
import audit_rigged_jacket_embroidery as E
import audit_rigged_jacket_sleeves as A

SOURCE = (
    S.parents[1]
    / "assets-src/avatars/launch-body-proof/rigged-jacket-embroidery-study/male-rigged-jacket-embroidered.blend"
)
PREFIX = "Shirt detail - "
NAMES = (
    "center placket",
    "left collar",
    "right collar",
    "button 1",
    "button 2",
    "button 3",
    "button 4",
)
EPS = 1e-6
TOL = 2e-6


def dig(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def coords(o):
    return np.asarray(
        [[v.co.x, v.co.y, v.co.z] for v in o.data.vertices], dtype=np.float32
    )


def weights(o, names):
    if [g.name for g in o.vertex_groups] != names:
        raise AssertionError(f"{o.name} group names")
    a = np.zeros((len(o.data.vertices), len(names)), np.float32)
    for v in o.data.vertices:
        for g in v.groups:
            a[v.index, g.group] = g.weight
    return a


def signed_volume(o):
    p = coords(o).astype(float)
    return float(
        sum(
            np.dot(p[f.vertices[0]], np.cross(p[f.vertices[1]], p[f.vertices[2]])) / 6
            for f in o.data.polygons
        )
    )


def topo(o):
    t = A.topology(o.data)
    if (
        t["boundary_edges"]
        or t["nonmanifold_edges"]
        or t["degenerate_faces"]
        or t["faces"] != t["triangles"]
    ):
        raise AssertionError(f"{o.name} closed triangles")
    return t


def image_snapshot():
    rows = {}
    for image in bpy.data.images:
        packed = bytes(image.packed_file.data) if image.packed_file else None
        rows[image.name] = {
            "size": list(image.size),
            "packed_sha256": hashlib.sha256(packed).hexdigest()
            if packed is not None
            else None,
            "colorspace": image.colorspace_settings.name,
        }
    return rows


def details():
    want = {PREFIX + n for n in NAMES}
    got = {o.name for o in bpy.data.objects if o.get("shirtDetail")}
    pref = {o.name for o in bpy.data.objects if o.name.startswith(PREFIX)}
    if got != want or pref != want:
        raise AssertionError("exact 7 shirt details required")
    return [bpy.data.objects[PREFIX + n] for n in NAMES]


def geometry(o):
    return A.H.geometry(o)


def strict(a, b):
    p, f = geometry(a)
    q, u = geometry(b)
    return len(A.H.between(p, f, q, u))


def selfpairs(o):
    p, f = geometry(o)
    return len(A.H.strict_pairs(p, f))


def static(o, i, prov, shirt, rig):
    pre = f"part_{i}_"
    need = (
        "expected_coordinates",
        "expected_weights",
        "anchors",
        "barycentrics",
        "goals_t",
    )
    if any(pre + x not in prov for x in need):
        raise AssertionError(f"{o.name} provenance")
    names = [g.name for g in shirt.vertex_groups]
    c = coords(o)
    w = weights(o, names)
    ec = np.asarray(prov[pre + "expected_coordinates"], np.float32)
    ew = np.asarray(prov[pre + "expected_weights"], np.float32)
    goals = np.asarray(prov[pre + "goals_t"], float)
    an = np.asarray(prov[pre + "anchors"])
    ba = np.asarray(prov[pre + "barycentrics"])
    if (
        ec.shape != c.shape
        or ew.shape != w.shape
        or goals.shape != c.shape
        or an.shape != (len(c), 3)
        or ba.shape != (len(c), 3)
    ):
        raise AssertionError(f"{o.name} provenance shapes")
    if not np.array_equal(c, ec) or not np.array_equal(w, ew):
        raise AssertionError(f"{o.name} exact coordinates/weights")
    if not all(np.isfinite(a).all() for a in (c, w, goals, ba)):
        raise AssertionError(f"{o.name} nonfinite provenance")
    if not np.issubdtype(an.dtype, np.integer) or not (
        np.all(an >= 0) and np.all(an < len(shirt.data.vertices))
    ):
        raise AssertionError(f"{o.name} invalid anchor indices")
    if (
        np.min(w) < -EPS
        or np.max(abs(w.sum(1) - 1)) > EPS
        or (w > 1e-8).sum(1).max() > 4
    ):
        raise AssertionError(f"{o.name} weights")
    shirt_w = weights(shirt, names)
    reconstructed = np.einsum("vi,vij->vj", ba, shirt_w[an])
    order = np.argsort(-reconstructed, axis=1, kind="stable")
    for row, ranked in zip(reconstructed, order, strict=True):
        row[ranked[4:]] = 0
        row /= row.sum()
    if np.max(np.abs(reconstructed - w)) > 1e-6:
        raise AssertionError(f"{o.name} weights do not reconstruct from shirt anchors")
    shirt_faces = {tuple(sorted(face.vertices)) for face in shirt.data.polygons}
    if any(tuple(sorted(face)) not in shirt_faces for face in an):
        raise AssertionError(f"{o.name} anchors are not shirt triangle vertex IDs")
    if not (
        np.all(an >= 0)
        and np.all(an < len(shirt.data.vertices))
        and np.min(ba) >= -EPS
        and np.max(abs(ba.sum(1) - 1)) < EPS
    ):
        raise AssertionError(f"{o.name} anchors")
    if (
        o.parent != shirt
        or float(np.max(np.abs(np.asarray(o.matrix_parent_inverse) - np.eye(4)))) > 1e-8
        or float(np.max(np.abs(np.asarray(o.matrix_basis) - np.eye(4)))) > 1e-8
        or o.data.shape_keys
        or (o.animation_data and o.animation_data.drivers)
    ):
        raise AssertionError(f"{o.name} attachment/drivers")
    if (
        len(o.modifiers) != 1
        or o.modifiers[0].type != "ARMATURE"
        or o.modifiers[0].object != rig
    ):
        raise AssertionError(f"{o.name} armature")
    volume = signed_volume(o)
    if volume <= 1e-12:
        raise AssertionError(f"{o.name} non-positive signed volume")
    return {
        "vertices": len(c),
        "triangles": topo(o)["triangles"],
        "goals": goals,
        "signed_volume_m3": volume,
    }


def pose(scene, rig, frame):
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, frame)


def edge_lengths(obj, points=None):
    if points is None:
        points, _ = geometry(obj)
    return np.asarray(
        [
            (points[a] - points[b]).length
            for a, b in sorted({tuple(sorted(e.vertices)) for e in obj.data.edges})
        ]
    )


def record(ds, shirt, body, coat, hardware, states, tref):
    cache = {o.name: geometry(o) for o in [*ds, shirt, body, coat, *hardware]}
    for name, (points, _faces) in cache.items():
        if not np.isfinite(A.array(points)).all():
            raise AssertionError(f"{name} nonfinite evaluated geometry")

    def crossing(a, b):
        p, f = cache[a.name]
        q, u = cache[b.name]
        return len(A.H.between(p, f, q, u))

    shirt_points, shirt_faces = cache[shirt.name]
    shirt_tree = A.BVHTree.FromPolygons(shirt_points, shirt_faces, all_triangles=True)
    rows = {}
    bad = False
    for o in ds:
        points, faces = cache[o.name]
        distances = [shirt_tree.find_nearest(point)[3] * 1000 for point in points]
        ratio = edge_lengths(o, points) / tref[o.name]
        if not np.isfinite(distances).all() or not np.isfinite(ratio).all():
            raise AssertionError(f"{o.name} nonfinite proximity/strain")
        row = {
            "shirt": crossing(o, shirt),
            "body": crossing(o, body),
            "coat": crossing(o, coat),
            "hardware": sum(crossing(o, h) for h in hardware),
            "self": len(A.H.strict_pairs(points, faces)),
            "shirt_proximity_mm": {
                "minimum": float(min(distances)),
                "maximum": float(max(distances)),
            },
            "edge_strain_percent": float(np.max(np.abs(ratio - 1)) * 100),
        }
        rows[o.name] = row
        bad |= any(row[key] for key in ("shirt", "body", "coat", "hardware", "self"))
    inter = sum(crossing(a, b) for x, a in enumerate(ds) for b in ds[x + 1 :])
    return {"accepted": not (bad or inter), "contacts": rows, "inter_new": inter}


def embroidery_bridge(source, sha):
    path = source.parent / "audit.json"
    if not path.exists():
        raise AssertionError(f"missing embroidery audit beside source: {path}")
    record = json.loads(path.read_text())
    if not record.get("accepted") or record.get("model_sha256") != sha:
        raise AssertionError("embroidery audit does not accept exact source")
    scope = record["inherited_motion_record"]
    if scope["arm_samples"] != 354 or scope["neck_samples"] != 36:
        raise AssertionError("source motion scope mismatch")
    return {"path": str(path), "sha256": dig(path), "model_sha256": sha}


def main(args):
    sh, ih = dig(args.source), dig(args.input)
    inherited = embroidery_bridge(args.source, sh)
    prov = np.load(args.provenance)
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    src = E.static_snapshot()
    src["images"] = image_snapshot()
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    ds = details()
    new = {o.name for o in ds}
    newm = {m.name for o in ds for m in o.data.materials if m}
    if newm != {
        PREFIX + "black satin collar and placket",
        PREFIX + "dark horn buttons with gold rims",
    }:
        raise AssertionError("exact two new shirt materials required")
    cand = E.static_snapshot()
    cand["images"] = image_snapshot()
    cand["meshes"] = {k: v for k, v in cand["meshes"].items() if k not in new}
    cand["mesh_names"] = sorted(cand["meshes"])
    cand["objects"] = {k: v for k, v in cand["objects"].items() if k not in new}
    cand["materials"] = [m for m in cand["materials"] if m["name"] not in newm]
    if cand != src:
        raise AssertionError("source embroidery assets changed")
    pose(scene, rig, 31)
    states = {o.name: static(o, i, prov, shirt, rig) for i, o in enumerate(ds)}
    hardware = [o for o in bpy.data.objects if o.get("jacketHardware")]
    tref = {o.name: edge_lengths(o) for o in ds}
    for o in ds:
        actual, _ = geometry(o)
        e = float(np.max(abs(A.array(actual) - states[o.name]["goals"])))
        states[o.name]["t_residual_m"] = e
        if e > TOL:
            raise AssertionError(f"{o.name} T residual")
    rows = []
    fails = []
    for action, frames in A.action_scopes(
        scene["riggedJacketOriginalLoweringAction"], args.quick
    ):
        rig.animation_data.action = bpy.data.actions[action]
        for f in frames:
            A.sample(scene, f)
            r = record(ds, shirt, body, coat, hardware, states, tref)
            r.update(
                scope="lowering"
                if action == scene["riggedJacketOriginalLoweringAction"]
                else action,
                frame=float(f),
            )
            rows.append(r)
            fails += [] if r["accepted"] else [r]
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, 31.0)
    t_basis = A.arm_basis(rig)
    A.sample(scene, 1.0)
    down_basis = A.arm_basis(rig)
    for active in A.SIDES:
        rig.animation_data.action = bpy.data.actions[
            scene["riggedJacketOriginalLoweringAction"]
        ]
        A.sample(scene, 31.0)
        rig.animation_data.action = None
        for side in A.SIDES:
            for part, matrix in (down_basis if side == active else t_basis)[
                side
            ].items():
                rig.pose.bones[f"{part}_{side}"].matrix_basis = matrix
        A.update()
        r = record(ds, shirt, body, coat, hardware, states, tref)
        r.update(scope="asymmetric", frame=None, full_down_side=active)
        rows.append(r)
        fails += [] if r["accepted"] else [r]

    neck = []
    neck_values = (
        [("X", -10), ("X", 10), ("Z", -20), ("Z", 20)]
        if args.quick
        else [
            (axis, float(degrees))
            for axis, limit in (("X", 10), ("Z", 20))
            for degrees in np.linspace(-limit, limit, 9)
        ]
    )
    for f in (31.0, 1.0):
        for axis, degrees in neck_values:
            pose(scene, rig, f)
            rig.animation_data.action = None
            b = rig.pose.bones["neck_01"]
            base = b.matrix_basis.copy()
            b.matrix_basis = (
                base
                @ Quaternion(
                    (1, 0, 0) if axis == "X" else (0, 0, 1), math.radians(degrees)
                )
                .to_matrix()
                .to_4x4()
            )
            A.update()
            r = record(ds, shirt, body, coat, hardware, states, tref)
            r.update(frame=f, axis=axis, degrees=degrees)
            neck.append(r)
            fails += [] if r["accepted"] else [r]
            b.matrix_basis = base
            A.update()
    if len(rows) != (14 if args.quick else 354) or len(neck) != (
        8 if args.quick else 36
    ):
        raise AssertionError("scope count")
    if dig(args.source) != sh or dig(args.input) != ih:
        raise AssertionError("blend mutated")
    for x in states.values():
        del x["goals"]
    out = {
        "source_sha256": sh,
        "model_sha256": ih,
        "auditor_sha256": dig(Path(__file__)),
        "provenance_sha256": dig(args.provenance),
        "mode": "quick14_plus_neck8" if args.quick else "full354_plus_neck36",
        "accepted": not fails,
        "source_embroidery_assets_exact": True,
        "inherited_embroidery_audit": inherited,
        "parts": states,
        "arm_samples": rows,
        "neck_samples": neck,
        "failures": fails,
        "limits": [
            "Finite strict crossings only; no continuous/combined-motion, coplanar or positive-clearance certification.",
            "Unsigned shirt proximity and edge strain are reported metrics, not physical attachment/strain acceptance thresholds.",
            "The 354 arm and 36 single-axis neck scopes include overlapping poses; locomotion and full neck range remain untested.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(out, indent=2) + "\n")
    print(
        "SHIRT_DETAIL_AUDIT",
        json.dumps(
            {k: out[k] for k in ("mode", "accepted", "source_sha256", "model_sha256")}
        ),
    )
    if fails:
        raise AssertionError(f"{len(fails)} failures")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=Path, default=SOURCE)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--provenance", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    p.add_argument("--quick", action="store_true")
    main(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
