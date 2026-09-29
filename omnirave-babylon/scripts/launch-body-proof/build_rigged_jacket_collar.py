"""Build and fit a three-ring standing collar on the preserved open-front jacket."""

import argparse
import hashlib
import json
import sys
from itertools import pairwise
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parents[2]
INPUT = None
OUTPUT = None
REPORT = None
PROVENANCE = None
NEGATIVE_CONTROL = None
SIDES = ("l", "r")
REVIEWS = (
    "Jacket review - elbow bend",
    "Jacket review - forward reach",
    "Jacket review - overhead reach",
)
EPS = 1e-6


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


sys.path.insert(0, str(SCRIPTS))
import build_lowered_jacket_target as H


def update():
    bpy.context.view_layer.update()


def sample(scene, value):
    whole = int(value)
    scene.frame_set(whole, subframe=float(value - whole))
    update()


def geometry(obj):
    return H.geometry(obj)


def points_array(points):
    return np.asarray([tuple(point) for point in points], dtype=np.float64)


def bounds(points):
    values = points_array(points)
    return {"min": values.min(axis=0).tolist(), "max": values.max(axis=0).tolist()}


def driver_snapshot(keys):
    rows = []
    for curve in keys.animation_data.drivers if keys.animation_data else ():
        driver = curve.driver
        rows.append(
            {
                "path": curve.data_path,
                "index": curve.array_index,
                "type": driver.type,
                "expression": driver.expression,
                "variables": [
                    {
                        "name": variable.name,
                        "type": variable.type,
                        "targets": [
                            {
                                "id_name": target.id.name if target.id else None,
                                "id_type": target.id_type,
                                "data_path": target.data_path,
                                "bone_target": target.bone_target,
                                "transform_type": target.transform_type,
                                "transform_space": target.transform_space,
                            }
                            for target in variable.targets
                        ],
                    }
                    for variable in driver.variables
                ],
            }
        )
    return rows


def shape_metadata(keys):
    return {
        "use_relative": keys.use_relative,
        "eval_time": keys.eval_time,
        "blocks": [
            {
                "name": key.name,
                "slider_min": key.slider_min,
                "slider_max": key.slider_max,
                "mute": key.mute,
                "vertex_group": key.vertex_group,
                "interpolation": key.interpolation,
                "relative": key.relative_key.name if key.relative_key else None,
            }
            for key in keys.key_blocks
        ],
    }


def clone_driver(source_curve, destination_curve):
    destination = destination_curve.driver
    source = source_curve.driver
    destination.type = source.type
    destination.expression = source.expression
    destination.use_self = source.use_self
    for variable in source.variables:
        copied = destination.variables.new()
        copied.name = variable.name
        copied.type = variable.type
        for target, source_target in zip(copied.targets, variable.targets):
            target.id = source_target.id
            target.id_type = source_target.id_type
            target.data_path = source_target.data_path
            target.bone_target = source_target.bone_target
            target.transform_type = source_target.transform_type
            target.transform_space = source_target.transform_space


def boundary_edges(mesh):
    edges = {}
    directions = {}
    for face in mesh.polygons:
        row = list(face.vertices)
        for a, b in zip(row, row[1:] + row[:1]):
            key = tuple(sorted((int(a), int(b))))
            edges.setdefault(key, []).append(face.index)
            directions.setdefault(key, []).append((int(a), int(b)))
    return edges, directions


def collar_chain(mesh, t_points):
    edge_faces, directions = boundary_edges(mesh)
    selected = [
        edge
        for edge, faces in edge_faces.items()
        if len(faces) == 1
        and all(t_points[v][2] > 1.499 and abs(t_points[v][0]) < 0.13 for v in edge)
    ]
    neighbors = {}
    for a, b in selected:
        neighbors.setdefault(a, []).append(b)
        neighbors.setdefault(b, []).append(a)
    if (
        not selected
        or len(selected) + 1 != len(neighbors)
        or sorted(map(len, neighbors.values())).count(1) != 2
        or any(len(row) not in (1, 2) for row in neighbors.values())
    ):
        raise AssertionError("T neck predicate did not select one open boundary chain")
    start = min(vertex for vertex, adjacent in neighbors.items() if len(adjacent) == 1)
    chain, previous, current = [start], None, start
    while True:
        options = [vertex for vertex in neighbors[current] if vertex != previous]
        if not options:
            break
        following = options[0]
        chain.append(following)
        previous, current = current, following
    if len(chain) != len(neighbors):
        raise AssertionError(
            "collar boundary chain traversal did not include every selected vertex"
        )
    first = tuple(sorted((chain[0], chain[1])))
    if directions[first][0] != (chain[0], chain[1]):
        chain.reverse()
    for a, b in pairwise(chain):
        if directions[tuple(sorted((a, b)))][0] != (a, b):
            raise AssertionError(
                "collar chain direction is not consistently opposite its source face direction"
            )
    return chain, edge_faces, directions


def deformation_linear(rig, coat, vertex):
    total = Matrix(((0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)))
    to_coat = coat.matrix_world.inverted() @ rig.matrix_world
    from_coat = rig.matrix_world.inverted() @ coat.matrix_world
    for assignment in vertex.groups:
        group = coat.vertex_groups[assignment.group]
        bone = rig.pose.bones.get(group.name)
        if bone is None:
            continue
        transform = (
            to_coat @ bone.matrix @ bone.bone.matrix_local.inverted() @ from_coat
        )
        total += assignment.weight * transform.to_3x3()
    if abs(total.determinant()) < 1e-10:
        raise AssertionError(
            f"collar source vertex {vertex.index} has a singular T LBS linear map"
        )
    return total


