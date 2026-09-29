import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';

/** Preserve material factors as vertex colors and a full-float parameter palette. */
export function packCompleteAvatarMaterials(container: AssetContainer): number {
  if (!container.scene.getEngine().isWebGPU || !container.scene.metadata?.avatarMaterialPaletteExperiment) return 0;
  const groups = new Map<string, Map<PBRMaterial, Mesh[]>>();
  for (const mesh of container.meshes) {
    const material = mesh.material;
    if (!(mesh instanceof Mesh) || !mesh.geometry || !mesh.skeleton || !(material instanceof PBRMaterial)
      || material.needAlphaBlendingForMesh(mesh) || material.subSurface.isRefractionEnabled
      || material.metallicTexture || material.reflectivityTexture || material.microSurfaceTexture
      || material.metallic === null || material.roughness === null
      || material.useAmbientOcclusionFromMetallicTextureRed || mesh.isVerticesDataPresent('uv6')
      || mesh.subMeshes?.length !== 1 || mesh.getVerticesDataKinds().some(kind => mesh.getVertexBuffer(kind)?.isUpdatable())) continue;
    const data = material.serialize();
    for (const key of ['name', 'id', 'uniqueId', 'metadata', 'albedo', 'metallic', 'roughness']) delete data[key];
    const key = JSON.stringify([data, Boolean(material.metadata?.gltf?.extras?.launchIridescent),
      material.metadata?.gltf?.extras?.launchFilmTexture ?? null,
      /groom fibers|hair strands|fine hair|scalp strands|swept strands/.test(material.name)]);
    const members = groups.get(key) ?? new Map<PBRMaterial, Mesh[]>();
    const meshes = members.get(material) ?? []; meshes.push(mesh); members.set(material, meshes); groups.set(key, members);
  }
  let packed = 0;
  for (const members of groups.values()) {
    if (members.size < 2) continue;
    const materials = [...members.keys()];
    const paletteData = new Float32Array(materials.length * 4);
    materials.forEach((material, index) => paletteData.set([1, material.roughness!, material.metallic!, 1], index * 4));
    const palette = new RawTexture(paletteData, materials.length, 1, Constants.TEXTUREFORMAT_RGBA,
      container.scene, false, false, Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT);
    palette.name = `avatar-material-factors:${materials[0].name}`;
    palette.gammaSpace = false; palette.coordinatesIndex = 5;
    palette.wrapU = palette.wrapV = Texture.CLAMP_ADDRESSMODE;
    const combined = materials[0].clone(`avatar-palette:${materials[0].name}`)!;
    combined.albedoColor.set(1, 1, 1); combined.metallic = combined.roughness = 1;
    combined.metallicTexture = palette;
    combined.useRoughnessFromMetallicTextureAlpha = false;
    combined.useRoughnessFromMetallicTextureGreen = true;
    combined.useMetallnessFromMetallicTextureBlue = true;
    combined.metadata = { ...materials[0].metadata, avatarPaletteMaterials: materials.map(material => material.name) };
    container.scene.removeMaterial(combined); container.materials.push(combined);
    // Material.clone also creates texture wrappers. The source container owns
    // every wrapper so pooled clones release their references together.
    for (const texture of new Set([palette, ...combined.getActiveTextures()])) {
      container.scene.removeTexture(texture);
      if (!container.textures.includes(texture)) container.textures.push(texture);
    }
    materials.forEach((material, index) => {
      for (const mesh of members.get(material)!) {
        const geometry = mesh.geometry!.copy(`avatar-palette:${mesh.geometry!.id}:${index}`);
        geometry.applyToMesh(mesh); container.scene.removeGeometry(geometry); container.geometries.push(geometry);
        const count = mesh.getTotalVertices();
        const sourceColors = mesh.useVertexColors ? mesh.getVerticesData('color') : null;
        const colorSize = mesh.getVertexBuffer('color')?.getSize() ?? 4;
        const colors = new Float32Array(count * 4), coordinates = new Float32Array(count * 2);
        const factor = material.albedoColor;
        for (let vertex = 0; vertex < count; vertex++) {
          const offset = vertex * colorSize;
          colors.set([(sourceColors?.[offset] ?? 1) * factor.r, (sourceColors?.[offset + 1] ?? 1) * factor.g,
            (sourceColors?.[offset + 2] ?? 1) * factor.b, colorSize === 4 ? sourceColors?.[offset + 3] ?? 1 : 1], vertex * 4);
          coordinates[vertex * 2] = (index + .5) / materials.length; coordinates[vertex * 2 + 1] = .5;
        }
        mesh.setVerticesData('color', colors, false, 4); mesh.setVerticesData('uv6', coordinates, false, 2);
        mesh.useVertexColors = true; mesh.material = combined;
      }
    });
    packed += members.size - 1;
  }
  container.geometries = container.geometries.filter(geometry => !geometry.isDisposed());
  return packed;
}
