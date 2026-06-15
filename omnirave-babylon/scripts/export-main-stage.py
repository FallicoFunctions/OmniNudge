import bpy
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output_dir = root / "public" / "assets" / "venues" / "main-stage"
output_dir.mkdir(parents=True, exist_ok=True)

scene_output = output_dir / "main-stage.glb"
collision_output = output_dir / "main-stage-collision.glb"


def strip_unused_tangents(glb_path):
    data = bytearray(glb_path.read_bytes())
    if data[:4] != b"glTF":
        raise RuntimeError(f"{glb_path} is not a GLB file")

    json_chunk_length, json_chunk_type = struct.unpack_from("<II", data, 12)
    if json_chunk_type != 0x4E4F534A:
        raise RuntimeError(f"{glb_path} does not start with a JSON chunk")

    json_start = 20
    json_end = json_start + json_chunk_length
    glb_json = json.loads(data[json_start:json_end].decode("utf-8").rstrip(" \t\r\n\0"))
    materials = glb_json.get("materials", [])
    removed = 0

    for mesh in glb_json.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            material_index = primitive.get("material")
            material = materials[material_index] if material_index is not None else {}
            if material.get("normalTexture") is None and "TANGENT" in primitive.get("attributes", {}):
                del primitive["attributes"]["TANGENT"]
                removed += 1

    if removed == 0:
        return

    next_json = json.dumps(glb_json, separators=(",", ":")).encode("utf-8")
    if len(next_json) > json_chunk_length:
        raise RuntimeError("Cannot strip tangents because the GLB JSON chunk grew unexpectedly")

    next_json = next_json + b" " * (json_chunk_length - len(next_json))
    data[json_start:json_end] = next_json
    glb_path.write_bytes(data)
    print(f"Stripped unused tangents from {removed} Main Stage primitives")

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
    export_tangents=True,
    export_materials="EXPORT",
)
strip_unused_tangents(scene_output)

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
