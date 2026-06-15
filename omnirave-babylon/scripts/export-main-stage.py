import bpy
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output_dir = root / "public" / "assets" / "venues" / "main-stage"
output_dir.mkdir(parents=True, exist_ok=True)

scene_output = output_dir / "main-stage.glb"
collision_output = output_dir / "main-stage-collision.glb"

collision_collection = bpy.data.collections.get("Collision")
if collision_collection is None:
    raise RuntimeError('Expected a "Collision" collection for main-stage-collision.glb export')

collision_object_names = {obj.name for obj in collision_collection.all_objects}

for obj in bpy.data.objects:
    obj.select_set(False)

visible_objects = []
for obj in bpy.context.scene.objects:
    if obj.name in collision_object_names:
        continue
    if obj.type in {"MESH", "EMPTY"} and not obj.hide_render:
        obj.select_set(True)
        visible_objects.append(obj)

if not visible_objects:
    raise RuntimeError("No visible Main Stage objects selected for main-stage.glb export")

bpy.context.view_layer.objects.active = visible_objects[0]
bpy.ops.export_scene.gltf(
    filepath=str(scene_output),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
)

for obj in bpy.data.objects:
    obj.select_set(False)

collision_objects = []
previous_hide_viewport = {}
previous_hide_render = {}
for obj in collision_collection.all_objects:
    if obj.type in {"MESH", "EMPTY"}:
        previous_hide_viewport[obj.name] = obj.hide_viewport
        previous_hide_render[obj.name] = obj.hide_render
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
        collision_objects.append(obj)

if not collision_objects:
    raise RuntimeError('The "Collision" collection is empty; cannot export main-stage-collision.glb')

bpy.context.view_layer.objects.active = collision_objects[0]
try:
    bpy.ops.export_scene.gltf(
        filepath=str(collision_output),
        export_format="GLB",
        use_selection=False,
        use_visible=False,
        use_renderable=False,
        collection=collision_collection.name,
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="NONE",
    )
finally:
    for obj in collision_objects:
        obj.hide_viewport = previous_hide_viewport[obj.name]
        obj.hide_render = previous_hide_render[obj.name]
