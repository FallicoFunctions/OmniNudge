"""Clip a tapered jacket opening and transfer native corrective shapes.

This builder records construction and preservation checks. Run the separate
saved-model motion audit before accepting the generated garment.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import gate_rigged_jacket_correctives as gate
from validate_body05_tops import geometry

SOURCE = (
    SCRIPTS.parents[1]
    / "assets-src/avatars/launch-body-proof/rigged-jacket-lowering-study/male-rigged-jacket-lowering.blend"
)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def update():
    bpy.context.view_layer.update()


def frame(scene, value):
    integer = int(value)
    scene.frame_set(integer, subframe=float(value - integer))
    update()


def points_array(points):
    return np.asarray([tuple(point) for point in points], dtype=np.float64)


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


def edge_width(z):
    return 0.046 + 0.034 * min(max((1.505 - z) / 0.49, 0.0), 1.0)


def build_clipped_topology(t_points, source_faces):
    """Clip only wholly negative-Y source triangles against the symmetric opening."""
    distances = np.abs(t_points[:, 0]) - np.asarray(
        [edge_width(value) for value in t_points[:, 2]]
    )
    output_sources = []
    original_output = {}
    edge_output = {}
    output_faces = []
    source_face_ids = []

    def original(vertex_id):
        if vertex_id not in original_output:
            original_output[vertex_id] = len(output_sources)
            output_sources.append(("original", int(vertex_id), -1, -1, 0.0))
        return original_output[vertex_id]

    def intersection(a, b):
        key = tuple(sorted((int(a), int(b))))
        if key not in edge_output:
            # Keep endpoints in canonical ID order, and keep t in that order.
            # This makes every generated point independently reproducible.
            a, b = key
            da, db = distances[a], distances[b]
            if (da >= 0.0) == (db >= 0.0):
                raise AssertionError("intersection requested on an uncut edge")
            t = float(da / (da - db))
            edge_output[key] = len(output_sources)
            output_sources.append(("edge", -1, a, b, t))
        return edge_output[key]

    for face_id, face in enumerate(source_faces):
        source = [int(value) for value in face]
        if not all(t_points[value, 1] < 0.0 for value in source):
            polygon = [original(value) for value in source]
        else:
            polygon = []
            for previous, current in zip(source[-1:] + source[:-1], source):
                previous_inside = distances[previous] >= 0.0
                current_inside = distances[current] >= 0.0
                if current_inside and not previous_inside:
                    polygon.append(intersection(previous, current))
                if current_inside:
                    polygon.append(original(current))
                elif previous_inside:
                    polygon.append(intersection(previous, current))
        if len(polygon) < 3:
            continue
        for index in range(1, len(polygon) - 1):
            triangle = (polygon[0], polygon[index], polygon[index + 1])
            if len(set(triangle)) != 3:
                raise AssertionError("clipping produced a degenerate triangle")
            output_faces.append(triangle)
            source_face_ids.append(face_id)
    if not output_faces:
        raise AssertionError("front clipping removed every jacket triangle")
    return (
        output_sources,
        np.asarray(output_faces, dtype=np.int32),
        np.asarray(source_face_ids, dtype=np.int32),
        distances,
    )


def source_point(key, record):
    kind, original_id, edge_a, edge_b, edge_t = record
    if kind == "original":
        return np.asarray(key.data[original_id].co[:], dtype=np.float32)
    return (1.0 - edge_t) * np.asarray(
        key.data[edge_a].co[:], dtype=np.float32
    ) + edge_t * np.asarray(key.data[edge_b].co[:], dtype=np.float32)


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


def transfer_mesh_and_keys(
    coat, t_points, source_faces, sources, output_faces, source_face_ids
):
    old_mesh = coat.data
    old_keys = old_mesh.shape_keys
    old_drivers = (
        list(old_keys.animation_data.drivers) if old_keys.animation_data else []
    )
    old_metadata = shape_metadata(old_keys)
    material_indices = [polygon.material_index for polygon in old_mesh.polygons]
    smooth_faces = [polygon.use_smooth for polygon in old_mesh.polygons]
    sharp_edges = {
        tuple(sorted(edge.vertices[:]))
        for edge in old_mesh.edges
        if edge.use_edge_sharp
    }
    new_mesh = bpy.data.meshes.new("Structured armhole jacket open-front mesh")
    basis_points = np.asarray(
        [source_point(old_keys.key_blocks[0], record) for record in sources],
        dtype=np.float32,
    )
    new_mesh.from_pydata(basis_points.tolist(), [], output_faces.tolist())
    new_mesh.update()
    for material in old_mesh.materials:
        new_mesh.materials.append(material)
    for polygon, source_face_id in zip(new_mesh.polygons, source_face_ids):
        polygon.material_index = material_indices[int(source_face_id)]
        polygon.use_smooth = smooth_faces[int(source_face_id)]
    # Preserve explicit sharpness for edges that still correspond to a source edge.
    source_ids = [record[1] if record[0] == "original" else None for record in sources]
    for edge in new_mesh.edges:
        source_edge = tuple(
            sorted(
                source_ids[index]
                for index in edge.vertices
                if source_ids[index] is not None
            )
        )
        if len(source_edge) == 2 and source_edge in sharp_edges:
            edge.use_edge_sharp = True
    tailor = new_mesh.attributes.new("TailorRest", "FLOAT_VECTOR", "POINT")
    for index, record in enumerate(sources):
        tailor.data[index].vector = source_point_data(t_points, record)
    coat.data = new_mesh
    for metadata, old_key in zip(old_metadata["blocks"], old_keys.key_blocks):
        key = coat.shape_key_add(name=metadata["name"], from_mix=False)
        key.data.foreach_set(
            "co",
            np.asarray(
                [source_point(old_key, record) for record in sources],
                dtype=np.float32,
            ).ravel(),
        )
        key.slider_min = metadata["slider_min"]
        key.slider_max = metadata["slider_max"]
        key.mute = metadata["mute"]
        key.vertex_group = metadata["vertex_group"]
        key.interpolation = metadata["interpolation"]
    new_keys = coat.data.shape_keys
    new_keys.use_relative = old_metadata["use_relative"]
    new_keys.eval_time = old_metadata["eval_time"]
    for index, metadata in enumerate(old_metadata["blocks"]):
        relative = metadata["relative"]
        if relative:
            new_keys.key_blocks[index].relative_key = new_keys.key_blocks[relative]
    for curve in old_drivers:
        name = curve.data_path.split('key_blocks["', 1)[1].split('"]', 1)[0]
        destination = new_keys.key_blocks[name].driver_add("value")
        clone_driver(curve, destination)
    return old_mesh, old_keys, old_metadata


def source_point_data(t_points, record):
    kind, original_id, edge_a, edge_b, edge_t = record
    if kind == "original":
        return t_points[original_id]
    return (1.0 - edge_t) * t_points[edge_a] + edge_t * t_points[edge_b]


def transfer_weights(coat, old_groups, group_specs, sources):
    # Blender may discard object vertex groups when assigning a fresh mesh.
    # Recreate their exact names/settings before restoring all mapped weights.
    for spec in group_specs:
        group = coat.vertex_groups.get(spec["name"])
        if group is None:
            group = coat.vertex_groups.new(name=spec["name"])
        group.lock_weight = spec["lock_weight"]
    for new_id, record in enumerate(sources):
        kind, original_id, edge_a, edge_b, edge_t = record
        if kind == "original":
            weighted = old_groups[original_id]
        else:
            weighted = {}
            for vertex_id, scale in ((edge_a, 1.0 - edge_t), (edge_b, edge_t)):
                for name, value in old_groups[vertex_id].items():
                    weighted[name] = weighted.get(name, 0.0) + scale * value
        rows = sorted(
            ((name, value) for name, value in weighted.items() if value > 1e-8),
            key=lambda item: -item[1],
        )[:4]
        total = sum(value for _, value in rows)
        if total <= 1e-8:
            raise AssertionError("new front vertex is unweighted")
        for name, value in rows:
            coat.vertex_groups[name].add([new_id], value / total, "REPLACE")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        raise FileExistsError(OUTPUT)
    source_hash = digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    coat = bpy.data.objects["Structured armhole jacket"]
    body = bpy.data.objects["AvatarBody"]
    shirt = bpy.data.objects["AvatarTop_tailored"]
    solidify = next(
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    )
    preserved = {
        "body": gate.body_snapshot(body),
        "shirt": gate.body_snapshot(shirt),
        "skeleton": gate.bones_snapshot(rig),
        "modifiers": gate.modifier_snapshot(coat),
        "actions": gate.action_snapshot(),
    }
    old_keys = coat.data.shape_keys
    old_driver_rows = driver_snapshot(old_keys)
    old_metadata = shape_metadata(old_keys)
    original_action = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    rig.data.pose_position = "POSE"
    rig.animation_data.action = original_action
    frame(scene, 31.0)
    visible = solidify.show_viewport
    solidify.show_viewport = False
    update()
    t_points, t_faces = geometry(coat)
    solidify.show_viewport = visible
    update()
    t_points = points_array(t_points)
    source_faces = np.asarray(
        [tuple(face.vertices) for face in coat.data.polygons], dtype=np.int32
    )
    if not np.array_equal(np.asarray(t_faces, dtype=np.int32), source_faces):
        raise AssertionError("T evaluated topology differs from source jacket topology")
    sources, output_faces, source_face_ids, distances = build_clipped_topology(
        t_points, source_faces
    )
    group_specs = [
        {"name": group.name, "lock_weight": group.lock_weight}
        for group in coat.vertex_groups
    ]
    old_groups = [
        {
            coat.vertex_groups[group.group].name: float(group.weight)
            for group in vertex.groups
        }
        for vertex in coat.data.vertices
    ]
    transfer_mesh_and_keys(
        coat, t_points, source_faces, sources, output_faces, source_face_ids
    )
    transfer_weights(coat, old_groups, group_specs, sources)
    new_keys = coat.data.shape_keys
    if (
        shape_metadata(new_keys) != old_metadata
        or driver_snapshot(new_keys) != old_driver_rows
    ):
        raise AssertionError(
            "shape-key metadata or native drivers did not transfer exactly"
        )
    for output_id, record in enumerate(sources):
        if record[0] == "original":
            for old_key, new_key in zip(old_keys.key_blocks, new_keys.key_blocks):
                if tuple(old_key.data[record[1]].co) != tuple(
                    new_key.data[output_id].co
                ):
                    raise AssertionError("retained source key coordinate changed")
    if gate.modifier_snapshot(coat) != preserved["modifiers"]:
        raise AssertionError("jacket modifiers changed")
    scene.frame_start = 1
    scene.frame_end = 31
    rig.animation_data.action = original_action
    frame(scene, 1.0)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    output_hash = digest(OUTPUT)
    bpy.ops.wm.open_mainfile(filepath=str(OUTPUT))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    coat = bpy.data.objects["Structured armhole jacket"]
    body = bpy.data.objects["AvatarBody"]
    shirt = bpy.data.objects["AvatarTop_tailored"]
    solidify = next(
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    )
    if (
        gate.body_snapshot(body) != preserved["body"]
        or gate.body_snapshot(shirt) != preserved["shirt"]
        or gate.bones_snapshot(rig) != preserved["skeleton"]
        or gate.action_snapshot() != preserved["actions"]
        or gate.modifier_snapshot(coat) != preserved["modifiers"]
    ):
        raise AssertionError(
            "saved open-front study changed preserved non-jacket source data"
        )
    source_hash_after = digest(SOURCE)
    if source_hash_after != source_hash:
        raise AssertionError("durable source changed")
    new_ids = np.asarray(
        [index for index, row in enumerate(sources) if row[0] == "edge"], dtype=np.int32
    )
    np.savez_compressed(
        MAPPING,
        output_faces=output_faces,
        source_face_ids=source_face_ids,
        source_kind=np.asarray(
            [0 if row[0] == "original" else 1 for row in sources], dtype=np.int8
        ),
        original_vertex_ids=np.asarray([row[1] for row in sources], dtype=np.int32),
        new_vertex_output_ids=new_ids,
        new_vertex_edge_a=np.asarray(
            [sources[index][2] for index in new_ids], dtype=np.int32
        ),
        new_vertex_edge_b=np.asarray(
            [sources[index][3] for index in new_ids], dtype=np.int32
        ),
        new_vertex_t=np.asarray(
            [sources[index][4] for index in new_ids], dtype=np.float64
        ),
        opening_distance=distances,
    )
    report = {
        "scope": __doc__,
        "source": str(SOURCE),
        "source_sha256_before": source_hash,
        "source_sha256_after": source_hash_after,
        "output": str(OUTPUT),
        "output_sha256": output_hash,
        "source_vertices": len(t_points),
        "source_faces": len(source_faces),
        "output_vertices": len(sources),
        "output_faces": len(output_faces),
        "new_intersection_vertices": len(new_ids),
        "removed_source_faces": len(source_faces) - len(set(source_face_ids)),
        "opening_rule": "d=abs(T.x)-(.046+.034*clamp((1.505-T.z)/.49,0,1)); only wholly negative-Y source triangles clipped",
        "preservation": {
            "source_driver_count": len(old_driver_rows),
            "shape_metadata_exact": True,
            "retained_key_coordinates_exact": True,
            "body_shirt_skeleton_actions_modifiers": True,
        },
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "OPEN_FRONT_RESULT",
        json.dumps(
            {
                "output": str(OUTPUT),
                "vertices": len(sources),
                "faces": len(output_faces),
                "new_vertices": len(new_ids),
                "built": True,
            },
            sort_keys=True,
        ),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--provenance", type=Path)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    SOURCE = args.input.resolve()
    OUTPUT = args.output.resolve()
    OUT = OUTPUT.parent
    REPORT = args.report or OUTPUT.with_suffix(".build.json")
    MAPPING = args.provenance or OUTPUT.with_suffix(".provenance.npz")
    assert SOURCE != OUTPUT
    main()
