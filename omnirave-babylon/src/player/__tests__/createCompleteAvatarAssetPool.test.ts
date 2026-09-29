import { Animation, AnimationGroup, AssetContainer, Bone, FreeCamera, Matrix, Mesh, MeshBuilder, MorphTarget, MorphTargetManager, MultiMaterial, NullEngine, PBRMaterial, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCompleteAvatarAssetPool } from '../createCompleteAvatarAssetPool';
import * as buffers from '../completeAvatarBuffers';
import * as copyBounds from '../prepareAvatarCopyBounds';
import { createRemotePlayerRigs } from '../createRemotePlayerRigs';
import type { WorldSnapshot } from '../../network/worldSocket';
import { InternalTexture, InternalTextureSource } from '@babylonjs/core/Materials/Textures/internalTexture.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';

vi.mock('../completeAvatarDownload', () => ({ loadCompleteAvatarSource: async (file: string) => file }));

let engine: NullEngine;
let scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function source() {
  const container = new AssetContainer(scene);
  const root = new TransformNode('source-root', scene);
  const material = new PBRMaterial('authored cloth', scene);
  const meshes = ['top', 'jacket'].map(slot => {
    const mesh = MeshBuilder.CreateBox(slot, {}, scene); mesh.parent = root; mesh.material = material;
    mesh.metadata = { gltf: { extras: { avatarSlot: slot, avatarOptionId: `authored-${slot}` } } };
    return mesh;
  });
  const skeleton = new Skeleton('rig', 'rig', scene);
  for (let i = 0; i < 56; i++) new Bone(`bone-${i}`, skeleton, null, Matrix.Identity());
  for (const mesh of meshes) mesh.skeleton = skeleton;
  const manager = new MorphTargetManager(scene);
  for (const name of ['cloth', 'Expression_BlinkLeft']) {
    const target = new MorphTarget(name, 0, scene); target.setPositions(meshes[0].getVerticesData('position')!); manager.addTarget(target);
  }
  meshes[0].morphTargetManager = manager;
  const groups = ['idle', 'walk', 'run'].map(name => {
    const group = new AnimationGroup(name, scene);
    const animation = new Animation(name, 'position.y', 30, Animation.ANIMATIONTYPE_FLOAT);
    animation.setKeys([{ frame: 0, value: 0 }, { frame: 30, value: .1 }]);
    group.addTargetedAnimation(animation, root);
    const corrective = new Animation(name, 'influence', 30, Animation.ANIMATIONTYPE_FLOAT);
    corrective.setKeys([{ frame: 0, value: 0 }, { frame: 30, value: 1 }]);
    group.addTargetedAnimation(corrective, manager.getTarget(0));
    return group;
  });
  Object.assign(container, { meshes, transformNodes: [root], materials: [material], skeletons: [skeleton],
    animationGroups: groups, morphTargetManagers: [manager], geometries: meshes.map(mesh => mesh.geometry!) });
  container.removeAllFromScene();
  return container;
}

