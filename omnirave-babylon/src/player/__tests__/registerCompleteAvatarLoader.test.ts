import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { afterEach, expect, it } from 'vitest';
import '../registerCompleteAvatarLoader';

let engine: NullEngine | undefined;
afterEach(() => { engine?.dispose(); });

it('retains authored wardrobe and material metadata without the glTF barrel', async () => {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const gltf = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'authored-jacket', mesh: 0, extras: { avatarSlot: 'jacket', avatarOptionId: 'festival' } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: 'authored-film', extras: { launchIridescent: true },
      extensions: { KHR_materials_iridescence: { iridescenceFactor: 0.6 } } }],
    extensionsUsed: ['KHR_materials_iridescence'],
    buffers: [{ byteLength: vertices.byteLength,
      uri: `data:application/octet-stream;base64,${Buffer.from(vertices.buffer).toString('base64')}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  };
  const container = await SceneLoader.LoadAssetContainerAsync('', `data:${JSON.stringify(gltf)}`, scene, undefined, '.gltf');
  const jacket = container.meshes.find(mesh => mesh.name === 'authored-jacket')!;
  expect(jacket.metadata.gltf.extras).toEqual({ avatarSlot: 'jacket', avatarOptionId: 'festival' });
  expect(jacket.material!.metadata.gltf.extras).toEqual({ launchIridescent: true });
  expect((jacket.material as PBRMaterial).iridescence.isEnabled).toBe(true);
  expect((jacket.material as PBRMaterial).iridescence.intensity).toBe(0.6);
  expect(scene.meshes).toHaveLength(0);
  container.dispose();
  scene.dispose();
});
