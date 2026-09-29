"""Build bounded lowered-jacket target controls without saving a blend.

The default comparison contains three offset controls; --round-underarm contains
two rounded controls. Neither comparison is an accepted final corrective.
"""

# Connection map: one shared underarm patch connects torso, shoulder and sleeve;
# no overlapping parts or separate shells are introduced by these controls.
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parents[2]
GATED_BLEND = (
    ROOT
    / "omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-gated-study"
    / "male-rigged-jacket-gated.blend"
)
CORRESPONDENCE = Path("/tmp/omnirave-lowered-correspondence/body-correspondence.npz")
FULL_DOWN = Path("/tmp/omnirave-lowered-correspondence/full-down-surfaces.npz")

sys.path.insert(0, str(SCRIPTS))
from surface_crossings import strict_pairs
from validate_body05_tops import between, geometry
from validate_body_contacts import bones_snapshot, hash_data, weights_snapshot


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--round-underarm", action="store_true")
    return parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )


def update():
    bpy.context.view_layer.update()


def vectors(array):
    return [Vector(point) for point in np.asarray(array)]


def array_vectors(points):
    return np.asarray([tuple(point) for point in points], dtype=np.float64)


def data_snapshot(obj):
    return hash_data(
        {
            "points": [list(vertex.co) for vertex in obj.data.vertices],
            "faces": [list(face.vertices) for face in obj.data.polygons],
            "weights": weights_snapshot(obj),
            "transform": [list(row) for row in obj.matrix_world],
        }
    )


def topology_metrics(points, faces):
    vertex_count = len(points)
    edge_counts = {}
    adjacency = [set() for _ in range(vertex_count)]
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            edge = tuple(sorted((int(a), int(b))))
            edge_counts[edge] = edge_counts.get(edge, 0) + 1
            adjacency[edge[0]].add(edge[1])
            adjacency[edge[1]].add(edge[0])
    boundary_edges = [edge for edge, count in edge_counts.items() if count == 1]
    nonmanifold_edges = sum(count > 2 for count in edge_counts.values())

    def components(graph):
        remaining = set(graph)
        count = 0
        while remaining:
            stack = [remaining.pop()]
            count += 1
            while stack:
                vertex = stack.pop()
                for neighbor in graph.get(vertex, ()):
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        stack.append(neighbor)
        return count

    boundary_graph = {}
    for a, b in boundary_edges:
        boundary_graph.setdefault(a, set()).add(b)
        boundary_graph.setdefault(b, set()).add(a)
    return {
        "vertices": vertex_count,
        "faces": len(faces),
        "edges": len(edge_counts),
        "boundary_edges": len(boundary_edges),
        "boundary_components": components(boundary_graph),
        "connected_components": components(
            {index: neighbors for index, neighbors in enumerate(adjacency) if neighbors}
        ),
        "nonmanifold_edges": nonmanifold_edges,
    }


def verify_shirt_pairing(faces, vertex_count):
    if vertex_count % 2:
        raise AssertionError("native top does not have paired halves")
    base_count = vertex_count // 2
    outer = [face for face in faces if max(face) < base_count]
    inner = [face for face in faces if min(face) >= base_count]
    rim = [face for face in faces if min(face) < base_count <= max(face)]
    if len(outer) != len(inner) or not outer or not rim:
        raise AssertionError("native top paired-sheet face counts are inconsistent")
    inner_by_set = {
        frozenset(index - base_count for index in face): face for face in inner
    }
    opposite_winding = 0
    for face in outer:
        paired = inner_by_set.get(frozenset(face))
        if paired is None:
            raise AssertionError("native top inner faces do not pair with outer faces")
        mapped = tuple(index - base_count for index in paired)
        a, b, c = face
        if mapped not in ((a, c, b), (c, b, a), (b, a, c)):
            raise AssertionError(
                "native top inner face winding is not opposite outer winding"
            )
        opposite_winding += 1
    outer_edges = {}
    for face in outer:
        for a, b in zip(face, face[1:] + face[:1]):
            edge = tuple(sorted((int(a), int(b))))
            outer_edges[edge] = outer_edges.get(edge, 0) + 1
    boundary_edges = {edge for edge, count in outer_edges.items() if count == 1}
    rim_edges = {}
    for face in rim:
        base_ids = sorted({int(index) % base_count for index in face})
        if len(base_ids) != 2 or tuple(base_ids) not in boundary_edges:
            raise AssertionError(
                "native top rim face does not map to an outer boundary edge"
            )
        layer_count = sum(index < base_count for index in face)
        if layer_count not in (1, 2):
            raise AssertionError(
                "native top rim face does not bridge both paired halves"
            )
        edge = tuple(base_ids)
        rim_edges[edge] = rim_edges.get(edge, 0) + 1
    if any(rim_edges.get(edge, 0) != 2 for edge in boundary_edges):
        raise AssertionError(
            "native top rim edges do not close both paired-sheet boundaries"
        )
    return {
        "base_vertices": base_count,
        "outer_triangles": len(outer),
        "inner_triangles": len(inner),
        "rim_triangles": len(rim),
        "outer_boundary_edges": len(boundary_edges),
        "rim_edges_two_per_boundary_edge": True,
        "paired_opposite_winding_triangles": opposite_winding,
    }, outer


