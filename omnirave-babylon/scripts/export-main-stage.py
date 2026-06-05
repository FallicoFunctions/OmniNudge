import bpy
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output_dir = root / "public" / "assets" / "venues" / "main-stage"
output_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.export_scene.gltf(
    filepath=str(output_dir / "main-stage.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
)
