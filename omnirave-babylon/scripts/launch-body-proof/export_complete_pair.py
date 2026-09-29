"""Bake portable appearance and author locomotion for the assembled launch pair.
All work opens study copies. Native source masters and joint-test actions remain
available; the runtime GLBs carry only idle, walk, and run on the same 56 bones.
"""

import argparse
import json
import math
import sys
import struct
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from assemble_complete_pair import OUT, ROOT, array, review
from build_bodies import point_bone

PUBLIC = ROOT / "public/assets/avatars/complete-pair"


def select(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.hide_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def portable_materials(sex, objects):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.render.bake.margin = 12
    # Camera-dependent foil becomes a portable thin-film PBR material.
    for name in ["PLURR iridescent foil", "PLURR mirrored goggles"]:
        mat = bpy.data.materials.get(name)
        if mat:
            bs = mat.node_tree.nodes.get("Principled BSDF")
            if "foil" in name:
                coords = mat.node_tree.nodes.new("ShaderNodeTexCoord")
                noise = mat.node_tree.nodes.new("ShaderNodeTexNoise")
                noise.inputs["Scale"].default_value = 4.2
                noise.inputs["Detail"].default_value = 2
                colors = mat.node_tree.nodes.new("ShaderNodeValToRGB")
                ramp = colors.color_ramp
                ramp.elements[0].position = 0.2
                ramp.elements[0].color = (0.55, 0.065, 0.20, 1)
                ramp.elements[1].position = 0.8
                ramp.elements[1].color = (0.78, 0.19, 0.40, 1)
                ramp.elements.new(0.38).color = (0.24, 0.24, 0.40, 1)
                ramp.elements.new(0.50).color = (0.60, 0.10, 0.34, 1)
                ramp.elements.new(0.63).color = (0.24, 0.48, 0.42, 1)
                mat.node_tree.links.new(
                    coords.outputs["Generated"], noise.inputs["Vector"]
                )
                mat.node_tree.links.new(noise.outputs["Fac"], colors.inputs[0])
                mat.node_tree.links.new(colors.outputs[0], bs.inputs["Base Color"])
            bs.inputs["Metallic"].default_value = 0.68 if "foil" in name else 0.9
            bs.inputs["Roughness"].default_value = 0.21 if "foil" in name else 0.13
            if "Thin Film Thickness" in bs.inputs:
                bs.inputs["Thin Film Thickness"].default_value = 420
                bs.inputs["Thin Film IOR"].default_value = 1.45
            mat["launchIridescent"] = True
    # Bake only node networks that cannot be expressed directly in glTF.
    for ob in objects:
        networks = []
        for mat in ob.data.materials:
            bs = (
                mat.node_tree.nodes.get("Principled BSDF")
                if mat and mat.use_nodes
                else None
            )
            if bs and (
                mat.get("launchBakeNormal")
                or any(
                    bs.inputs[k].is_linked
                    and bs.inputs[k].links[0].from_node.type
                    not in ["TEX_IMAGE", "VERTEX_COLOR"]
                    for k in ["Base Color", "Roughness", "Metallic"]
                )
            ):
                networks.append(mat)
        if not networks:
            continue
        select(ob)
        # Jacket embroidery has deliberately overlapping source coordinates;
        # preserve those for sampling and bake onto a second packed UV set.
        if ob.name != "AvatarBody" or not ob.data.uv_layers:
            ob.data.uv_layers.new(name="LaunchBakeUV")
            ob.data.uv_layers.active_index = len(ob.data.uv_layers) - 1
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.018)
            bpy.ops.object.mode_set(mode="OBJECT")
        uvname = ob.data.uv_layers.active.name
        size = (
            2048
            if ob.name in ["AvatarBody", "Structured armhole jacket"]
            else 1024
            if ob.name == "AvatarBottoms_cargo-pants"
            else 512
        )
        for original in networks:
            mat = original.copy()
            for slot in ob.material_slots:
                if slot.material == original:
                    slot.material = mat
            bs = mat.node_tree.nodes.get("Principled BSDF")
            output = next(n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL")
            # Lock existing image sampling to its original UV, while baking
            # writes into the active packed UV layer.
            for node in list(mat.node_tree.nodes):
                if node.type == "TEX_IMAGE" and not node.inputs["Vector"].is_linked:
                    uv = mat.node_tree.nodes.new("ShaderNodeUVMap")
                    uv.uv_map = ob.data.uv_layers[0].name
                    mat.node_tree.links.new(uv.outputs["UV"], node.inputs["Vector"])
            emit = mat.node_tree.nodes.new("ShaderNodeEmission")
            mat.node_tree.links.new(emit.outputs[0], output.inputs["Surface"])
            images = {}
            for channel in ["Base Color", "Roughness", "Metallic"]:
                socket = bs.inputs[channel]
                if not socket.is_linked:
                    continue
                tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
                img = bpy.data.images.new(
                    f"{sex}-{ob.name}-{channel}", size, size, alpha=False
                )
                if channel != "Base Color":
                    img.colorspace_settings.name = "Non-Color"
                tex.image = img
                mat.node_tree.nodes.active = tex
                for other in ob.data.materials:
                    if other and other != mat:
                        target = other.node_tree.nodes.new("ShaderNodeTexImage")
                        target.image = img
                        other.node_tree.nodes.active = target
                for link in list(emit.inputs["Color"].links):
                    mat.node_tree.links.remove(link)
                mat.node_tree.links.new(
                    socket.links[0].from_socket, emit.inputs["Color"]
                )
                print("BAKE", sex, ob.name, channel, flush=True)
                bpy.ops.object.bake(type="EMIT", use_clear=True, margin=12)
                img.filepath_raw = str(OUT / (img.name.replace(" ", "_") + ".png"))
                img.file_format = "PNG"
                img.save()
                img.pack()
                images[channel] = tex
            mat.node_tree.links.new(bs.outputs["BSDF"], output.inputs["Surface"])
            for channel, tex in images.items():
                uv = mat.node_tree.nodes.new("ShaderNodeUVMap")
                uv.uv_map = uvname
                mat.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
                mat.node_tree.links.new(tex.outputs["Color"], bs.inputs[channel])
            if mat.get("launchBakeNormal") and bs.inputs["Normal"].is_linked:
                img = bpy.data.images.new(
                    f"{sex}-{ob.name}-Normal", size, size, alpha=False
                )
                img.colorspace_settings.name = "Non-Color"
                tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
                tex.image = img
                mat.node_tree.nodes.active = tex
                for other in ob.data.materials:
                    if other and other != mat:
                        target = other.node_tree.nodes.new("ShaderNodeTexImage")
                        target.image = img
                        other.node_tree.nodes.active = target
                print("BAKE", sex, ob.name, "Normal", flush=True)
                bpy.ops.object.bake(
                    type="NORMAL", normal_space="TANGENT", use_clear=True, margin=12
                )
                img.filepath_raw = str(OUT / (img.name.replace(" ", "_") + ".png"))
                img.file_format = "PNG"
                img.save()
                img.pack()
                uv = mat.node_tree.nodes.new("ShaderNodeUVMap")
                uv.uv_map = uvname
                mat.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
                normal = mat.node_tree.nodes.new("ShaderNodeNormalMap")
                normal.uv_map = uvname
                mat.node_tree.links.new(tex.outputs["Color"], normal.inputs["Color"])
                mat.node_tree.links.new(normal.outputs["Normal"], bs.inputs["Normal"])
            mat.node_tree.nodes.remove(emit)


def world_rotate(rig, name, axis, angle):
    b = rig.pose.bones[name]
    q = Quaternion(axis, angle) @ b.matrix.to_quaternion()
    m = q.to_matrix().to_4x4()
    m.translation = b.head
    b.matrix = m
    bpy.context.view_layer.update()


def locomotion(rig, objects, sex="male"):
    scene = bpy.context.scene
    scene.frame_set(1)
    bpy.context.view_layer.update()
    base = {b.name: b.matrix_basis.copy() for b in rig.pose.bones}
    feet = {side: rig.pose.bones["foot_" + side].matrix.copy() for side in ["l", "r"]}
    arms = {
        side: (
            rig.pose.bones["upperarm_" + side].tail
            - rig.pose.bones["upperarm_" + side].head
        ).normalized()
        for side in ["l", "r"]
    }
    shoes = [o for o in objects if "high-top sneaker" in o.name]
    initial_floor = min(array(o, True)[:, 2].min() for o in shoes)
    root = rig.pose.bones["Root"]
    root_world_to_local = root.bone.matrix_local.to_3x3().inverted()
    clips = []
    metrics = {}
    rig.animation_data.action = None
    for name, duration in [("idle", 90), ("walk", 32), ("run", 22)]:
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        samples = []
        for frame in range(duration + 1):
            # Author each pose with no active action. Otherwise evaluation of
            # the preceding keys can restore bones during the IK updates.
            rig.animation_data.action = None
            scene.frame_set(frame + 1)
            phase = math.tau * frame / duration
            for b in rig.pose.bones:
                b.rotation_mode = "QUATERNION"
                b.matrix_basis = base[b.name]
            # Pelvis lowering permits planted, softly flexed knees; in-place
            # stance feet travel backwards at uniform speed during contact.
            bob = (
                0.002 * math.sin(phase)
                if name == "idle"
                else (
                    -0.026 + 0.009 * math.cos(phase * 2)
                    if name == "walk"
                    else -0.045 + 0.026 * math.cos(phase * 2)
                )
            )
            root.location += root_world_to_local @ Vector((0, 0, bob - initial_floor))
            bpy.context.view_layer.update()
            world_rotate(
                rig,
                "spine_02",
                (1, 0, 0),
                (
                    0.004 * math.sin(phase)
                    if name == "idle"
                    else 0.025
                    if name == "walk"
                    else 0.09
                ),
            )
            world_rotate(
                rig,
                "spine_03",
                (0, 0, 1),
                (0.005 if name == "idle" else 0.025) * math.sin(phase),
            )
            for side, sign in [("l", 1), ("r", -1)]:
                u = (frame / duration + (0 if side == "l" else 0.5)) % 1
                stride = 0 if name == "idle" else (0.31 if name == "walk" else 0.48)
                stance = 0.60 if name != "run" else 0.40
                if u < stance:
                    forward = stride * (0.5 - u / stance)
                    lift = 0
                else:
                    v = (u - stance) / (1 - stance)
                    forward = stride * (-0.5 + (1 - math.cos(math.pi * v)) * 0.5)
                    lift = (
                        0 if name == "idle" else 0.065 if name == "walk" else 0.17
                    ) * math.sin(math.pi * v)
                ankle = feet[side].translation + Vector(
                    (0, -forward, lift - initial_floor)
                )
                thigh = rig.pose.bones["thigh_" + side]
                calf = rig.pose.bones["calf_" + side]
                hip = thigh.head.copy()
                delta = ankle - hip
                length1, length2 = thigh.length, calf.length
                distance = min(delta.length, length1 + length2 - 0.0001)
                direction = delta.normalized()
                along = (length1**2 - length2**2 + distance**2) / (2 * distance)
                bend = Vector((0, -1, 0))
                bend = (bend - direction * bend.dot(direction)).normalized()
                knee = (
                    hip
                    + direction * along
                    + bend * math.sqrt(max(0, length1**2 - along**2))
                )
                point_bone(rig, thigh.name, knee - hip)
                point_bone(rig, calf.name, ankle - rig.pose.bones[calf.name].head)
                foot = rig.pose.bones["foot_" + side]
                orientation = feet[side].to_quaternion()
                fm = orientation.to_matrix().to_4x4()
                fm.translation = foot.head
                foot.matrix = fm
                swing = -(
                    0.012 if name == "idle" else 0.25 if name == "walk" else 0.52
                ) * math.cos(phase + (0 if side == "l" else math.pi))
                point_bone(
                    rig,
                    "upperarm_" + side,
                    # The narrower female shoulders need a little more arm
                    # clearance around the wider cargo pockets and hip straps.
                    (sign * (0.23 if sex == "female" else 0.11), -math.sin(swing), -math.cos(swing)),
                )
                # Elbows flex forward; hands inherit the forearm without
                # detaching jewelry or changing the canonical joint chain.
                point_bone(
                    rig,
                    "lowerarm_" + side,
                    (
                        sign * (0.18 if sex == "female" else 0.10),
                        -math.sin(
                            swing
                            + (
                                1.28
                                if name == "run"
                                else 0.22
                                if name == "walk"
                                else 0.10
                            )
                        ),
                        -math.cos(
                            swing
                            + (
                                1.28
                                if name == "run"
                                else 0.22
                                if name == "walk"
                                else 0.10
                            )
                        ),
                    ),
                )
            for side, sign in [("l", 1), ("r", -1)]:
                palm = Vector((-sign, 0, 0))
                for finger in ["index", "middle", "ring", "pinky"]:
                    for joint in [1, 2, 3]:
                        bone_name = f"{finger}_{joint:02d}_{side}"
                        bone = rig.pose.bones[bone_name]
                        axis = (
                            (bone.tail - bone.head)
                            .normalized()
                            .cross(palm)
                            .normalized()
                        )
                        world_rotate(
                            rig,
                            bone_name,
                            axis,
                            0.45 if name == "run" else 0.22 if name == "walk" else 0.12,
                        )
            bpy.context.view_layer.update()
            floors = [float(array(o, True)[:, 2].min()) for o in shoes]
            correction = -min(floors) if name != "run" else max(0, -min(floors))
            root.location += root_world_to_local @ Vector((0, 0, correction))
            bpy.context.view_layer.update()
            rig.animation_data.action = action
            for b in rig.pose.bones:
                # Matrix assignment is converted explicitly before keying.
                loc, rot, scale = b.matrix_basis.decompose()
                b.location, b.rotation_quaternion, b.scale = loc, rot, scale
                for channel in ["location", "rotation_quaternion", "scale"]:
                    b.keyframe_insert(data_path=channel, frame=frame + 1, group=b.name)
            if frame % max(1, duration // 8) == 0:
                floors = [float(array(o, True)[:, 2].min()) for o in shoes]
                samples.append({"frame": frame + 1, "sole_z_m": floors})
        clips.append(action)
        metrics[name] = samples
    rig.animation_data.action = clips[0]
    scene.frame_start = 1
    scene.frame_end = 91
    scene.render.fps = 30
    scene.frame_set(1)
    bpy.context.view_layer.update()
    return clips, metrics


def sample_correctives(rig, clips, objects):
    result = {}
    scene = bpy.context.scene
    # Facial and groom controls are owned by the runtime, independently of the
    # locomotion clips. Clothing correctives keep their sampled animation.
    morphs = [o for o in objects if o.data.shape_keys and not all(
        k.name.startswith(("Expression_", "Secondary_"))
        for k in o.data.shape_keys.key_blocks[1:])]
    for clip in clips:
        rig.animation_data.action = clip
        rows = {o.name: [] for o in morphs}
        frames = range(int(clip.frame_range[0]), int(clip.frame_range[1]) + 1)
        for frame in frames:
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            for ob in morphs:
                rows[ob.name].append(
                    [float(k.value) for k in ob.data.shape_keys.key_blocks[1:]]
                )
        result[clip.name] = rows
    rig.animation_data.action = clips[0]
    scene.frame_set(1)
    return result


def complete_morph_channels(path, samples):
    """glTF exporter omits cross-object driven keys; write sampled channels.

    These are the actual evaluated native values on every exported frame,
    including hardware following the coat and the collar's separate drivers.
    """
    raw = path.read_bytes()
    json_size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20 : 20 + json_size])
    binary = bytearray(raw[28 + json_size :])

    def accessor(values, kind, count):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(struct.pack("<" + "f" * len(values), *values))
        view = len(doc["bufferViews"])
        doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(values) * 4}
        )
        index = len(doc["accessors"])
        doc["accessors"].append(
            {
                "bufferView": view,
                "componentType": 5126,
                "count": count,
                "type": kind,
                "min": [min(values)],
                "max": [max(values)],
            }
        )
        return index

    nodes = {n["name"]: i for i, n in enumerate(doc["nodes"]) if "mesh" in n}
    for animation in doc["animations"]:
        animation["channels"] = [
            c for c in animation["channels"] if c["target"]["path"] != "weights"
        ]
        for name, rows in samples[animation["name"]].items():
            node = nodes[name]
            mesh = doc["meshes"][doc["nodes"][node]["mesh"]]
            assert len(mesh["primitives"][0]["targets"]) == len(rows[0])
            time = accessor([i / 30 for i in range(len(rows))], "SCALAR", len(rows))
            flat = [v for row in rows for v in row]
            values = accessor(flat, "SCALAR", len(flat))
            sampler = len(animation["samplers"])
            animation["samplers"].append(
                {"input": time, "output": values, "interpolation": "LINEAR"}
            )
            animation["channels"].append(
                {"sampler": sampler, "target": {"node": node, "path": "weights"}}
            )
    # Ship only public contract metadata, not inherited local authoring paths.
    for material in doc["materials"]:
        if material.get("alphaMode") == "BLEND" and any(
            term in material.get("name", "")
            for term in [
                "groom fibers",
                "hair strands",
                "scalp strands",
                "swept strands",
            ]
        ):
            material["alphaMode"] = "MASK"
            material["alphaCutoff"] = 0.08
    for scene in doc["scenes"]:
        scene["extras"] = {"avatarContract": "complete-pair-v1"}
    doc["buffers"][0]["byteLength"] = len(binary)
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * ((-len(encoded)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(binary))
        + struct.pack("<I4s", len(encoded), b"JSON")
        + encoded
        + struct.pack("<I4s", len(binary), b"BIN\0")
        + binary
    )