it('shares one load and its immutable resources while keeping wardrobe, expressions and poses independent', async () => {
  const load = vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async () => source());
  const pool = createCompleteAvatarAssetPool(scene);
  const [a, b, c] = await Promise.all([pool.create('female'), pool.create('female'), pool.create('female')]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(pool.stats()).toEqual({ cachedAssets: 1, activeInstances: 3 });
  const first = a.meshes.find(mesh => mesh.name === 'top') as Mesh;
  const second = b.meshes.find(mesh => mesh.name === 'top') as Mesh;
  expect(first.geometry).toBe(second.geometry);
  expect(first.material).toBe(second.material);
  expect(first.skeleton).not.toBe(second.skeleton);
  expect(first.morphTargetManager).not.toBe(second.morphTargetManager);
  a.wardrobe!.setVisible('jacket', false);
  expect(a.meshes.find(mesh => mesh.name === 'jacket')!.isEnabled()).toBe(false);
  expect(b.meshes.find(mesh => mesh.name === 'jacket')!.isEnabled()).toBe(true);
  a.expression!.setBlink('closed'); b.expression!.setBlink('open');
  expect(first.morphTargetManager!.getTarget(1).influence).toBe(1);
  expect(second.morphTargetManager!.getTarget(1).influence).toBe(0);
  a.animate(.5, 'run'); b.animate(.25, 'walk');
  expect(a.animationGroups!.find(group => group.name === 'run')!.isStarted).toBe(true);
  expect(b.animationGroups!.find(group => group.name === 'run')!.isStarted).toBeFalsy();
  expect(first.morphTargetManager!.getTarget(0).influence).toBeCloseTo(.5);
  expect(second.morphTargetManager!.getTarget(0).influence).toBeCloseTo(.25);
  const material = second.material!; const dispose = vi.spyOn(material, 'dispose');
  a.release!(); a.release!();
  expect(dispose).not.toHaveBeenCalled();
  expect(first.isDisposed()).toBe(true);
  expect(second.isDisposed()).toBe(false);
  expect(pool.stats().activeInstances).toBe(2);
  b.release!(); c.release!();
  expect(scene.meshes).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
  expect(scene.morphTargetManagers).toHaveLength(0);
  pool.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('reuses cached levels and releases all active instances when the pool closes', async () => {
  new FreeCamera('test-camera', Vector3.Zero(), scene);
  const load = vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async () => source());
  const baseline = scene.onBeforeRenderObservable.observers.length;
  const pool = createCompleteAvatarAssetPool(scene);
  const avatars = await Promise.all([pool.create('male', 0), pool.create('male', 1), pool.create('female', 2)]);
  expect(load.mock.calls.map(call => call[1])).toEqual(['male.glb', 'male-lod1.glb', 'female-lod2.glb']);
  expect(avatars.map(avatar => avatar.root.metadata.avatarCompleteDetail)).toEqual([0, 1, 2]);
  pool.dispose(); pool.dispose();
  expect(avatars.every(avatar => avatar.root.isDisposed())).toBe(true);
  // Babylon defers render-list cleanup to the next frame, even in NullEngine.
  scene.render();
  await vi.waitFor(() => expect(scene.onBeforeRenderObservable.observers.length).toBe(baseline));
  expect(scene.meshes).toHaveLength(0);
  expect(scene.transformNodes).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
  expect(scene.morphTargetManagers).toHaveLength(0);
  await expect(pool.create('male')).rejects.toThrow('disposed');
});

it.each([false, true])('preserves material configuration and independent rigs with combined materials=%s', async combineMaterials => {
  scene.metadata = { avatarMultiMaterialBatchExperiment: combineMaterials };
  const container = source();
  // Keep the source's morph-driven top outside the batch, while two static
  // skinned panels use separate immutable materials in the same wardrobe slot.
  const first = container.meshes[1] as Mesh;
  const cloth = new PBRMaterial('authored cloth panel', scene); cloth.environmentIntensity = .1;
  first.material = cloth;
  const film = new PBRMaterial('authored iridescent trim', scene);
  film.metadata = { gltf: { extras: { launchIridescent: true, launchFilmTexture: 'film.png' } } };
  film.iridescence.intensity = .6;
  const second = first.clone('jacket trim')!; second.material = film;
  for (const mesh of [first, second]) {
    mesh.setVerticesData('matricesIndices', new Float32Array(mesh.getTotalVertices() * 4));
    const weights = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
    mesh.setVerticesData('matricesWeights', weights);
  }
  // The fixture animates its root transform. Real launch sources animate
  // skeleton bones; make this fixture's wardrobe panels eligible too.
  for (const group of container.animationGroups) for (const track of [...group.targetedAnimations]) {
    if (track.target === container.transformNodes[0]) group.removeTargetedAnimation(track.animation);
  }
  container.meshes.push(second); container.materials.push(cloth, film);
  container.removeAllFromScene();
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValue(container);
  const clothDisposed = vi.spyOn(cloth, 'dispose'), filmDisposed = vi.spyOn(film, 'dispose');
  const pool = createCompleteAvatarAssetPool(scene);
  const a = await pool.create('female'), b = await pool.create('female');
  const jacketsA = a.meshes.filter(mesh => mesh.metadata?.avatarSlot === 'jacket');
  const jacketsB = b.meshes.filter(mesh => mesh.metadata?.avatarSlot === 'jacket');
  expect(jacketsA).toHaveLength(combineMaterials ? 1 : 2);
  expect(jacketsA[0].material instanceof MultiMaterial).toBe(combineMaterials);
  expect(cloth.environmentIntensity).toBe(.75);
  expect(film.environmentIntensity).toBe(1.25); expect(film.iridescence.isEnabled).toBe(true);
  expect(film.iridescence.intensity).toBe(.6);
  expect(scene.materials).toEqual(expect.arrayContaining([cloth, film]));
  a.wardrobe!.setVisible('jacket', false);
  expect(jacketsA.every(mesh => !mesh.isEnabled())).toBe(true);
  expect(jacketsB.every(mesh => mesh.isEnabled())).toBe(true);
  expect(jacketsA[0].skeleton).not.toBe(jacketsB[0].skeleton);
  a.release!(); expect(clothDisposed).not.toHaveBeenCalled(); expect(filmDisposed).not.toHaveBeenCalled();
  b.animate(.5, 'walk'); b.release!(); pool.dispose();
  expect(clothDisposed).toHaveBeenCalledTimes(1); expect(filmDisposed).toHaveBeenCalledTimes(1);
  expect(scene.multiMaterials).toHaveLength(0);
});

it('keeps hidden source morphs on the CPU and independent visible-copy morphs in texture storage', async () => {
  // Exercise Babylon's texture lifecycle; NullEngine has no GL array allocator.
  const allocations: ReturnType<typeof vi.spyOn>[] = [];
  vi.spyOn(engine, 'createRawTexture2DArray').mockImplementation(() => {
    const texture = new InternalTexture(engine, InternalTextureSource.Raw2DArray, true);
    allocations.push(vi.spyOn(texture, 'dispose'));
    return texture;
  });
  Object.assign(engine.getCaps(), { canUseGLVertexID: true, textureFloat: true,
    maxVertexTextureImageUnits: 16, texture2DArrayMaxLayerCount: 256, maxTextureSize: 4096 });
  const container = source();
  const templateAllocations = [...allocations];
  const template = container.morphTargetManagers[0];
  expect(template.isUsingTextureForTargets).toBe(true);
  const originalPositions = Array.from(template.getTarget(0).getPositions()!);
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValue(container);
  const pool = createCompleteAvatarAssetPool(scene);
  const a = await pool.create('female');
  expect(template.useTextureToStoreTargets).toBe(false);
  expect(template.isUsingTextureForTargets).toBe(false);
  expect(templateAllocations.every(dispose => dispose.mock.calls.length > 0)).toBe(true);
  expect(Array.from(template.getTarget(0).getPositions()!)).toEqual(originalPositions);
  const b = await pool.create('female');
  const first = a.meshes.find(mesh => mesh.name === 'top')!.morphTargetManager!;
  const second = b.meshes.find(mesh => mesh.name === 'top')!.morphTargetManager!;
  expect(first.isUsingTextureForTargets).toBe(true);
  expect(second.isUsingTextureForTargets).toBe(true);
  a.animate(.6, 'walk'); b.animate(.2, 'run');
  expect(first.getTarget(0).influence).toBeCloseTo(.6);
  expect(second.getTarget(0).influence).toBeCloseTo(.2);
  expect(template.getTarget(0).influence).toBe(0);
  a.release!();
  b.animate(.7, 'run');
  expect(second.getTarget(0).influence).toBeCloseTo(.7);
  expect(second.isUsingTextureForTargets).toBe(true);
  pool.dispose();
});

it('shares one morph upload through native pooled clones, animation, wardrobe and cleanup with prepared bounds', async () => {
  Object.defineProperty(engine, 'isWebGPU', { get: () => true });
  scene.metadata = { avatarSharedMorphsExperiment: true, avatarCopyBoundsExperiment: true };
  Object.assign(engine.getCaps(), { canUseGLVertexID: true, textureFloat: true,
    maxVertexTextureImageUnits: 16, texture2DArrayMaxLayerCount: 256, maxTextureSize: 4096 });
  vi.spyOn(engine, 'createRawTexture2DArray').mockImplementation((data, width, height, depth) => {
    const texture = new InternalTexture(engine, InternalTextureSource.Raw2DArray, true);
    Object.assign(texture, { width, height, depth, is2DArray: true, isReady: true, _bufferView: data });
    return texture;
  });
  const container = source();
  for (const mesh of container.meshes as Mesh[]) {
    mesh.setVerticesData('matricesIndices', new Float32Array(mesh.getTotalVertices() * 4));
    const weights = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
    mesh.setVerticesData('matricesWeights', weights);
  }
  const internalTexture = (manager: MorphTargetManager) => (manager as unknown as {
    _targetStoreTexture: { getInternalTexture(): InternalTexture };
  })._targetStoreTexture.getInternalTexture();
  const templateTexture = internalTexture(container.morphTargetManagers[0]);
  const references = () => (templateTexture as unknown as { _references: number })._references;
  const allocations = vi.mocked(engine.createRawTexture2DArray).mock.calls.length;
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValue(container);
  const pool = createCompleteAvatarAssetPool(scene);
  const a = await pool.create('female', 1), b = await pool.create('female', 1);
  const first = a.meshes.find(mesh => mesh.name === 'top')!, second = b.meshes.find(mesh => mesh.name === 'top')!;
  expect(internalTexture(first.morphTargetManager!)).toBe(templateTexture);
  expect(internalTexture(second.morphTargetManager!)).toBe(templateTexture);
  expect(vi.mocked(engine.createRawTexture2DArray).mock.calls.length).toBe(allocations);
  expect(references()).toBe(3);
  expect(first.getBoundingInfo()).not.toBe(second.getBoundingInfo());
  a.animate(.6, 'walk'); b.animate(.2, 'run');
  expect(first.morphTargetManager!.getTarget(0).influence).toBeCloseTo(.6);
  expect(second.morphTargetManager!.getTarget(0).influence).toBeCloseTo(.2);
  a.wardrobe!.setVisible('jacket', false);
  expect(b.wardrobe!.isVisible('jacket')).toBe(true);
  a.release!(); expect(references()).toBe(2);
  b.animate(.7, 'run'); expect(second.morphTargetManager!.getTarget(0).influence).toBeCloseTo(.7);
  pool.dispose(); expect(references()).toBe(0);
  expect(scene.meshes).toHaveLength(0); expect(scene.morphTargetManagers).toHaveLength(0);
});

it('releases the retained morph upload immediately when later source preparation fails', async () => {
  Object.defineProperty(engine, 'isWebGPU', { get: () => true });
  scene.metadata = { avatarSharedMorphsExperiment: true, avatarCopyBoundsExperiment: true };
  Object.assign(engine.getCaps(), { canUseGLVertexID: true, textureFloat: true,
    maxVertexTextureImageUnits: 16, texture2DArrayMaxLayerCount: 256, maxTextureSize: 4096 });
  vi.spyOn(engine, 'createRawTexture2DArray').mockImplementation(() => new InternalTexture(engine, InternalTextureSource.Raw2DArray, true));
  const container = source(), manager = container.morphTargetManagers[0];
  const texture = (manager as unknown as { _targetStoreTexture: { getInternalTexture(): InternalTexture } })._targetStoreTexture.getInternalTexture();
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValue(container);
  vi.spyOn(copyBounds, 'prepareAvatarCopyBounds').mockImplementation(() => { throw new Error('bounds failed'); });
  const pool = createCompleteAvatarAssetPool(scene);
  await expect(pool.create('female')).rejects.toThrow('bounds failed');
  expect((texture as unknown as { _references: number })._references).toBe(0);
  expect(pool.stats()).toEqual({ cachedAssets: 0, activeInstances: 0 });
  pool.dispose();
});

it('retries a failed source load without retaining a rejected promise', async () => {
  const load = vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(async () => source());
  const pool = createCompleteAvatarAssetPool(scene);
  await expect(pool.create('male')).rejects.toThrow('offline');
  const avatar = await pool.create('male');
  expect(load).toHaveBeenCalledTimes(2);
  expect(pool.stats()).toEqual({ cachedAssets: 1, activeInstances: 1 });
  avatar.release!(); pool.dispose();
});

it('releases an invalid source and a source that arrives after disposal', async () => {
  const invalid = source(); invalid.animationGroups.pop()!.dispose();
  const load = vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValueOnce(invalid);
  const pool = createCompleteAvatarAssetPool(scene);
  await expect(pool.create('male')).rejects.toThrow('missing');
  expect(scene.skeletons).toHaveLength(0);
  expect(pool.stats()).toEqual({ cachedAssets: 0, activeInstances: 0 });
  let finish!: (container: AssetContainer) => void;
  load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = pool.create('male'); pool.dispose();
  const late = source(); const dispose = vi.spyOn(late, 'dispose'); finish(late);
  await expect(pending).rejects.toThrow('disposed');
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(scene.meshes).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
});

it('cleans up a clone when preparation fails after its source loaded', async () => {
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async () => source());
  const prepare = vi.spyOn(buffers, 'prepareCompleteAvatarVertexBuffers');
  prepare.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('buffer failure'); });
  const pool = createCompleteAvatarAssetPool(scene);
  await expect(pool.create('male')).rejects.toThrow('buffer failure');
  expect(pool.stats().activeInstances).toBe(0);
  expect(scene.meshes).toHaveLength(0);
  expect(scene.transformNodes).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
  expect(scene.morphTargetManagers).toHaveLength(0);
  pool.dispose();
});

