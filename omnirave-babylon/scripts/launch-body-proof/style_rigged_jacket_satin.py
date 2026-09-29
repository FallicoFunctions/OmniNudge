"""Refine jacket-only satin shading with an exact geometry preservation bridge."""

import argparse
import json
import sys
from pathlib import Path

import bpy

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A
from style_rigged_jacket_tailoring import geometry_hash


def style(coat):
    material = coat.data.materials[0]
    assert material.users == 1
    tree = material.node_tree
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    color_gold_mix = bsdf.inputs["Base Color"].links[0].from_node
    color_dark_mix = color_gold_mix.inputs[1].links[0].from_node
    dark = color_dark_mix.inputs[0].links[0].from_socket
    rest = next(
        n
        for n in tree.nodes
        if n.type == "ATTRIBUTE" and n.attribute_name == "TailorRest"
    ).outputs["Vector"]

    def bind(socket, value):
        if isinstance(value, (int, float, tuple, list)):
            socket.default_value = value
        else:
            tree.links.new(value, socket)

    def math(op, a, b):
        n = tree.nodes.new("ShaderNodeMath")
        n.label = "Satin " + op
        n.operation = op
        bind(n.inputs[0], a)
        bind(n.inputs[1], b)
        return n.outputs[0]

    fabric = math("SUBTRACT", 1, dark)
    old_roughness = bsdf.inputs["Roughness"].links[0].from_socket
    bind(
        bsdf.inputs["Roughness"],
        math("SUBTRACT", old_roughness, math("MULTIPLY", fabric, 0.10)),
    )
    bind(bsdf.inputs["Coat Weight"], math("MULTIPLY", fabric, 0.18))
    bsdf.inputs["Coat Roughness"].default_value = 0.20
    # Keep trim response and every original color/metallic connection intact.
    bind(bsdf.inputs["Sheen Weight"], math("ADD", 0.25, math("MULTIPLY", fabric, 0.12)))

    stretch = tree.nodes.new("ShaderNodeVectorMath")
    stretch.label = "Stable fabric microcrease direction"
    stretch.operation = "MULTIPLY"
    bind(stretch.inputs[0], rest)
    stretch.inputs[1].default_value = (2.3, 1.3, 0.45)
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.label = "Small satin wrinkles in fabric coordinates"
    bind(noise.inputs["Vector"], stretch.outputs["Vector"])
    noise.inputs["Scale"].default_value = 75
    noise.inputs["Detail"].default_value = 2
    noise.inputs["Roughness"].default_value = 0.55
    # Normal detail only: no material displacement output is connected.
    old_normal = bsdf.inputs["Normal"].links[0].from_socket
    bump = tree.nodes.new("ShaderNodeBump")
    bump.label = "Satin microcreases, no geometric displacement"
    bump.inputs["Strength"].default_value = 0.30
    bump.inputs["Distance"].default_value = 0.0008
    bind(bump.inputs["Height"], math("MULTIPLY", fabric, noise.outputs["Fac"]))
    bind(bump.inputs["Normal"], old_normal)
    bind(bsdf.inputs["Normal"], bump.outputs["Normal"])
    return material.name


def run(args):
    if args.output.exists():
        raise FileExistsError(args.output)
    source_hash = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    _scene, rig, coat, body, shirt = A.scene_objects()
    before = A.preserved_snapshot(coat, rig, body, shirt)
    shape_hash = geometry_hash()
    target_material = style(coat)
    expected_materials = A.material_snapshot()
    assert [m for m in before["materials"] if m["name"] != target_material] == [
        m for m in expected_materials if m["name"] != target_material
    ]
    expected = dict(before, materials=expected_materials)
    assert A.preserved_snapshot(coat, rig, body, shirt) == expected
    assert geometry_hash() == shape_hash
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    bpy.ops.wm.open_mainfile(filepath=str(args.output))
    _scene, rig, coat, body, shirt = A.scene_objects()
    assert geometry_hash() == shape_hash
    assert A.preserved_snapshot(coat, rig, body, shirt) == expected
    assert A.digest(args.input) == source_hash
    report = {
        "source_sha256": source_hash,
        "model_sha256": A.digest(args.output),
        "styler_sha256": A.digest(Path(__file__)),
        "all_mesh_geometry_skin_and_shape_sha256": shape_hash,
        "all_mesh_geometry_skin_and_shapes_exact_after_reopen": True,
        "rig_actions_drivers_modifiers_attributes_exact": True,
        "other_materials_exact": True,
        "only_changed_material": target_material,
        "coordinates": "Existing TailorRest attribute; no UVs or Generated coordinates",
        "material_displacement": False,
        "scope": "Shading-only preservation bridge from the geometry-audited input",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("SATIN_STYLE", json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
