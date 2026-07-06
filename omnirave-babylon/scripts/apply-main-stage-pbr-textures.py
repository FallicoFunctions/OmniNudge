from pathlib import Path

import bmesh
import bpy


# Applies the approved CC0 material texture foundation to the authored Main Stage blend.
ROOT = Path(__file__).resolve().parent.parent
BLEND_PATH = ROOT / "assets-src" / "main-stage" / "main-stage.blend"
TEXTURE_ROOT = ROOT / "assets-src" / "main-stage" / "textures" / "polyhaven"
TEXTURE_TRIANGULATE_MODIFIER = "OmniRaveTextureTangentsTriangulate"
TEXTURE_DECIMATE_MODIFIER = "OmniRaveTextureBudgetDecimate"
TEXTURE_DECIMATE_RATIOS = {
    "V49_ScreenServiceCatwalkCableLoom": 0.84,
}


TEXTURE_SETS = {
    "pearl": {
        "diffuse": "marble_01_diff_1k.jpg",
        "normal": "marble_01_nor_gl_1k.jpg",
        "arm": "marble_01_arm_1k.jpg",
    },
    "stone": {
        "diffuse": "concrete_floor_01_diff_1k.jpg",
        "normal": "concrete_floor_01_nor_gl_1k.jpg",
        "arm": "concrete_floor_01_arm_1k.jpg",
    },
    "black_metal": {
        "diffuse": "metal_plate_black_diff_1k.jpg",
        "normal": "metal_plate_nor_gl_1k.jpg",
        "arm": "metal_plate_arm_1k.jpg",
    },
    "gold_metal": {
        "diffuse": "metal_plate_gold_diff_1k.jpg",
        "normal": "metal_plate_nor_gl_1k.jpg",
        "arm": "metal_plate_arm_1k.jpg",
    },
}


def ensure_gltf_material_output_group():
    group_name = "glTF Material Output"
    node_group = bpy.data.node_groups.get(group_name)
    if node_group is None:
        node_group = bpy.data.node_groups.new(group_name, "ShaderNodeTree")
        node_group.interface.new_socket("Occlusion", socket_type="NodeSocketFloat")
        node_group.nodes.new("NodeGroupOutput")
        node_group.nodes.new("NodeGroupInput")
    return node_group


MATERIAL_FAMILIES = {
    "pearl": {
        "V13_MoonstoneShell",
        "V14_PolishedMoonstoneShell",
        "V15_PearlShellBeveled",
        "V16_PearlArchitecturalShell",
        "V17_PearlShellSatin",
        "V18_PearlFacadeInlay",
        "V19_GatewayPearlIvory",
        "V20_LayeredPearlShell",
        "V7_PearlIvory",
    },
    "stone": {
        "V13_WetPlazaStone",
        "V15_WetPlazaInlay",
        "V18_WetStonePaver",
        "V19_DeepWetArrivalStone",
        "V20_RecessedWarmShadow",
    },
    "black_metal": {
        "V13_BlackStageRigging",
        "V14_MatteBlackProductionRig",
        "V16_MatteBlackStageHardware",
        "V18_LineArrayGraphite",
    },
    "gold_metal": {
        "V13_BrushedFestivalGold",
        "V14_BurnishedCelestialGold",
        "V15_EngineeredGoldAnchors",
        "V16_BrushedProductionGold",
        "V17_CrownBrushedGold",
        "V18_BrushedGoldTrim",
        "V19_ArrivalBrushedGold",
        "V20_ChasedGoldFiligree",
        "V9_CrownFiligreeGold",
    },
}

LEGACY_RIGGING_MATERIAL_OVERRIDES = {
    "V16_CrownRiggingSpan": "V18_BlackPowderCoatTruss",
    "V16_CrownRiggingFrontChord": "V14_BurnishedCelestialGold",
    "V16_CrownRiggingRearChord": "V14_BurnishedCelestialGold",
}

LEGACY_PREFIX_MATERIAL_OVERRIDES = {
    "V16_PlazaPaverGoldEdge_": "V18_BrushedGoldTrim",
}

