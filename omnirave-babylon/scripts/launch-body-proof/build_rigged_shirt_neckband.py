"""Join the two existing shirt collar flaps with one native-skinned neck band."""

# Connection map: remove only each old flap's 16 top-cap triangles. Reuse its
# 18 seam vertices directly for the new band, creating one continuous closed
# surface. A 0.35–0.65 mm textile wall fits between measured body/shirt and jacket;
# the original body, shirt, jacket, buttons and hardware remain intact.
import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

S = Path(__file__).resolve().parent
sys.path.insert(0, str(S))
import itertools

import audit_rigged_jacket_sleeves as A
from build_rigged_jacket_hardware import barycentric

SOURCE = S.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-shirt-detail-study/"
    "male-rigged-shirt-detailed.blend"
)
OLD_NAMES = ["Shirt detail - left collar", "Shirt detail - right collar"]
NAME = "Shirt detail - connected collar"


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def weight_array(obj, names):
    indices = {
        g.index: names.index(g.name) for g in obj.vertex_groups if g.name in names
    }
    w = np.zeros((len(obj.data.vertices), len(names)))
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group in indices:
                w[v.index, indices[g.group]] = g.weight
    return w


def rays(tree, direction, z):
    origin = Vector((0, 0.005, z))
    step = Vector((direction[0], direction[1], 0))
    result = []
    for _ in range(6):
        hit, _normal, _face, _distance = tree.ray_cast(origin, step, 0.3)
        if hit is None:
            break
        radius = float(np.dot(np.array(hit)[:2] - (0, 0.005), direction))
        result.append(radius)
        origin = hit + step * 0.000001
    return result


