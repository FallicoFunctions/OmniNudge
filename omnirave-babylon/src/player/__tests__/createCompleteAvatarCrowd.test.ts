import { Animation, AnimationGroup, AssetContainer, Bone, Matrix, Mesh, MeshBuilder, MorphTarget, MorphTargetManager, NullEngine, PBRMaterial, RenderTargetTexture, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createCompleteAvatarCrowd } from '../createCompleteAvatarCrowd';

vi.mock('../completeAvatarDownload', () => ({ loadCompleteAvatarSource: async (file: string) => file }));

let engine: NullEngine | undefined;
afterEach(() => { vi.restoreAllMocks(); engine?.dispose(); });
function source(scene: Scene, name: string) {
  const container = new AssetContainer(scene);
  const root = new TransformNode(name, scene);
  const mesh = MeshBuilder.CreateBox(`${name}-mesh`, {}, scene); mesh.parent = root;
  const material = new PBRMaterial(`${name}-material`, scene); mesh.material = material;
  material.metadata = { gltf: { extras: { launchIridescent: true, launchFilmTexture: 'film.png' } } };
  material.iridescence.minimumThickness = 180; material.iridescence.maximumThickness = 620;
  material.iridescence.indexOfRefraction = 1.65; material.iridescence.intensity = .9;
  const skeleton = new Skeleton(name, name, scene);
  for (let i = 0;i < 56;i++) new Bone(`bone-${i}`, skeleton, null, Matrix.Identity());
  mesh.skeleton = skeleton;
  const manager = new MorphTargetManager(scene);
  const target = new MorphTarget('cloth', 0, scene); target.setPositions(mesh.getVerticesData('position')!); manager.addTarget(target); mesh.morphTargetManager = manager;
  for (const name of ['Expression_BlinkLeft', 'Expression_Smile', 'Secondary_HairSide']) {
    const control = new MorphTarget(name, 0, scene); control.setPositions(mesh.getVerticesData('position')!); manager.addTarget(control);
  }
  const groups = ['idle', 'walk', 'run'].map(name => {
    const group = new AnimationGroup(name, scene);
    const animation = new Animation(name, 'position.y', 60, Animation.ANIMATIONTYPE_FLOAT); animation.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: .1 }]); group.addTargetedAnimation(animation, root);
    const morph = new Animation(name, 'influence', 60, Animation.ANIMATIONTYPE_FLOAT); morph.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: 1 }]); group.addTargetedAnimation(morph, target);
    return group;
  });
  container.meshes = [mesh]; container.transformNodes = [root]; container.materials = [material]; container.skeletons = [skeleton]; container.animationGroups = groups; container.morphTargetManagers = [manager]; container.geometries = [mesh.geometry!]; container.removeAllFromScene();
  return container;
}

it.each([false, true])('shares geometry, keeps poses independent and releases copies with WebGPU=%s', async (webgpu) => {
  engine = new NullEngine(); const scene = new Scene(engine); const baselineMaterial = scene.defaultMaterial;
  const load = vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async (_root, file) => source(scene, String(file)));
  Object.defineProperty(engine, 'isWebGPU', { get: () => webgpu });
  const pool = createCompleteAvatarCrowd(scene);
  await pool.setCount(8, 'full', new Vector3(0, 2, 10));
  expect(load).toHaveBeenCalledTimes(2);
  expect(pool.stats().actors).toBe(8);
  const a = scene.getMeshByName('0:male.glb-mesh') as Mesh; const b = scene.getMeshByName('2:male.glb-mesh') as Mesh;
  expect(a.geometry).toBe(b.geometry);
  expect(a.material).toBe(b.material);
  expect(a.skeleton).not.toBe(b.skeleton);
  expect(a.morphTargetManager).not.toBe(b.morphTargetManager);
  expect(a.morphTargetManager!.getTarget(2).influence).toBeGreaterThan(0);
  expect(b.morphTargetManager!.getTarget(2).influence).toBe(0);
  pool.update(.1, new Vector3(0, 2, 10));
  await pool.setCount(0, 'full', Vector3.Zero());
  expect(scene.meshes).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
  expect(scene.animationGroups).toHaveLength(0);
  await pool.setCount(4, 'full', Vector3.Zero());
  expect(load).toHaveBeenCalledTimes(2);
  pool.dispose();
  expect(scene.meshes).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
  expect(scene.animationGroups).toHaveLength(0);
  expect(scene.materials).toEqual([baselineMaterial]);
  expect(scene.morphTargetManagers).toHaveLength(0);
});

