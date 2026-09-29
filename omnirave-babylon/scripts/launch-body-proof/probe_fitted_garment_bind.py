"""Rebind a saved fitted surface in its matching body pose, with optional quads.

The archived surface is input to a new authoring experiment, not a continuation
of the old physical solve. Native nearest-face weights and linear skinning are
tested at rest and six animation poses before any export is considered.
"""

# Connection map: one connected torso/sleeve surface retains neck, front, hem,
# and cuff openings. The QuadriFlow trial requests boundary preservation, but
# this is not guaranteed; all resulting geometry remains subject to checks.
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from probe_blender_garment_transfer import (
    SOURCE,
    apply_modifier,
    bind_points,
    collect_weights,
    new_mesh,
)
from surface_crossings import strict_pairs
from validate_body05_tops import between, body_snapshot, geometry
from validate_body_contacts import bones_snapshot


def run(output, frame, quad_faces, save):
    output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    source = SOURCE / "male-outfit04.blend"
    archive = SOURCE / "outfit04-rest-tpose-checked-panels.npz"
    input_path = SOURCE / "outfit04-rest-tpose-input.npz"
    input_data, fitted = np.load(input_path), np.load(archive)
    index = list(fitted["frames"]).index(float(frame))
    points = fitted["panels"][index]
    faces = input_data["faces"]
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body, top = [
        bpy.data.objects[name] for name in ["AvatarBody", "AvatarTop_tailored"]
    ]
    original = (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    old = bpy.data.objects["Luxury_Bomber rebuilt shell"]
    old.hide_render = True
    old.hide_set(True)
    scene.frame_set(int(frame), subframe=frame - int(frame))
    bpy.context.view_layer.update()
    obj = new_mesh(
        "Luxury_Bomber fitted bind", points.tolist(), faces.tolist(), old.data.materials
    )
    if quad_faces:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        obj.data.use_mirror_x = True
        result = bpy.ops.object.quadriflow_remesh(
            target_faces=quad_faces,
            use_mesh_symmetry=False,
            use_preserve_boundary=True,
            use_preserve_sharp=False,
            seed=0,
        )
        assert result == {"FINISHED"}, result
    initial_points = [vertex.co.copy() for vertex in obj.data.vertices]
    initial_faces = [tuple(face.vertices) for face in obj.data.polygons]
    skin = {
        bone.name: bone.matrix @ bone.bone.matrix_local.inverted()
        for bone in rig.pose.bones
    }
    transfer_source = body.copy()
    transfer_source.data = body.data.copy()
    transfer_source.name = "Temporary deform weights source"
    scene.collection.objects.link(transfer_source)
    transfer_source.hide_render = True
    for group in list(transfer_source.vertex_groups):
        if group.name not in skin:
            transfer_source.vertex_groups.remove(group)
    for group in transfer_source.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    modifier = obj.modifiers.new("Native nearest-face weights", "DATA_TRANSFER")
    modifier.object = transfer_source
    modifier.use_vert_data = True
    modifier.data_types_verts = {"VGROUP_WEIGHTS"}
    modifier.vert_mapping = "POLYINTERP_NEAREST"
    modifier.layers_vgroup_select_src = "ALL"
    modifier.layers_vgroup_select_dst = "NAME"
    modifier.mix_mode = "REPLACE"
    apply_modifier(obj, modifier)
    weights = collect_weights(obj, skin)
    bpy.data.objects.remove(transfer_source, do_unlink=True)
    obj.vertex_groups.clear()
    bind_points(obj, weights, skin, rig)
    bpy.context.view_layer.update()
    bound, _ = geometry(obj)
    bind_error = max((a - b).length for a, b in zip(bound, initial_points))
    assert bind_error < 2e-6, bind_error
    modifier = obj.modifiers.new("Final fabric thickness", "SOLIDIFY")
    modifier.thickness = 0.001
    modifier.offset = 0
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    topology = {
        "vertices": len(bm.verts),
        "faces": len(bm.faces),
        "quad_faces": sum(len(face.verts) == 4 for face in bm.faces),
        "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
        "invalid_edges": sum(
            not (edge.is_manifold or edge.is_boundary) for edge in bm.edges
        ),
    }
    bm.free()
    rows = []
    for sample in [0, 1, 6, 31, 61, 91, 121]:
        rig.data.pose_position = "REST" if sample == 0 else "POSE"
        scene.frame_set(max(sample, 1))
        bpy.context.view_layer.update()
        p, t = geometry(obj)
        q, u = geometry(body)
        v, w = geometry(top)
        row = {
            "frame": sample,
            "self_pairs": len(strict_pairs(p, t)),
            "body_pairs": len(between(p, t, q, u)),
            "top_pairs": len(between(p, t, v, w)),
        }
        rows.append(row)
        print("FITTED_BIND", frame, quad_faces, row, flush=True)
    assert (body_snapshot(body), body_snapshot(top), bones_snapshot(rig)) == original
    report = {
        "scope": __doc__,
        "source_hashes": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in [source, archive, input_path]
        },
        "body_top_skeleton_preserved": True,
        "bind_frame": frame,
        "maximum_bind_error_m": bind_error,
        "quad_target_faces": quad_faces,
        "topology": topology,
        "initial_surface_faces": len(initial_faces),
        "poses": rows,
        "clear_at_all_tested_poses": all(
            not any(row[k] for k in ["self_pairs", "body_pairs", "top_pairs"])
            for row in rows
        ),
        "elapsed_seconds": time.monotonic() - started,
        "status": "DIAGNOSTIC_ONLY",
    }
    (output / "fitted-bind.json").write_text(json.dumps(report, indent=2) + "\n")
    rig.data.pose_position = "POSE"
    scene.frame_set(1)
    if save:
        bpy.data.objects.remove(old, do_unlink=True)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(
            filepath=str(output / "fitted-bind.blend"), compress=True
        )
    from build_bodies import review

    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 1.14
    camera.location = (1, -4, 1.35)
    review.look_at(camera, Vector((0, 0, 1.28)))
    scene.render.resolution_x = 800
    scene.render.resolution_y = 800
    for sample in [1, 31]:
        scene.frame_set(sample)
        scene.render.filepath = str(output / f"frame-{sample}.png")
        bpy.ops.render.render(write_still=True)
    print("FITTED_BIND_COMPLETE", report["elapsed_seconds"], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--frame", type=float, default=6)
    parser.add_argument("--quad-faces", type=int, default=0)
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.output, args.frame, args.quad_faces, args.save)