def load_image(filename, non_color=False):
    path = TEXTURE_ROOT / filename
    if not path.exists():
        raise RuntimeError(f"Missing Main Stage texture file: {path}")
    image = bpy.data.images.load(str(path), check_existing=True)
    image.name = filename
    image.filepath = bpy.path.relpath(str(path), start=str(BLEND_PATH.parent))
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return image


def principled_input(principled, name):
    socket = principled.inputs.get(name)
    if socket is None:
        raise RuntimeError(f"Principled BSDF missing input: {name}")
    return socket


def apply_texture_set(material_name, texture_set_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        return False

    if material.node_tree is None:
        raise RuntimeError(f"{material_name} has no node tree")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError(f"{material_name} has no Principled BSDF node")

    for node in list(nodes):
        if node.name.startswith("OmniRaveTexture_"):
            nodes.remove(node)

    textures = TEXTURE_SETS[texture_set_name]
    diffuse = nodes.new("ShaderNodeTexImage")
    diffuse.name = f"OmniRaveTexture_{texture_set_name}_diffuse"
    diffuse.image = load_image(textures["diffuse"])
    links.new(diffuse.outputs["Color"], principled_input(principled, "Base Color"))

    normal_image = nodes.new("ShaderNodeTexImage")
    normal_image.name = f"OmniRaveTexture_{texture_set_name}_normal"
    normal_image.image = load_image(textures["normal"], non_color=True)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.name = f"OmniRaveTexture_{texture_set_name}_normal_map"
    normal_map.inputs["Strength"].default_value = 0.42
    links.new(normal_image.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled_input(principled, "Normal"))

    arm = nodes.new("ShaderNodeTexImage")
    arm.name = f"OmniRaveTexture_{texture_set_name}_arm"
    arm.image = load_image(textures["arm"], non_color=True)
    separate = nodes.new("ShaderNodeSeparateColor")
    separate.name = f"OmniRaveTexture_{texture_set_name}_arm_channels"
    links.new(arm.outputs["Color"], separate.inputs["Color"])
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.name = "OmniRaveTexture_gltf_output"
    gltf_output.node_tree = ensure_gltf_material_output_group()
    links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])
    links.new(separate.outputs["Green"], principled_input(principled, "Roughness"))
    links.new(separate.outputs["Blue"], principled_input(principled, "Metallic"))

    material["omnirave_texture_source"] = f"polyhaven:{texture_set_name}"
    return True


def remove_omnirave_texture_nodes(material):
    if not material or material.node_tree is None:
        return
    for node in list(material.node_tree.nodes):
        if node.name.startswith("OmniRaveTexture_"):
            material.node_tree.nodes.remove(node)
    if "omnirave_texture_source" in material:
        del material["omnirave_texture_source"]


def clean_non_target_materials(target_material_names):
    for material in bpy.data.materials:
        if material.name not in target_material_names:
            remove_omnirave_texture_nodes(material)


def reassign_legacy_rigging_materials():
    for object_name, material_name in LEGACY_RIGGING_MATERIAL_OVERRIDES.items():
        obj = bpy.data.objects.get(object_name)
        if obj is None or obj.type != "MESH":
            # Legacy proxies get replaced by later regeneration scripts; once
            # gone, their material reassignment is already baked into the blend.
            print(f"V50_LEGACY_SKIP mesh={object_name}")
            continue
        material = bpy.data.materials.get(material_name)
        if material is None:
            raise RuntimeError(f"Missing legacy Main Stage rigging material: {material_name}")
        if not obj.material_slots:
            obj.data.materials.append(material)
            continue
        for slot in obj.material_slots:
            slot.material = material

    for prefix, material_name in LEGACY_PREFIX_MATERIAL_OVERRIDES.items():
        material = bpy.data.materials.get(material_name)
        if material is None:
            raise RuntimeError(f"Missing legacy Main Stage rigging material: {material_name}")
        matched = False
        for obj in bpy.data.objects:
            if obj.type != "MESH" or not obj.name.startswith(prefix):
                continue
            matched = True
            if not obj.material_slots:
                obj.data.materials.append(material)
                continue
            for slot in obj.material_slots:
                slot.material = material
        if not matched:
            print(f"V50_LEGACY_SKIP prefix={prefix}")


