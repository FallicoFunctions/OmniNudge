# Shared proportion source-of-truth for the OmniRave avatar body bases.
#
# generate-avatar-bodies.py builds BOTH bodies from the SAME joint graph:
# identical node names, identical node order, identical edge list. Only the
# positions and the per-node cross-section radii differ between 'male' and
# 'female'. Because the graph is identical, the two bodies come out of the
# Skin + Subdivision pipeline with IDENTICAL TOPOLOGY (same vertex count,
# same face order), which is what lets a later wardrobe pass fit one garment
# mesh to both bodies (shape keys / vertex-index-parallel transfer).
#
# Change proportions HERE, then re-run the generator. Nothing else encodes
# body measurements.
#
# Units: metres, Blender Z-up, forward -Y (matches assets-src/main-stage
# source rules). Everything is authored around REFERENCE_HEIGHT.

# The runtime scales each avatar from this height (sec 6.5 height effects).
# The generator normalises the finished mesh so its bounding box is EXACTLY
# this tall with the feet at z = 0.
REFERENCE_HEIGHT = 1.75

# Classical figure canon: 7.5 heads tall. 1.75 / 7.5 = 0.2333 m head length,
# so the chin lands at 1.5167 and the crown at 1.75. Every landmark below is
# derived from real anthropometric ratios rather than eyeballed.
HEADS_TALL = 7.5

# --- joint graph -------------------------------------------------------
# Node names are shared by both bodies. Order matters: it fixes the vertex
# order of the skin base mesh, and therefore the topology parity between the
# male and the female body.
NODE_ORDER = (
    "pelvis", "waist", "chest", "yoke", "neck", "skull", "crown",
    "shoulder.L", "deltoid.L", "elbow.L", "wrist.L", "palm.L",
    "thumb.L", "index.L", "middle.L", "ring.L", "pinky.L",
    "shoulder.R", "deltoid.R", "elbow.R", "wrist.R", "palm.R",
    "thumb.R", "index.R", "middle.R", "ring.R", "pinky.R",
    "hip.L", "knee.L", "ankle.L", "heel.L", "ball.L", "bigtoe.L", "toes.L",
    "hip.R", "knee.R", "ankle.R", "heel.R", "ball.R", "bigtoe.R", "toes.R",
)

# (parent, child) - the skeleton the Skin modifier inflates. Branch points
# (pelvis, yoke, palm) are where the modifier stitches limbs into the torso
# or fans a hand out into separate digits, which is why the body comes out
# as ONE watertight surface instead of overlapping capsules like the
# procedural review avatar. There is deliberately no node for the nose/brow/
# eyes: a Skin edge tapers LINEARLY over its whole length from its parent's
# radius, and skull's radius is so much bigger than a nose-sized tip that a
# nose modelled as a skull spur comes out as a beak/fin spanning much of the
# face, not a localised bump (tried during pass 2, looked wrong). Facial
# detail is sculpted by displacing existing skull-region vertices instead
# (see sculpt_face in generate-avatar-bodies.py), which blends into whatever
# is already there.
EDGES = (
    ("pelvis", "waist"), ("waist", "chest"), ("chest", "yoke"),
    ("yoke", "neck"), ("neck", "skull"), ("skull", "crown"),
)
for _s in ("L", "R"):
    EDGES += (
        (f"yoke", f"shoulder.{_s}"), (f"shoulder.{_s}", f"deltoid.{_s}"),
        (f"deltoid.{_s}", f"elbow.{_s}"), (f"elbow.{_s}", f"wrist.{_s}"),
        (f"wrist.{_s}", f"palm.{_s}"),
        # Four separate finger branches (instead of one merged "fingers" tip)
        # plus the thumb, all fanned off the same palm node - this is what
        # gives the hand distinct digits instead of a single mitten volume.
        (f"palm.{_s}", f"thumb.{_s}"), (f"palm.{_s}", f"index.{_s}"),
        (f"palm.{_s}", f"middle.{_s}"), (f"palm.{_s}", f"ring.{_s}"),
        (f"palm.{_s}", f"pinky.{_s}"),
        (f"pelvis", f"hip.{_s}"), (f"hip.{_s}", f"knee.{_s}"),
        (f"knee.{_s}", f"ankle.{_s}"), (f"ankle.{_s}", f"heel.{_s}"),
        (f"ankle.{_s}", f"ball.{_s}"),
        # Big toe fanned to the inner (medial) side, separate from the other
        # four as one cluster - a hint of toe separation, not five distinct
        # toes, same idea as the finger fan above.
        (f"ball.{_s}", f"bigtoe.{_s}"), (f"ball.{_s}", f"toes.{_s}"),
    )