it('keeps a second remote player intact when the first shared copy despawns', async () => {
  const baselineMaterial = scene.defaultMaterial;
  const load = vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async () => source());
  const rigs = createRemotePlayerRigs(scene);
  const snapshot = (ids: string[]): WorldSnapshot => ({
    currentPlayerId: 'me', activeZone: 'main_stage', zoneMedia: [], zoneEvents: [],
    players: ids.map((id, i) => ({ id, playerName: id, mode: 'guest', zone: 'main_stage',
      position: { x: i * 3, y: 1.65, z: 0 }, loadout: { cv: '1', cp: 'female', cw: '111111' } })),
  });
  rigs.applySnapshot(snapshot(['first', 'second']));
  await vi.waitFor(() => expect(scene.getTransformNodeByName('remote-player-second')!.getChildMeshes().some(mesh => mesh.name === 'top')).toBe(true));
  expect(load).toHaveBeenCalledTimes(1);
  const second = scene.getTransformNodeByName('remote-player-second')!.getChildMeshes().find(mesh => mesh.name === 'top')!;
  const material = second.material!; const dispose = vi.spyOn(material, 'dispose');
  rigs.applySnapshot(snapshot(['second']));
  expect(second.isDisposed()).toBe(false);
  expect(dispose).not.toHaveBeenCalled();
  expect(second.skeleton!.bones).toHaveLength(56);
  rigs.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(scene.materials).toEqual([baselineMaterial]);
  expect(scene.meshes).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
  expect(scene.animationGroups).toHaveLength(0);
  expect(scene.morphTargetManagers).toHaveLength(0);
});

