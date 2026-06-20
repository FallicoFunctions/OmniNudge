from __future__ import annotations

import bpy


MARKER_NAMES = [
    "V18_WingFacadeArchInlay_L_0",
    "V20_SideScreenOrbitalRing_L_0",
    "V20_VipBalustradeFiligree_L_0",
]


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def delete_existing(names):
    removed = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)
        removed.append(name)
    return removed


def main():
    ensure_object_mode()
    removed = delete_existing(MARKER_NAMES)
    bpy.ops.wm.save_mainfile()
    print(f"Removed visible marker anchors: {removed}")


if __name__ == "__main__":
    main()
