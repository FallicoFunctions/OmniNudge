"""Add packed right-sleeve gold embroidery color/normal detail without geometry changes."""

# Connection map: embroidery is a material layer on the existing jacket surface.
# UVs and bump shading follow the original skin/correctives; no geometric offset,
# extra mesh, attachment gap or physical penetration is introduced.
import argparse
import hashlib
import json
import sys
from itertools import pairwise
from pathlib import Path

import bpy
import numpy as np

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A
from style_rigged_jacket_tailoring import geometry_hash

SOURCE = SCRIPTS.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-jacket-hardware-study/"
    "male-rigged-jacket-hardware.blend"
)
UV_NAME = "JacketEmbroideryUV"
REGION = "TailorEmbroidery"
IMAGE_NAME = "Right sleeve gold embroidery"
TEXTURE_NAME = "right-sleeve-embroidery.png"
SIZE = 2048


def curve(control, count=65):
    control = np.asarray(control, dtype=np.float64)
    t = np.linspace(0, 1, count)[:, None]
    return (
        (1 - t) ** 3 * control[0]
        + 3 * (1 - t) ** 2 * t * control[1]
        + 3 * (1 - t) * t**2 * control[2]
        + t**3 * control[3]
    )


def design():
    """Authored filigree: a winding stem with open angular leaves and scrolls."""
    strokes = []
    for control in (
        [(0.055, 0.59), (0.23, 0.76), (0.25, 0.43), (0.44, 0.59)],
        [(0.44, 0.59), (0.62, 0.75), (0.69, 0.43), (0.94, 0.61)],
        [(0.065, 0.575), (0.24, 0.72), (0.25, 0.42), (0.44, 0.573)],
        [(0.44, 0.573), (0.62, 0.71), (0.70, 0.42), (0.93, 0.589)],
    ):
        strokes.append((curve(control), 0.00072))
    for index, u in enumerate((0.14, 0.27, 0.39, 0.53, 0.68, 0.82)):
        sign = 1 if index % 2 == 0 else -1
        base = 0.59 + 0.035 * np.sin(u * 4 * np.pi)
        end = np.array([u + 0.075, base + sign * 0.105])
        middle = np.array([u + 0.012, base + sign * 0.061])
        start = np.array([u - 0.022, base - sign * 0.008])
        strokes.append((curve([start, middle, end - [0.045, 0], end]), 0.00056))
        strokes.append(
            (
                curve(
                    [
                        end,
                        end + [0.015, -sign * 0.065],
                        middle + [0.05, -sign * 0.09],
                        start,
                    ]
                ),
                0.00056,
            )
        )
        strokes.append(
            (
                curve([start, middle + [0.02, 0], end - [0.02, sign * 0.035], end]),
                0.00034,
            )
        )
    for u in (0.11, 0.47, 0.79):
        strokes.append(
            (
                curve(
                    [
                        (u, 0.54),
                        (u - 0.085, 0.47),
                        (u + 0.015, 0.405),
                        (u + 0.038, 0.477),
                    ]
                ),
                0.00045,
            )
        )
        strokes.append(
            (
                curve(
                    [
                        (u + 0.038, 0.477),
                        (u + 0.042, 0.51),
                        (u + 0.009, 0.51),
                        (u + 0.014, 0.481),
                    ]
                ),
                0.00045,
            )
        )
    return strokes