it('disposes a source that arrives after the crowd was closed', async () => {
  engine = new NullEngine(); const scene = new Scene(engine); const baselineMaterial = scene.defaultMaterial;
  let finish: (container: AssetContainer) => void = () => { };
  const load = vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pool = createCompleteAvatarCrowd(scene);
  const pending = pool.setCount(1, 'full', Vector3.Zero());
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  pool.dispose();
  const container = source(scene, 'late'); const dispose = vi.spyOn(container, 'dispose'); finish(container); await pending;
  expect(dispose).toHaveBeenCalledOnce();
  expect(scene.meshes).toHaveLength(0);
  expect(scene.materials).toEqual([baselineMaterial]);
});

it('releases old morph managers when moving from far detail to close detail', async () => {
  engine = new NullEngine(); const scene = new Scene(engine);
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async (_root, file) => source(scene, String(file)));
  const pool = createCompleteAvatarCrowd(scene);
  await pool.setCount(2, 'adaptive', new Vector3(0, 1, 30));
  expect(pool.stats().detailCounts).toEqual([0, 0, 2]);
  for (const mesh of scene.meshes) {
    const film = (mesh.material as PBRMaterial).iridescence;
    expect(film.isEnabled).toBe(false); expect(film.maximumThickness).toBe(620);
    expect(film.indexOfRefraction).toBe(1.65); expect(film.intensity).toBe(.9);
  }
  const previous = scene.meshes.map(mesh => mesh.morphTargetManager).filter(Boolean);
  pool.update(.1, new Vector3(0, 1, 0));
  await vi.waitFor(() => expect(pool.stats().detailCounts).toEqual([0, 2, 0]));
  for (const manager of previous) expect(scene.morphTargetManagers).not.toContain(manager);
  expect(scene.skeletons).toHaveLength(2);
  expect(pool.stats().pending).toBe(0);
  expect(pool.stats().cachedAssets).toBe(4);
  const close = scene.getMeshByName('0:male-lod1.glb-mesh')!;
  expect((close.material as PBRMaterial).iridescence.isEnabled).toBe(true);
  expect((close.material as PBRMaterial).iridescence.maximumThickness).toBe(620);
  expect(close.morphTargetManager!.getTarget(2).influence).toBeGreaterThan(0);
  pool.dispose();
  expect(scene.morphTargetManagers).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
});

it('restores transmission quality for a close camera, explicit comparison and an empty crowd', async () => {
  engine = new NullEngine(); const scene = new Scene(engine);
  const background = new RenderTargetTexture('scene background', 1024, scene, true);
  let samples = 4;
  Object.defineProperty(background, 'samples', { get: () => samples, set: value => { samples = value; } });
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async (_root, file) => {
    const container = source(scene, String(file));
    const material = container.materials[0] as PBRMaterial;
    material.metadata.gltf.extras.launchTransmission = true;
    material.subSurface.refractionTexture = background;
    return container;
  });
  const pool = createCompleteAvatarCrowd(scene), far = new Vector3(0, 1, 30), near = new Vector3(0, 1, 0);
  await pool.setCount(2, 'adaptive', far); pool.update(.1, far);
  expect(pool.stats().transmissionTargets).toEqual([{ width: 512, height: 512, samples: 1 }]);
  pool.setFullQualityTransmission(true); pool.update(.1, far);
  expect(background.getSize().width).toBe(1024); expect(samples).toBe(4);
  pool.setFullQualityTransmission(false); pool.update(.1, far);
  expect(background.getSize().width).toBe(512);
  pool.update(.1, near);
  expect(background.getSize().width).toBe(1024); expect(samples).toBe(4);
  await vi.waitFor(() => expect(pool.stats().detailCounts).toEqual([0, 2, 0]));
  pool.update(.1, far);
  await vi.waitFor(() => expect(pool.stats().detailCounts).toEqual([0, 0, 2]));
  pool.update(.1, far);
  expect(background.getSize().width).toBe(512);
  await pool.setCount(0, 'adaptive', far); pool.update(.1, far);
  expect(background.getSize().width).toBe(1024); expect(samples).toBe(4);
  pool.dispose();
});
