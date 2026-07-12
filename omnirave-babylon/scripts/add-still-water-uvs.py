# The venue's older still-water meshes were authored without UVs, so the
# runtime ripple normal map (cascadeCourtWaterMotion) cannot bind to them -
# they stayed frozen paint while the cascade water moved. Box-project UVs
# (the venue's 1.5m cube convention) and compute tangents so they match the
# V86/V150 water attribute convention and can carry the drift ripple.
#
# Idempotent: meshes that already have a UV layer are skipped.
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/add-still-water-uvs.py -- --write
import sys

import bpy

TARGETS = [
    "V63_BasinWaterParterre",
    "V118_BasinWaterSheet_L",
    "V118_BasinWaterSheet_R",
    "V67_VipGardenReflectingPool_L",
    "V67_VipGardenReflectingPool_R",
]


def box_project_uvs(mesh, cube_size=1.5):
    uv_layer = mesh.uv_layers.new(name="StillWaterUV")
    for poly in mesh.polygons:
        n = poly.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        u_axis, v_axis = [i for i in range(3) if i != axis]
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv_layer.data[li].uv = (co[u_axis] / cube_size, co[v_axis] / cube_size)


def main():
    write = "--write" in sys.argv
    touched = 0
    for name in TARGETS:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            print(f"SKIP missing {name}")
            continue
        if obj.data.uv_layers:
            continue  # already projected
        box_project_uvs(obj.data)
        try:
            obj.data.calc_tangents()
        except Exception:
            pass
        touched += 1
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"STILL_WATER_UVS_ADDED objects={touched} written={write}")


main()
