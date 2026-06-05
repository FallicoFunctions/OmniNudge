import bpy
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output_dir = root / "public" / "assets" / "venues" / "main-stage"
output_dir.mkdir(parents=True, exist_ok=True)

scene_output = output_dir / "main-stage.glb"
collision_output = output_dir / "main-stage-collision.glb"

bpy.ops.export_scene.gltf(
    filepath=str(scene_output),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
)

collision_collection = bpy.data.collections.get("Collision")
if collision_collection is None:
    raise RuntimeError('Expected a "Collision" collection for main-stage-collision.glb export')

for obj in bpy.data.objects:
    obj.select_set(False)

collision_objects = []
for obj in collision_collection.all_objects:
    if obj.type in {"MESH", "EMPTY"}:
        obj.select_set(True)
        collision_objects.append(obj)

if not collision_objects:
    raise RuntimeError('The "Collision" collection is empty; cannot export main-stage-collision.glb')

bpy.context.view_layer.objects.active = collision_objects[0]
bpy.ops.export_scene.gltf(
    filepath=str(collision_output),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_texcoords=False,
    export_normals=True,
    export_materials="NONE",
)