def triangle_normal(points, face):
    a, b, c = (points[int(index)] for index in face)
    return (b - a).cross(c - a)


def minimum_area(points, faces):
    return min(0.5 * triangle_normal(points, face).length for face in faces)


def offset_orientation(native_points, native_faces, mid_points, mid_faces):
    base_count = len(mid_points)
    if len(native_points) != 2 * base_count:
        raise AssertionError(
            f"Solidify produced {len(native_points)} vertices, expected {2 * base_count}"
        )
    if not np.array_equal(
        np.asarray(native_faces[: len(mid_faces)], dtype=np.int64),
        np.asarray(mid_faces, dtype=np.int64),
    ):
        raise AssertionError(
            "Solidify first face block no longer matches fixed midsurface faces"
        )
    ratios = []
    for face in mid_faces:
        mid_normal = triangle_normal(mid_points, face)
        denominator = mid_normal.length_squared
        if denominator <= 1e-24:
            raise AssertionError("degenerate midsurface triangle")
        for layer in (0, base_count):
            layer_points = [native_points[int(index) + layer] for index in face]
            ratios.append(
                triangle_normal(layer_points, (0, 1, 2)).dot(mid_normal) / denominator
            )
    return {
        "minimum_ratio": min(ratios),
        "reversed_faces": sum(ratio <= 0.0 for ratio in ratios),
        "minimum_midsurface_triangle_area_m2": minimum_area(mid_points, mid_faces),
    }


def mapped_base_triangle(native_face, base_count, base_face_lookup):
    base_vertices = tuple(int(index) % base_count for index in native_face)
    return {
        "base_face_id": base_face_lookup.get(frozenset(base_vertices)),
        "base_vertex_ids": sorted(set(base_vertices)),
    }


def contact_details(native, base_faces):
    base_count = len(native["midsurface_points"])
    lookup = {frozenset(face): index for index, face in enumerate(base_faces)}
    result = {}
    for kind, pairs in (
        ("self", native["self"]),
        ("body", native["body"]),
        ("top", native["top"]),
    ):
        records = []
        for pair in pairs:
            garment_ids = pair if kind == "self" else (pair[0],)
            records.append(
                {
                    "native_face_ids": [int(value) for value in pair],
                    "mapped_base_faces": [
                        mapped_base_triangle(
                            native["native_faces"][triangle_id],
                            base_count,
                            lookup,
                        )
                        for triangle_id in garment_ids
                    ],
                }
            )
        result[kind] = records
    return result


