"""Compare native weight transfer and thickness order on the retained jacket.

This is a bounded Blender-space diagnostic, not a model export. Every variant
starts at the identical authored T-pose midsurface. The body, top and armature
stay fixed; source model files are never saved. Results include rest and the
five existing diagnostic poses, with the known strict-crossing limitations.
"""

# Connection map: retain the jacket's connected torso/sleeves and opening rims.
# Paired thickness uses common midsurface weights; no overlapping new pieces.
# Garment/body/top are separate surfaces with intentional layer clearance.
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from surface_crossings import crossing, strict_pairs
from validate_body05_tops import between, body_snapshot, geometry
from validate_body_contacts import bones_snapshot

SOURCE = SCRIPTS.parents[1] / "assets-src/avatars/launch-body-proof"
COAT_NAME = "Luxury_Bomber rebuilt shell"


def new_mesh(name, points, faces, materials):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for material in materials:
        mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def apply_modifier(obj, modifier):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def normalize(weights):
    selected = sorted(
        ((name, weight) for name, weight in weights.items() if weight > 1e-8),
        key=lambda item: -item[1],
    )[:4]
    total = sum(weight for _, weight in selected)
    assert total > 1e-10, "Unweighted garment vertex"
    return {name: weight / total for name, weight in selected}


def collect_weights(obj, allowed):
    return [
        normalize(
            {
                obj.vertex_groups[group.group].name: group.weight
                for group in vertex.groups
                if obj.vertex_groups[group.group].name in allowed
            }
        )
        for vertex in obj.data.vertices
    ]


def bind_points(obj, weights, skin, rig):
    for vertex, weights_for_vertex in zip(obj.data.vertices, weights):
        transform = Matrix(((0.0, 0.0, 0.0, 0.0),) * 4)
        for name, weight in weights_for_vertex.items():
            transform += skin[name] * weight
            group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
            group.add([vertex.index], weight, "REPLACE")
        assert abs(transform.determinant()) > 1e-6
        vertex.co = transform.inverted() @ vertex.co
    obj.data.update()
    modifier = obj.modifiers.new("Garment armature", "ARMATURE")
    modifier.object = rig
    obj.parent = rig


