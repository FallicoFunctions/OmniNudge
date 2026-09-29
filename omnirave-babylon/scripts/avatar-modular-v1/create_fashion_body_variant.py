"""Create protected OmniRave fashion/editorial body and rig derivatives.

Connection map (Blender assembly contract):

    AvatarSkeleton (56-bone shared armature)
      -> AvatarBody (L0 core, male/female/lean shape keys)
      -> AvatarTop_* / AvatarJacket_* / AvatarBottoms_* (L4 fitted shells)
      -> AvatarHair_* / AvatarShoes_* / AvatarAccessory_* (L3/L4 modules)

No primitives or detached parts are created. Every mesh coordinate is converted into
armature space, mapped by the same old-bone -> new-bone field, and converted back. Edit-bone
endpoints are then replaced by those same mapped endpoints. This preserves contact seams,
topology, material slots, vertex groups, object/option names and the existing action library.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


ARMATURE_NAME = "AvatarSkeleton"
EXPECTED_BONES = 56

FASHION_PROFILES = {
    "fashion-v2": {
    "legLength": 0.075,
    "neckLength": 0.085,
    "shoulderWidth": -0.055,
    "ribWidth": -0.085,
    "ribDepth": -0.060,
    "waistWidth": -0.100,
    "waistDepth": -0.070,
    "upperArmRadius": -0.060,
    "forearmRadius": -0.075,
    "thighRadius": -0.100,
    "calfRadius": -0.095,
    "wristRadius": -0.115,
    "ankleRadius": -0.115,
    "headWidth": -0.050,
    "jawWidth": -0.075,
    },
    "editorial-v3": {
        "legLength": 0.090,
        "neckLength": 0.100,
        "torsoLength": -0.070,
        "shoulderWidth": -0.105,
        "shoulderDrop": 0.018,
        "ribWidth": -0.120,
        "ribDepth": -0.090,
        "waistWidth": -0.140,
        "waistDepth": -0.100,
        "upperArmRadius": -0.120,
        "forearmRadius": -0.140,
        "thighRadius": -0.140,
        "calfRadius": -0.155,
        "wristRadius": -0.170,
        "ankleRadius": -0.170,
        "headWidth": -0.050,
        "jawWidth": -0.080,
    },
    "editorial-v4": {
        "legLength": 0.090,
        "neckLength": 0.100,
        "torsoLength": -0.070,
        "shoulderWidth": -0.105,
        "shoulderDrop": 0.018,
        "ribWidth": -0.120,
        "ribDepth": -0.090,
        "waistWidth": -0.140,
        "waistDepth": -0.100,
        "upperArmRadius": -0.120,
        "forearmRadius": -0.140,
        "thighRadius": -0.140,
        "calfRadius": -0.155,
        "wristRadius": -0.170,
        "ankleRadius": -0.170,
        "headHeight": -0.140,
        "headWidth": -0.120,
        "headDepth": -0.060,
        "jawWidth": -0.140,
    },
    "editorial-v5": {
        "legLength": 0.090,
        "neckLength": 0.100,
        "torsoLength": -0.070,
        "shoulderWidth": -0.105,
        "shoulderDrop": 0.018,
        "ribWidth": -0.120,
        "ribDepth": -0.090,
        "waistWidth": -0.140,
        "waistDepth": -0.100,
        "upperArmRadius": -0.120,
        "forearmRadius": -0.140,
        "thighRadius": -0.140,
        "calfRadius": -0.155,
        "wristRadius": -0.170,
        "ankleRadius": -0.170,
        "headHeight": -0.240,
        "headWidth": -0.160,
        "headDepth": -0.070,
        "jawWidth": -0.180,
    },
    # Re-grounded from reference-analysis.json after the user rejected V5.
    # These are measured deltas from protected Lean V1, not a continuation of
    # the increasingly exaggerated V3-V5 thinning branch.
    "editorial-v6": {
        "legLength": 0.055,
        "neckLength": 0.070,
        "torsoLength": -0.035,
        "shoulderWidth": -0.040,
        "shoulderDrop": 0.008,
        "ribWidth": -0.075,
        "ribDepth": -0.055,
        "waistWidth": -0.090,
        "waistDepth": -0.060,
        "upperArmRadius": -0.060,
        "forearmRadius": -0.075,
        "thighRadius": -0.085,
        "calfRadius": -0.080,
        "wristRadius": -0.110,
        "ankleRadius": -0.100,
        "headHeight": 0.000,
        "headWidth": -0.035,
        "headDepth": -0.015,
        "jawWidth": -0.055,
    },
    "editorial-v7": {
        "legLength": 0.055,
        "neckLength": 0.070,
        "torsoLength": -0.035,
        "shoulderWidth": -0.040,
        "shoulderDrop": 0.008,
        "ribWidth": -0.075,
        "ribDepth": -0.055,
        "waistWidth": -0.090,
        "waistDepth": -0.060,
        "upperArmRadius": -0.060,
        "forearmRadius": -0.075,
        "thighRadius": -0.085,
        "calfRadius": -0.080,
        "wristRadius": -0.110,
        "ankleRadius": -0.100,
        "headHeight": 0.000,
        "headWidth": -0.035,
        "headDepth": -0.015,
        "jawWidth": -0.055,
        "maleShoulderBalance": 0.035,
        "maleHipBalance": -0.045,
        "maleThighBalance": -0.040,
    },
    "editorial-v8": {
        "legLength": 0.055,
        "neckLength": 0.070,
        "torsoLength": -0.035,
        "shoulderWidth": -0.040,
        "shoulderDrop": 0.008,
        "ribWidth": -0.075,
        "ribDepth": -0.055,
        "waistWidth": -0.090,
        "waistDepth": -0.060,
        "upperArmRadius": -0.060,
        "forearmRadius": -0.075,
        "thighRadius": -0.085,
        "calfRadius": -0.080,
        "wristRadius": -0.110,
        "ankleRadius": -0.100,
        "headHeight": 0.000,
        "headWidth": -0.035,
        "headDepth": -0.015,
        "jawWidth": -0.055,
        "femaleHipBalance": 0.025,
        "femaleThighBalance": -0.005,
        "maleShoulderBalance": 0.035,
        "maleHipBalance": -0.055,
        "maleThighBalance": -0.060,
        "maleCalfBalance": -0.025,
    },
    # V9 changes only the long-axis landmark rhythm. All V8 lateral/depth
    # fields stay locked so this pass cannot silently reintroduce the earlier
    # tiny-head, stick-limb, or pear-silhouette failures.
    "editorial-v9": {
        "legLength": 0.072,
        "neckLength": 0.070,
        "torsoLength": -0.055,
        "shoulderWidth": -0.040,
        "shoulderDrop": 0.008,
        "ribWidth": -0.075,
        "ribDepth": -0.055,
        "waistWidth": -0.090,
        "waistDepth": -0.060,
        "upperArmRadius": -0.060,
        "forearmRadius": -0.075,
        "thighRadius": -0.085,
        "calfRadius": -0.080,
        "wristRadius": -0.110,
        "ankleRadius": -0.100,
        "headHeight": 0.000,
        "headWidth": -0.035,
        "headDepth": -0.015,
        "jawWidth": -0.055,
        "femaleHipBalance": 0.025,
        "femaleThighBalance": -0.005,
        "maleShoulderBalance": 0.035,
        "maleHipBalance": -0.055,
        "maleThighBalance": -0.060,
        "maleCalfBalance": -0.025,
    },
    # V10 preserves V9's long-axis landmarks and all global radii. Its only
    # purpose is a bounded sex-specific torso contour pass, avoiding another
    # whole-body thinning operation.
    "editorial-v10": {
        "legLength": 0.072,
        "neckLength": 0.070,
        "torsoLength": -0.055,
        "shoulderWidth": -0.040,
        "shoulderDrop": 0.008,
        "ribWidth": -0.075,
        "ribDepth": -0.055,
        "waistWidth": -0.090,
        "waistDepth": -0.060,
        "upperArmRadius": -0.060,
        "forearmRadius": -0.075,
        "thighRadius": -0.085,
        "calfRadius": -0.080,
        "wristRadius": -0.110,
        "ankleRadius": -0.100,
        "headHeight": 0.000,
        "headWidth": -0.035,
        "headDepth": -0.015,
        "jawWidth": -0.055,
        "femaleRibContour": -0.018,
        "femaleWaistContour": -0.025,
        "femaleIliacContour": 0.012,
        "maleShoulderContour": 0.020,
        "maleRibContour": 0.015,
        "maleWaistContour": -0.025,
        "maleHipContour": -0.010,
    },
    # V11 is a single bounded anatomy-rhythm correction from protected Lean V1.
    # It does not thin the body globally: it raises the hip/groin transition,
    # removes V10's added female iliac shelf, and straightens the male waist.
    "editorial-v11": {
        "legLength": 0.082,
        "neckLength": 0.070,
        "torsoLength": -0.072,
        "shoulderWidth": -0.040,
        "shoulderDrop": 0.008,
        "ribWidth": -0.075,
        "ribDepth": -0.055,
        "waistWidth": -0.090,
        "waistDepth": -0.060,
        "upperArmRadius": -0.060,
        "forearmRadius": -0.075,
        "thighRadius": -0.085,
        "calfRadius": -0.080,
        "wristRadius": -0.110,
        "ankleRadius": -0.100,
        "headHeight": 0.000,
        "headWidth": -0.035,
        "headDepth": -0.015,
        "jawWidth": -0.055,
        "femaleRibContour": -0.018,
        "femaleWaistContour": -0.022,
        "femaleIliacContour": 0.000,
        "maleShoulderContour": 0.015,
        "maleRibContour": 0.015,
        "maleWaistContour": 0.005,
        "maleHipContour": -0.005,
    },
}

VERTICAL_ANCHOR_PROFILES = {
    "fashion-v2": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.509),
        (0.897, 0.959),
        (1.363, 1.413),
        (1.433, 1.485),
        (1.534, 1.595),
        (1.6815, 1.7425),
    ),
    # Shorter upper-torso rhythm, higher pelvis and longer balanced legs while
    # retaining the reviewed 1.7425 m crown height.
    "editorial-v3": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.515),
        (0.897, 0.970),
        (1.363, 1.405),
        (1.433, 1.470),
        (1.534, 1.595),
        (1.6815, 1.7425),
    ),
    "editorial-v4": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.515),
        (0.897, 0.970),
        (1.363, 1.405),
        (1.433, 1.470),
        (1.534, 1.595),
        (1.6815, 1.7425),
    ),
    "editorial-v5": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.515),
        (0.897, 0.970),
        (1.363, 1.405),
        (1.433, 1.470),
        (1.534, 1.595),
        (1.6815, 1.7425),
    ),
    "editorial-v6": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.503),
        (0.897, 0.952),
        (1.363, 1.407),
        (1.433, 1.474),
        (1.534, 1.590),
        (1.6815, 1.7425),
    ),
    "editorial-v7": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.503),
        (0.897, 0.952),
        (1.363, 1.407),
        (1.433, 1.474),
        (1.534, 1.590),
        (1.6815, 1.7425),
    ),
    "editorial-v8": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.503),
        (0.897, 0.952),
        (1.363, 1.407),
        (1.433, 1.474),
        (1.534, 1.590),
        (1.6815, 1.7425),
    ),
    "editorial-v9": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.520),
        (0.897, 0.980),
        (1.363, 1.407),
        (1.433, 1.474),
        (1.534, 1.590),
        (1.6815, 1.7425),
    ),
    "editorial-v10": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.520),
        (0.897, 0.980),
        (1.363, 1.407),
        (1.433, 1.474),
        (1.534, 1.590),
        (1.6815, 1.7425),
    ),
    "editorial-v11": (
        (0.000, 0.000),
        (0.069, 0.069),
        (0.478, 0.530),
        (0.897, 1.010),
        (1.363, 1.407),
        (1.433, 1.474),
        (1.534, 1.590),
        (1.6815, 1.7425),
    ),
}

ACTIVE_PROFILE = "fashion-v2"


def profile() -> dict[str, float]:
    return FASHION_PROFILES[ACTIVE_PROFILE]


def vertical_anchors() -> tuple[tuple[float, float], ...]:
    return VERTICAL_ANCHOR_PROFILES[ACTIVE_PROFILE]


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-blend", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument(
        "--profile",
        choices=tuple(FASHION_PROFILES),
        default="fashion-v2",
    )
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def remap_height(z: float) -> float:
    anchors = vertical_anchors()
    if z <= anchors[0][0]:
        return z
    for (old_a, new_a), (old_b, new_b) in zip(
        anchors, anchors[1:]
    ):
        if z <= old_b:
            ratio = (z - old_a) / max(old_b - old_a, 1e-8)
            return new_a + ratio * (new_b - new_a)
    old_a, new_a = anchors[-2]
    old_b, new_b = anchors[-1]
    slope = (new_b - new_a) / (old_b - old_a)
    return new_b + (z - old_b) * slope


def map_vertical(point: Vector) -> Vector:
    return Vector((point.x, point.y, remap_height(point.z)))


def arm_side(name: str) -> int:
    if name.endswith("_l"):
        return 1
    if name.endswith("_r"):
        return -1
    return 0


def is_arm_chain(name: str) -> bool:
    prefixes = (
        "upperarm_",
        "lowerarm_",
        "hand_",
        "thumb_",
        "index_",
        "middle_",
        "ring_",
        "pinky_",
    )
    return name.startswith(prefixes)


def mapped_bone_endpoints(
    name: str, head: Vector, tail: Vector
) -> tuple[Vector, Vector]:
    new_head = map_vertical(head)
    new_tail = map_vertical(tail)
    side = arm_side(name)
    shoulder_inset = 0.020 if ACTIVE_PROFILE == "editorial-v3" else 0.009
    shoulder_drop = 0.018 if ACTIVE_PROFILE == "editorial-v3" else 0.006
    if ACTIVE_PROFILE in {"editorial-v4", "editorial-v5"}:
        shoulder_inset = 0.020
        shoulder_drop = 0.018

        # One isolated proportion-lock correction: compress the complete
        # head-bound hierarchy toward the crown and extend the neck endpoint
        # to meet the resulting head base. This changes the head unit without
        # touching the accepted torso, pelvis, or limb field.
        crown_z = 1.7425
        head_scale_z = 0.76 if ACTIVE_PROFILE == "editorial-v5" else 0.86

        def compress_head_z(value: float) -> float:
            return crown_z - (crown_z - value) * head_scale_z

        if name in {"head", "jaw", "eye_l", "eye_r"}:
            new_head.z = compress_head_z(new_head.z)
            new_tail.z = compress_head_z(new_tail.z)
        elif name == "neck_01":
            new_tail.z = compress_head_z(new_tail.z)

    if ACTIVE_PROFILE in {"editorial-v6", "editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"}:
        shoulder_inset = 0.020
        shoulder_drop = 0.008

    if name.startswith("clavicle_") and side:
        new_tail.x -= side * shoulder_inset
        new_tail.z -= shoulder_drop
    elif is_arm_chain(name) and side:
        for endpoint in (new_head, new_tail):
            endpoint.x -= side * shoulder_inset
            endpoint.z -= shoulder_drop

    if name.startswith("eye_") and side:
        new_head.x *= 0.965
        new_tail.x *= 0.965
    return new_head, new_tail


def closest_parameter(point: Vector, start: Vector, end: Vector) -> float:
    axis = end - start
    length_squared = axis.length_squared
    if length_squared <= 1e-12:
        return 0.0
    return max(0.0, min(1.0, (point - start).dot(axis) / length_squared))


def torso_scales(z: float) -> tuple[float, float]:
    if z < 0.80 or z > 1.46:
        return 1.0, 1.0
    waist = math.exp(-((z - 1.035) / 0.145) ** 2)
    rib = math.exp(-((z - 1.245) / 0.185) ** 2)
    pelvis_transition = math.exp(-((z - 0.905) / 0.11) ** 2)
    if ACTIVE_PROFILE in {"editorial-v6", "editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"}:
        shoulder_protection = 1.0 - 0.55 * smoothstep(1.30, 1.45, z)
        width_reduction = shoulder_protection * max(0.090 * waist, 0.075 * rib)
        depth_reduction = shoulder_protection * max(0.060 * waist, 0.055 * rib)
        width_reduction *= 1.0 - 0.55 * pelvis_transition
        depth_reduction *= 1.0 - 0.45 * pelvis_transition
    elif ACTIVE_PROFILE in {"editorial-v3", "editorial-v4", "editorial-v5"}:
        shoulder_protection = 1.0 - 0.40 * smoothstep(1.30, 1.45, z)
        width_reduction = shoulder_protection * max(0.140 * waist, 0.120 * rib)
        depth_reduction = shoulder_protection * max(0.100 * waist, 0.090 * rib)
        width_reduction *= 1.0 - 0.78 * pelvis_transition
        depth_reduction *= 1.0 - 0.68 * pelvis_transition
    else:
        shoulder_protection = 1.0 - 0.55 * smoothstep(1.30, 1.45, z)
        width_reduction = shoulder_protection * max(0.100 * waist, 0.085 * rib)
        depth_reduction = shoulder_protection * max(0.070 * waist, 0.060 * rib)
        width_reduction *= 1.0 - 0.45 * pelvis_transition
        depth_reduction *= 1.0 - 0.35 * pelvis_transition
    return 1.0 - width_reduction, 1.0 - depth_reduction


def mesh_attenuation(name: str) -> float:
    if name == "AvatarBody":
        return 1.0
    measured = ACTIVE_PROFILE in {"editorial-v6", "editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"}
    if name.startswith("AvatarTop_"):
        if measured:
            return 0.92
        return 0.96 if ACTIVE_PROFILE in {"editorial-v3", "editorial-v4", "editorial-v5"} else 0.90
    if name.startswith("AvatarBottoms_"):
        if measured:
            return 0.88
        return 0.90 if ACTIVE_PROFILE in {"editorial-v3", "editorial-v4", "editorial-v5"} else 0.84
    if name.startswith("AvatarJacket_"):
        if measured:
            return 0.60
        return 0.48 if ACTIVE_PROFILE in {"editorial-v3", "editorial-v4", "editorial-v5"} else 0.62
    if name.startswith("AvatarHair_"):
        if measured:
            return 0.35
        return 0.25 if ACTIVE_PROFILE in {"editorial-v3", "editorial-v4", "editorial-v5"} else 0.35
    if name.startswith(("AvatarEye_", "AvatarIris_", "AvatarPupil_", "AvatarEyebrow", "AvatarEyelash")):
        return 1.0
    if name.startswith("AvatarAccessory_"):
        if measured:
            return 0.50
        return 0.40 if ACTIVE_PROFILE in {"editorial-v3", "editorial-v4", "editorial-v5"} else 0.50
    if name.startswith("AvatarShoes_"):
        return 0.0
    return 0.70


def attenuate_factor(factor: float, attenuation: float) -> float:
    return 1.0 - attenuation * (1.0 - factor)


def region_scales(name: str, t: float, point: Vector, attenuation: float) -> tuple[float, float, float]:
    sx = sy = sz = 1.0
    editorial = ACTIVE_PROFILE in {"editorial-v3", "editorial-v4", "editorial-v5"}
    measured = ACTIVE_PROFILE in {"editorial-v6", "editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"}
    if name in {"pelvis", "spine_01", "spine_02", "spine_03"}:
        sx, sy = torso_scales(point.z)
    elif name.startswith("clavicle_"):
        sx = sy = 0.96 if measured else (0.90 if editorial else 0.96)
    elif name.startswith("upperarm_"):
        sx = sy = (0.94 - 0.01 * t) if measured else ((0.88 - 0.02 * t) if editorial else (0.94 - 0.01 * t))
    elif name.startswith("lowerarm_"):
        sx = sy = (0.925 - 0.025 * t) if measured else ((0.86 - 0.04 * t) if editorial else (0.925 - 0.035 * t))
    elif name.startswith("hand_"):
        sx = sy = sz = 0.94 if measured else (0.92 if editorial else 0.965)
    elif name.startswith(("thumb_", "index_", "middle_", "ring_", "pinky_")):
        sx = sy = sz = 0.94 if measured else (0.91 if editorial else 0.96)
    elif name.startswith("thigh_"):
        sx = sy = 0.915 if measured else (0.86 if editorial else 0.900)
    elif name.startswith("calf_"):
        sx = sy = (0.92 - 0.02 * t) if measured else ((0.86 - 0.03 * t) if editorial else (0.91 - 0.02 * t))
    elif name.startswith("foot_") or name.startswith("ball_"):
        sx = sy = sz = 1.0
    elif name == "neck_01":
        sx = sy = 0.93 if measured else (0.90 if editorial else 0.925)
    elif name in {"head", "jaw"}:
        lower_face = 1.0 - smoothstep(1.585, 1.645, point.z)
        if measured:
            sx = 0.965 - 0.020 * lower_face
            sy = 0.985
        elif ACTIVE_PROFILE == "editorial-v5":
            sx = 0.840 - 0.020 * lower_face
            sy = 0.930
        elif ACTIVE_PROFILE == "editorial-v4":
            sx = 0.880 - 0.020 * lower_face
            sy = 0.940
        else:
            sx = 0.950 - 0.025 * lower_face
            sy = 0.985
    elif name.startswith("eye_"):
        sx = sy = sz = 0.97

    return (
        attenuate_factor(sx, attenuation),
        attenuate_factor(sy, attenuation),
        attenuate_factor(sz, attenuation),
    )


def apply_sex_specific_silhouette(
    obj: bpy.types.Object,
    shape_name: str,
    point: Vector,
    attenuation: float,
) -> Vector:
    """Apply the female/male silhouette deltas without splitting topology.

    The shared Basis and skeleton remain identical. Only existing male/female
    shape-key coordinates receive bounded shoulder, bust, pelvis, and upper-
    thigh adjustments, and fitted garments receive the same attenuated field.
    """
    if ACTIVE_PROFILE not in {"editorial-v6", "editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"} or shape_name not in {"female", "male"}:
        return point
    if not obj.name.startswith(("AvatarBody", "AvatarTop_", "AvatarJacket_", "AvatarBottoms_")):
        return point

    shoulder = math.exp(-((point.z - 1.350) / 0.115) ** 2)
    bust = math.exp(-((point.z - 1.245) / 0.120) ** 2)
    rib = math.exp(-((point.z - 1.205) / 0.145) ** 2)
    waist = math.exp(-((point.z - 1.055) / 0.120) ** 2)
    hip = math.exp(-((point.z - 0.925) / 0.105) ** 2)
    upper_thigh = math.exp(-((point.z - 0.760) / 0.150) ** 2)
    calf = math.exp(-((point.z - 0.430) / 0.165) ** 2)

    if shape_name == "female":
        lateral = 1.0 - attenuation * 0.030 * shoulder
        if ACTIVE_PROFILE in {"editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"}:
            # Preserve the target's shoulder-to-waist rhythm while removing
            # the rounded riding-breech transition still visible in V7.
            lateral += attenuation * 0.025 * hip
            lateral -= attenuation * 0.005 * upper_thigh
            if ACTIVE_PROFILE in {"editorial-v10", "editorial-v11"} and 0.72 <= point.z <= 1.47:
                lateral += attenuation * profile()["femaleRibContour"] * rib
                lateral += attenuation * profile()["femaleWaistContour"] * waist
                lateral += attenuation * profile()["femaleIliacContour"] * hip
        else:
            lateral += attenuation * 0.038 * hip
            lateral += attenuation * 0.020 * upper_thigh
        depth = 1.0 - attenuation * 0.050 * bust + attenuation * 0.018 * hip
    else:
        if ACTIVE_PROFILE in {"editorial-v7", "editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"}:
            # Correct the inherited male pear/hourglass silhouette without
            # changing the shared rest skeleton or the accepted female key.
            lateral = 1.0 + attenuation * 0.035 * shoulder
            lateral += attenuation * 0.025 * rib
            lateral += attenuation * 0.015 * waist
            if ACTIVE_PROFILE in {"editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"}:
                lateral -= attenuation * 0.055 * hip
                lateral -= attenuation * 0.060 * upper_thigh
                lateral -= attenuation * 0.025 * calf
                if ACTIVE_PROFILE in {"editorial-v10", "editorial-v11"} and 0.72 <= point.z <= 1.47:
                    lateral += attenuation * profile()["maleShoulderContour"] * shoulder
                    lateral += attenuation * profile()["maleRibContour"] * rib
                    lateral += attenuation * profile()["maleWaistContour"] * waist
                    lateral += attenuation * profile()["maleHipContour"] * hip
            else:
                lateral -= attenuation * 0.045 * hip
                lateral -= attenuation * 0.040 * upper_thigh
            depth = 1.0 - attenuation * 0.035 * bust
            depth -= attenuation * (0.035 if ACTIVE_PROFILE in {"editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"} else 0.025) * hip
            depth -= attenuation * (0.040 if ACTIVE_PROFILE in {"editorial-v8", "editorial-v9", "editorial-v10", "editorial-v11"} else 0.025) * upper_thigh
        else:
            lateral = 1.0 - attenuation * 0.018 * shoulder
            lateral += attenuation * 0.012 * hip
            lateral += attenuation * 0.012 * upper_thigh
            depth = 1.0 - attenuation * 0.025 * bust + attenuation * 0.010 * hip

    return Vector((point.x * lateral, point.y * depth, point.z))


def transform_from_bone(
    point: Vector,
    old_head: Vector,
    old_tail: Vector,
    new_head: Vector,
    new_tail: Vector,
    scales: tuple[float, float, float],
) -> Vector:
    t = closest_parameter(point, old_head, old_tail)
    old_axis = old_tail - old_head
    new_axis = new_tail - new_head
    old_anchor = old_head.lerp(old_tail, t)
    new_anchor = new_head.lerp(new_tail, t)
    offset = point - old_anchor
    if old_axis.length > 1e-8 and new_axis.length > 1e-8:
        rotation = old_axis.normalized().rotation_difference(new_axis.normalized())
        offset = rotation @ offset
    offset = Vector((offset.x * scales[0], offset.y * scales[1], offset.z * scales[2]))
    return new_anchor + offset


def deform_point(
    obj: bpy.types.Object,
    vertex: bpy.types.MeshVertex,
    local_point: Vector,
    armature: bpy.types.Object,
    old_bones: dict[str, tuple[Vector, Vector]],
    new_bones: dict[str, tuple[Vector, Vector]],
    shape_name: str,
) -> Vector:
    object_to_armature = armature.matrix_world.inverted() @ obj.matrix_world
    armature_to_object = object_to_armature.inverted()
    point = object_to_armature @ local_point
    attenuation = mesh_attenuation(obj.name)

    influences: list[tuple[float, str]] = []
    for membership in vertex.groups:
        if membership.group >= len(obj.vertex_groups) or membership.weight <= 0.0:
            continue
        bone_name = obj.vertex_groups[membership.group].name
        if bone_name in old_bones:
            influences.append((membership.weight, bone_name))
    total = sum(weight for weight, _ in influences)
    if total <= 1e-8:
        return armature_to_object @ map_vertical(point)

    destination = Vector((0.0, 0.0, 0.0))
    for weight, bone_name in influences:
        old_head, old_tail = old_bones[bone_name]
        new_head, new_tail = new_bones[bone_name]
        t = closest_parameter(point, old_head, old_tail)
        scales = region_scales(bone_name, t, point, attenuation)
        target = transform_from_bone(
            point, old_head, old_tail, new_head, new_tail, scales
        )
        destination += target * (weight / total)
    destination = apply_sex_specific_silhouette(
        obj, shape_name, destination, attenuation
    )
    return armature_to_object @ destination


def deform_mesh(
    obj: bpy.types.Object,
    armature: bpy.types.Object,
    old_bones: dict[str, tuple[Vector, Vector]],
    new_bones: dict[str, tuple[Vector, Vector]],
) -> dict[str, object]:
    keys = obj.data.shape_keys
    key_blocks = list(keys.key_blocks) if keys else []
    targets = key_blocks or [None]
    max_delta = 0.0
    moved = 0
    for key in targets:
        shape_name = key.name if key is not None else "Basis"
        points = key.data if key is not None else obj.data.vertices
        source_points = [point.co.copy() for point in points]
        for vertex, point, source in zip(obj.data.vertices, points, source_points, strict=True):
            destination = deform_point(
                obj, vertex, source, armature, old_bones, new_bones, shape_name
            )
            delta = (destination - source).length
            point.co = destination
            if delta > 1e-7:
                moved += 1
                max_delta = max(max_delta, delta)
    obj.data.update()
    return {
        "name": obj.name,
        "vertices": len(obj.data.vertices),
        "shapeKeys": [key.name for key in key_blocks],
        "movedCoordinates": moved,
        "maxDeltaMeters": round(max_delta, 7),
        "attenuation": mesh_attenuation(obj.name),
    }


def main() -> None:
    global ACTIVE_PROFILE
    args = parse_args()
    ACTIVE_PROFILE = args.profile
    source_blend = Path(bpy.data.filepath).resolve()
    output_blend = Path(args.output_blend).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    if output_blend == source_blend:
        raise RuntimeError("A fashion derivative must not overwrite its source blend")
    required_dir = {
        "editorial-v3": "fashion-v3",
        "editorial-v4": "fashion-v4",
        "editorial-v5": "fashion-v5",
        "editorial-v6": "fashion-v6",
        "editorial-v7": "fashion-v7",
        "editorial-v8": "fashion-v8",
        "editorial-v9": "fashion-v9",
        "editorial-v10": "fashion-v10",
        "editorial-v11": "fashion-v11",
    }.get(ACTIVE_PROFILE, "fashion-v2")
    if required_dir not in output_blend.parts:
        raise RuntimeError(f"Output must be contained by an explicit {required_dir} directory")

    armature = bpy.data.objects.get(ARMATURE_NAME)
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError(f"Missing armature {ARMATURE_NAME}")
    if len(armature.data.bones) != EXPECTED_BONES:
        raise RuntimeError(f"Expected {EXPECTED_BONES} bones, got {len(armature.data.bones)}")

    source_hash = sha256(source_blend)
    meshes = sorted(
        (obj for obj in bpy.data.objects if obj.type == "MESH"),
        key=lambda obj: obj.name,
    )
    topology = {obj.name: len(obj.data.vertices) for obj in meshes}
    materials = {
        obj.name: [slot.material.name if slot.material else "" for slot in obj.material_slots]
        for obj in meshes
    }
    object_names = sorted(obj.name for obj in bpy.data.objects)
    action_names = sorted(action.name for action in bpy.data.actions)
    bone_contract = {
        bone.name: bone.parent.name if bone.parent else None
        for bone in armature.data.bones
    }
    old_bones = {
        bone.name: (bone.head_local.copy(), bone.tail_local.copy())
        for bone in armature.data.bones
    }
    new_bones = {
        name: mapped_bone_endpoints(name, head, tail)
        for name, (head, tail) in old_bones.items()
    }

    changed_meshes = [
        deform_mesh(obj, armature, old_bones, new_bones) for obj in meshes
    ]

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail) in new_bones.items():
        edit_bone = armature.data.edit_bones[name]
        edit_bone.head = head
        edit_bone.tail = tail
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)

    for obj in meshes:
        if len(obj.data.vertices) != topology[obj.name]:
            raise RuntimeError(f"Topology changed on {obj.name}")
        current_materials = [
            slot.material.name if slot.material else "" for slot in obj.material_slots
        ]
        if current_materials != materials[obj.name]:
            raise RuntimeError(f"Material slots changed on {obj.name}")
    if sorted(obj.name for obj in bpy.data.objects) != object_names:
        raise RuntimeError("Object contract changed")
    if sorted(action.name for action in bpy.data.actions) != action_names:
        raise RuntimeError("Action contract changed")
    current_bones = {
        bone.name: bone.parent.name if bone.parent else None
        for bone in armature.data.bones
    }
    if current_bones != bone_contract:
        raise RuntimeError("Bone name/parent contract changed")

    scene = bpy.context.scene
    scene["avatarFashionProfile"] = ACTIVE_PROFILE
    scene["avatarFashionProfileVersion"] = {
        "editorial-v3": 3,
        "editorial-v4": 4,
        "editorial-v5": 5,
        "editorial-v6": 6,
        "editorial-v7": 7,
        "editorial-v8": 8,
        "editorial-v9": 9,
        "editorial-v10": 10,
        "editorial-v11": 11,
    }.get(ACTIVE_PROFILE, 2)
    scene["avatarFashionSource"] = str(source_blend)
    scene["avatarFashionReference"] = (
        "/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/"
        ".superpowers/brainstorm/49113-1780456702/content/assets/avatar-plurr-warehouse.png"
    )

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

    report = {
        "status": "built",
        "sourceBlend": str(source_blend),
        "sourceSha256": source_hash,
        "outputBlend": str(output_blend),
        "boneCount": len(armature.data.bones),
        "profileId": ACTIVE_PROFILE,
        "profile": profile(),
        "verticalAnchors": vertical_anchors(),
        "topologyUnchanged": True,
        "materialsUnchanged": True,
        "objectsUnchanged": True,
        "actionsUnchanged": True,
        "boneHierarchyUnchanged": True,
        "changedMeshes": changed_meshes,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