def cross2(a, b):
    return a.x * b.y - a.y * b.x


def radial_surface_radii(points, faces, z, center, direction):
    """All horizontal-section intersections ahead of center along a radial ray."""
    radii = []
    for face in faces:
        vertices = [points[index] for index in face]
        hits = []
        for first, second in zip(vertices, vertices[1:] + vertices[:1]):
            df, ds = first.z - z, second.z - z
            if abs(df) < 1e-8:
                hits.append(Vector((first.x, first.y)))
            if df * ds < 0.0:
                fraction = df / (df - ds)
                point = first + fraction * (second - first)
                hits.append(Vector((point.x, point.y)))
        unique = []
        for point in hits:
            if not any((point - other).length < 1e-7 for other in unique):
                unique.append(point)
        for first, second in pairwise(unique):
            edge = second - first
            denominator = cross2(direction, edge)
            if abs(denominator) < 1e-10:
                continue
            delta = first - center
            distance = cross2(delta, edge) / denominator
            edge_fraction = cross2(delta, direction) / denominator
            if distance >= 0.0 and -1e-7 <= edge_fraction <= 1.0 + 1e-7:
                radii.append(float(distance))
    return sorted(radii)


def required_radial_radius(
    body_points, body_faces, shirt_points, shirt_outer, z, direction
):
    center = Vector((0.0, 0.005))
    intersections = radial_surface_radii(body_points, body_faces, z, center, direction)
    intersections += radial_surface_radii(
        shirt_points, shirt_outer, z, center, direction
    )
    if not intersections:
        raise AssertionError("neck radial envelope ray did not meet body or shirt")
    return max(intersections) + 0.002


def dynamic_containment(native_points, body_points, body_faces):
    tree = BVHTree.FromPolygons(body_points, body_faces, all_triangles=True)
    direction = H.Vector((1.0, 0.371, 0.173)).normalized()
    counts = {"inside": 0, "outside": 0, "ambiguous": 0, "no_hit": 0}
    for point in native_points:
        counts[H.oriented_inside(point, tree, direction)] += 1
    return {"ray_direction": list(direction), "native_vertex_states": counts}


def midpoint(coat, solidify, base_count):
    previous = solidify.show_viewport
    solidify.show_viewport = False
    try:
        update()
        points, faces = geometry(coat)
        if len(points) != base_count:
            raise AssertionError("midsurface vertex count changed")
        return points, faces
    finally:
        solidify.show_viewport = previous
        update()


def native_record(coat, body, shirt, solidify, base_count):
    native, native_faces = geometry(coat)
    body_points, body_faces = geometry(body)
    shirt_points, shirt_faces = geometry(shirt)
    pairs = {
        "self": H.strict_pairs(native, native_faces),
        "body": H.between(native, native_faces, body_points, body_faces),
        "shirt": H.between(native, native_faces, shirt_points, shirt_faces),
    }
    mid, mid_faces = midpoint(coat, solidify, base_count)
    _, outer = H.verify_shirt_pairing(shirt_faces, len(shirt_points))
    result = {
        "native_counts": {name: len(rows) for name, rows in pairs.items()},
        "midsurface_self": len(H.strict_pairs(mid, mid_faces)),
        "offset_orientation": H.offset_orientation(
            native, native_faces, mid, mid_faces
        ),
        "containment": dynamic_containment(native, body_points, body_faces),
        "shirt_layering": H.shirt_layering_violations(
            mid, BVHTree.FromPolygons(shirt_points, outer, all_triangles=True)
        ),
        "native_bounds": bounds(native),
        "midsurface_bounds": bounds(mid),
    }
    result["native_counts"]["total"] = sum(result["native_counts"].values())
    return result


def failed(record):
    states = record["containment"]["native_vertex_states"]
    orientation = record["offset_orientation"]
    return bool(
        record["native_counts"]["total"]
        or record["midsurface_self"]
        or states["inside"]
        or states["ambiguous"]
        or record["shirt_layering"]["count"]
        or orientation["reversed_faces"]
        or orientation["minimum_midsurface_triangle_area_m2"] <= 1e-12
    )


def quick_audit(scene, rig, coat, body, shirt, solidify):
    base_count = len(coat.data.vertices)
    action = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    rows, failures = [], []
    rig.animation_data.action = action
    for label, value in (("T", 31.0), ("full_down", 1.0)):
        sample(scene, value)
        result = native_record(coat, body, shirt, solidify, base_count)
        row = {"scope": label, "frame": value, "record": result}
        rows.append(row)
        if failed(result):
            failures.append(row)
    for action_name in REVIEWS:
        rig.animation_data.action = bpy.data.actions[action_name]
        for label, value in (("start", 1.0), ("midpoint", 25.0), ("end", 49.0)):
            sample(scene, value)
            result = native_record(coat, body, shirt, solidify, base_count)
            row = {
                "scope": action_name,
                "sample": label,
                "frame": value,
                "record": result,
            }
            rows.append(row)
            if failed(result):
                failures.append(row)
    return {
        "samples": len(rows),
        "failed_samples": len(failures),
        "failure_rows": failures,
        "rows": rows,
        "accepted": not failures,
    }


