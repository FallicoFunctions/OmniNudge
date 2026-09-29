"""Read-only preservation bridge for a UV/material-only jacket embroidery pass.

This audit intentionally inherits the accepted hardware 354-arm/36-neck motion
record: it proves the embroidery candidate did not alter any geometry or rigging.
It does not repeat collision sampling for a shader-only change.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A

SOURCE = (
    SCRIPTS.parents[1]
    / "assets-src/avatars/launch-body-proof/rigged-jacket-hardware-study/male-rigged-jacket-hardware.blend"
)
COAT = "Structured armhole jacket"
COAT_MATERIAL = "Tailored pearl bomber with gold knit trim"


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def h(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def vector(v):
    return [float(x) for x in v]


def attr_value(item):
    for name in ("vector", "color", "uv"):
        if hasattr(item, name):
            return vector(getattr(item, name))
    for name in ("value", "vertex_index", "edge_index", "material_index"):
        if hasattr(item, name):
            value = getattr(item, name)
            if isinstance(value, bool):
                return bool(value)
            if isinstance(value, (int, float, str)):
                return value
            try:
                return list(value)
            except TypeError:
                return repr(value)
    return repr(item)


def attributes(mesh):
    return {
        attr.name: {
            "domain": attr.domain,
            "data_type": attr.data_type,
            "length": len(attr.data),
            "sha256": h([attr_value(item) for item in attr.data]),
        }
        for attr in mesh.attributes
    }


def shape_array(mesh):
    keys = mesh.shape_keys
    if keys is None:
        return None
    return np.asarray(
        [[[p.co.x, p.co.y, p.co.z] for p in k.data] for k in keys.key_blocks],
        dtype=np.float32,
    )


def weights(obj):
    return [
        {obj.vertex_groups[g.group].name: float(g.weight) for g in vertex.groups}
        for vertex in obj.data.vertices
    ]


def mesh_core(obj):
    mesh = obj.data
    shape = shape_array(mesh)
    return {
        "coordinates_sha256": hashlib.sha256(
            np.asarray(
                [[v.co.x, v.co.y, v.co.z] for v in mesh.vertices], dtype=np.float32
            ).tobytes()
        ).hexdigest(),
        "topology_sha256": h(
            {
                "faces": [list(p.vertices) for p in mesh.polygons],
                "edges": [list(e.vertices) for e in mesh.edges],
                "smooth": [bool(p.use_smooth) for p in mesh.polygons],
            }
        ),
        "weights_sha256": h(weights(obj)),
        "shape_arrays_sha256": None
        if shape is None
        else hashlib.sha256(shape.tobytes()).hexdigest(),
        "shape_array_shape": None if shape is None else list(shape.shape),
        "materials": [m.name if m else None for m in mesh.materials],
        "attributes": attributes(mesh),
    }


def transform(obj):
    return {
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "parent_type": obj.parent_type,
        "parent_bone": obj.parent_bone,
        "matrix_local": [vector(row) for row in obj.matrix_local],
        "matrix_parent_inverse": [vector(row) for row in obj.matrix_parent_inverse],
        "modifiers": A.gate.modifier_snapshot(obj),
        "object_drivers": A.driver_snapshot(obj),
        "shape_metadata": A.shape_metadata(obj.data.shape_keys)
        if obj.type == "MESH" and obj.data.shape_keys
        else None,
        "shape_drivers": A.driver_snapshot(obj.data.shape_keys)
        if obj.type == "MESH" and obj.data.shape_keys
        else [],
    }


def static_snapshot():
    meshes = {
        obj.name: {"core": mesh_core(obj), "transform": transform(obj)}
        for obj in sorted(bpy.data.objects, key=lambda o: o.name)
        if obj.type == "MESH"
    }
    objects = {
        obj.name: transform(obj)
        for obj in sorted(bpy.data.objects, key=lambda o: o.name)
    }
    rig = bpy.data.objects["AvatarSkeleton"]
    return {
        "mesh_names": sorted(meshes),
        "meshes": meshes,
        "objects": objects,
        "skeleton": A.gate.bones_snapshot(rig),
        "actions": A.gate.action_snapshot(),
        "scene_drivers": A.driver_snapshot(bpy.context.scene),
        "materials": A.material_snapshot(),
    }


def material_map(rows):
    return {row["name"]: row for row in rows}


def no_displacement(material):
    if not material.use_nodes or not material.node_tree:
        return True
    return all(
        not node.inputs.get("Displacement") or not node.inputs["Displacement"].links
        for node in material.node_tree.nodes
        if node.type == "OUTPUT_MATERIAL"
    )


def read_contract(path):
    if path is None:
        return None
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise TypeError("embroidery provenance must be a JSON object")
    return value


def verify_extras(source_attrs, candidate_attrs, contract):
    extras = sorted(set(candidate_attrs) - set(source_attrs))
    if contract is None:
        if extras:
            raise AssertionError("new coat attributes require --provenance contract")
        return extras
    expected = contract.get("new_coat_attributes")
    if expected is None and isinstance(contract.get("uv"), dict):
        uv_info = contract["uv"]
        expected = [
            {
                "name": uv_info["uv_name"],
                "domain": "CORNER",
                "data_type": "FLOAT2",
                "length": 15264,
            },
            {
                "name": uv_info["region_attribute"],
                "domain": "FACE",
                "data_type": "FLOAT",
                "length": 5088,
            },
        ]
    if not isinstance(expected, list):
        raise TypeError("contract needs new_coat_attributes list or uv contract")
    expected_map = {row["name"]: row for row in expected}
    if extras != sorted(expected_map):
        raise AssertionError(
            f"new coat attrs {extras} != contract {sorted(expected_map)}"
        )
    for name, row in expected_map.items():
        actual = candidate_attrs[name]
        for key in ("domain", "data_type", "length"):
            if actual[key] != row[key]:
                raise AssertionError(f"coat attr {name} {key} differs from contract")
        if "sha256" in row and actual["sha256"] != row["sha256"]:
            raise AssertionError(f"coat attr {name} hash differs from contract")
    uv = contract.get("uv_layer_name") or (contract.get("uv") or {}).get("uv_name")
    if not isinstance(uv, str) or uv not in expected_map:
        raise AssertionError("contract UV layer must be one new coat attribute")
    if (
        expected_map[uv]["domain"] != "CORNER"
        or expected_map[uv]["data_type"] != "FLOAT2"
    ):
        raise AssertionError("embroidery UV must be CORNER/FLOAT2")
    return extras


def verify_uv_and_atlas(scene, rig, coat, contract):
    uv_info = contract.get("uv") if contract else None
    if not isinstance(uv_info, dict):
        raise TypeError("embroidery builder report requires uv contract")
    uv_name, region_name = uv_info["uv_name"], uv_info["region_attribute"]
    uv = coat.data.uv_layers.get(uv_name)
    region = coat.data.attributes.get(region_name)
    if (
        uv is None
        or region is None
        or region.domain != "FACE"
        or region.data_type != "FLOAT"
    ):
        raise AssertionError("missing expected embroidery UV/face region")
    previous_action, previous_frame = (
        rig.animation_data.action,
        scene.frame_current_final,
    )
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    whole = 31
    scene.frame_set(whole)
    bpy.context.view_layer.update()
    solid = next(modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY")
    points, _ = A.midpoint(coat, solid, len(coat.data.vertices))
    points = A.array(points)
    axis = np.asarray(rig.matrix_world @ rig.pose.bones["lowerarm_r"].head)
    along = (-points[:, 0] - 0.29) / 0.40
    angle = (
        np.arctan2(points[:, 2] - axis[2], -(points[:, 1] - axis[1])) / (2 * math.pi)
        + 0.5
    )
    selected = 0
    error = 0.0
    for polygon in coat.data.polygons:
        ids = np.asarray(polygon.vertices)
        enabled = bool(np.max(points[ids, 0]) < -0.255)
        if float(region.data[polygon.index].value) != float(enabled):
            raise AssertionError("embroidery region differs from T sleeve contract")
        selected += int(enabled)
        values = angle[ids].copy()
        if values.max() - values.min() > 0.5:
            values[values < 0.5] += 1
        for j, loop in enumerate(polygon.loop_indices):
            expected = np.array((along[ids[j]], values[j]) if enabled else (-1.0, -1.0))
            error = max(
                error, float(np.max(np.abs(np.asarray(uv.data[loop].uv) - expected)))
            )
    rig.animation_data.action = previous_action
    whole = int(previous_frame)
    scene.frame_set(whole, subframe=previous_frame - whole)
    bpy.context.view_layer.update()
    if selected != int(uv_info["region_faces"]) or error > 2e-6:
        raise AssertionError(
            f"UV/region contract failed: faces={selected}, error={error}"
        )
    mat = coat.data.materials[0]
    image_nodes = [
        n
        for n in mat.node_tree.nodes
        if n.type == "TEX_IMAGE"
        and n.image
        and n.image.name == "Right sleeve gold embroidery"
    ]
    if (
        len(image_nodes) != 1
        or image_nodes[0].interpolation != "Linear"
        or image_nodes[0].extension != "CLIP"
    ):
        raise AssertionError("missing named packed embroidery atlas node")
    image = image_nodes[0].image
    if (
        not image.packed_file
        or image.colorspace_settings.name != "Non-Color"
        or tuple(image.size) != tuple(contract["texture"]["resolution"])
    ):
        raise AssertionError("atlas is not packed Non-Color expected resolution")
    if (
        hashlib.sha256(bytes(image.packed_file.data)).hexdigest()
        != contract["texture_sha256"]
    ):
        raise AssertionError("packed atlas hash differs from contract")
    uv_nodes = [
        n for n in mat.node_tree.nodes if n.type == "UVMAP" and n.uv_map == uv_name
    ]
    if len(uv_nodes) != 1 or not any(
        link.from_node == uv_nodes[0] and link.to_node == image_nodes[0]
        for link in mat.node_tree.links
    ):
        raise AssertionError("named UV layer is not connected to atlas")
    return {
        "uv_layer": uv_name,
        "region_attribute": region_name,
        "region_faces": selected,
        "maximum_uv_error": error,
        "atlas": image.name,
        "packed_sha256": contract["texture_sha256"],
    }


def inherited_hardware_record(source, source_hash):
    path = source.parent / "hardware-audit.json"
    if not path.exists():
        raise AssertionError(f"no inherited hardware audit beside source: {path}")
    record = json.loads(path.read_text())
    if not (record.get("accepted") and record.get("model_sha256") == source_hash):
        raise AssertionError(
            "inherited hardware audit is not accepted for this exact source"
        )
    if (
        record.get("accepted_arm_samples") != 354
        or record.get("accepted_neck_samples") != 36
    ):
        raise AssertionError(
            "inherited hardware audit lacks required 354+36 finite scope"
        )
    return {
        "path": str(path),
        "sha256": digest(path),
        "arm_samples": 354,
        "neck_samples": 36,
    }


def main(args):
    source_hash, input_hash = digest(args.source), digest(args.input)
    inherited = inherited_hardware_record(args.source, source_hash)
    contract = read_contract(args.provenance)
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    source = static_snapshot()
    if COAT not in source["meshes"] or source["meshes"][COAT]["core"]["materials"] != [
        COAT_MATERIAL
    ]:
        raise AssertionError("unexpected embroidery source coat/material")
    source_materials = material_map(source["materials"])
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    candidate = static_snapshot()
    if candidate["mesh_names"] != source["mesh_names"] or set(
        candidate["objects"]
    ) != set(source["objects"]):
        raise AssertionError("mesh/object set changed")
    if (
        candidate["skeleton"] != source["skeleton"]
        or candidate["actions"] != source["actions"]
        or candidate["scene_drivers"] != source["scene_drivers"]
    ):
        raise AssertionError("skeleton/actions/scene drivers changed")
    for name in source["objects"]:
        if candidate["objects"][name] != source["objects"][name]:
            raise AssertionError(
                f"object transform/parent/modifier/driver changed: {name}"
            )
    source_coat = source["meshes"][COAT]
    candidate_coat = candidate["meshes"][COAT]
    for name, row in source["meshes"].items():
        current = candidate["meshes"][name]
        if name == COAT:
            if {
                k: v for k, v in current["core"].items() if k not in ("attributes",)
            } != {k: v for k, v in row["core"].items() if k not in ("attributes",)}:
                raise AssertionError("coat geometry/skin/shapes/material slots changed")
            for attr, old in row["core"]["attributes"].items():
                if current["core"]["attributes"].get(attr) != old:
                    raise AssertionError(f"original coat attr changed: {attr}")
        elif current != row:
            raise AssertionError(f"mesh altered: {name}")
    extras = verify_extras(
        source_coat["core"]["attributes"],
        candidate_coat["core"]["attributes"],
        contract,
    )
    current_materials = material_map(candidate["materials"])
    if set(current_materials) != set(source_materials):
        raise AssertionError("material set changed")
    for name, old in source_materials.items():
        if name != COAT_MATERIAL and current_materials[name] != old:
            raise AssertionError(f"non-jacket material changed: {name}")
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    coat = bpy.data.objects[COAT]
    coat_material = bpy.data.materials.get(COAT_MATERIAL)
    if coat_material is None or not no_displacement(coat_material):
        raise AssertionError("coat material output displacement is forbidden")
    if contract and contract.get("changed_material") not in (None, COAT_MATERIAL):
        raise AssertionError("contract jacket material mismatch")
    uv_atlas = verify_uv_and_atlas(scene, rig, coat, contract) if contract else None
    if digest(args.source) != source_hash or digest(args.input) != input_hash:
        raise AssertionError("audit mutated a blend")
    report = {
        "source_sha256": source_hash,
        "model_sha256": input_hash,
        "mode": "static_preservation_bridge",
        "accepted": True,
        "inherited_motion_record": inherited,
        "preservation": {
            "all_mesh_coordinates_topology_weights_shape_arrays_transforms_parents_modifiers_drivers_actions_skeleton_exact": True,
            "all_original_mesh_attributes_exact": True,
            "all_non_jacket_materials_exact": True,
        },
        "allowed_changes": {
            "coat_new_attributes": extras,
            "coat_material_graph_changed": current_materials[COAT_MATERIAL]
            != source_materials[COAT_MATERIAL],
            "coat_material_output_displacement": False,
        },
        "contract_used": args.provenance.name if args.provenance else None,
        "uv_and_atlas": uv_atlas,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("EMBROIDERY_AUDIT", json.dumps(report), flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", type=Path, default=SOURCE)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--provenance", type=Path)
    p.add_argument("--report", type=Path, required=True)
    main(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