it('samples far poses less often while preserving the animation phase across detail levels', async () => {
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async () => source());
  const pool = createCompleteAvatarAssetPool(scene);
  const high = await pool.create('female', 0); const far = await pool.create('female', 2);
  high.animate(.4, 'walk'); far.animate(.4, 'walk');
  const influence = (avatar: typeof high) => avatar.meshes.find(mesh => mesh.name === 'top')!.morphTargetManager!.getTarget(0).influence;
  expect(influence(high)).toBeCloseTo(.4);
  expect(influence(far)).toBeCloseTo(influence(high));
  const group = far.animationGroups!.find(group => group.name === 'walk')!;
  const sample = vi.spyOn(group, 'goToFrame');
  far.animate(.42, 'walk'); far.animate(.44, 'walk');
  expect(sample).not.toHaveBeenCalled();
  far.animate(.48, 'walk');
  expect(sample).toHaveBeenCalledTimes(1);
  expect(influence(far)).toBeCloseTo(7 / 15);
  const seek = vi.spyOn(far.expression!, 'seek');
  far.animate(12.4, 'run');
  expect(seek).toHaveBeenCalledWith(12.4, 'run');
  expect(influence(far)).toBeCloseTo(.4);
  pool.dispose();
});

it('spreads shared-source copies across frames and cancels queued work when disposed', async () => {
  vi.useFakeTimers();
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  vi.spyOn(engine, 'getRenderingCanvas').mockReturnValue(document.createElement('canvas'));
  const load = vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async () => source());
  const pool = createCompleteAvatarAssetPool(scene);
  const first = pool.create('male');
  const second = pool.create('male').catch(error => error);
  await vi.advanceTimersByTimeAsync(0);
  expect(load).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
  expect(pool.stats().activeInstances).toBe(0);
  frames.get(1)!(0);
  const avatar = await first;
  expect(pool.stats().activeInstances).toBe(1);
  expect(request).toHaveBeenCalledTimes(2);
  pool.dispose();
  expect(await second).toBeInstanceOf(Error);
  expect(avatar.root.isDisposed()).toBe(true);
  expect(frames.size).toBe(0);
  await vi.advanceTimersByTimeAsync(200);
  expect(pool.stats().activeInstances).toBe(0);
  expect(scene.meshes).toHaveLength(0);
});