def run(sex, prepared=False, polished=False, expressive=False):
    source = (
        OUT
        / f"{sex}-{'expressive' if expressive else 'motion-fitted' if prepared else 'polished' if polished else 'finished'}.blend"
    )
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    objects = [o for o in scene.objects if o.type == "MESH" and not o.hide_render]
    scene.frame_set(1)
    if prepared or expressive:
        clips = [bpy.data.actions[name] for name in ["idle", "walk", "run"]]
        metrics = json.loads((OUT / f"{sex}-runtime.json").read_text())["clips"]
    else:
        portable_materials(sex, objects)
        clips, metrics = locomotion(rig, objects, sex)
    correctives = sample_correctives(rig, clips, objects)
    for ob in objects:
        if not ob.get("avatarSlot"):
            n = ob.name.lower()
            slot = (
                "jacket"
                if "jacket" in n
                else "top"
                if ("shirt" in n or "top_" in n)
                else "body"
            )
            ob["avatarSlot"] = slot
        ob["launchCharacter"] = sex
    rig["avatarContract"] = "complete-pair-v1"
    rig["avatarCharacter"] = sex
    bpy.ops.wm.save_as_mainfile(
        filepath=str(OUT / f"{sex}-runtime.blend"), compress=True
    )
    # Export-friendly shell treatment: two-sided thin cloth keeps driven
    # morphs; solidify and subdivision on meshes without morphs are applied.
    for ob in objects:
        select(ob)
        arms = [m for m in ob.modifiers if m.type == "ARMATURE"]
        for arm in arms:
            arm.show_viewport = False
        for mod in list(ob.modifiers):
            if mod.type == "ARMATURE":
                continue
            if ob.data.shape_keys:
                ob.modifiers.remove(mod)
            else:
                bpy.ops.object.modifier_apply(modifier=mod.name)
        for arm in arms:
            arm.show_viewport = True
        for mat in ob.data.materials:
            if mat:
                mat.use_backface_culling = False
    for action in list(bpy.data.actions):
        if action not in clips:
            bpy.data.actions.remove(action)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [rig] + objects:
        ob.hide_set(False)
        ob.select_set(True)
    bpy.context.view_layer.objects.active = rig
    PUBLIC.mkdir(parents=True, exist_ok=True)
    output = PUBLIC / f"{sex}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_skins=True,
        export_morph=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_range=False,
        export_optimize_animation_size=True,
    )
    complete_morph_channels(output, correctives)
    (OUT / f"{sex}-runtime.json").write_text(
        json.dumps(
            {
                "source": source.name,
                "glb": str(output.relative_to(ROOT)),
                "bytes": output.stat().st_size,
                "clips": metrics,
                "bones": len(rig.data.bones),
            },
            indent=2,
        )
        + "\n"
    )
    print("COMPLETE_PAIR_EXPORTED", sex, output.stat().st_size, flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--sex", choices=["male", "female"], required=True)
    p.add_argument("--prepared", action="store_true")
    p.add_argument("--polished", action="store_true")
    p.add_argument("--expressive", action="store_true")
    args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    run(args.sex, args.prepared, args.polished, args.expressive)