def fit_crossing_constraints(
    scene, rig, coat, body, shirt, solidify, collar_first_face, radial_bind_dirs, chain
):
    """Bounded, plane-based radial fit over the eleven acceptance poses."""
    base_count = len(coat.data.vertices)
    keys = coat.data.shape_keys.key_blocks
    collar = coat.data.attributes["TailorCollar"]
    action = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    poses = [("T", action, 31.0), ("full_down", action, 1.0)] + [
        (name, bpy.data.actions[name], value)
        for name in REVIEWS
        for value in (1.0, 25.0, 49.0)
    ]
    totals = {vertex_id: 0.0 for vertex_id in radial_bind_dirs}
    logs = []
    for iteration in range(1, 7):
        proposed = {vertex_id: 0.0 for vertex_id in radial_bind_dirs}
        unsatisfied, constraints, collision_faces = (
            [],
            0,
            {"body": set(), "shirt": set()},
        )
        for label, pose_action, value in poses:
            rig.animation_data.action = pose_action
            sample(scene, value)
            native, native_faces = geometry(coat)
            body_points, body_faces = geometry(body)
            shirt_points, shirt_faces = geometry(shirt)
            mid, mid_faces = midpoint(coat, solidify, base_count)
            _, shirt_outer = H.verify_shirt_pairing(shirt_faces, len(shirt_points))
            target_trees = {
                "body": BVHTree.FromPolygons(
                    body_points, body_faces, all_triangles=True
                ),
                "shirt": BVHTree.FromPolygons(
                    shirt_points, shirt_outer, all_triangles=True
                ),
            }
            pair_sets = {
                "body": H.between(native, native_faces, body_points, body_faces),
                "shirt": H.between(native, native_faces, shirt_points, shirt_faces),
            }
            for target_name, pairs in pair_sets.items():
                faces = set()
                for coat_face_id, _ in pairs:
                    if coat_face_id < 2 * len(mid_faces):
                        raw_face_id = coat_face_id % len(mid_faces)
                        if collar.data[raw_face_id].value > 0.5:
                            faces.add(raw_face_id)
                collision_faces[target_name].update(faces)
                for raw_face_id in faces:
                    vertices = list(mid_faces[raw_face_id])
                    barycentrics = [
                        tuple(1.0 if index == slot else 0.0 for index in range(3))
                        for slot in range(3)
                    ]
                    barycentrics += [
                        (0.5, 0.5, 0.0),
                        (0.5, 0.0, 0.5),
                        (0.0, 0.5, 0.5),
                        (1.0 / 3.0,) * 3,
                    ]
                    for barycentric in barycentrics:
                        point = sum(
                            (
                                mid[vertices[index]] * barycentric[index]
                                for index in range(3)
                            ),
                            Vector((0.0, 0.0, 0.0)),
                        )
                        hit, normal, target_face_id, distance = target_trees[
                            target_name
                        ].find_nearest(point)
                        if hit is None or normal is None or distance is None:
                            continue
                        normal.normalize()
                        signed = (point - hit).dot(normal)
                        if signed >= 0.002:
                            continue
                        coefficients = []
                        for index, vertex_id in enumerate(vertices):
                            if (
                                vertex_id not in radial_bind_dirs
                                or barycentric[index] <= 0.0
                            ):
                                continue
                            direction = (
                                coat.matrix_world.to_3x3()
                                @ deformation_linear(
                                    rig, coat, coat.data.vertices[vertex_id]
                                )
                                @ radial_bind_dirs[vertex_id]
                            )
                            coefficient = barycentric[index] * normal.dot(direction)
                            if coefficient > 1e-8:
                                coefficients.append((vertex_id, coefficient))
                        denominator = sum(value for _, value in coefficients)
                        if denominator <= 1e-8:
                            unsatisfied.append(
                                {
                                    "pose": label,
                                    "frame": value,
                                    "target": target_name,
                                    "collar_face_id": raw_face_id,
                                    "target_face_id": int(target_face_id),
                                    "point": list(point),
                                    "normal": list(normal),
                                    "signed_distance_m": float(signed),
                                    "outward_coefficients": [],
                                }
                            )
                            continue
                        increment = (0.002 - signed) / denominator
                        constraints += 1
                        for vertex_id, _ in coefficients:
                            proposed[vertex_id] = max(proposed[vertex_id], increment)
        # Taper any local correction to adjacent angular columns on its ring.
        for ring_start in (
            min(radial_bind_dirs),
            min(radial_bind_dirs) + len(chain),
            min(radial_bind_dirs) + 2 * len(chain),
        ):
            raw = [proposed[ring_start + index] for index in range(len(chain))]
            for index, value in enumerate(raw):
                if value:
                    if index:
                        proposed[ring_start + index - 1] = max(
                            proposed[ring_start + index - 1], 0.5 * value
                        )
                    if index + 1 < len(raw):
                        proposed[ring_start + index + 1] = max(
                            proposed[ring_start + index + 1], 0.5 * value
                        )
        applied = {}
        for vertex_id, value in proposed.items():
            delta = min(max(0.0, value), 0.003, 0.010 - totals[vertex_id])
            if delta > 0.0:
                applied[vertex_id] = delta
                totals[vertex_id] += delta
                for key in keys:
                    key.data[vertex_id].co += radial_bind_dirs[vertex_id] * delta
        update()
        logs.append(
            {
                "pass": iteration,
                "constraints": constraints,
                "body_collar_faces": sorted(collision_faces["body"]),
                "shirt_collar_faces": sorted(collision_faces["shirt"]),
                "unsatisfied_planes": unsatisfied,
                "applied_vertex_deltas_m": {
                    str(key): value for key, value in applied.items()
                },
                "maximum_total_delta_m": max(totals.values(), default=0.0),
            }
        )
        if not applied:
            break
    return {
        "passes": logs,
        "total_radial_displacement_m": {
            str(key): value for key, value in totals.items() if value > 0.0
        },
        "maximum_total_delta_m": max(totals.values(), default=0.0),
    }