it('drains queued copies when background-tab animation frames do not arrive', async () => {
  vi.useFakeTimers();
  const request = vi.fn(() => 1);
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  vi.spyOn(engine, 'getRenderingCanvas').mockReturnValue(document.createElement('canvas'));
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async () => source());
  const pool = createCompleteAvatarAssetPool(scene);
  const first = pool.create('female'); const second = pool.create('female');
  await vi.advanceTimersByTimeAsync(99);
  expect(pool.stats().activeInstances).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  await first;
  expect(pool.stats().activeInstances).toBe(1);
  await vi.advanceTimersByTimeAsync(100);
  await second;
  expect(pool.stats().activeInstances).toBe(2);
  expect(cancel).toHaveBeenCalledTimes(2);
  pool.dispose();
});

it('skips stale queued copies without building their rigs or delaying the next live copy', async () => {
  vi.useFakeTimers();
  let current = true;
  const container = source();
  const instantiate = vi.spyOn(container, 'instantiateModelsToScene');
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValue(container);
  const pool = createCompleteAvatarAssetPool(scene);
  const stale = pool.create('male', 0, () => current).catch(error => error);
  const live = pool.create('male');
  // Resolve the source and enqueue both requests, without running the timer.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  current = false;
  await vi.advanceTimersByTimeAsync(0);
  expect(await stale).toBeInstanceOf(Error);
  await live;
  expect(instantiate).toHaveBeenCalledTimes(1);
  expect(pool.stats().activeInstances).toBe(1);
  pool.dispose();
});

