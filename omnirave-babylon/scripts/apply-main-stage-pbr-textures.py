from pathlib import Path

import bmesh
import bpy


# Applies the approved CC0 material texture foundation to the authored Main Stage blend.
ROOT = Path(__file__).resolve().parent.parent
BLEND_PATH = ROOT / "assets-src" / "main-stage" / "main-stage.blend"
TEXTURE_ROOT = ROOT / "assets-src" / "main-stage" / "textures" / "subtle"
TEXTURE_TRIANGULATE_MODIFIER = "OmniRaveTextureTangentsTriangulate"
TEXTURE_DECIMATE_MODIFIER = "OmniRaveTextureBudgetDecimate"
TEXTURE_DECIMATE_RATIOS = {
    "V49_ScreenServiceCatwalkCableLoom": 0.84,
}


TEXTURE_SETS = {
    # One clean low-contrast surface set for every family: the material tint
    # comes from the runtime albedo factors, the maps only add close-range
    # response (fine relief, gentle roughness variation, banding breakup).
    "pearl": {
        "diffuse": "subtle_surface_diff_1k.jpg",
        "normal": "subtle_surface_nor_gl_1k.jpg",
        "arm": "subtle_surface_arm_1k.jpg",
    },
    "stone": {
        "diffuse": "subtle_surface_diff_1k.jpg",
        "normal": "subtle_surface_nor_gl_1k.jpg",
        "arm": "subtle_surface_arm_1k.jpg",
    },
    "black_metal": {
        "diffuse": "subtle_surface_diff_1k.jpg",
        "normal": "subtle_surface_nor_gl_1k.jpg",
        "arm": "subtle_surface_arm_1k.jpg",
    },
    "gold_metal": {
        "diffuse": "subtle_surface_diff_1k.jpg",
        "normal": "subtle_surface_nor_gl_1k.jpg",
        "arm": "subtle_surface_arm_1k.jpg",
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
        "V15_MatteProductionBlack",
        "V16_MatteBlackStageHardware",
        "V18_BlackPowderCoatTruss",
        "V18_LineArrayGraphite",
        "V7_BlackTruss",
        "V9_BlackRigging",
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

    material["omnirave_texture_source"] = f"subtle:{texture_set_name}"
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
            # Legacy meshes have been renamed/split as the blend evolved.
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
            continue


def ensure_vertex_stable_uvs(obj, cube_size=3.0):
    # Cube projection at a fixed world scale: fine texel density for
    # close-range viewing and no stretched faces perpendicular to a single
    # projection plane (the old two-axis planar mapping smeared wall faces).
    mesh = obj.data
    mesh.uv_layers.new(name="OmniRaveGeneratedUV")
    mesh.uv_layers["OmniRaveGeneratedUV"].active = True
    bpy.context.view_layer.objects.active = obj
    for other in bpy.context.selected_objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=cube_size, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def ensure_uvs_for_textured_meshes(textured_material_names):
    processed_mesh_data = set()
    triangulated_mesh_data = set()
    collision_collection = bpy.data.collections.get("Collision")
    collision_objects = set(collision_collection.all_objects) if collision_collection else set()

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        generated_uv = obj.data.uv_layers.get("OmniRaveGeneratedUV")
        if obj in collision_objects or obj.hide_viewport or obj.hide_render or obj.hide_get():
            if generated_uv:
                obj.data.uv_layers.remove(generated_uv)
            modifier = obj.modifiers.get(TEXTURE_TRIANGULATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
            modifier = obj.modifiers.get(TEXTURE_DECIMATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
            continue
        material_names = {slot.material.name for slot in obj.material_slots if slot.material}
        if not material_names.intersection(textured_material_names):
            if generated_uv:
                obj.data.uv_layers.remove(generated_uv)
            modifier = obj.modifiers.get(TEXTURE_TRIANGULATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
            modifier = obj.modifiers.get(TEXTURE_DECIMATE_MODIFIER)
            if modifier:
                obj.modifiers.remove(modifier)
            continue
        if generated_uv:
            obj.data.uv_layers.remove(generated_uv)
        if obj.data.uv_layers:
            pass
        elif obj.data.name not in processed_mesh_data:
            # UV-project each mesh datablock exactly once: L/R pairs share
            # datablocks, and editing per object splits that instancing.
            try:
                ensure_vertex_stable_uvs(obj)
            except RuntimeError as error:
                raise RuntimeError(f"Failed to generate Main Stage UVs for {obj.name}") from error
        processed_mesh_data.add(obj.data.name)

        # Triangulate the mesh DATA once per datablock instead of stacking a
        # per-object modifier: shared L/R datablocks must stay modifier-free or
        # the glTF exporter stops deduplicating them into one mesh.
        stale = obj.modifiers.get(TEXTURE_TRIANGULATE_MODIFIER)
        if stale:
            obj.modifiers.remove(stale)
        if obj.data.name not in triangulated_mesh_data:
            triangulated_mesh_data.add(obj.data.name)
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="BEAUTY", ngon_method="BEAUTY")
            bm.to_mesh(obj.data)
            bm.free()

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