def run(output, render):
    started = time.monotonic()
    output.mkdir(parents=True, exist_ok=True)
    path = SOURCE / "male-outfit04.blend"
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    old = bpy.data.objects[COAT_NAME]
    original = (body_snapshot(body), body_snapshot(top), bones_snapshot(rig))
    scene.frame_set(31)
    bpy.context.view_layer.update()
    authored, full_faces = geometry(old)
    half = len(authored) // 2
    middle = [(authored[i] + authored[i + half]) * 0.5 for i in range(half)]
    faces = [face for face in full_faces if max(face) < half]
    skin = {
        bone.name: bone.matrix @ bone.bone.matrix_local.inverted()
        for bone in rig.pose.bones
    }
    # This source has identity object transforms; otherwise convert spaces
    # explicitly before using bone matrices or copying authored coordinates.
    for obj in [body, top, old, rig]:
        assert (
            max(
                abs(obj.matrix_world[i][j] - (i == j))
                for i in range(4)
                for j in range(4)
            )
            < 1e-6
        )
    old_weights = collect_weights(old, skin)[:half]
    transfer_source = body.copy()
    transfer_source.data = body.data.copy()
    transfer_source.name = "Deform groups only transfer source"
    scene.collection.objects.link(transfer_source)
    for group in list(transfer_source.vertex_groups):
        if group.name not in skin:
            transfer_source.vertex_groups.remove(group)
    transfer_source.hide_render = True
    target = new_mesh(
        "Native weight transfer target", middle, faces, old.data.materials
    )
    for group in body.vertex_groups:
        if group.name in skin:
            target.vertex_groups.new(name=group.name)
    transfer = target.modifiers.new(
        "Rest configuration weight transfer", "DATA_TRANSFER"
    )
    transfer.object = transfer_source
    transfer.use_vert_data = True
    transfer.data_types_verts = {"VGROUP_WEIGHTS"}
    transfer.vert_mapping = "POLYINTERP_NEAREST"
    transfer.layers_vgroup_select_src = "ALL"
    transfer.layers_vgroup_select_dst = "NAME"
    transfer.mix_mode = "REPLACE"
    transfer.use_object_transform = True
    apply_modifier(target, transfer)
    native_weights = collect_weights(target, skin)
    changes = [
        sum(abs(a.get(name, 0) - b.get(name, 0)) for name in set(a) | set(b))
        for a, b in zip(old_weights, native_weights)
    ]
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(transfer_source, do_unlink=True)
    variants = {"original": old}
    for name, weights, thickness_after in [
        ("native_transfer_fixed_walls", native_weights, False),
        ("original_weights_thickness_after", old_weights, True),
        ("native_transfer_thickness_after", native_weights, True),
    ]:
        obj = new_mesh(
            name,
            middle if thickness_after else authored,
            faces if thickness_after else full_faces,
            old.data.materials,
        )
        bind_points(obj, weights if thickness_after else weights + weights, skin, rig)
        if thickness_after:
            modifier = obj.modifiers.new("Final fabric thickness", "SOLIDIFY")
            modifier.thickness = 0.001
            modifier.offset = 0
        variants[name] = obj
    controls = json.loads((SOURCE / "top01-diagonal-control.json").read_text())
    from mathutils import Vector

    detected = sum(
        crossing(*[[Vector(p) for p in tri] for tri in item["points"]])
        for item in controls["examples"]
    )
    assert detected == 8
    report = {
        "scope": __doc__,
        "blender_version": bpy.app.version_string,
        "source": str(path),
        "source_sha256": digest,
        "native_transfer": {
            "mapping": "POLYINTERP_NEAREST",
            "source_groups": "ALL on a deform-groups-only source copy",
            "destination_groups": "NAME",
            "maximum_influences": 4,
            "changed_midsurface_vertices": sum(x > 1e-5 for x in changes),
            "maximum_weight_l1_change": max(changes),
        },
        "positive_crossing_controls_detected": detected,
        "variants": {},
    }
    for name, obj in variants.items():
        rows = []
        for frame in [0, 1, 31, 61, 91, 121]:
            rig.data.pose_position = "REST" if frame == 0 else "POSE"
            scene.frame_set(max(frame, 1))
            bpy.context.view_layer.update()
            p, t = geometry(obj)
            q, u = geometry(body)
            v, w = geometry(top)
            row = {
                "frame": frame,
                "self_pairs": len(strict_pairs(p, t)),
                "body_pairs": len(between(p, t, q, u)),
                "top_pairs": len(between(p, t, v, w)),
            }
            rows.append(row)
            print("TRANSFER_PROBE", name, row, flush=True)
        report["variants"][name] = {
            "poses": rows,
            "clear_at_all_tested_poses": all(
                not any(row[key] for key in ["self_pairs", "body_pairs", "top_pairs"])
                for row in rows
            ),
        }
        if render:
            for variant in variants.values():
                variant.hide_render = variant != obj
            rig.data.pose_position = "POSE"
            scene.frame_set(1)
            from build_bodies import review
            from mathutils import Vector

            camera = review.configure_scene()
            camera.data.type = "ORTHO"
            camera.data.ortho_scale = 1.15
            camera.location = (1, -4, 1.35)
            review.look_at(camera, Vector((0, 0, 1.28)))
            scene.render.resolution_x = 800
            scene.render.resolution_y = 800
            scene.render.filepath = str(output / f"{name}-relaxed.png")
            bpy.ops.render.render(write_still=True)
    assert (body_snapshot(body), body_snapshot(top), bones_snapshot(rig)) == original
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
    report["body_top_skeleton_preserved"] = True
    report["elapsed_seconds"] = time.monotonic() - started
    report["status"] = "DIAGNOSTIC_ONLY_NO_MODEL_SAVED"
    (output / "transfer-probe.json").write_text(json.dumps(report, indent=2) + "\n")
    print("TRANSFER_PROBE_COMPLETE", report["elapsed_seconds"], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.output, args.render)
