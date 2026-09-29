import { AssetContainer, Bone, Matrix, MeshBuilder, NullEngine, PBRMaterial, Scene, Skeleton } from '@babylonjs/core';
import { expect, it } from 'vitest';
import { packCompleteAvatarMaterials } from '../packCompleteAvatarMaterials';

it('packs exact solid factors without changing the source geometry or skin weights', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  Object.defineProperty(engine, 'isWebGPU', { value: true });
  scene.metadata = { avatarMaterialPaletteExperiment: true };
  const container = new AssetContainer(scene), skeleton = new Skeleton('rig', 'rig', scene);
  new Bone('bone', skeleton, null, Matrix.Identity());
  const meshes = [0, 1].map(i => {
    const mesh = MeshBuilder.CreateBox(`panel${i}`, {}, scene), material = new PBRMaterial(`surface${i}`, scene);
    material.metallic = .15 + .6 * i; material.roughness = .32 + .17 * i;
    material.albedoColor.set(.12 + .3 * i, .25, .5); mesh.material = material; mesh.skeleton = skeleton;
    mesh.setVerticesData('matricesIndices', new Float32Array(mesh.getTotalVertices() * 4));
    const weights = new Float32Array(mesh.getTotalVertices() * 4);
    for (let v = 0; v < mesh.getTotalVertices(); v++) weights[v * 4] = 1;
    mesh.setVerticesData('matricesWeights', weights); return mesh;
  });
  container.meshes = meshes; container.materials = meshes.map(mesh => mesh.material!);
  container.skeletons = [skeleton]; container.geometries = meshes.map(mesh => mesh.geometry!); container.removeAllFromScene();
  const original = meshes.map(mesh => ({ material: mesh.material as PBRMaterial,
    data: Object.fromEntries(mesh.getVerticesDataKinds().map(kind => [kind, Array.from(mesh.getVerticesData(kind)!)])),
    indices: Array.from(mesh.getIndices()!) }));
  try {
    expect(packCompleteAvatarMaterials(container)).toBe(1);
    expect(meshes[0].material).toBe(meshes[1].material);
    const material = meshes[0].material as PBRMaterial, texture = material.metallicTexture!;
    expect(texture.getSize().width).toBe(2); expect(texture.coordinatesIndex).toBe(5); expect(texture.gammaSpace).toBe(false);
    expect(Array.from(texture.getInternalTexture()!._bufferView as Float32Array)).toEqual(Array.from(new Float32Array([1,.32,.15,1,1,.49,.75,1])));
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i], before = original[i];
      for (const [kind, data] of Object.entries(before.data)) expect(Array.from(mesh.getVerticesData(kind)!)).toEqual(data);
      expect(Array.from(mesh.getIndices()!)).toEqual(before.indices);
      expect(Array.from(mesh.getVerticesData('color')!).slice(0,4)).toEqual(Array.from(new Float32Array([...before.material.albedoColor.asArray(),1])));
      expect(Array.from(mesh.getVerticesData('uv6')!).slice(0,2)).toEqual([(i+.5)/2,.5]);
      expect(before.material.metallicTexture).toBeNull();
    }
    expect(packCompleteAvatarMaterials(container)).toBe(0);
  } finally { container.dispose(); scene.dispose(); engine.dispose(); }
});
