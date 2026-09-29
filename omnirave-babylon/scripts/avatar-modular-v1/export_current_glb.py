from __future__ import annotations

import bpy


def main() -> None:
    root = bpy.data.objects.get("AvatarAsset")
    if root is None:
        raise RuntimeError("AvatarAsset root is missing")
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath="public/assets/avatars/modular-v1/avatar-base.glb",
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_morph=True,
        export_skins=True,
        export_animations=True,
        export_animation_mode="BROADCAST",
        export_frame_range=False,
        export_force_sampling=False,
        export_optimize_animation_size=True,
    )


if __name__ == "__main__":
    main()
