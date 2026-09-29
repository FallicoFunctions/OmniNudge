"""Isolate cloth rest-key response without confusing a shape mix with simulation.

A one-meter connected strip starts at full length. The requested rest key is
half length but has zero mix value. A deliberately mixed case exposes the
misleading shortened initial state; a gravity case checks simulation response.
Results describe this installed Blender setup, not all Blender configurations.
"""

# Connection map: 33 strip vertices, 40 triangles, left edge pinned.
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np


def run(output):
    rows = []
    cases = [
        ("relative_rest_zero_mix", True, 0, False, False),
        ("absolute_rest_zero_mix", False, 0, False, False),
        ("absolute_identity_bridge", False, 0, True, False),
        ("relative_mixed_initial_negative", True, 1, False, False),
        ("gravity_response", True, 0, False, True),
    ]
    for name, relative, mix, bridge, gravity in cases:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        points = np.array([(x / 10, y / 10, 0.0) for x in range(11) for y in range(3)])
        faces = []
        for x in range(10):
            for y in range(2):
                a = x * 3 + y
                b = a + 3
                faces.extend([(a, b, b + 1), (a, b + 1, a + 1)])
        mesh = bpy.data.meshes.new("Strip")
        mesh.from_pydata(points.tolist(), [], faces)
        obj = bpy.data.objects.new("Strip", mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.shape_key_add(name="Initial")
        key = obj.shape_key_add(name="Half length rest")
        rest = points.copy()
        rest[:, 0] *= 0.5
        key.data.foreach_set("co", rest.ravel())
        key.value = mix
        key.interpolation = "KEY_LINEAR"
        obj.data.shape_keys.use_relative = relative
        obj.data.shape_keys.eval_time = 0
        pin = obj.vertex_groups.new(name="Left edge")
        pin.add([0, 1, 2], 1, "REPLACE")
        if bridge:
            obj.modifiers.new("Identity triangulation", "TRIANGULATE")
        cloth = obj.modifiers.new("Cloth", "CLOTH")
        cloth.settings.rest_shape_key = key
        cloth.settings.vertex_group_mass = pin.name
        cloth.settings.use_dynamic_mesh = False
        cloth.settings.effector_weights.gravity = float(gravity)
        cloth.settings.quality = 20
        cloth.collision_settings.use_collision = False
        cloth.collision_settings.use_self_collision = False
        cloth.point_cache.frame_start = 1
        cloth.point_cache.frame_end = 11
        initial = None
        for frame in range(1, 12):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            coords = np.array([v.co[:] for v in evaluated.data.vertices])
            if frame == 1:
                initial = coords.copy()
        assert abs(initial[:, 0].max() - (0.5 if mix else 1)) < 1e-6
        if gravity:
            assert coords[:, 2].min() < -0.001
        row = {
            "case": name,
            "relative": relative,
            "key_mix": mix,
            "identity_bridge": bridge,
            "gravity": gravity,
            "initial_xmax": float(initial[:, 0].max()),
            "final_xmax": float(coords[:, 0].max()),
            "final_zmin": float(coords[:, 2].min()),
            "max_simulated_movement_m": float(
                np.linalg.norm(coords - initial, axis=1).max()
            ),
            "rest_xmax": max(v.co.x for v in cloth.settings.rest_shape_key.data),
        }
        rows.append(row)
        print("REST_CONTROL", row, flush=True)
    output.write_text(
        json.dumps(
            {
                "scope": __doc__,
                "blender_version": bpy.app.version_string,
                "cases": rows,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.output)