def collar_contact_diagnostics(
    coat, body, shirt, solidify, old_vertex_count, old_face_count
):
    """Measure the discarded taper candidate without writing it to disk."""
    native, native_faces = geometry(coat)
    body_points, body_faces = geometry(body)
    shirt_points, shirt_faces = geometry(shirt)
    mid, mid_faces = midpoint(coat, solidify, len(coat.data.vertices))
    collar = coat.data.attributes["TailorCollar"]
    body_pairs = H.between(native, native_faces, body_points, body_faces)
    shirt_pairs = H.between(native, native_faces, shirt_points, shirt_faces)

    def mapped(face_id):
        if face_id < 2 * len(mid_faces):
            base_face = face_id % len(mid_faces)
            return {
                "native_face_id": int(face_id),
                "base_face_id": int(base_face),
                "collar_face": bool(collar.data[base_face].value > 0.5),
            }
        return {
            "native_face_id": int(face_id),
            "base_face_id": None,
            "collar_face": False,
        }

    def contact_summary(pairs):
        rows = [mapped(pair[0]) for pair in pairs]
        return {
            "pairs": len(rows),
            "collar_pairs": sum(row["collar_face"] for row in rows),
            "old_pairs": sum(not row["collar_face"] for row in rows),
            "collar_base_face_ids": sorted(
                {row["base_face_id"] for row in rows if row["collar_face"]}
            ),
            "old_base_face_ids": sorted(
                {
                    row["base_face_id"]
                    for row in rows
                    if not row["collar_face"] and row["base_face_id"] is not None
                }
            ),
        }

    body_tree = BVHTree.FromPolygons(body_points, body_faces, all_triangles=True)
    _, shirt_outer = H.verify_shirt_pairing(shirt_faces, len(shirt_points))
    shirt_tree = BVHTree.FromPolygons(shirt_points, shirt_outer, all_triangles=True)
    involved_faces = set(contact_summary(body_pairs)["collar_base_face_ids"]) | set(
        contact_summary(shirt_pairs)["collar_base_face_ids"]
    )
    involved_vertices = sorted(
        {
            vertex
            for face_id in involved_faces
            for vertex in mid_faces[face_id]
            if vertex >= old_vertex_count
        }
    )
    rows = []
    for vertex_id in involved_vertices:
        point = mid[vertex_id]
        ring_size = (len(coat.data.vertices) - old_vertex_count) // 3
        ring = ("quarter", "mid", "top")[(vertex_id - old_vertex_count) // ring_size]
        row = {"vertex_id": int(vertex_id), "ring": ring, "point": list(point)}
        for name, tree in (("body", body_tree), ("shirt_outer", shirt_tree)):
            hit, normal, face_id, distance = tree.find_nearest(point)
            normal = normal.normalized() if normal else None
            row[name] = {
                "face_id": int(face_id) if face_id is not None else None,
                "point": list(hit) if hit else None,
                "normal": list(normal) if normal else None,
                "distance_m": float(distance) if distance is not None else None,
                "signed_distance_m": float((point - hit).dot(normal))
                if hit and normal
                else None,
            }
        rows.append(row)
    return {
        "body": contact_summary(body_pairs),
        "shirt": contact_summary(shirt_pairs),
        "involved_new_vertices": rows,
        "old_face_count": old_face_count,
    }


def main():
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        raise FileExistsError(OUTPUT)
    input_sha_before = digest(INPUT)
    bpy.ops.wm.open_mainfile(filepath=str(INPUT))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    coat = bpy.data.objects["Structured armhole jacket"]
    body = bpy.data.objects["AvatarBody"]
    shirt = bpy.data.objects["AvatarTop_tailored"]
    solidify = next(
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    )
    old_mesh = coat.data
    old_keys = old_mesh.shape_keys
    old_shape_metadata = shape_metadata(old_keys)
    old_drivers = driver_snapshot(old_keys)
    old_vertex_coordinates = np.asarray(
        [tuple(vertex.co) for vertex in old_mesh.vertices], dtype=np.float32
    )
    old_key_coordinates = np.asarray(
        [[tuple(point.co) for point in key.data] for key in old_keys.key_blocks],
        dtype=np.float32,
    )
    old_faces = [tuple(face.vertices) for face in old_mesh.polygons]
    old_material_indices = [face.material_index for face in old_mesh.polygons]
    old_smooth = [face.use_smooth for face in old_mesh.polygons]
    old_sharp = {
        tuple(sorted(edge.vertices[:]))
        for edge in old_mesh.edges
        if edge.use_edge_sharp
    }
    old_weights = [
        {
            coat.vertex_groups[group.group].name: float(group.weight)
            for group in vertex.groups
        }
        for vertex in old_mesh.vertices
    ]
    group_specs = [
        {"name": group.name, "lock_weight": group.lock_weight}
        for group in coat.vertex_groups
    ]
    old_tailor_rest = old_mesh.attributes.get("TailorRest")
    if (
        old_tailor_rest is None
        or old_tailor_rest.domain != "POINT"
        or old_tailor_rest.data_type != "FLOAT_VECTOR"
    ):
        raise AssertionError(
            "open-front TailorRest attribute is missing or has the wrong type"
        )
    old_tailor_rest = np.asarray(
        [tuple(value.vector) for value in old_tailor_rest.data], dtype=np.float32
    )
    action = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    rig.data.pose_position = "POSE"
    rig.animation_data.action = action
    sample(scene, 31.0)
    previous = solidify.show_viewport
    solidify.show_viewport = False
    update()
    t_points, t_faces = geometry(coat)
    solidify.show_viewport = previous
    update()
    t_points = points_array(t_points)
    if not np.array_equal(
        np.asarray(t_faces, dtype=np.int32), np.asarray(old_faces, dtype=np.int32)
    ):
        raise AssertionError(
            "T evaluated collar input topology differs from its raw mesh"
        )
    raw_chain, edge_faces, _directions = collar_chain(old_mesh, t_points)
    # The two terminal predicate segments are short, nearly vertical pieces of
    # the front-cut/zipper edge.  They are not part of the neck arc and would
    # make folded collar end strips when extruded upward.
    excluded_endpoint_segments = [
        (raw_chain[0], raw_chain[1]),
        (raw_chain[-2], raw_chain[-1]),
    ]
    first, last = sorted((raw_chain.index(1718), raw_chain.index(1388)))
    chain = raw_chain[first : last + 1]
    if len(chain) != 41 or {chain[0], chain[-1]} != {1718, 1388}:
        raise AssertionError(
            "unexpected neck arc after excluding zipper endpoint segments"
        )
    old_count = len(old_mesh.vertices)
    body_t, body_faces = geometry(body)
    shirt_t, shirt_faces = geometry(shirt)
    _, shirt_outer = H.verify_shirt_pairing(shirt_faces, len(shirt_t))
    ring_goals = {"quarter": [], "mid": [], "top": []}
    profile_rows = []
    for base_id in chain:
        base = t_points[base_id]
        direction = Vector((base[0], base[1] - 0.005))
        base_radius = direction.length
        direction.normalize()
        canonical_top = np.asarray(
            (0.88 * base[0], 0.005 + 0.88 * (base[1] - 0.005), 1.535), dtype=np.float64
        )
        canonical_mid = (base + canonical_top) * 0.5
        mid_radius = Vector((canonical_mid[0], canonical_mid[1] - 0.005)).length
        deltas = {}
        for fraction in (0.0625, 0.125, 0.25, 0.375, 0.5):
            z = float(base[2] + fraction * (canonical_mid[2] - base[2]))
            current_radius = base_radius + fraction * (mid_radius - base_radius)
            required = required_radial_radius(
                body_t, body_faces, shirt_t, shirt_outer, z, direction
            )
            deltas[fraction] = max(0.0, required - current_radius)
        quarter_delta = max(4.0 * deltas[0.0625], 2.0 * deltas[0.125], deltas[0.25])
        mid_delta = max(deltas[0.5], 2.0 * deltas[0.375] - quarter_delta)
        top_direction = direction
        top_radius = Vector((canonical_top[0], canonical_top[1] - 0.005)).length
        top_required = required_radial_radius(
            body_t,
            body_faces,
            shirt_t,
            shirt_outer,
            float(canonical_top[2]),
            top_direction,
        )
        top_delta = max(0.0, top_required - top_radius)
        # The middle-to-top strip is a real triangle band too.  Lift its top
        # radius only when its geometric midpoint needs additional clearance.
        mid_top_required = required_radial_radius(
            body_t,
            body_faces,
            shirt_t,
            shirt_outer,
            float((canonical_mid[2] + canonical_top[2]) * 0.5),
            direction,
        )
        top_delta = max(
            top_delta, 2.0 * mid_top_required - (mid_radius + mid_delta) - top_radius
        )

        def radial_goal(z, radius, direction=direction):
            return np.asarray(
                (direction.x * radius, 0.005 + direction.y * radius, z),
                dtype=np.float64,
            )

        ring_goals["quarter"].append(
            radial_goal(
                base[2] + 0.25 * (canonical_mid[2] - base[2]),
                base_radius + 0.25 * (mid_radius - base_radius) + quarter_delta,
            )
        )
        ring_goals["mid"].append(radial_goal(canonical_mid[2], mid_radius + mid_delta))
        ring_goals["top"].append(radial_goal(canonical_top[2], top_radius + top_delta))
        profile_rows.append(
            {
                "base_vertex_id": base_id,
                "direction_xy": [direction.x, direction.y],
                "base_radius_m": base_radius,
                "canonical_mid_radius_m": mid_radius,
                "canonical_top_radius_m": top_radius,
                "lower_profile_required_delta_m": {
                    str(key): value for key, value in deltas.items()
                },
                "quarter_delta_m": quarter_delta,
                "mid_delta_m": mid_delta,
                "top_required_delta_m": top_delta,
                "mid_top_required_radius_m": mid_top_required,
                "goals": {
                    name: value.tolist()
                    for name, value in (
                        ("quarter", ring_goals["quarter"][-1]),
                        ("mid", ring_goals["mid"][-1]),
                        ("top", ring_goals["top"][-1]),
                    )
                },
            }
        )
    offsets = []
    t_goal = []
    radial_bind_dirs = {}
    # Complete rings keep topology and provenance deterministic.
    for ring in ("quarter", "mid", "top"):
        for chain_index, (base_id, goal) in enumerate(zip(chain, ring_goals[ring])):
            world_offset = Vector(goal - t_points[base_id])
            local_offset = coat.matrix_world.to_3x3().inverted() @ world_offset
            t_linear = deformation_linear(rig, coat, old_mesh.vertices[base_id])
            bind_offset = t_linear.inverted() @ local_offset
            offsets.append((base_id, np.asarray(bind_offset, dtype=np.float32)))
            t_goal.append(np.asarray(goal, dtype=np.float32))
            output_id = old_count + len(offsets) - 1
            radial_world = Vector(
                (
                    profile_rows[chain_index]["direction_xy"][0],
                    profile_rows[chain_index]["direction_xy"][1],
                    0.0,
                )
            )
            radial_bind_dirs[output_id] = t_linear.inverted() @ (
                coat.matrix_world.to_3x3().inverted() @ radial_world
            )
    ring_midpoint_rows = []
    for index, base_id in enumerate(chain):
        direction = Vector(profile_rows[index]["direction_xy"])
        previous = t_points[base_id]
        for ring in ("quarter", "mid", "top"):
            current = ring_goals[ring][index]
            midpoint_goal = (previous + current) * 0.5
            midpoint_radius = Vector(
                (midpoint_goal[0], midpoint_goal[1] - 0.005)
            ).length
            required = required_radial_radius(
                body_t,
                body_faces,
                shirt_t,
                shirt_outer,
                float(midpoint_goal[2]),
                direction,
            )
            row = {
                "base_vertex_id": base_id,
                "strip_to_ring": ring,
                "z": float(midpoint_goal[2]),
                "radius_m": midpoint_radius,
                "required_radius_m": required,
                "margin_m": midpoint_radius - required,
            }
            ring_midpoint_rows.append(row)
            if row["margin_m"] < -1e-6:
                raise AssertionError(
                    f"collar midpoint envelope failed at base {base_id}, strip {ring}: {row['margin_m']}"
                )
            previous = current
    quarter_ids = list(range(old_count, old_count + len(chain)))
    mid_ids = list(range(old_count + len(chain), old_count + 2 * len(chain)))
    top_ids = list(range(old_count + 2 * len(chain), old_count + 3 * len(chain)))
    new_faces = []
    for index, (a, b) in enumerate(pairwise(chain)):
        qa, qb = quarter_ids[index], quarter_ids[index + 1]
        ma, mb, ta, tb = (
            mid_ids[index],
            mid_ids[index + 1],
            top_ids[index],
            top_ids[index + 1],
        )
        # Existing face direction is a->b. These triangles share b->a, so the
        # new collar is consistently opposite across its only shared boundary.
        new_faces.extend(
            (
                (b, a, qa),
                (b, qa, qb),
                (qb, qa, ma),
                (qb, ma, mb),
                (mb, ma, ta),
                (mb, ta, tb),
            )
        )
    new_mesh = bpy.data.meshes.new("Structured armhole jacket collar-front mesh")
    basis = np.asarray(
        [tuple(vertex.co) for vertex in old_mesh.vertices], dtype=np.float32
    )
    basis = np.concatenate(
        (
            basis,
            np.asarray(
                [basis[base_id] + offset for base_id, offset in offsets],
                dtype=np.float32,
            ),
        )
    )
    new_mesh.from_pydata(basis.tolist(), [], old_faces + new_faces)
    new_mesh.update()
    for material in old_mesh.materials:
        new_mesh.materials.append(material)
    for face_id, face in enumerate(new_mesh.polygons):
        if face_id < len(old_faces):
            face.material_index = old_material_indices[face_id]
            face.use_smooth = old_smooth[face_id]
        else:
            face.material_index = old_material_indices[
                edge_faces[tuple(sorted((chain[0], chain[1])))][0]
            ]
            face.use_smooth = True
    for edge in new_mesh.edges:
        source_ids = [vertex for vertex in edge.vertices if vertex < old_count]
        if len(source_ids) == 2 and tuple(sorted(source_ids)) in old_sharp:
            edge.use_edge_sharp = True
    tailor_rest = new_mesh.attributes.new("TailorRest", "FLOAT_VECTOR", "POINT")
    for index, value in enumerate(old_tailor_rest):
        tailor_rest.data[index].vector = value
    for index, value in enumerate(t_goal, start=old_count):
        tailor_rest.data[index].vector = value
    collar_attr = new_mesh.attributes.new("TailorCollar", "FLOAT", "FACE")
    for face_id, value in enumerate(collar_attr.data):
        value.value = 1.0 if face_id >= len(old_faces) else 0.0
    coat.data = new_mesh
    for spec in group_specs:
        group = coat.vertex_groups.get(spec["name"])
        if group is None:
            group = coat.vertex_groups.new(name=spec["name"])
        group.lock_weight = spec["lock_weight"]
    for vertex_id, row in enumerate(old_weights):
        for name, value in row.items():
            coat.vertex_groups[name].add([vertex_id], value, "REPLACE")
    for output_id, (base_id, _) in enumerate(offsets, start=old_count):
        for name, value in old_weights[base_id].items():
            coat.vertex_groups[name].add([output_id], value, "REPLACE")
    for metadata, old_key in zip(old_shape_metadata["blocks"], old_keys.key_blocks):
        key = coat.shape_key_add(name=metadata["name"], from_mix=False)
        values = np.asarray(
            [tuple(point.co) for point in old_key.data], dtype=np.float32
        )
        values = np.concatenate(
            (
                values,
                np.asarray(
                    [values[base_id] + offset for base_id, offset in offsets],
                    dtype=np.float32,
                ),
            )
        )
        key.data.foreach_set("co", values.ravel())
        key.slider_min = metadata["slider_min"]
        key.slider_max = metadata["slider_max"]
        key.mute = metadata["mute"]
        key.vertex_group = metadata["vertex_group"]
        key.interpolation = metadata["interpolation"]
    keys = coat.data.shape_keys
    keys.use_relative = old_shape_metadata["use_relative"]
    keys.eval_time = old_shape_metadata["eval_time"]
    for index, metadata in enumerate(old_shape_metadata["blocks"]):
        if metadata["relative"]:
            keys.key_blocks[index].relative_key = keys.key_blocks[metadata["relative"]]
    for curve in old_keys.animation_data.drivers if old_keys.animation_data else ():
        name = curve.data_path.split('key_blocks["', 1)[1].split('"]', 1)[0]
        clone_driver(curve, keys.key_blocks[name].driver_add("value"))
    if (
        shape_metadata(keys) != old_shape_metadata
        or driver_snapshot(keys) != old_drivers
    ):
        raise AssertionError("existing shape-key metadata or drivers changed")
    for vertex_id in range(old_count):
        if tuple(coat.data.vertices[vertex_id].co) != tuple(
            old_mesh.vertices[vertex_id].co
        ):
            raise AssertionError("existing mesh vertex changed")
        for old_key, new_key in zip(old_keys.key_blocks, keys.key_blocks):
            if tuple(old_key.data[vertex_id].co) != tuple(new_key.data[vertex_id].co):
                raise AssertionError("existing shape-key coordinate changed")
        new_row = {
            coat.vertex_groups[group.group].name: float(group.weight)
            for group in coat.data.vertices[vertex_id].groups
        }
        if new_row != old_weights[vertex_id]:
            raise AssertionError("existing vertex weights changed before save")
    if [
        tuple(face.vertices) for face in coat.data.polygons[: len(old_faces)]
    ] != old_faces:
        raise AssertionError("existing face topology changed")
    rig.animation_data.action = action
    sample(scene, 31.0)
    collar_t, _ = midpoint(coat, solidify, len(coat.data.vertices))
    collar_t = points_array(collar_t)
    t_error = max(
        float(np.linalg.norm(collar_t[index] - t_goal[index - old_count]))
        for index in range(old_count, len(collar_t))
    )
    if t_error > 5e-5:
        raise AssertionError(f"T LBS collar target error {t_error} exceeds 5e-5")
    constraint_fit = fit_crossing_constraints(
        scene, rig, coat, body, shirt, solidify, len(old_faces), radial_bind_dirs, chain
    )
    rig.animation_data.action = action
    sample(scene, 31.0)
    collar_t, _ = midpoint(coat, solidify, len(coat.data.vertices))
    collar_t = points_array(collar_t)
    for index in range(old_count, len(collar_t)):
        tailor_rest.data[index].vector = collar_t[index]
    update()
    t_error = max(
        float(
            np.linalg.norm(collar_t[index] - np.asarray(tailor_rest.data[index].vector))
        )
        for index in range(old_count, len(collar_t))
    )
    quick = quick_audit(scene, rig, coat, body, shirt, solidify)
    input_sha_after = digest(INPUT)
    if input_sha_after != input_sha_before:
        raise AssertionError("frozen open-front input changed")
    if not quick["accepted"]:
        rig.animation_data.action = action
        sample(scene, 31.0)
        t_detail = collar_contact_diagnostics(
            coat, body, shirt, solidify, old_count, len(old_faces)
        )
        sample(scene, 1.0)
        down_detail = collar_contact_diagnostics(
            coat, body, shirt, solidify, old_count, len(old_faces)
        )
        REPORT.write_text(
            json.dumps(
                {
                    "input": str(INPUT),
                    "input_sha256_before": input_sha_before,
                    "input_sha256_after": input_sha_after,
                    "chain": chain,
                    "excluded_endpoint_segments": excluded_endpoint_segments,
                    "excluded_reason": "near-vertical front-cut zipper endpoint segments",
                    "fit_profiles": profile_rows,
                    "ring_midpoint_envelope": ring_midpoint_rows,
                    "constraint_fit": constraint_fit,
                    "t_target_error": t_error,
                    "quick_audit": quick,
                    "t_contact_diagnostics": t_detail,
                    "down_contact_diagnostics": down_detail,
                    "output_written": False,
                },
                indent=2,
            )
            + "\n"
        )
        raise AssertionError("collar precheck failed; output was not saved")
    scene.frame_start = 1
    scene.frame_end = 31
    rig.animation_data.action = action
    sample(scene, 1.0)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    output_sha = digest(OUTPUT)
    final_bind_offsets = np.asarray(
        [
            tuple(keys.key_blocks[0].data[index].co - old_mesh.vertices[base_id].co)
            for index, (base_id, _) in enumerate(offsets, start=old_count)
        ],
        dtype=np.float32,
    )
    final_t_tailor_rest = np.asarray(
        [
            tuple(tailor_rest.data[index].vector)
            for index in range(old_count, len(coat.data.vertices))
        ],
        dtype=np.float32,
    )
    bpy.ops.wm.open_mainfile(filepath=str(OUTPUT))
    reopened_coat = bpy.data.objects["Structured armhole jacket"]
    reopened_keys = reopened_coat.data.shape_keys
    reopened_weights = [
        {
            reopened_coat.vertex_groups[group.group].name: float(group.weight)
            for group in vertex.groups
        }
        for vertex in reopened_coat.data.vertices[:old_count]
    ]
    weight_delta = max(
        (
            abs(row.get(name, 0.0) - old_weights[index].get(name, 0.0))
            for index, row in enumerate(reopened_weights)
            for name in set(row) | set(old_weights[index])
        ),
        default=0.0,
    )
    reopened_tailor_rest = reopened_coat.data.attributes.get("TailorRest")
    post_reopen = {
        "shape_metadata_exact": shape_metadata(reopened_keys) == old_shape_metadata,
        "drivers_exact": driver_snapshot(reopened_keys) == old_drivers,
        "existing_mesh_coordinates_exact": bool(
            np.array_equal(
                np.asarray(
                    [
                        tuple(vertex.co)
                        for vertex in reopened_coat.data.vertices[:old_count]
                    ],
                    dtype=np.float32,
                ),
                old_vertex_coordinates,
            )
        ),
        "existing_key_coordinates_exact": bool(
            np.array_equal(
                np.asarray(
                    [
                        [tuple(point.co) for point in key.data[:old_count]]
                        for key in reopened_keys.key_blocks
                    ],
                    dtype=np.float32,
                ),
                old_key_coordinates,
            )
        ),
        "existing_tailor_rest_exact": bool(
            reopened_tailor_rest
            and np.array_equal(
                np.asarray(
                    [
                        tuple(value.vector)
                        for value in reopened_tailor_rest.data[:old_count]
                    ],
                    dtype=np.float32,
                ),
                old_tailor_rest,
            )
        ),
        "maximum_existing_weight_delta": weight_delta,
    }
    if (
        not all(
            (
                post_reopen["shape_metadata_exact"],
                post_reopen["drivers_exact"],
                post_reopen["existing_mesh_coordinates_exact"],
                post_reopen["existing_key_coordinates_exact"],
                post_reopen["existing_tailor_rest_exact"],
            )
        )
        or weight_delta > 1e-7
    ):
        raise AssertionError(f"post-reopen preservation failed: {post_reopen}")
    if digest(INPUT) != input_sha_before:
        raise AssertionError("frozen open-front input changed after collar save")
    np.savez_compressed(
        PROVENANCE,
        base_chain_vertex_ids=np.asarray(chain, dtype=np.int32),
        new_vertex_ids=np.arange(old_count, old_count + len(offsets), dtype=np.int32),
        new_vertex_base_ids=np.asarray(
            [base_id for base_id, _ in offsets], dtype=np.int32
        ),
        new_vertex_ring=np.repeat(np.asarray((0, 1, 2), dtype=np.int8), len(chain)),
        initial_bind_offsets=np.asarray(
            [offset for _, offset in offsets], dtype=np.float32
        ),
        final_bind_offsets=final_bind_offsets,
        radial_bind_directions=np.asarray(
            [
                radial_bind_dirs[index]
                for index in range(old_count, old_count + len(offsets))
            ],
            dtype=np.float32,
        ),
        final_t_tailor_rest=final_t_tailor_rest,
    )
    negative = None
    if NEGATIVE_CONTROL:
        negative = {"path": str(NEGATIVE_CONTROL), "sha256": digest(NEGATIVE_CONTROL)}
    report = {
        "scope": __doc__,
        "input": str(INPUT),
        "input_sha256_before": input_sha_before,
        "input_sha256_after": input_sha_after,
        "output": str(OUTPUT),
        "output_sha256": output_sha,
        "provenance": str(PROVENANCE),
        "negative_control": negative,
        "base_chain_vertex_ids": chain,
        "excluded_endpoint_segments": excluded_endpoint_segments,
        "excluded_reason": "near-vertical front-cut zipper endpoint segments",
        "base_chain_vertices": len(chain),
        "base_chain_edges": len(chain) - 1,
        "new_vertices": len(offsets),
        "new_faces": len(new_faces),
        "fit_profiles": profile_rows,
        "ring_midpoint_envelope": ring_midpoint_rows,
        "constraint_fit": constraint_fit,
        "t_target_error": t_error,
        "quick_audit": quick,
        "post_reopen": post_reopen,
        "output_written": True,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "COLLAR_FRONT_RESULT",
        json.dumps(
            {
                "output": str(OUTPUT),
                "sha256": output_sha,
                "chain_vertices": len(chain),
                "new_vertices": len(offsets),
                "new_faces": len(new_faces),
                "t_target_error": t_error,
                "quick_failures": quick["failed_samples"],
            },
            sort_keys=True,
        ),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", type=Path, required=True, help="Frozen open-front Blender study"
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="New collar Blender study; must not exist",
    )
    parser.add_argument(
        "--report",
        type=Path,
        required=True,
        help="Precheck/provenance JSON destination",
    )
    parser.add_argument(
        "--provenance",
        type=Path,
        required=True,
        help="New collar bind/T-coordinate provenance NPZ",
    )
    parser.add_argument(
        "--negative-control",
        type=Path,
        help="Rejected three-ring fit evidence retained in the final report",
    )
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    INPUT, OUTPUT, REPORT, PROVENANCE, NEGATIVE_CONTROL = (
        args.input,
        args.output,
        args.report,
        args.provenance,
        args.negative_control,
    )
    main()