def texture_pixels():
    # Atlas axes represent approximately 400 mm of length and circumference.
    # Submillimetre stitched strokes are sampled at about five pixels per mm.
    coverage = np.zeros((SIZE, SIZE), dtype=np.float32)
    height = np.zeros_like(coverage)
    filament = np.zeros_like(coverage)
    physical_size = 0.40
    pixel = physical_size / SIZE
    for points, width in design():
        width *= 1.75
        points = points * physical_size
        distance_along = 0.0
        for a, b in pairwise(points):
            delta = b - a
            length = float(np.linalg.norm(delta))
            pad = width / 2 + 1.5 * pixel
            lo = np.maximum(0, np.floor((np.minimum(a, b) - pad) / pixel).astype(int))
            hi = np.minimum(SIZE, np.ceil((np.maximum(a, b) + pad) / pixel).astype(int))
            if np.any(hi <= lo) or length < 1e-12:
                continue
            yy, xx = np.mgrid[lo[1] : hi[1], lo[0] : hi[0]]
            offsets = np.stack(
                ((xx + 0.5) * pixel - a[0], (yy + 0.5) * pixel - a[1]), axis=-1
            )
            t = np.clip(np.einsum("...c,c->...", offsets, delta) / length**2, 0, 1)
            residual = offsets - t[..., None] * delta
            dist = np.linalg.norm(residual, axis=-1)
            signed = (offsets[..., 0] * delta[1] - offsets[..., 1] * delta[0]) / length
            phase = distance_along + t * length
            edge = np.clip((width / 2 + pixel * 0.5 - dist) / pixel, 0, 1)
            ridge = np.sqrt(np.maximum(0, 1 - (dist / (width / 2 + pixel)) ** 2))
            threads = (
                0.72
                + 0.18 * np.cos(signed * 2 * np.pi / 0.00018)
                + 0.10 * np.cos(phase * 2 * np.pi / 0.00135)
            )
            sl = np.s_[lo[1] : hi[1], lo[0] : hi[0]]
            coverage[sl] = np.maximum(coverage[sl], edge)
            height[sl] = np.maximum(height[sl], edge * ridge * threads)
            filament[sl] = np.maximum(filament[sl], edge * threads)
            distance_along += length
    pixels = np.stack((coverage, height, filament, np.ones_like(coverage)), axis=-1)
    return pixels, {
        "resolution": [SIZE, SIZE],
        "channels": {
            "R": "coverage",
            "G": "thread relief",
            "B": "filament variation",
            "A": "one",
        },
        "stroke_count": len(design()),
        "coverage_pixels": int(np.count_nonzero(coverage > 0.5)),
        "coverage_fraction": float(np.mean(coverage > 0.5)),
        "float_pixels_sha256": hashlib.sha256(pixels.tobytes()).hexdigest(),
        "interpretation": "Authored gold filigree guided by the foreshortened right-sleeve reference, not a recovered exact embroidery pattern",
    }


def add_uv(scene, rig, coat):
    original_action, original_frame = rig.animation_data.action, scene.frame_current
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, 31)
    solid = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
    points, _ = A.midpoint(coat, solid, len(coat.data.vertices))
    points = A.array(points)
    axis = np.asarray(rig.matrix_world @ rig.pose.bones["lowerarm_r"].head)
    along = (-points[:, 0] - 0.29) / 0.40
    angle = (
        np.arctan2(points[:, 2] - axis[2], -(points[:, 1] - axis[1])) / (2 * np.pi)
        + 0.5
    )
    uv = coat.data.uv_layers.new(name=UV_NAME)
    region = coat.data.attributes.new(REGION, "FLOAT", "FACE")
    selected = 0
    for polygon in coat.data.polygons:
        ids = np.asarray(polygon.vertices)
        enabled = bool(np.max(points[ids, 0]) < -0.255)
        region.data[polygon.index].value = float(enabled)
        selected += int(enabled)
        values = angle[ids].copy()
        if values.max() - values.min() > 0.5:
            values[values < 0.5] += 1
        for j, loop in enumerate(polygon.loop_indices):
            uv.data[loop].uv = (along[ids[j]], values[j]) if enabled else (-1, -1)
    rig.animation_data.action = original_action
    A.sample(scene, original_frame)
    return {
        "uv_name": UV_NAME,
        "region_attribute": REGION,
        "region_faces": selected,
        "axis_yz_m": axis[1:].tolist(),
        "u_range_m": [0.29, 0.69],
        "seam": "rear sleeve; face-local angle unwrap",
    }


