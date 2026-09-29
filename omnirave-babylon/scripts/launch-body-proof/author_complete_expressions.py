"""Add editable facial and groom shapes to the fitted complete characters.

Connection map: upper/lower lids meet over the measured eye surface; lashes
follow the same lid field; brows follow the forehead field. Hair roots stay
fixed and connected to the retained scalp. No topology or skin weights change.
The preceding fitted sources remain read-only.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array, review


def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def points(ob):
    return np.array([list(ob.matrix_world @ v.co) for v in ob.data.vertices])


def shape(ob, name, world, signed=False):
    if not ob.data.shape_keys:
        ob.shape_key_add(name="Basis")
    key = ob.shape_key_add(name=name)
    local = (np.c_[world, np.ones(len(world))] @ np.linalg.inv(np.array(ob.matrix_world)).T)[:, :3]
    key.data.foreach_set("co", local.astype(np.float32).ravel())
    key.slider_min = -1 if signed else 0
    key.slider_max = 1
    key.value = 0
    delta = world - points(ob)
    assert np.isfinite(delta).all()
    return {"verticesMoved": int((np.linalg.norm(delta, axis=1) > 1e-7).sum()),
            "maximumDisplacementMm": round(float(np.linalg.norm(delta, axis=1).max() * 1000), 3)}


def lid_field(p, eye, iris):
    center = (eye.min(0) + eye.max(0)) * 0.5
    radius = (eye.max(0) - eye.min(0)) * 0.5
    dx = p[:, 0] - iris[0]
    seam = iris[2] - 0.0018 + 0.055 * dx * np.sign(iris[0])
    dz = p[:, 2] - seam
    # Keep the existing canthi, with a soft falloff into the orbital skin.
    horizontal = 1 - smooth((np.abs(dx) - 0.014) / 0.012)
    vertical = 1 - smooth((np.abs(dz) - 0.0075) / np.where(dz > 0, 0.006, 0.010))
    front = smooth((center[1] + 0.006 - p[:, 1]) / 0.016)
    amount = horizontal * vertical * front
    q = p.copy()
    q[:, 2] += (-dz + np.sign(dz) * 0.00004) * amount
    # Roll the lid forward over the cornea instead of through the eyeball.
    sphere = center[1] - radius[1] * np.sqrt(np.clip(1 - (dx / radius[0]) ** 2
                       - ((q[:, 2] - center[2]) / radius[2]) ** 2, 0, 1)) - 0.001
    q[:, 1] += np.minimum(0, sphere - p[:, 1]) * amount
    return q


def brow_field(p, eye_center):
    dz = p[:, 2] - (eye_center[2] + 0.015)
    w = np.exp(-0.5 * ((np.abs(p[:, 0]) - 0.028) / 0.024) ** 4
               - 0.5 * (dz / 0.012) ** 2)
    w *= smooth((eye_center[1] + 0.005 - p[:, 1]) / 0.022)
    w *= (np.abs(dz) < 0.045)
    q = p.copy()
    q[:, 2] += 0.004 * w
    q[:, 1] -= 0.0008 * w
    return q


def author(sex, head_refined=False, footwear_refined=False, outfit_refined=False, upper_refined=False, groom_refined=False, jacket_refined=False, jacket_shape_refined=False, layer_refined=False, pocket_refined=False, opening_refined=False, knit_refined=False, face_finished=False, crop_refined=False, hair_refined=False, foil_refined=False, transmission_refined=False, final_forms=False):
    source = 'final-forms' if final_forms else 'transmission-refined' if transmission_refined else 'foil-refined' if foil_refined else 'hair-refined' if hair_refined else 'crop-refined' if crop_refined else 'face-finished' if face_finished else 'knit-refined' if knit_refined else 'opening-refined' if opening_refined else 'pocket-refined' if pocket_refined else 'layer-refined' if layer_refined else 'jacket-shape-refined' if jacket_shape_refined else 'jacket-refined' if jacket_refined else 'groom-refined' if groom_refined else 'upper-refined' if upper_refined else 'outfit-refined' if outfit_refined else 'footwear-refined' if footwear_refined else 'head-refined' if head_refined else 'motion-fitted'
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{sex}-{source}.blend"))
    bpy.context.preferences.filepaths.save_version = 0
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    report = {}
    eyes = {side: points(bpy.data.objects["AvatarEye_" + side]) for side in ["l", "r"]}
    irises = {side: points(bpy.data.objects["AvatarIris_" + side]).mean(0) for side in ["l", "r"]}
    center = (irises["l"] + irises["r"]) * 0.5
    for name in ["AvatarBody", "AvatarEyelashes"]:
        ob = bpy.data.objects[name]
        p = points(ob)
        report[name] = {}
        for side, label in [("l", "Left"), ("r", "Right")]:
            report[name]["Expression_Blink" + label] = shape(ob, "Expression_Blink" + label,
                                                           lid_field(p, eyes[side], irises[side]))
    for name in ["AvatarBody", "AvatarEyebrows"]:
        ob = bpy.data.objects[name]
        report.setdefault(name, {})["Expression_BrowLift"] = shape(ob, "Expression_BrowLift", brow_field(points(ob), center))
    p = points(body)
    lip_group = body.vertex_groups["lips"].index
    lip_ids = [v.index for v in body.data.vertices if any(g.group == lip_group and g.weight > 0.1 for g in v.groups)]
    mouth = p[lip_ids].mean(0)
    # The mouth corners sit farther back than the protruding vermilion. A
    # lip-depth cutoff would lift the lip lobes while leaving the corners down.
    front = smooth((mouth[1] + 0.055 - p[:, 1]) / 0.020)
    corners = np.exp(-0.5 * ((np.abs(p[:, 0]) - 0.023) / 0.011) ** 2
                     - 0.5 * ((p[:, 2] - mouth[2]) / 0.013) ** 2) * front
    cheeks = np.exp(-0.5 * ((np.abs(p[:, 0]) - 0.041) / 0.014) ** 2
                    - 0.5 * ((p[:, 2] - (center[2] - 0.032)) / 0.019) ** 2) * front
    q = p.copy()
    q[:, 0] += np.sign(p[:, 0]) * 0.003 * corners
    q[:, 2] += 0.008 * corners + 0.0014 * cheeks
    q[:, 1] -= 0.0008 * cheeks
    # Compact support keeps the neck, body, hands and garment clearance exact.
    q[p[:, 2] < center[2] - 0.12] = p[p[:, 2] < center[2] - 0.12]
    report[body.name]["Expression_Smile"] = shape(body, "Expression_Smile", q)
    for ob in list(bpy.context.scene.objects):
        if ob.type != "MESH" or ob.get("avatarSlot") != "hair":
            continue
        p = points(ob)
        if sex == "male" and ob.name in ["Luxury retained swept groom", "Polished male flyaways"]:
            # The retained groom uses 12 samples per ribbon, flyaways 10.
            samples = 12 if "retained" in ob.name else 10
            t = (np.arange(len(p)) // 2 % samples) / (samples - 1)
            w = smooth((t - 0.18) / 0.82) ** 2
            ax, ay = 0.005, 0.003
        elif sex == "female" and (ob.name.startswith("PLURR pony")
                or ob.name in ["PLURR gathered pony bundle", "Polished female flyaways"]):
            # One shared spatial field keeps the pony core and ribbons together.
            top = eyes["l"].max(0)[2] + 0.105
            w = smooth((top - 0.018 - p[:, 2]) / 0.28) ** 1.5
            w *= smooth((p[:, 1] - 0.005) / 0.035)
            ax, ay = 0.020, 0.012
        else:
            continue
        report[ob.name] = {}
        for axis, label, amplitude in [(0, "Side", ax), (1, "Back", ay)]:
            q = p.copy()
            q[:, axis] += amplitude * w
            report[ob.name]["Secondary_Hair" + label] = shape(ob, "Secondary_Hair" + label, q, signed=True)
    rig.data.pose_position = "POSE"
    rig.animation_data.action = bpy.data.actions["idle"]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH' and ob.data.shape_keys:
            for key in ob.data.shape_keys.key_blocks:
                if key.name.startswith(('Expression_', 'Secondary_')): key.value = 0
            ob.active_shape_key_index = 0
    bpy.context.view_layer.update()
    bpy.context.scene["expressionContract"] = "complete-expression-v1"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{sex}-expressive.blend"), compress=True)
    (OUT / f"{sex}-expression-shapes.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def render(sex):
    scene = bpy.context.scene
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.33
    eye = array(bpy.data.objects["AvatarEye_l"], True).mean(0)
    camera.location = (0.12, -4, eye[2])
    review.look_at(camera, Vector((0, -0.03, eye[2] - 0.018)))
    scene.view_settings.exposure = -0.8
    scene.render.resolution_x = 700
    scene.render.resolution_y = 800
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 24
    for label, values in [("neutral", {}), ("blink", {"Expression_BlinkLeft": 1, "Expression_BlinkRight": 1}),
                          ("smile", {"Expression_Smile": 0.85, "Expression_BrowLift": 0.15})]:
        for ob in scene.objects:
            if ob.type == "MESH" and ob.data.shape_keys:
                for k in ob.data.shape_keys.key_blocks:
                    if k.name.startswith("Expression_"):
                        k.value = values.get(k.name, 0)
        bpy.context.view_layer.update()
        scene.render.filepath = str(OUT / f"{sex}-expression-{label}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sex", required=True, choices=["male", "female"])
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--head-refined", action="store_true")
    parser.add_argument("--footwear-refined", action="store_true")
    parser.add_argument("--outfit-refined", action="store_true")
    parser.add_argument("--upper-refined", action="store_true")
    parser.add_argument("--groom-refined", action="store_true")
    parser.add_argument("--jacket-refined", action="store_true")
    parser.add_argument("--jacket-shape-refined", action="store_true")
    parser.add_argument("--layer-refined", action="store_true")
    parser.add_argument("--pocket-refined", action="store_true")
    parser.add_argument("--opening-refined", action="store_true")
    parser.add_argument("--knit-refined", action="store_true")
    parser.add_argument("--face-finished", action="store_true")
    parser.add_argument("--crop-refined", action="store_true")
    parser.add_argument("--hair-refined", action="store_true")
    parser.add_argument("--foil-refined", action="store_true")
    parser.add_argument("--transmission-refined", action="store_true")
    parser.add_argument("--final-forms", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    print(json.dumps(author(args.sex, args.head_refined, args.footwear_refined, args.outfit_refined, args.upper_refined, args.groom_refined, args.jacket_refined, args.jacket_shape_refined, args.layer_refined, args.pocket_refined, args.opening_refined, args.knit_refined, args.face_finished, args.crop_refined, args.hair_refined, args.foil_refined, args.transmission_refined, args.final_forms), indent=2), flush=True)
    if args.render:
        render(args.sex)