# The Skin modifier needs exactly one root vertex; it also decides which way
# the limb cross-sections are framed, so it must sit in the body core.
ROOT_NODE = "pelvis"

# The brow ridge, eye sockets AND the nose are all sculpted by displacing
# existing skull-region vertices after the surface is built (see sculpt_face
# in generate-avatar-bodies.py) rather than modelled as graph nodes - see the
# EDGES comment above for why a nose-as-skull-spur doesn't work. That
# displacement is purely radial around the neck-skull-crown axis, so
# warp_to_graph (which only reconstructs the radial/cross-section component
# of a vertex's offset, not how far it sits beyond a segment's end) carries
# it over correctly to the warped female body; an axial spur like a fingertip
# would not survive that reconstruction nearly as well, which is why fingers
# ARE modelled as graph branches instead (see below) and not as a post-build
# push.
FACE_NODE_PARENT = "skull"


def _half(nodes):
    """Mirror every '.L' entry to '.R' so the two sides can never drift."""
    out = dict(nodes)
    for name, value in nodes.items():
        if not name.endswith(".L"):
            continue
        (x, y, z), radius = value
        out[name[:-2] + ".R"] = ((-x, y, z), radius)
    return out


# --- male -------------------------------------------------------------
# Biacromial (shoulder) breadth 0.23*H, bi-iliac (hip) 0.19*H, waist clearly
# narrower than both -> the classic inverted-trapezoid male torso.
# radius is (a, b) of the elliptical cross-section: a across, b through.
MALE = _half({
    "pelvis":   ((0.000,  0.000, 0.905), (0.150, 0.108)),
    "waist":    ((0.000,  0.008, 1.065), (0.132, 0.098)),
    "chest":    ((0.000,  0.000, 1.245), (0.168, 0.115)),
    "yoke":     ((0.000, -0.004, 1.420), (0.118, 0.104)),
    "neck":     ((0.000, -0.004, 1.500), (0.056, 0.054)),
    "skull":    ((0.000, -0.006, 1.625), (0.086, 0.098)),
    "crown":    ((0.000,  0.004, 1.718), (0.050, 0.054)),

    "shoulder.L": ((0.070, -0.004, 1.442), (0.072, 0.072)),
    "deltoid.L":  ((0.178, -0.004, 1.418), (0.074, 0.074)),
    "elbow.L":    ((0.201,  0.004, 1.095), (0.050, 0.050)),
    "wrist.L":    ((0.216,  0.010, 0.828), (0.034, 0.030)),
    "palm.L":     ((0.221, -0.002, 0.762), (0.044, 0.025)),
    # Four separate finger branches (instead of one merged tip) fanned across
    # the palm's width, plus the thumb angled off to the side - this is what
    # gives visual finger SEPARATION instead of a mitten. Each is a single
    # short spur, not fully-articulated, per the pass-2 brief.
    "thumb.L":  ((0.192, -0.040, 0.744), (0.020, 0.017)),
    "index.L":  ((0.203, -0.024, 0.694), (0.015, 0.013)),
    "middle.L": ((0.222, -0.026, 0.685), (0.016, 0.014)),
    "ring.L":   ((0.241, -0.023, 0.692), (0.015, 0.013)),
    "pinky.L":  ((0.257, -0.016, 0.706), (0.012, 0.011)),

    "hip.L":   ((0.093,  0.000, 0.862), (0.100, 0.100)),
    "knee.L":  ((0.088,  0.006, 0.480), (0.063, 0.062)),
    "ankle.L": ((0.083,  0.014, 0.088), (0.044, 0.045)),
    "heel.L":  ((0.083,  0.056, 0.048), (0.040, 0.040)),
    "ball.L":  ((0.085, -0.088, 0.036), (0.046, 0.034)),
    "bigtoe.L": ((0.060, -0.138, 0.027), (0.020, 0.017)),
    "toes.L":   ((0.098, -0.140, 0.024), (0.031, 0.020)),
})

