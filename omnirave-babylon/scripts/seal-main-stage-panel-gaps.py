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
GENTLE_PATTERN = re.compile(r"ProductionTruss")
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

sealed = 0
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    if SINK_PATTERN.search(obj.name):
        obj.location.z -= SINK_METERS
        sealed += 1
        continue
    if LIFT_PATTERN.search(obj.name):
        obj.location.z += LIFT_METERS
        sealed += 1
        continue
    gentle = GENTLE_PATTERN.search(obj.name)
    if not gentle and not TARGET_PATTERN.search(obj.name):
        continue
    mesh = obj.data
    amount = GENTLE_INFLATE_METERS if gentle else INFLATE_METERS
    # displace along per-vertex normals (world-scale assumed 1.0 per source rules)
    offsets = [Vector(v.normal) * amount for v in mesh.vertices]
    for vertex, offset in zip(mesh.vertices, offsets):
        vertex.co += offset
    mesh.update()
    sealed += 1

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print(f"PANEL_GAPS_SEALED objects={sealed}")
