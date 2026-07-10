# Shared geometry source-of-truth for the cascade court generators.
#
# generate-cascade-court.py (stone shell + coping) and
# generate-cascade-court-water.py (water + mist + crown) both import this
# module so the water always registers exactly with the stone. Change tier
# shapes HERE, then re-run both generators.
import math
import random

# Mound center in RIGHT-pocket coordinates (left pocket mirrors X).
CENTER = (48.5, 28.5)

# Stacked tiers, base (widest, lowest) -> summit (smallest, highest). Each:
# (radius_x, radius_y, z_bottom, z_top, n_sides, phase_rad, off_x, off_y, seed)
# Distinct n_sides/phase/offset/seed per tier keeps the shapes irregular and
# non-concentric so the top-down silhouette never reads as circles.
TIERS = [
    (13.0, 10.6, 0.00, 0.80, 11, 0.15, 0.0, 0.0, 11),
    (10.6, 8.6, 0.80, 1.60, 9, 0.55, 0.9, -0.6, 27),
    (8.2, 6.6, 1.60, 2.40, 10, 1.10, -0.8, 0.7, 43),
    (5.8, 4.7, 2.40, 3.20, 8, 0.30, 0.6, 0.5, 61),
    (3.6, 3.0, 3.20, 4.00, 7, 0.90, -0.5, -0.4, 79),
]

# Battered (inward-leaning) riser walls: each tier's top ring pulls toward its
# centroid so the mound reads as one carved form, not stacked prisms.
BATTER = 0.35

# Raised coping curb rimming each tread (and the catch basin at the floor).
COPING_W = 0.5
COPING_H = 0.09
COPING_LIP = 0.06  # curb outer face sits slightly proud of the riser top

# Catch basin at the fountain's foot: pool ring + floor curb, both derived by
# offsetting the base tier's own polygon so they follow its irregular shape
# and can never clip into the stone.
CATCH_Z = 0.07          # catch water level
BASE_POOL_OFF = 0.65    # water ring extends this far past the base stone
BASE_CURB_IN = 0.4      # floor curb inner face offset from the base stone
BASE_CURB_OUT = 0.9     # floor curb outer face offset from the base stone
BASE_CURB_H = 0.18      # floor curb rises above the catch water


def tier_polygon(cx, cy, rx, ry, n, phase, seed, j_lo=0.80, j_hi=1.20):
    """An irregular closed n-gon: per-vertex radius jitter, seeded so the
    shape is deterministic but unique to this tier."""
    rng = random.Random(seed)
    pts = []
    for k in range(n):
        a = phase + 2.0 * math.pi * k / n
        r_mult = j_lo + (j_hi - j_lo) * rng.random()
        pts.append((cx + rx * r_mult * math.cos(a), cy + ry * r_mult * math.sin(a)))
    return pts


def base_polygon():
    """The base (widest) tier's exact seeded polygon - the catch pool and
    floor curb offset outward from this so they always follow the stone."""
    cx, cy = CENTER
    (rx, ry, _z0, _z1, n, phase, ox, oy, seed) = TIERS[0]
    return tier_polygon(cx + ox, cy + oy, rx, ry, n, phase, seed)


def offset_polygon(pts, delta):
    """Move each vertex toward (delta<0) or away from (delta>0) the centroid."""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    out = []
    for (x, y) in pts:
        dx, dy = x - cx, y - cy
        d = math.hypot(dx, dy) or 1.0
        out.append((x + dx / d * delta, y + dy / d * delta))
    return out


def jitter_polygon(pts, seed, amount=0.3):
    """Radial jitter so water edges never run parallel to the stone edges."""
    rng = random.Random(seed)
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    out = []
    for (x, y) in pts:
        dx, dy = x - cx, y - cy
        d = math.hypot(dx, dy) or 1.0
        delta = (rng.random() * 2.0 - 1.0) * amount
        out.append((x + dx / d * delta, y + dy / d * delta))
    return out
