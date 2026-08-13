# Owner-review turnaround for the avatar body bases.
#
# Renders front / side / three-quarter views of both bodies, PLUS face/hand/
# foot/crotch close-ups (see CLOSEUPS - added in pass 2 after the full-body
# views turned out too small to catch the crotch boundary zigzag or judge the
# face sculpt at all), to assets-src/avatars/body-bases/review-renders/ so
# proportions and small-scale detail can both be judged without opening
# Blender. Read-only: never saves the .blend.
#
# Run:  blender -b assets-src/avatars/body-bases/avatar.blend \
#         --python scripts/render-avatar-bodies.py
import math
import os

import bpy
from mathutils import Euler, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets-src", "avatars", "body-bases", "review-renders")
VIEWS = {"front": 0.0, "side": 90.0, "three-quarter": 35.0}
BODIES = ("male", "female")

# Close-up framings (pass 2): the full-body views above put the hands/feet
# right at the frame edge or past it entirely, and the face/crotch read too
# small to judge sculpt/boundary quality - these are what actually caught the
# crotch zigzag and the featureless-egg-head problems in owner review, so
# they stay part of the standard workflow rather than being a one-off check.
# Each entry is (target_xyz, camera_distance, yaw_degrees, lens_mm).
CLOSEUPS = {
    "face":   ((0.0, -0.06, 1.60), 0.40, 0.0, 45.0),
    "hand":   ((0.20, -0.02, 0.70), 0.35, 0.0, 45.0),
    "foot":   ((0.085, -0.04, 0.05), 0.40, 75.0, 45.0),
    "crotch": ((0.0, 0.0, 0.86), 0.42, 0.0, 85.0),
}


def setup():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 620
    scene.render.resolution_y = 1000
    scene.render.film_transparent = False
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.show_cavity = True
    shading.show_shadows = True

    cam_data = bpy.data.cameras.new("AvatarReviewCam")
    cam_data.lens = 85.0
    cam = bpy.data.objects.new("AvatarReviewCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    cam = setup()
    bodies = {sex: bpy.data.objects.get(f"AvatarBody_{sex}") for sex in BODIES}
    for obj in bpy.data.objects:
        obj.hide_render = obj.type != "MESH"

    for sex, body in bodies.items():
        if body is None:
            raise RuntimeError(f"AvatarBody_{sex} missing - run generate-avatar-bodies.py first")
    for sex, body in bodies.items():
        for other_sex, other in bodies.items():
            other.hide_render = other_sex != sex
        for view, yaw in VIEWS.items():
            angle = math.radians(yaw)
            distance = 4.2
            cam.location = Vector((math.sin(angle) * distance, -math.cos(angle) * distance, 0.95))
            cam.rotation_euler = Euler((math.radians(90.0), 0.0, angle), "XYZ")
            bpy.context.scene.render.filepath = os.path.join(OUT_DIR, f"{sex}-{view}.png")
            bpy.ops.render.render(write_still=True)
            print(f"AVATAR_RENDER {sex} {view} -> {bpy.context.scene.render.filepath}")

        # Close-ups: orbit the camera around the target point itself (rather
        # than the world origin, like the full-body views above) so a small
        # yaw still frames the body part instead of drifting off it.
        for name, (target, distance, yaw, lens) in CLOSEUPS.items():
            target_v = Vector(target)
            angle = math.radians(yaw)
            cam.data.lens = lens
            cam.location = target_v + Vector((math.sin(angle) * distance, -math.cos(angle) * distance, 0.0))
            cam.rotation_euler = Euler((math.radians(90.0), 0.0, angle), "XYZ")
            bpy.context.scene.render.filepath = os.path.join(OUT_DIR, f"{sex}-closeup-{name}.png")
            bpy.ops.render.render(write_still=True)
            print(f"AVATAR_RENDER {sex} closeup-{name} -> {bpy.context.scene.render.filepath}")
            cam.data.lens = 85.0


main()
