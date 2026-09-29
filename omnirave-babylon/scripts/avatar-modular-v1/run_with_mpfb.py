"""Bootstrap the MPFB extension before executing the modular-avatar builder."""

from __future__ import annotations

import runpy
import sys

import bpy


def main() -> None:
    module = next(
        (candidate for candidate in ("bl_ext.blender_org.mpfb", "bl_ext.user_default.mpfb")
         if candidate in bpy.context.preferences.addons),
        "bl_ext.user_default.mpfb",
    )
    if module not in bpy.context.preferences.addons:
        result = bpy.ops.preferences.addon_enable(module=module)
        if "FINISHED" not in result:
            # The repository may expose MPFB under blender_org while the
            # preferences key is not populated until the extension is enabled.
            fallback = "bl_ext.blender_org.mpfb" if module.endswith("user_default.mpfb") else "bl_ext.user_default.mpfb"
            result = bpy.ops.preferences.addon_enable(module=fallback)
            if "FINISHED" not in result:
                raise RuntimeError(f"Could not enable MPFB extension: {result}")

    script = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None
    if not script:
        raise RuntimeError("Expected builder script path after --")
    sys.argv = [script, *sys.argv[sys.argv.index("--") + 2 :]]
    runpy.run_path(script, run_name="__main__")


main()
