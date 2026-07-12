import bpy
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output_dir = root / "public" / "assets" / "venues" / "main-stage"
output_dir.mkdir(parents=True, exist_ok=True)

# The Blender export is the uncompressed canonical artifact. The finalize
# step repairs its tangent data, then Draco-compresses this exact file into
# the runtime GLB so production and validation cannot diverge.
validation_dir = root / "assets-src" / "main-stage" / "build"
validation_dir.mkdir(parents=True, exist_ok=True)
validation_output = validation_dir / "main-stage-validation.glb"
collision_output = output_dir / "main-stage-collision.glb"
TEMP_TANGENT_TRIANGULATE_MODIFIER = "OmniRaveTempTangentsTriangulate"
TEMP_TANGENT_TRIANGULATE_PREFIXES = (
    "V13_BasinFountainJet_",
    "V7_ArcadeCol_",
    "V7_PlazaLightMast_",
    "V8_SpawnGalleryCol_",
    "V87_WingFacadeShadowFrameArray_",
    "V87_WingFacadeShadowVaultArray_",
    "V87_WingFacadeGoldLintelArray_",
)


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

    binary_chunk_length, binary_chunk_type = struct.unpack_from("<II", data, json_end)
    if binary_chunk_type != 0x004E4942:
        raise RuntimeError(f"{glb_path} does not contain a BIN chunk after the JSON chunk")
    binary_chunk_start = json_end + 8
    binary_chunk = bytes(data[binary_chunk_start : binary_chunk_start + binary_chunk_length])
    next_json = json.dumps(glb_json, separators=(",", ":")).encode("utf-8")
    json_padding = (4 - (len(next_json) % 4)) % 4
    padded_json = next_json + b" " * json_padding
    total_length = 12 + 8 + len(padded_json) + 8 + len(binary_chunk)

    rewritten = bytearray()
    rewritten.extend(b"glTF")
    rewritten.extend(struct.pack("<I", 2))
    rewritten.extend(struct.pack("<I", total_length))
    rewritten.extend(struct.pack("<I", len(padded_json)))
    rewritten.extend(struct.pack("<I", 0x4E4F534A))
    rewritten.extend(padded_json)
    rewritten.extend(struct.pack("<I", len(binary_chunk)))
    rewritten.extend(struct.pack("<I", 0x004E4942))
    rewritten.extend(binary_chunk)
    glb_path.write_bytes(rewritten)
    if removed:
        print(f"Stripped unused tangents from {removed} Main Stage primitives")


def ensure_temp_tangent_triangulation(objects):
    added = 0
    for obj in objects:
        if obj.type != "MESH" or not obj.name.startswith(TEMP_TANGENT_TRIANGULATE_PREFIXES):
            continue
        if obj.modifiers.get(TEMP_TANGENT_TRIANGULATE_MODIFIER) is not None:
            continue
        modifier = obj.modifiers.new(TEMP_TANGENT_TRIANGULATE_MODIFIER, "TRIANGULATE")
        modifier.quad_method = "BEAUTY"
        modifier.ngon_method = "BEAUTY"
        added += 1
    if added:
        print(f"Temporarily triangulated {added} legacy Main Stage cylindrical meshes for tangent export")

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

ensure_temp_tangent_triangulation(visible_objects)
bpy.context.view_layer.objects.active = visible_objects[0]
common_gltf_options = dict(
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_tangents=True,
    export_materials="EXPORT",
)
# Validation artifact first: raw accessors for tangent repair and tests.
bpy.ops.export_scene.gltf(filepath=str(validation_output), **common_gltf_options)
strip_unused_tangents(validation_output)
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