it('expands packed WebGPU attributes once and retains the shared buffers for later copies', async () => {
  Object.defineProperty(engine, 'isWebGPU', { get: () => true });
  const container = source();
  const mesh = container.meshes[0] as Mesh;
  const originalPositions = mesh.getVertexBuffer('position');
  const joints = new Uint8Array(mesh.getTotalVertices() * 4);
  for (let index = 0; index < joints.length; index += 4) joints[index] = 5;
  mesh.setVerticesBuffer(new VertexBuffer(engine, joints, VertexBuffer.MatricesIndicesKind,
    false, false, 4, false, 0, 4, VertexBuffer.UNSIGNED_BYTE, false));
  const colors = new Uint8Array(mesh.getTotalVertices() * 3);
  for (let i = 0; i < colors.length; i++) colors[i] = i % 256;
  mesh.setVerticesBuffer(new VertexBuffer(engine, colors, VertexBuffer.ColorKind,
    false, false, 3, false, 0, 3, VertexBuffer.UNSIGNED_BYTE, true));
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValue(container);
  const pool = createCompleteAvatarAssetPool(scene);
  const first = await pool.create('female');
  const converted = mesh.getVertexBuffer(VertexBuffer.MatricesIndicesKind);
  expect(converted!.type).toBe(VertexBuffer.FLOAT);
  expect(mesh.getVertexBuffer('position')).toBe(originalPositions);
  const second = await pool.create('female');
  const firstMesh = first.meshes.find(item => item.name === 'top') as Mesh;
  const secondMesh = second.meshes.find(item => item.name === 'top') as Mesh;
  expect(firstMesh.getVertexBuffer(VertexBuffer.MatricesIndicesKind)).toBe(converted);
  expect(secondMesh.getVertexBuffer(VertexBuffer.MatricesIndicesKind)).toBe(converted);
  expect(Array.from(secondMesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!)).toEqual(Array.from(joints));
  const colorBuffer = secondMesh.getVertexBuffer(VertexBuffer.ColorKind)!;
  expect(colorBuffer.getSize()).toBe(3); expect(colorBuffer.type).toBe(VertexBuffer.FLOAT);
  const expandedColors = secondMesh.getVerticesData(VertexBuffer.ColorKind)!;
  expect(expandedColors.length).toBe(secondMesh.getTotalVertices() * 3);
  Array.from(expandedColors).forEach((value, i) => expect(value).toBeCloseTo(colors[i] / 255, 6));
  first.release!();
  expect(secondMesh.getVertexBuffer(VertexBuffer.MatricesIndicesKind)).toBe(converted);
  pool.dispose();
});