def shade(coat, image):
    mat = coat.data.materials[0]
    assert mat.users == 1
    tree = mat.node_tree
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    old = {
        name: socket.links[0].from_socket if socket.is_linked else socket.default_value
        for name, socket in bsdf.inputs.items()
        if name in ("Base Color", "Metallic", "Roughness", "Normal")
    }

    def link(socket, value):
        if isinstance(value, (int, float, tuple, list)):
            socket.default_value = value
        else:
            tree.links.new(value, socket)

    def math(op, a, b):
        node = tree.nodes.new("ShaderNodeMath")
        node.label = "Embroidery " + op
        node.operation = op
        link(node.inputs[0], a)
        link(node.inputs[1], b)
        return node.outputs[0]

    uv = tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = UV_NAME
    uv.label = "Embroidery sleeve UV"
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    tex.extension = "CLIP"
    tex.label = "Packed embroidery channels"
    tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    split = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(tex.outputs["Color"], split.inputs[0])
    region = tree.nodes.new("ShaderNodeAttribute")
    region.attribute_name = REGION
    mask = math("MULTIPLY", split.outputs["Red"], region.outputs["Fac"])
    color = tree.nodes.new("ShaderNodeMixRGB")
    color.label = "Gold embroidery over preserved satin"
    link(color.inputs[0], mask)
    link(color.inputs[1], old["Base Color"])
    color.inputs[2].default_value = (0.56, 0.33, 0.095, 1)
    tree.links.new(color.outputs[0], bsdf.inputs["Base Color"])
    for name, target in (("Metallic", 0.72), ("Roughness", 0.30)):
        value = math(
            "ADD",
            math("MULTIPLY", old[name], math("SUBTRACT", 1, mask)),
            math("MULTIPLY", target, mask),
        )
        tree.links.new(value, bsdf.inputs[name])
    bump = tree.nodes.new("ShaderNodeBump")
    bump.label = "Embroidery thread relief; normal detail only"
    bump.inputs["Strength"].default_value = 0.5
    bump.inputs["Distance"].default_value = 0.00035
    link(
        bump.inputs["Height"],
        math("MULTIPLY", split.outputs["Green"], region.outputs["Fac"]),
    )
    link(bump.inputs["Normal"], old["Normal"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    assert all(
        not node.inputs["Displacement"].is_linked
        for node in tree.nodes
        if node.type == "OUTPUT_MATERIAL"
    )
    return mat.name


def run(args):
    for path in (args.output, args.report, args.texture):
        if path.exists():
            raise FileExistsError(path)
        path.parent.mkdir(parents=True, exist_ok=True)
    source_hash = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    before_geometry = geometry_hash()
    old_snapshot = A.preserved_snapshot(coat, rig, body, shirt)
    uv_report = add_uv(scene, rig, coat)
    pixels, texture_report = texture_pixels()
    image = bpy.data.images.new(
        IMAGE_NAME, width=SIZE, height=SIZE, alpha=True, float_buffer=False
    )
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(pixels.reshape(-1))
    image.file_format = "PNG"
    image.filepath_raw = str(args.texture.resolve())
    image.save()
    image.pack()
    image.filepath = "//" + args.texture.name
    changed_material = shade(coat, image)
    assert geometry_hash() == before_geometry
    after = A.preserved_snapshot(coat, rig, body, shirt)
    # Explicit geometry/metadata bridge is independently audited after reopening.
    for key in old_snapshot:
        if key not in ("materials", "mesh_attributes"):
            assert after[key] == old_snapshot[key], key
    assert [m for m in after["materials"] if m["name"] != changed_material] == [
        m for m in old_snapshot["materials"] if m["name"] != changed_material
    ]
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    assert A.digest(args.input) == source_hash
    report = {
        "source_sha256": source_hash,
        "model_sha256": A.digest(args.output),
        "builder_sha256": A.digest(Path(__file__)),
        "texture_sha256": A.digest(args.texture),
        "geometry_sha256": before_geometry,
        "all_geometry_skin_shapes_preserved": True,
        "changed_material": changed_material,
        "uv": uv_report,
        "texture": texture_report,
        "packed_image": bool(image.packed_file),
        "no_geometric_displacement": True,
        "acceptance": "Requires reopened preservation audit and visual review",
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("EMBROIDERY_BUILD", json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--texture", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