# --- female -----------------------------------------------------------
# Same graph, different table: narrower shoulders (0.21*H), wider bi-iliac
# relative to the shoulders, a deeper high waist taper, thinner limbs, a
# smaller neck and skull. Shoulder:waist:hip lands near 1.00:0.72:0.95 vs the
# male 1.00:0.79:0.89 - the ratio, not a scale factor, is what reads female.
FEMALE = _half({
    "pelvis":   ((0.000,  0.000, 0.890), (0.156, 0.108)),
    "waist":    ((0.000,  0.010, 1.055), (0.113, 0.089)),
    "chest":    ((0.000, -0.006, 1.235), (0.150, 0.124)),
    "yoke":     ((0.000, -0.004, 1.412), (0.108, 0.098)),
    "neck":     ((0.000, -0.004, 1.498), (0.047, 0.046)),
    "skull":    ((0.000, -0.006, 1.622), (0.082, 0.094)),
    "crown":    ((0.000,  0.004, 1.716), (0.048, 0.052)),

    "shoulder.L": ((0.062, -0.004, 1.432), (0.062, 0.062)),
    "deltoid.L":  ((0.160, -0.004, 1.408), (0.062, 0.062)),
    "elbow.L":    ((0.183,  0.004, 1.090), (0.042, 0.042)),
    "wrist.L":    ((0.198,  0.010, 0.826), (0.029, 0.026)),
    "palm.L":     ((0.203, -0.002, 0.764), (0.038, 0.022)),
    "thumb.L":  ((0.175, -0.035, 0.747), (0.017, 0.015)),
    "index.L":  ((0.187, -0.021, 0.700), (0.013, 0.011)),
    "middle.L": ((0.203, -0.023, 0.692), (0.014, 0.012)),
    "ring.L":   ((0.219, -0.020, 0.699), (0.013, 0.011)),
    "pinky.L":  ((0.232, -0.014, 0.712), (0.010, 0.009)),

    "hip.L":   ((0.101,  0.000, 0.850), (0.098, 0.098)),
    "knee.L":  ((0.090,  0.006, 0.475), (0.055, 0.054)),
    "ankle.L": ((0.084,  0.014, 0.085), (0.039, 0.040)),
    "heel.L":  ((0.084,  0.052, 0.046), (0.036, 0.036)),
    "ball.L":  ((0.086, -0.082, 0.034), (0.041, 0.030)),
    "bigtoe.L": ((0.063, -0.129, 0.026), (0.018, 0.015)),
    "toes.L":   ((0.098, -0.131, 0.023), (0.027, 0.018)),
})

BODIES = {"male": MALE, "female": FEMALE}

# --- armature ---------------------------------------------------------
# Standard humanoid names, Blender .L/.R side suffixes so mirroring and
# automatic weighting behave. (bone, head_node, tail_node, parent, connected)
BONES = (
    ("hips",  "pelvis", "waist", None,   False),
    ("spine", "waist",  "chest", "hips", True),
    ("chest", "chest",  "yoke",  "spine", True),
    ("neck",  "yoke",   "neck",  "chest", True),
    ("head",  "neck",   "crown", "neck",  True),
)
for _s in ("L", "R"):
    BONES += (
        (f"shoulder.{_s}", "yoke",           f"deltoid.{_s}", "chest",           False),
        (f"upperarm.{_s}", f"deltoid.{_s}",  f"elbow.{_s}",   f"shoulder.{_s}",  True),
        (f"forearm.{_s}",  f"elbow.{_s}",    f"wrist.{_s}",   f"upperarm.{_s}",  True),
        # Tail lands on the middle finger (the standard "hand length"
        # landmark); the other three fingers + thumb deform with it via
        # automatic weights - no per-finger bones, per the pass-2 brief.
        (f"hand.{_s}",     f"wrist.{_s}",    f"middle.{_s}",  f"forearm.{_s}",   True),
        (f"thigh.{_s}",    f"hip.{_s}",      f"knee.{_s}",    "hips",            False),
        (f"shin.{_s}",     f"knee.{_s}",     f"ankle.{_s}",   f"thigh.{_s}",     True),
        (f"foot.{_s}",     f"ankle.{_s}",    f"ball.{_s}",    f"shin.{_s}",      True),
        # Tail lands on the main toe cluster (not the big toe) - same
        # "biggest branch is the landmark" convention as the hand bone above.
        (f"toe.{_s}",      f"ball.{_s}",     f"toes.{_s}",    f"foot.{_s}",      True),
    )

# --- surfacing --------------------------------------------------------
# Slot 0 is the tintable skin (the runtime's 10 skin tones multiply it, so it
# ships near-neutral). Slot 1 is the neutral undergarment so the base is not
# nude - wardrobe is a LATER pass and must not be modelled here.
SKIN_MATERIAL = "AvatarSkinBase"
UNDERGARMENT_MATERIAL = "AvatarUndergarmentBase"
SKIN_BASE_COLOR = (0.804, 0.678, 0.596, 1.0)
UNDERGARMENT_BASE_COLOR = (0.114, 0.121, 0.145, 1.0)

# Face-region bands (fractions of REFERENCE_HEIGHT) that get slot 1. No extra
# geometry: the undergarment is a material assignment on the body surface, so
# it costs zero triangles and cannot clip.
BRIEFS_BAND = (0.435, 0.573)          # crotch to just over the hip crest
BRA_BAND = (0.660, 0.742)             # female only
UNDERGARMENT_MAX_ABS_X = 0.30         # keep the bands off the hanging arms
