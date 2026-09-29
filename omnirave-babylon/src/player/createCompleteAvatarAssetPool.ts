import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { loadCompleteAvatarSource } from './completeAvatarDownload';
import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { createCompleteAvatarFromAssets } from './createCompleteAvatar';
import { prepareCompleteAvatarVertexBuffers, interleaveCompleteAvatarVertexBuffers } from './completeAvatarBuffers';
import { completeAvatarAssetName, type CompleteAvatarDetail } from './completeAvatarLod';
import type { ReviewAvatar } from './createReviewAvatar';
import { createAvatarShaderCache } from './createAvatarShaderCache';
import { batchCompleteAvatarMeshes } from './batchCompleteAvatarMeshes';
import { packCompleteAvatarMaterials } from './packCompleteAvatarMaterials';
import { createAvatarInstanceRenderer } from './createAvatarInstanceRenderer';
import { shareAvatarMorphTargetBuffers } from './shareAvatarMorphTargetBuffers';
import { prepareAvatarCopyBounds } from './prepareAvatarCopyBounds';
import { publicUrl } from '../app/publicUrl';

/** One immutable source per character/detail, with independent rigged copies. */
export function createCompleteAvatarAssetPool(scene: Scene, options: { sampledAnimationRate?: number; crowd?: boolean } = {}) {
  const sources = new Map<string, Promise<AssetContainer>>();
  const loaded = new Set<AssetContainer>();
  const active = new Set<ReviewAvatar>();
  const sharedMorphStores: ReturnType<typeof shareAvatarMorphTargetBuffers>[] = [];
  const preparedBounds: ReturnType<typeof prepareAvatarCopyBounds>[] = [];
  const instances = options.crowd && scene.getEngine().isWebGPU && scene.metadata?.avatarInstanceExperiment
    && scene.metadata?.reuseTransmissionExperiment ? createAvatarInstanceRenderer(scene) : null;
  const shaders = scene.metadata?.avatarShaderCacheBaseline ? null : createAvatarShaderCache(scene);
  const copies: { build: () => ReviewAvatar; isCurrent?: () => boolean; resolve: (avatar: ReviewAvatar) => void; reject: (error: unknown) => void }[] = [];
  let frame: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const cancelScheduledCopy = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (timer !== undefined) clearTimeout(timer);
    frame = undefined; timer = undefined;
  };
  const scheduleCopy = () => {
    if (disposed || copies.length === 0 || frame !== undefined || timer !== undefined) return;
    const flush = () => {
      cancelScheduledCopy();
      if (disposed) return;
      while (copies.length) {
        const copy = copies.shift()!;
        try {
          if (copy.isCurrent && !copy.isCurrent()) {
            copy.reject(new Error('Avatar copy request is no longer current.'));
            continue;
          }
          copy.resolve(copy.build());
        } catch (error) { copy.reject(error); }
        break;
      }
      scheduleCopy();
    };
    // A source may unblock dozens of callers together. Build only one rig per
    // frame so its morph uploads do not all run in the same microtask burst.
    // The timer also drains the queue if a hidden tab's frames are throttled.
    if (scene.getEngine().getRenderingCanvas() && typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(flush);
      timer = setTimeout(flush, 100);
    } else timer = setTimeout(flush, 0);
  };

  async function source(character: 'male' | 'female', detail: CompleteAvatarDetail) {
    const file = completeAvatarAssetName(character, detail);
    let pending = sources.get(file);
    if (!pending) {
      pending = loadCompleteAvatarSource(file).then(source => SceneLoader.LoadAssetContainerAsync(publicUrl('/assets/avatars/complete-pair/'), source, scene, undefined, '.glb')).then(container => {
        const stores: ReturnType<typeof shareAvatarMorphTargetBuffers>[] = [];
        let bounds: ReturnType<typeof prepareAvatarCopyBounds> | undefined;
        try {
          if (disposed) throw new Error('Avatar asset pool has been disposed.');
          if (container.skeletons.length !== 1 || container.skeletons[0].bones.length !== 56
            || ['idle', 'walk', 'run'].some(name => !container.animationGroups.some(group => group.name === name))) {
            throw new Error('The complete avatar is missing its skeleton or movement clips.');
          }
          prepareCompleteAvatarVertexBuffers(scene, container.meshes);
          packCompleteAvatarMaterials(container);
          if (!scene.metadata?.avatarBatchingBaseline) batchCompleteAvatarMeshes(container,
            { combineMaterials: scene.metadata?.avatarMultiMaterialBatchExperiment === true });
          interleaveCompleteAvatarVertexBuffers(scene, container.meshes);
          for (const material of container.materials) shaders?.watch(material);
          for (const group of container.animationGroups) group.stop();
          if (scene.getEngine().isWebGPU && scene.metadata?.avatarSharedMorphsExperiment) {
            for (const manager of container.morphTargetManagers) stores.push(shareAvatarMorphTargetBuffers(scene, manager));
          }
          // Hidden templates need the CPU targets for cloning, but never draw.
          // Release their GPU morph textures; each visible copy owns its pose.
          for (const manager of container.morphTargetManagers) manager.useTextureToStoreTargets = false;
          if (scene.metadata?.avatarCopyBoundsExperiment) bounds = prepareAvatarCopyBounds(container);
          sharedMorphStores.push(...stores);
          if (bounds) preparedBounds.push(bounds);
          loaded.add(container);
          return container;
        } catch (error) {
          for (const store of stores) store.dispose();
          bounds?.dispose();
          container.dispose();
          throw error;
        }
      }).catch(error => { sources.delete(file); throw error; });
      sources.set(file, pending);
    }
    return pending;
  }

  function buildCopy(container: AssetContainer, character: 'male' | 'female', detail: CompleteAvatarDetail): ReviewAvatar {
    const profile = scene.metadata?.avatarCopyProfile;
    const start = profile ? performance.now() : 0;
    const model = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
    const instantiated = profile ? performance.now() : 0;
    const meshes = model.rootNodes.flatMap(root => [
      ...(root instanceof AbstractMesh ? [root] : []), ...root.getChildMeshes(),
    ]);
    const managers = new Set(meshes.map(mesh => mesh.morphTargetManager));
    let avatar: ReviewAvatar;
    try {
      for (const manager of managers) if (manager) manager.useTextureToStoreTargets = true;
      avatar = createCompleteAvatarFromAssets(scene, character, {
        meshes, transformNodes: model.rootNodes.filter((root): root is TransformNode => root instanceof TransformNode && !(root instanceof AbstractMesh)),
        skeletons: model.skeletons, animationGroups: model.animationGroups,
      }, { persistWardrobe: false, sharedMaterials: true,
        sampledAnimationRate: options.sampledAnimationRate ?? (detail === 0 ? 60 : detail === 1 ? 30 : 15) });
    } catch (error) {
      model.dispose();
      for (const manager of managers) manager?.dispose();
      throw error;
    }
    avatar.root.metadata.avatarCompleteDetail = detail;
    const release = avatar.release!;
    const releaseInstances = instances?.register(avatar);
    avatar.release = () => {
      const releaseStart = profile ? performance.now() : 0;
      active.delete(avatar); releaseInstances?.(); release();
      if (profile) { profile.releases++; profile.releaseMs += performance.now() - releaseStart; }
    };
    active.add(avatar);
    if (profile) {
      const elapsed = performance.now() - start;
      profile.builds++; profile.buildMs += elapsed; profile.maxBuildMs = Math.max(profile.maxBuildMs, elapsed);
      profile.instantiateMs += instantiated - start; profile.configureMs += performance.now() - instantiated;
    }
    return avatar;
  }

  const pool = {
    async create(character: 'male' | 'female', detail: CompleteAvatarDetail = 0, isCurrent?: () => boolean): Promise<ReviewAvatar> {
      if (disposed) throw new Error('Avatar asset pool has been disposed.');
      if (isCurrent && !isCurrent()) throw new Error('Avatar copy request is no longer current.');
      const container = await source(character, detail);
      if (disposed) throw new Error('Avatar asset pool has been disposed.');
      return new Promise<ReviewAvatar>((resolve, reject) => {
        copies.push({ resolve, reject, isCurrent, build: () => buildCopy(container, character, detail) });
        scheduleCopy();
      });
    },
    stats: () => ({ cachedAssets: loaded.size, activeInstances: active.size }),
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelScheduledCopy();
      for (const copy of copies.splice(0)) copy.reject(new Error('Avatar asset pool has been disposed.'));
      scene.onDisposeObservable.remove(disposeObserver);
      for (const avatar of [...active]) avatar.release?.();
      for (const store of sharedMorphStores) store.dispose();
      sharedMorphStores.length = 0;
      for (const bounds of preparedBounds) bounds.dispose();
      preparedBounds.length = 0;
      instances?.dispose();
      shaders?.dispose();
      for (const container of loaded) container.dispose();
      loaded.clear(); sources.clear();
    },
  };
  const disposeObserver = scene.onDisposeObservable.addOnce(() => pool.dispose());
  return pool;
}