def make_candidate(name, points, faces, scene):
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata([tuple(point) for point in points], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    solidify = obj.modifiers.new("Native 1 mm Solidify", "SOLIDIFY")
    solidify.thickness = 0.001
    solidify.offset = 0.0
    solidify.use_even_offset = False
    solidify.use_quality_normals = False
    solidify.use_rim = True
    solidify.use_rim_only = False
    return obj


def evaluate_candidate(obj):
    points, faces = geometry(obj)
    return points, faces


def cuff_preservation(points, old_midsurface, source_x):
    result = []
    for point, old_point, x in zip(points, old_midsurface, source_x):
        distance = abs(float(x))
        if distance >= 0.729:
            result.append(old_point.copy())
        elif distance > 0.709:
            fraction = (distance - 0.709) / 0.020
            fraction = fraction * fraction * (3.0 - 2.0 * fraction)
            result.append(point * (1.0 - fraction) + old_point * fraction)
        else:
            result.append(point.copy())
    return result


def cuff_report(points, old_midsurface, source_x):
    exact_ids = [index for index, x in enumerate(source_x) if abs(float(x)) >= 0.729]
    transition_ids = [
        index for index, x in enumerate(source_x) if 0.709 < abs(float(x)) < 0.729
    ]
    exact_deltas = [
        (points[index] - old_midsurface[index]).length for index in exact_ids
    ]
    return {
        "exact_vertex_count": len(exact_ids),
        "transition_vertex_count": len(transition_ids),
        "maximum_exact_position_delta_m": max(exact_deltas, default=0.0),
    }


def armpit_warp(points):
    centers = [
        Vector((-0.1495, -0.012, 1.367)),
        Vector((0.1495, -0.012, 1.367)),
    ]
    sigmas = (0.025, 0.045, 0.045)
    warped = []
    jacobians = []
    phi_sums = []
    for point in points:
        phi_sum = 0.0
        derivatives = [0.0, 0.0, 0.0]
        for center in centers:
            delta = point - center
            phi = math.exp(
                -0.5 * sum((delta[axis] / sigmas[axis]) ** 2 for axis in range(3))
            )
            phi_sum += phi
            for axis in range(3):
                derivatives[axis] += 0.030 * phi * delta[axis] / (sigmas[axis] ** 2)
        jzz = 1.0 + derivatives[2]
        if jzz <= 0.0:
            raise AssertionError(f"non-monotonic warp Jacobian Jzz={jzz}")
        warped.append(Vector((point.x, point.y, point.z - 0.030 * phi_sum)))
        jacobians.append((derivatives[0], derivatives[1], jzz))
        phi_sums.append(phi_sum)
    return warped, jacobians, phi_sums


def transform_normals(normals, jacobians):
    transformed = []
    for normal, (jzx, jzy, jzz) in zip(normals, jacobians):
        result = Vector(
            (
                normal.x - jzx * normal.z / jzz,
                normal.y - jzy * normal.z / jzz,
                normal.z / jzz,
            )
        )
        if result.length <= 1e-10:
            raise AssertionError("warp transformed a body normal to zero")
        transformed.append(result.normalized())
    return transformed


def shirt_clearance(points, shirt_tree, desired_clearance=0.0015):
    result = []
    affected = []
    shifts = []
    for index, point in enumerate(points):
        hit, normal, _, distance = shirt_tree.find_nearest(point)
        if hit is None or normal is None or distance is None:
            result.append(point.copy())
            continue
        normal = normal.normalized()
        signed = (point - hit).dot(normal)
        if (
            distance < 0.020
            and signed < desired_clearance
            and abs(signed) > 0.8 * distance
        ):
            shift = normal * (desired_clearance - signed)
            result.append(point + shift)
            affected.append(
                {
                    "vertex_id": index,
                    "distance_m": float(distance),
                    "signed_distance_m": float(signed),
                    "shift_m": float(shift.length),
                }
            )
            shifts.append(shift.length)
        else:
            result.append(point.copy())
    return result, affected, max(shifts, default=0.0)


def shirt_layering_violations(points, shirt_tree):
    violations = []
    for index, point in enumerate(points):
        hit, normal, _, distance = shirt_tree.find_nearest(point)
        if hit is None or normal is None or distance is None:
            continue
        signed = (point - hit).dot(normal.normalized())
        if distance < 0.020 and abs(signed) > 0.8 * distance and signed < -0.0001:
            violations.append(
                {
                    "vertex_id": index,
                    "distance_m": float(distance),
                    "signed_distance_m": float(signed),
                    "penetration_m": float(-signed),
                }
            )
    return {
        "count": len(violations),
        "vertex_ids": [row["vertex_id"] for row in violations],
        "maximum_penetration_m": max(
            (row["penetration_m"] for row in violations), default=0.0
        ),
    }


def fixed_vertex_adjacency(faces, vertex_count):
    neighbors = [set() for _ in range(vertex_count)]
    edge_set = set()
    for face in faces:
        row = tuple(int(value) for value in face)
        if len(row) != 3:
            raise AssertionError("fixed jacket topology must contain triangles")
        if len(set(row)) != len(row):
            raise AssertionError(
                "fixed jacket topology contains a repeated triangle vertex"
            )
        if any(index < 0 or index >= vertex_count for index in row):
            raise AssertionError("fixed jacket topology contains an invalid vertex ID")
        for a, b in zip(row, row[1:] + row[:1]):
            edge = tuple(sorted((a, b)))
            edge_set.add(edge)
            neighbors[a].add(b)
            neighbors[b].add(a)
    if any(not values for values in neighbors):
        raise AssertionError("fixed jacket topology contains an isolated vertex")
    if sum(len(values) for values in neighbors) != 2 * len(edge_set):
        raise AssertionError("fixed jacket triangle-edge adjacency is not reciprocal")
    adjacency_edges = {
        tuple(sorted((index, neighbor)))
        for index, values in enumerate(neighbors)
        for neighbor in values
    }
    if adjacency_edges != edge_set:
        raise AssertionError("fixed jacket triangle-edge adjacency is incomplete")
    return neighbors


def rounded_target(
    warped_points,
    jacobians,
    phi_sums,
    original_normals,
    faces,
    neighbors,
    pinned_ids,
):
    phi = [min(max(value, 0.0), 1.0) for value in phi_sums]
    pinned = set(pinned_ids)
    rounded = [point.copy() for point in warped_points]
    for _ in range(10):
        next_points = []
        for index, point in enumerate(rounded):
            if index in pinned:
                next_points.append(warped_points[index].copy())
                continue
            mean = sum((rounded[neighbor] for neighbor in neighbors[index]), Vector())
            mean /= len(neighbors[index])
            next_points.append(point + 0.25 * phi[index] * (mean - point))
        rounded = next_points

    mesh_normals = [Vector() for _ in rounded]
    for face in faces:
        normal = triangle_normal(rounded, face)
        for vertex_id in face:
            mesh_normals[int(vertex_id)] += normal
    for index, normal in enumerate(mesh_normals):
        if normal.length <= 1e-10:
            raise AssertionError(f"rounded mesh normal is zero at vertex {index}")
        mesh_normals[index] = normal.normalized()

    warped_normals = transform_normals(original_normals, jacobians)
    offset_points = []
    offsets = []
    for index, (point, normal) in enumerate(zip(rounded, warped_normals)):
        blended = (
            warped_normals[index] * (1.0 - phi[index])
            + mesh_normals[index] * phi[index]
        )
        if blended.length <= 1e-10:
            raise AssertionError(f"rounded blended normal is zero at vertex {index}")
        blended.normalize()
        offset = 0.004 * (1.0 - phi[index]) + 0.00075 * phi[index]
        offset_points.append(point + blended * offset)
        offsets.append(offset)
    return offset_points, rounded, mesh_normals, offsets


def oriented_inside(point, body_tree, direction):
    _, normal, face_id, distance = body_tree.ray_cast(point, direction)
    if normal is None or face_id < 0 or distance is None:
        return "no_hit"
    dot = normal.dot(direction)
    if abs(dot) <= 1e-6:
        return "ambiguous"
    return "inside" if dot > 0.0 else "outside"


def containment(native_points, body_tree):
    direction = Vector((1.0, 0.371, 0.173)).normalized()
    counts = {"inside": 0, "outside": 0, "ambiguous": 0, "no_hit": 0}
    for point in native_points:
        counts[oriented_inside(point, body_tree, direction)] += 1
    controls = {
        "torso_center": oriented_inside(Vector((0.0, 0.0, 1.2)), body_tree, direction),
        "outside_right": oriented_inside(Vector((0.8, 0.0, 1.2)), body_tree, direction),
    }
    if controls["torso_center"] != "inside" or controls["outside_right"] not in {
        "outside",
        "no_hit",
    }:
        raise AssertionError(
            f"body containment orientation controls failed: {controls}"
        )
    return {
        "ray_direction": list(direction),
        "native_vertex_states": counts,
        "expected_controls": controls,
        "outside_right_classified_as_outside": True,
        "near_tangent_epsilon": 1e-6,
    }


def displacement_report(points, old_midsurface):
    distances = np.asarray(
        [(point - old_midsurface[index]).length for index, point in enumerate(points)]
    )
    return {
        "maximum_m": float(np.max(distances)),
        "percentiles_m": {
            str(percentile): float(np.percentile(distances, percentile))
            for percentile in (50, 90, 95, 99, 100)
        },
    }


def bounds(points):
    values = array_vectors(points)
    return {"min": values.min(axis=0).tolist(), "max": values.max(axis=0).tolist()}


def evaluate_control(
    label,
    points,
    faces,
    old_midsurface,
    source_x,
    body_points,
    body_faces,
    top_points,
    top_faces,
    body_tree,
    top_tree,
    topology,
    scene,
    layering=None,
):
    if layering is None:
        measured_layering = shirt_layering_violations(points, top_tree)
        layering = {
            "before_projection": measured_layering,
            "after_projection": measured_layering,
        }
    obj = make_candidate("Lowered target " + label, points, faces, scene)
    try:
        native_points, native_faces = evaluate_candidate(obj)
        cuff = cuff_report(points, old_midsurface, source_x)
        if cuff["maximum_exact_position_delta_m"] > 1e-8:
            raise AssertionError("cuff vertices were not retained exactly")
        midsurface_self = len(strict_pairs(points, faces))
        native_self = strict_pairs(native_points, native_faces)
        native_body = between(native_points, native_faces, body_points, body_faces)
        native_top = between(native_points, native_faces, top_points, top_faces)
        orientation = offset_orientation(native_points, native_faces, points, faces)
        midsurface_topology = topology_metrics(points, faces)
        native_topology = topology_metrics(native_points, native_faces)
        body_containment = containment(native_points, body_tree)
        expected_native_topology = {
            "vertices": 2 * topology["vertices"],
            "faces": 2 * topology["faces"] + 2 * topology["boundary_edges"],
            "edges": 2 * topology["edges"] + 2 * topology["boundary_edges"],
            "boundary_edges": 0,
            "boundary_components": 0,
            "connected_components": topology["connected_components"],
            "nonmanifold_edges": 0,
        }
        shared_topology_unchanged = (
            midsurface_topology == topology
            and native_topology == expected_native_topology
        )
        cuff_unchanged = (
            cuff["exact_vertex_count"] == sum(abs(float(x)) >= 0.729 for x in source_x)
            and cuff["transition_vertex_count"]
            == sum(0.709 < abs(float(x)) < 0.729 for x in source_x)
            and cuff["maximum_exact_position_delta_m"] <= 1e-8
        )
        contacts = {
            "self": native_self,
            "body": native_body,
            "top": native_top,
        }
        report = {
            "control": label,
            "midsurface_self_count": midsurface_self,
            "native_counts": {
                "self": len(native_self),
                "body": len(native_body),
                "top": len(native_top),
                "total": len(native_self) + len(native_body) + len(native_top),
            },
            "midsurface_topology": midsurface_topology,
            "topology": native_topology,
            "expected_native_topology": expected_native_topology,
            "topology_matches_base": shared_topology_unchanged,
            "shared_topology_unchanged": shared_topology_unchanged,
            "offset_orientation": orientation,
            "displacement_from_old_lowered_jacket": displacement_report(
                points, old_midsurface
            ),
            "bounds": bounds(points),
            "cuff_preservation": cuff,
            "cuffs_unchanged": cuff_unchanged,
            "body_containment": body_containment,
            "contact_faces_and_mapped_base_ids": contact_details(
                {"midsurface_points": points, "native_faces": native_faces, **contacts},
                faces,
            ),
        }
        if layering is not None:
            report["near_normal_shirt_layering"] = layering
            report["shirt_layering_passed"] = layering["after_projection"]["count"] == 0
        else:
            report["shirt_layering_passed"] = True
    finally:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    report["passed_scoped_crossings"] = report["midsurface_self_count"] == 0 and all(
        report["native_counts"][key] == 0 for key in ("self", "body", "top")
    )
    containment_states = report["body_containment"]["native_vertex_states"]
    report["body_containment_passed"] = (
        containment_states["inside"] == 0 and containment_states["ambiguous"] == 0
    )
    report["accepted"] = (
        report["midsurface_self_count"] == 0
        and all(report["native_counts"][key] == 0 for key in ("self", "body", "top"))
        and report["offset_orientation"]["reversed_faces"] == 0
        and report["offset_orientation"]["minimum_midsurface_triangle_area_m2"] > 1e-12
        and report["shared_topology_unchanged"]
        and report["cuffs_unchanged"]
        and report["body_containment_passed"]
        and report["shirt_layering_passed"]
    )
    print(
        "LOWERED_TARGET_CONTROL",
        label,
        json.dumps(
            {
                "native": report["native_counts"],
                "midsurface_self": report["midsurface_self_count"],
                "reversed_offset_faces": report["offset_orientation"]["reversed_faces"],
                "inside_vertices": report["body_containment"]["native_vertex_states"][
                    "inside"
                ],
            },
            sort_keys=True,
        ),
        flush=True,
    )
    return report


def main():
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    output_stem = (
        "rounded-target-candidates"
        if args.round_underarm
        else "lowered-target-candidates"
    )
    candidate_npz = output_dir / f"{output_stem}.npz"
    candidate_json = output_dir / f"{output_stem}.json"
    gated_hash_before = hashlib.sha256(GATED_BLEND.read_bytes()).hexdigest()

    with np.load(CORRESPONDENCE) as data:
        patch_t = np.asarray(data["body_patch_t"], dtype=np.float64)
        patch_down = np.asarray(data["body_patch_down"], dtype=np.float64)
        body_normals_down = np.asarray(data["body_normal_down"], dtype=np.float64)
        faces = np.asarray(data["faces"], dtype=np.int64)
    with np.load(FULL_DOWN) as data:
        full_down = {key: np.asarray(data[key]) for key in data.files}
    if (
        patch_t.shape != (2636, 3)
        or patch_down.shape != (2636, 3)
        or body_normals_down.shape != (2636, 3)
    ):
        raise AssertionError("correspondence patch arrays have unexpected shapes")
    if faces.shape != (5062, 3):
        raise AssertionError("correspondence face array has unexpected shape")
    if full_down["jacket_points"].shape != (5272, 3):
        raise AssertionError("full-down jacket surface has unexpected native shape")

    bpy.ops.wm.open_mainfile(filepath=str(GATED_BLEND))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    coat = bpy.data.objects["Structured armhole jacket"]
    original_body_hash = data_snapshot(body)
    original_top_hash = data_snapshot(top)
    original_skeleton_hash = bones_snapshot(rig)
    original_object_names = {obj.name for obj in bpy.data.objects}
    original_default_action = rig.animation_data.action if rig.animation_data else None
    original_default_action_name = (
        original_default_action.name if original_default_action else None
    )
    original_action_name = scene.get("riggedJacketOriginalLoweringAction")
    if not isinstance(original_action_name, str):
        raise TypeError("gated blend is missing its original lowering action name")
    original_action = bpy.data.actions.get(original_action_name)
    if original_action is None:
        raise AssertionError(f"missing original lowering action {original_action_name}")
    solidifies = [
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    ]
    if len(solidifies) != 1:
        raise AssertionError(
            f"expected one jacket Solidify modifier, got {len(solidifies)}"
        )
    solidify = solidifies[0]
    if not solidify.show_viewport:
        raise AssertionError("jacket Solidify modifier is not live")
    if not (
        abs(solidify.thickness - 0.001) < 1e-8
        and abs(solidify.offset) < 1e-8
        and not solidify.use_even_offset
        and not solidify.use_quality_normals
    ):
        raise AssertionError("jacket Solidify configuration is not native 1 mm offset0")

    rig.animation_data.action = original_action
    scene.frame_set(1)
    update()
    body_points, body_faces = geometry(body)
    top_points, top_faces = geometry(top)
    jacket_native_points, jacket_native_faces = geometry(coat)
    for name, actual, expected in (
        ("body", body_points, full_down["body_points"]),
        ("shirt", top_points, full_down["shirt_points"]),
        ("jacket", jacket_native_points, full_down["jacket_points"]),
    ):
        actual_array = array_vectors(actual)
        if (
            actual_array.shape != expected.shape
            or np.max(np.abs(actual_array - expected)) > 3e-6
        ):
            raise AssertionError(
                f"full-down artifact does not match gated native {name} geometry"
            )
    if not np.array_equal(np.asarray(body_faces), full_down["body_faces"]):
        raise AssertionError("full-down body faces differ from gated native geometry")
    if not np.array_equal(np.asarray(top_faces), full_down["shirt_faces"]):
        raise AssertionError("full-down shirt faces differ from gated native geometry")
    if not np.array_equal(np.asarray(jacket_native_faces), full_down["jacket_faces"]):
        raise AssertionError("full-down jacket faces differ from gated native geometry")

    jacket_base_count = len(coat.data.vertices)
    if jacket_base_count != len(patch_down):
        raise AssertionError(
            "gated jacket base count does not match body correspondence"
        )
    previous_solidify_state = solidify.show_viewport
    solidify.show_viewport = False
    update()
    old_midsurface, old_midsurface_faces = geometry(coat)
    solidify.show_viewport = previous_solidify_state
    update()
    if len(old_midsurface) != jacket_base_count or not np.array_equal(
        np.asarray(old_midsurface_faces), faces
    ):
        raise AssertionError(
            "original jacket midsurface topology differs from fixed target faces"
        )

    top_vertex_count = len(top_points)
    shirt_mapping, outer_faces = verify_shirt_pairing(top_faces, top_vertex_count)
    top_tree = BVHTree.FromPolygons(top_points, outer_faces, all_triangles=True)
    body_tree = BVHTree.FromPolygons(body_points, body_faces, all_triangles=True)
    topology = topology_metrics(vectors(patch_down), [tuple(face) for face in faces])

    raw_points = vectors(patch_down)
    raw_normals = vectors(body_normals_down)
    if any(abs(normal.length - 1.0) > 2e-6 for normal in raw_normals):
        raise AssertionError("body correspondence normals are not unit length")
    warped_points, jacobians, phi_sums = armpit_warp(raw_points)
    conservative_jzz_bound = 1.0 - 2.0 * 0.030 / 0.045 * math.exp(-0.5)
    minimum_jzz = min(jacobian[2] for jacobian in jacobians)
    if minimum_jzz <= 0.0:
        raise AssertionError(f"warp Jzz is not positive: {minimum_jzz}")
    warped_normals = transform_normals(raw_normals, jacobians)
    control_a = [
        point + normal * 0.0015 for point, normal in zip(raw_points, raw_normals)
    ]
    control_b = [
        point + normal * 0.0015 for point, normal in zip(warped_points, warped_normals)
    ]
    control_c_pre_projection, projected_ids, maximum_projection_shift = shirt_clearance(
        control_b, top_tree
    )
    source_x = patch_t[:, 0]
    if args.round_underarm:
        neighbors = fixed_vertex_adjacency(faces, len(raw_points))
        pinned_ids = [
            index for index, x in enumerate(source_x) if abs(float(x)) >= 0.729
        ]
        rounded_pre_cuff, rounded_surface, rounded_normals, rounded_offsets = (
            rounded_target(
                warped_points,
                jacobians,
                phi_sums,
                raw_normals,
                [tuple(face) for face in faces],
                neighbors,
                pinned_ids,
            )
        )
        control_d = cuff_preservation(rounded_pre_cuff, old_midsurface, source_x)
        control_e_pre_projection, projected_ids, maximum_projection_shift = (
            shirt_clearance(rounded_pre_cuff, top_tree, desired_clearance=0.004)
        )
        control_e = cuff_preservation(
            control_e_pre_projection, old_midsurface, source_x
        )
        controls = {
            "D_rounded_underarm": control_d,
            "E_rounded_underarm_shirt_projection": control_e,
        }
        round_info = {
            "laplacian_steps": 10,
            "laplacian_factor": 0.25,
            "pinned_vertex_count": len(pinned_ids),
            "rounded_surface_bounds": bounds(rounded_surface),
            "rounded_normal_bounds": bounds(rounded_normals),
            "offset_range_m": [min(rounded_offsets), max(rounded_offsets)],
            "projection": {
                "one_pass": True,
                "desired_signed_clearance_m": 0.004,
                "affected_vertex_count": len(projected_ids),
                "affected_vertex_ids": projected_ids,
                "maximum_shift_m": maximum_projection_shift,
            },
        }
        layering_by_control = {
            "D_rounded_underarm": {
                "before_projection": shirt_layering_violations(control_d, top_tree),
                "after_projection": shirt_layering_violations(control_d, top_tree),
            },
            "E_rounded_underarm_shirt_projection": {
                "before_projection": shirt_layering_violations(control_d, top_tree),
                "after_projection": shirt_layering_violations(control_e, top_tree),
            },
        }
    else:
        controls = {
            "A_raw_body_original_normals": cuff_preservation(
                control_a, old_midsurface, source_x
            ),
            "B_warped_body_transformed_normals": cuff_preservation(
                control_b, old_midsurface, source_x
            ),
            "C_warped_body_shirt_projection": cuff_preservation(
                control_c_pre_projection, old_midsurface, source_x
            ),
        }
        round_info = None
        layering_by_control = {}
    reports = {}
    for label, points in controls.items():
        reports[label] = evaluate_control(
            label,
            points,
            [tuple(face) for face in faces],
            old_midsurface,
            source_x,
            body_points,
            body_faces,
            top_points,
            top_faces,
            body_tree,
            top_tree,
            topology,
            scene,
            layering=layering_by_control.get(label),
        )

    if args.round_underarm:
        np.savez_compressed(
            candidate_npz,
            control_d_points=array_vectors(controls["D_rounded_underarm"]).astype(
                np.float32
            ),
            control_e_points=array_vectors(
                controls["E_rounded_underarm_shirt_projection"]
            ).astype(np.float32),
            faces=faces,
        )
    else:
        np.savez_compressed(
            candidate_npz,
            control_a_points=array_vectors(
                controls["A_raw_body_original_normals"]
            ).astype(np.float32),
            control_b_points=array_vectors(
                controls["B_warped_body_transformed_normals"]
            ).astype(np.float32),
            control_c_points=array_vectors(
                controls["C_warped_body_shirt_projection"]
            ).astype(np.float32),
            faces=faces,
        )
    gated_hash_after = hashlib.sha256(GATED_BLEND.read_bytes()).hexdigest()
    body_hash_after = data_snapshot(body)
    top_hash_after = data_snapshot(top)
    skeleton_hash_after = bones_snapshot(rig)
    solidify.show_viewport = previous_solidify_state
    rig.animation_data.action = original_default_action
    scene.frame_set(1)
    update()
    if gated_hash_before != gated_hash_after:
        raise AssertionError(
            "gated blend hash changed during read-only target extraction"
        )
    if (body_hash_after, top_hash_after, skeleton_hash_after) != (
        original_body_hash,
        original_top_hash,
        original_skeleton_hash,
    ):
        raise AssertionError(
            "body, top, or rest skeleton changed during target extraction"
        )
    if {obj.name for obj in bpy.data.objects} != original_object_names:
        raise AssertionError("temporary target object was not fully removed")

    accepted = all(report["accepted"] for report in reports.values())
    metadata = {
        "scope": __doc__,
        "blender_version": bpy.app.version_string,
        "gated_blend": str(GATED_BLEND),
        "gated_blend_sha256_before": gated_hash_before,
        "gated_blend_sha256_after": gated_hash_after,
        "body_hash_before": original_body_hash,
        "body_hash_after": body_hash_after,
        "top_hash_before": original_top_hash,
        "top_hash_after": top_hash_after,
        "rest_skeleton_hash_before": original_skeleton_hash,
        "rest_skeleton_hash_after": skeleton_hash_after,
        "original_lowering_action": original_action_name,
        "default_action_restored": original_default_action_name,
        "frame": 1,
        "correspondence_npz": str(CORRESPONDENCE),
        "full_down_surfaces_npz": str(FULL_DOWN),
        "fixed_topology": topology,
        "jacket_native_configuration": {
            "base_vertices": jacket_base_count,
            "native_vertices": len(jacket_native_points),
            "thickness_m": solidify.thickness,
            "offset": solidify.offset,
            "use_even_offset": solidify.use_even_offset,
            "use_quality_normals": solidify.use_quality_normals,
            "use_rim": solidify.use_rim,
        },
        "shirt_outer_mapping": {
            "native_vertices": top_vertex_count,
            **shirt_mapping,
            "outer_triangles_all_indices_below_base_count": True,
        },
        "warp": {
            "centers": [[-0.1495, -0.012, 1.367], [0.1495, -0.012, 1.367]],
            "sigma_m": [0.025, 0.045, 0.045],
            "vertical_amplitude_m": 0.030,
            "minimum_sampled_jzz": minimum_jzz,
            "conservative_jzz_bound": conservative_jzz_bound,
            "conservative_bound_positive": conservative_jzz_bound > 0.0,
            "maximum_phi_sum": max(phi_sums),
            "maximum_downward_shift_m": 0.030 * max(phi_sums),
            "normal_transform": "J^-T then normalize",
        },
        "round_underarm_mode": args.round_underarm,
        "rounding": round_info,
        "shirt_projection": {
            "one_pass": True,
            "threshold_m": 0.020,
            "target_signed_m": 0.0015,
            "near_normal_ratio": 0.8,
            "affected_vertex_count": len(projected_ids),
            "affected_vertex_ids": projected_ids,
            "maximum_shift_m": maximum_projection_shift,
        },
        "cuff_preservation": {
            "source": "gated original jacket midsurface with Solidify temporarily disabled",
            "exact_for_abs_x_at_least_m": 0.729,
            "smooth_transition_range_m": [0.709, 0.729],
            "smoothstep": True,
        },
        "controls": reports,
        "accepted": accepted,
        "acceptance_rule": "all native self/body/top and midsurface self crossings clear, with no offset reversal",
        "output_sha256": hashlib.sha256(candidate_npz.read_bytes()).hexdigest(),
    }
    candidate_json.write_text(json.dumps(metadata, indent=2) + "\n")
    print(
        "LOWERED_TARGET_RESULT",
        json.dumps(
            {
                "accepted": accepted,
                "output_npz": str(candidate_npz),
                "controls": {
                    key: value["native_counts"] for key, value in reports.items()
                },
            },
            sort_keys=True,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
