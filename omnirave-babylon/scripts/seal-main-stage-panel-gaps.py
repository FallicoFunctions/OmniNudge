# Seals hairline gaps in segmented panel/canopy assemblies.
#
# Several blockout assemblies are authored as stacked plates with sub-2cm
# clearances; at night lighting the dark interior reads through the slits
# as rows of "bleeding" dashes (player-reported on the route awnings and
# the spawn gallery / rear shell walls). Shadow bias and depth bias were
# both ruled out empirically - the slits are real geometry. Displacing the
# plates ~1.2cm along their vertex normals closes the clearances with no
# visible silhouette change.
#
# Run headless: blender -b assets-src/main-stage/main-stage.blend \
#   --python scripts/seal-main-stage-panel-gaps.py
import re
import sys

import bpy
from mathutils import Vector

TARGET_PATTERN = re.compile(
    r"TentCanopy|RouteTent|RearShellPanelArray|OculusCanopy|SpawnGalleryArcadePearl|"
    r"SpawnGalleryPierPearl|WingCanopyLamella|CrownShellLamella|"
    # Route-edge segmented shells: the gold "awnings" flanking the promenade
    # (player-reported bleeding lines along their segment overlaps).
    r"PromenadeGoldShoulders|PromenadePearlRibbon|BasinRunwaySpine"
)
INFLATE_METERS = 0.02

# Gentler treatment for lattice/louver frames: 2cm distorts thin members.
# WingTerraceGoldArray is a trim band authored fully embedded in its host
# fascia's volume (player-reported "objects inside one another") rather
# than mounted proud on its face - normal-push separates it regardless of
# which face it wraps, unlike an axis-locked lift.
GENTLE_PATTERN = re.compile(r"ProductionTruss|WingTerraceGoldArray")
GENTLE_INFLATE_METERS = 0.008

# Assemblies whose crests poke through their host covers: sink instead.
SINK_PATTERN = re.compile(r"BasinBridgeRelief")
SINK_METERS = 0.05

# Truly coplanar floor overlays: inlays and thread strips authored in the
# exact plane of the deck beneath them. Depth bias cannot fix this on
# WebGPU (any nonzero bias overshoots), so give them real separation.
LIFT_PATTERN = re.compile(
    r"PromenadeGoldInlay|PromenadeCyanThread|PromenadePearlRibbon|PlazaPaverGoldFiligree|"
    r"PlazaPaverPearlBands|BackPlazaSightlineGoldRail"
)
LIFT_METERS = 0.006
SEAL_MARKER = "omnirave_panel_gap_seal_version"
SEAL_VERSION = 1


def target_kind(obj):
    if obj.type != "MESH":
        return None
    if SINK_PATTERN.search(obj.name):
        return "sink"
    if LIFT_PATTERN.search(obj.name):
        return "lift"
    if GENTLE_PATTERN.search(obj.name):
        return "gentle"
    if TARGET_PATTERN.search(obj.name):
        return "inflate"
    return None


def mark_current_state():
    """Adopt the already-sealed repository baseline without moving geometry."""
    marked = 0
    for obj in bpy.data.objects:
        kind = target_kind(obj)
        if kind in {"sink", "lift"}:
            obj[SEAL_MARKER] = SEAL_VERSION
            marked += 1
        elif kind in {"gentle", "inflate"} and obj.data.get(SEAL_MARKER) != SEAL_VERSION:
            obj.data[SEAL_MARKER] = SEAL_VERSION
            marked += 1
    return marked


def seal_once():
    sealed = 0
    for obj in bpy.data.objects:
        kind = target_kind(obj)
        if kind is None:
            continue
        if kind in {"sink", "lift"}:
            if obj.get(SEAL_MARKER) == SEAL_VERSION:
                continue
            obj.location.z += -SINK_METERS if kind == "sink" else LIFT_METERS
            obj[SEAL_MARKER] = SEAL_VERSION
            sealed += 1
            continue

        mesh = obj.data
        # Mirrored objects can share one mesh datablock. Marking the datablock
        # prevents both double-application in one run and drift across reruns.
        if mesh.get(SEAL_MARKER) == SEAL_VERSION:
            continue
        amount = GENTLE_INFLATE_METERS if kind == "gentle" else INFLATE_METERS
        offsets = [Vector(vertex.normal) * amount for vertex in mesh.vertices]
        for vertex, offset in zip(mesh.vertices, offsets):
            vertex.co += offset
        mesh[SEAL_MARKER] = SEAL_VERSION
        mesh.update()
        sealed += 1
    return sealed


def main():
    if "--mark-current" in sys.argv:
        changed = mark_current_state()
        action = "PANEL_GAP_BASELINE_MARKED"
    else:
        changed = seal_once()
        action = "PANEL_GAPS_SEALED"
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"{action} datablocks={changed}")


if __name__ == "__main__":
    main()