it('retargets animated glTF-style joint nodes to each copied skeleton', async () => {
  const container = source();
  const joint = new TransformNode('animated-joint', scene);
  joint.parent = container.transformNodes[0]; joint.rotationQuaternion = Quaternion.Identity();
  container.transformNodes.push(joint);
  container.skeletons[0].bones[0].linkTransformNode(joint);
  for (const group of container.animationGroups) {
    const track = new Animation('joint-turn', 'rotationQuaternion', 30, Animation.ANIMATIONTYPE_QUATERNION);
    track.setKeys([{ frame: 0, value: Quaternion.Identity() },
      { frame: 30, value: Quaternion.RotationAxis(Vector3.Up(), .8) }]);
    group.addTargetedAnimation(track, joint);
  }
  container.removeAllFromScene();
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValue(container);
  const pool = createCompleteAvatarAssetPool(scene);
  const a = await pool.create('male'); const b = await pool.create('male');
  const firstJoint = a.skeletons![0].bones[0].getTransformNode()!;
  const secondJoint = b.skeletons![0].bones[0].getTransformNode()!;
  expect(firstJoint).not.toBe(joint); expect(secondJoint).not.toBe(firstJoint);
  a.animate(.5, 'walk'); b.animate(.25, 'run');
  expect(firstJoint.rotationQuaternion!.toEulerAngles().y).toBeCloseTo(.4);
  expect(secondJoint.rotationQuaternion!.toEulerAngles().y).toBeCloseTo(.2);
  expect(joint.rotationQuaternion!.toEulerAngles().y).toBe(0);
  pool.dispose();
});

it.each([false, true])('retains independent rigs around pooled core buffers (baseline=%s)', async baseline => {
  Object.defineProperty(engine, 'isWebGPU', { get: () => true });
  scene.metadata = { avatarVertexBufferExperiment: !baseline };
  const container = source();
  const kinds = ['position', 'normal', 'matricesIndices', 'matricesWeights'];
  for (const mesh of container.meshes) {
    const count = mesh.getTotalVertices();
    mesh.setVerticesData('matricesIndices', new Float32Array(count * 4));
    mesh.setVerticesData('matricesWeights', Float32Array.from({ length: count * 4 }, (_, index) => index % 4 === 0 ? 1 : 0));
  }
  const before = kinds.map(kind => Array.from(container.meshes[0].getVerticesData(kind)!));
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockResolvedValue(container);
  const pool = createCompleteAvatarAssetPool(scene);
  try {
    const a = await pool.create('female'), b = await pool.create('female');
    const meshA = a.meshes.find(mesh => mesh.name === 'top') as Mesh;
    const meshB = b.meshes.find(mesh => mesh.name === 'top') as Mesh;
    expect(new Set(kinds.map(kind => meshA.getVertexBuffer(kind)!.getBuffer())).size).toBe(baseline ? 4 : 1);
    expect(meshA.geometry).toBe(meshB.geometry);
    expect(meshA.skeleton).not.toBe(meshB.skeleton);
    expect(meshA.morphTargetManager).not.toBe(meshB.morphTargetManager);
    expect(kinds.map(kind => Array.from(meshB.getVerticesData(kind)!))).toEqual(before);
    a.animate(.5, 'run'); b.animate(.25, 'walk');
    expect(meshA.morphTargetManager!.getTarget(0).influence).toBeCloseTo(.5);
    expect(meshB.morphTargetManager!.getTarget(0).influence).toBeCloseTo(.25);
    a.release!();
    expect(kinds.map(kind => Array.from(meshB.getVerticesData(kind)!))).toEqual(before);
  } finally { pool.dispose(); }
});

it('keeps local animation sampling at 60 Hz on a distant model', async () => {
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(async () => source());
  const pool = createCompleteAvatarAssetPool(scene, { sampledAnimationRate: 60 });
  const avatar = await pool.create('female', 2);
  const target = avatar.meshes.find(mesh => mesh.name === 'top')!.morphTargetManager!.getTarget(0);
  avatar.animate(1 / 60, 'walk'); expect(target.influence).toBeCloseTo(1 / 60);
  avatar.animate(2 / 60, 'walk'); expect(target.influence).toBeCloseTo(2 / 60);
  pool.dispose();
});