def triangulate_mesh_data(mesh):
    # Triangulate the shared datablock itself: the glTF exporter refuses to
    # generate tangents for non-triangulated primitives, and per-object
    # triangulate modifiers would break mesh-data sharing between mirrored
    # nodes at export (doubling GPU memory).
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(mesh)
    bm.free()


def ensure_vertex_stable_uvs(obj):
    # Smart UV Project: unlike a planar two-axis projection it cannot produce
    # zero-area UV faces (and therefore zero-length tangents) on geometry
    # perpendicular to the projection plane.
    obj.data.uv_layers.new(name="OmniRaveGeneratedUV")
    obj.data.uv_layers["OmniRaveGeneratedUV"].active = True
    bpy.context.view_layer.objects.active = obj
    for other in bpy.context.selected_objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Cube projection at a fixed world scale: keeps ~one texture tile per
    # 4m (Smart UV normalises islands to the 0-1 square, which stretched a
    # single tile across whole meshes and made the maps invisible), and its
    # per-face dominant-axis mapping cannot emit the zero-area UV faces the
    # old two-axis planar projection produced.
    bpy.ops.uv.cube_project(cube_size=4.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def ensure_uvs_for_textured_meshes(textured_material_names):
    triangulated_mesh_names = set()
    collision_collection = bpy.data.collections.get("Collision")
    collision_objects = set(collision_collection.all_objects) if collision_collection else set()

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        generated_uv = obj.data.uv_layers.get("OmniRaveGeneratedUV")
        if obj in collision_objects or obj.hide_viewport or obj.hide_render or obj.hide_get():
            modifier = obj.modifiers.get(TEXTURE_TRIANGULATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
            modifier = obj.modifiers.get(TEXTURE_DECIMATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
            continue
        material_names = {slot.material.name for slot in obj.material_slots if slot.material}
        if not material_names.intersection(textured_material_names):
            modifier = obj.modifiers.get(TEXTURE_TRIANGULATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
            modifier = obj.modifiers.get(TEXTURE_DECIMATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
            continue
        authored_layers = [layer for layer in obj.data.uv_layers if layer.name != "OmniRaveGeneratedUV"]
        if not authored_layers:
            # Legacy planar generated UVs produce zero-area faces (and
            # therefore zero-length tangents) on geometry perpendicular to
            # the projection plane; regenerate them with a smart projection.
            if generated_uv:
                obj.data.uv_layers.remove(generated_uv)
            try:
                ensure_vertex_stable_uvs(obj)
            except RuntimeError as error:
                raise RuntimeError(f"Failed to generate Main Stage UVs for {obj.name}") from error

        if obj.data.name not in triangulated_mesh_names:
            triangulate_mesh_data(obj.data)
            triangulated_mesh_names.add(obj.data.name)

        decimate_ratio = TEXTURE_DECIMATE_RATIOS.get(obj.name)
        if decimate_ratio is None:
            modifier = obj.modifiers.get(TEXTURE_DECIMATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
        elif obj.modifiers.get(TEXTURE_DECIMATE_MODIFIER) is None:
            modifier = obj.modifiers.new(TEXTURE_DECIMATE_MODIFIER, "DECIMATE")
            modifier.ratio = decimate_ratio
        else:
            obj.modifiers[TEXTURE_DECIMATE_MODIFIER].ratio = decimate_ratio


target_material_names = {material_name for material_names in MATERIAL_FAMILIES.values() for material_name in material_names}
clean_non_target_materials(target_material_names)
reassign_legacy_rigging_materials()

applied = []
for texture_set_name, material_names in MATERIAL_FAMILIES.items():
    for material_name in sorted(material_names):
        if apply_texture_set(material_name, texture_set_name):
            applied.append(material_name)

ensure_uvs_for_textured_meshes(set(applied))

if len(applied) != len(target_material_names):
    raise RuntimeError(f"Expected {len(target_material_names)} textured materials, got {len(applied)}")

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
print(f"V50_TEXTURES_COMPLETE textured_materials={len(applied)}")