def run(args):
    for path in (args.output, args.provenance, args.report):
        if path.exists():
            raise FileExistsError(path)
        path.parent.mkdir(parents=True, exist_ok=True)
    sha = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, 31)
    names = [g.name for g in shirt.vertex_groups]
    bone_matrices = np.asarray(
        [
            rig.matrix_world
            @ rig.pose.bones[n].matrix
            @ rig.data.bones[n].matrix_local.inverted()
            @ rig.matrix_world.inverted()
            for n in names
        ]
    )
    assert np.max(abs(np.asarray(shirt.matrix_world) - np.eye(4))) < 1e-8
    bp, bf = A.H.geometry(body)
    bp = A.array(bp)
    bf = np.asarray(bf)
    body_weights = weight_array(body, names)
    # Head and neck have the same skin transform in the retained arm/neck
    # actions. Route this cloth's head influence to neck before truncation so
    # a small but essential upper-arm influence is not discarded instead.
    # Independent local-head motion is outside this collar attachment contract.
    head_index, neck_index = names.index("head"), names.index("neck_01")
    assert np.max(abs(bone_matrices[head_index] - bone_matrices[neck_index])) < 1e-6
    body_weights[:, neck_index] += body_weights[:, head_index]
    body_weights[:, head_index] = 0
    sp, sf = A.H.geometry(shirt)
    sp, sf = A.array(sp), np.asarray(sf)
    shirt_weights = weight_array(shirt, names)
    shirt_weights[:, neck_index] += shirt_weights[:, head_index]
    shirt_weights[:, head_index] = 0
    shirt_top = float(sp[:, 2].max())
    trees = {}
    for name, obj in (("body", body), ("shirt", shirt), ("coat", coat)):
        p, f = A.H.geometry(obj)
        trees[name] = BVHTree.FromPolygons(p, f, all_triangles=True)
    coordinates, weights, goals, faces, uv = [], [], [], [], []
    seams = []
    cap_counts = []
    material = bpy.data.objects[OLD_NAMES[0]].data.materials[0]
    for name in OLD_NAMES:
        obj = bpy.data.objects[name]
        p, _ = A.H.geometry(obj)
        p = A.array(p)
        offset = len(coordinates)
        end = np.flatnonzero(p[:, 2] > 1.47699)
        assert len(end) == 18
        seam = end + offset
        seams.append(seam)
        end_set = set(end)
        caps = 0
        for face in obj.data.polygons:
            if set(face.vertices) <= end_set:
                caps += 1
                continue
            faces.append(tuple(i + offset for i in face.vertices))
        assert caps == 16
        cap_counts.append(caps)
        coordinates.extend([list(v.co) for v in obj.data.vertices])
        weights.extend(weight_array(obj, names))
        goals.extend(p)
        uv.extend(
            [list(v.vector) for v in obj.data.attributes["ShirtDetailCoordinates"].data]
        )
    old_count = len(coordinates)
    goals = list(goals)
    end_goals = [np.asarray(goals)[seam].reshape(9, 2, 3) for seam in seams]
    end_weights = [np.asarray(weights)[seam].reshape(9, 2, -1) for seam in seams]
    center = np.mean(end_goals[0], axis=(0, 1))
    theta0 = float(np.arctan2(center[0], -(center[1] - 0.005)))
    thetas = np.linspace(theta0, 2 * np.pi - theta0, 441)
    rings = [seams[0].reshape(9, 2)]
    body_anchors, body_bary, source_end_ids, blends = [], [], [], []
    shirt_anchors, shirt_bary, shirt_blends = [], [], []
    smoothing_factors = []
    max_dropped = 0.0
    max_condition = 0.0
    margins = []
    for theta in thetas[1:-1]:
        angle = min(theta, 2 * np.pi - theta)
        degrees = float(np.rad2deg(angle))
        progress = smooth((degrees - np.rad2deg(theta0)) / (34 - np.rad2deg(theta0)))
        tilt = (
            smooth((degrees - np.rad2deg(theta0)) / (43 - np.rad2deg(theta0)))
            * np.pi
            / 2
        )
        width = 0.0053 + 0.0117 * smooth((degrees - np.rad2deg(theta0)) / 20)
        zcenter = 1.477 + (1.532 - 1.477) * progress
        back_extension = smooth((degrees - 90) / 25)
        added_width = back_extension * (1.5235 - (shirt_top + 0.0005))
        width += added_width
        zcenter -= added_width / 2
        join_blend = smooth((degrees - np.rad2deg(theta0)) / 5)
        end_index = 0 if theta < np.pi else 1
        ring = []
        for j, t in enumerate(np.linspace(0, 1, 9)):
            dt = (t - 0.5) * width
            th = theta + (1 if theta < np.pi else -1) * dt * np.cos(tilt) / 0.085
            front_inset = (
                np.deg2rad(3.5)
                * smooth((degrees - np.rad2deg(theta0)) / 7)
                * (1 - smooth((degrees - 38) / 14))
            )
            th -= (1 if theta < np.pi else -1) * front_inset
            z = zcenter - dt * np.sin(tilt)
            radial = np.array((np.sin(th), -np.cos(th)))
            body_hits = rays(trees["body"], radial, z)
            assert body_hits
            shirt_hits = rays(trees["shirt"], radial, z)
            coat_hits = rays(trees["coat"], radial, z)
            lower_blend = back_extension * smooth((t - 0.4) / 0.6)
            edge_hits = rays(trees["shirt"], radial, shirt_top - 0.001)
            inner = max(body_hits) + 0.0016 + (1 - progress) * 0.0055
            if shirt_hits:
                inner = max(inner, max(shirt_hits) + 0.00055)
            if edge_hits:
                inner = (
                    inner * (1 - lower_blend) + (max(edge_hits) + 0.0002) * lower_blend
                )
            thickness = 0.00065 - 0.0003 * lower_blend
            outer_limit = min(coat_hits) - 0.0008 if coat_hits else 1.0
            if lower_blend:
                inner = min(inner, outer_limit - thickness - 0.0001)
                assert inner > max(body_hits) + 0.0005
            front_corner = (
                smooth((degrees - 31) / 5)
                * (1 - smooth((degrees - 47) / 10))
                * smooth((0.7 - t) / 0.3)
            )
            inner -= 0.0006 * front_corner
            assert inner + thickness < outer_limit, (
                "no band layering space",
                degrees,
                th,
                z,
                inner,
                outer_limit,
            )
            pair = []
            for wall in (0, 1):
                radius = inner + (thickness if wall == 0 else 0)
                goal = np.array((radius * radial[0], 0.005 + radius * radial[1], z))
                # Exact shared seam, then a short smooth transition to radial
                # textile coordinates; no duplicate/coincident seam vertices.
                seam_goal = end_goals[end_index][j, wall]
                ramp = smooth((degrees - np.rad2deg(theta0)) / 3)
                goal = seam_goal * (1 - ramp) + goal * ramp
                hit, _normal, face_id, _distance = trees["body"].find_nearest(
                    Vector(goal)
                )
                ids = bf[face_id]
                ba = barycentric(np.array(hit), bp[ids])
                bw = ba @ body_weights[ids]
                assert abs(bw.sum() - 1) < 1e-6, bw.sum()
                shirt_query = Vector((goal[0], goal[1], min(z, shirt_top - 0.001)))
                sh, _sn, sid, _sd = trees["shirt"].find_nearest(shirt_query)
                sids = sf[sid]
                sba = barycentric(np.array(sh), sp[sids])
                sw = sba @ shirt_weights[sids]
                bw = bw * (1 - lower_blend) + sw * lower_blend
                w = bw * join_blend + end_weights[end_index][j, wall] * (1 - join_blend)
                order = np.argsort(-w, kind="stable")
                dropped = float(w[order[4:]].sum())
                max_dropped = max(max_dropped, dropped)
                assert dropped < 0.05
                w[order[4:]] = 0
                w /= w.sum()
                matrix = np.einsum("g,gij->ij", w, bone_matrices)
                condition = float(np.linalg.cond(matrix[:3, :3]))
                max_condition = max(max_condition, condition)
                assert condition < 5
                local = (np.linalg.inv(matrix) @ np.r_[goal, 1])[:3]
                pair.append(len(coordinates))
                coordinates.append(local)
                weights.append(w)
                goals.append(goal)
                uv.append((t, z, 0))
                body_anchors.append(ids)
                body_bary.append(ba)
                source_end_ids.append(int(seams[end_index][2 * j + wall]))
                blends.append(join_blend)
                shirt_anchors.append(sids)
                shirt_bary.append(sba)
                shirt_blends.append(lower_blend)
                smoothing_factors.append(
                    0.9
                    * smooth((degrees - 96) / 8)
                    * (1 - smooth((degrees - 120) / 15))
                    * smooth((t - 0.35) / 0.25)
                    * (1 - smooth((t - 0.85) / 0.15))
                )
                margins.append(outer_limit - radius)
            ring.append(pair)
        rings.append(np.asarray(ring))
    rings.append(seams[1].reshape(9, 2))
    unfiltered = np.asarray(weights[old_count:]).reshape(
        len(thetas) - 2, 9, 2, len(names)
    )
    filtered = unfiltered.copy()
    for _ in range(6):
        padded = np.pad(filtered, ((1, 1), (0, 0), (0, 0), (0, 0)), mode="edge")
        filtered = (padded[:-2] + 2 * padded[1:-1] + padded[2:]) / 4
    factors = np.asarray(smoothing_factors).reshape(-1, 9, 2, 1)
    smoothed = (unfiltered * (1 - factors) + filtered * factors).reshape(-1, len(names))
    maximum_smoothing_weight_change = float(
        np.max(abs(smoothed - unfiltered.reshape(-1, len(names))))
    )
    for i, w in enumerate(smoothed, start=old_count):
        order = np.argsort(-w, kind="stable")
        dropped = float(w[order[4:]].sum())
        max_dropped = max(max_dropped, dropped)
        assert dropped < 0.05
        w[order[4:]] = 0
        w /= w.sum()
        matrix = np.einsum("g,gij->ij", w, bone_matrices)
        condition = float(np.linalg.cond(matrix[:3, :3]))
        max_condition = max(max_condition, condition)
        assert condition < 5
        coordinates[i] = (np.linalg.inv(matrix) @ np.r_[goals[i], 1])[:3]
        weights[i] = w

    def quad(a, b, c, d):
        faces.extend(((int(a), int(b), int(c)), (int(a), int(c), int(d))))

    for a, b in itertools.pairwise(rings):
        for j in range(8):
            for wall in (0, 1):
                quad(a[j, wall], a[j + 1, wall], b[j + 1, wall], b[j, wall])
        for j in (0, 8):
            quad(a[j, 0], a[j, 1], b[j, 1], b[j, 0])
    mesh = bpy.data.meshes.new(NAME)
    # Supplying edges avoids thread-dependent edge discovery/index ordering.
    edges = sorted(
        {
            tuple(sorted((face[i], face[(i + 1) % len(face)])))
            for face in faces
            for i in range(len(face))
        }
    )
    mesh.from_pydata(coordinates, edges, faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(NAME, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = shirt
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = Matrix.Identity(4)
    mesh.materials.append(material)
    for p in mesh.polygons:
        p.use_smooth = True
    attr = mesh.attributes.new("ShirtDetailCoordinates", "FLOAT_VECTOR", "POINT")
    attr.data.foreach_set("vector", np.asarray(uv).reshape(-1))
    for name in names:
        obj.vertex_groups.new(name=name)
    for i, row in enumerate(weights):
        for g in np.flatnonzero(np.asarray(row) > 0):
            obj.vertex_groups[int(g)].add([i], float(row[g]), "REPLACE")
    mod = obj.modifiers.new("Existing shirt armature", "ARMATURE")
    mod.object = rig
    obj["shirtDetail"] = True
    obj["shirtDetailRole"] = "connected collar"
    for name in OLD_NAMES:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    A.update()
    p, _f = A.H.geometry(obj)
    residual = float(np.max(abs(A.array(p) - goals)))
    assert residual < 2e-6, residual
    topology = A.topology(mesh)
    assert not any(
        topology[k] for k in ("boundary_edges", "nonmanifold_edges", "degenerate_faces")
    ), topology
    np.savez_compressed(
        args.provenance,
        expected_coordinates=np.asarray(coordinates, np.float32),
        expected_weights=np.asarray(weights, np.float32),
        goals_t=np.asarray(goals),
        body_anchors=np.asarray(body_anchors, np.int32),
        body_barycentrics=np.asarray(body_bary),
        source_end_ids=np.asarray(source_end_ids, np.int32),
        body_weight_blends=np.asarray(blends),
        shirt_anchors=np.asarray(shirt_anchors, np.int32),
        shirt_barycentrics=np.asarray(shirt_bary),
        shirt_weight_blends=np.asarray(shirt_blends),
        weight_smoothing_factors=np.asarray(smoothing_factors),
        weight_smoothing_passes=np.array(6, np.int32),
        seams=np.asarray(seams, np.int32),
    )
    A.sample(scene, 1)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    assert A.digest(args.input) == sha
    record = {
        "source_sha256": sha,
        "model_sha256": A.digest(args.output),
        "builder_sha256": A.digest(Path(__file__)),
        "original_collar_vertices": old_count,
        "removed_cap_triangles": cap_counts,
        "vertices": len(coordinates),
        "triangles": len(faces),
        "maximum_dropped_weight": max_dropped,
        "body_head_influence_owner": "neck_01",
        "maximum_smoothing_weight_change": maximum_smoothing_weight_change,
        "shirt_neckline_top_m": shirt_top,
        "band_rear_lower_z_m": shirt_top + 0.0005,
        "maximum_t_skin_condition": max_condition,
        "maximum_t_residual_m": residual,
        "minimum_radial_coat_margin_m": min(margins),
        "acceptance": "Requires independent reopened static, motion and visual checks",
    }
    args.report.write_text(json.dumps(record, indent=2) + "\n")
    print("SHIRT_NECKBAND_BUILD", json.dumps(record))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, default=SOURCE)
    for name in ("output", "provenance", "report"):
        p.add_argument("--" + name, type=Path, required=True)
    run(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
