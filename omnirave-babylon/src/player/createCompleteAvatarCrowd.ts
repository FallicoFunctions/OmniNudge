import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { loadCompleteAvatarSource } from './completeAvatarDownload';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import type { MorphTargetManager } from '@babylonjs/core/Morph/morphTargetManager.js';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer.js';
import type { Scene } from '@babylonjs/core/scene.js';
import './registerCompleteAvatarLoader';
import { prepareCompleteAvatarVertexBuffers } from './completeAvatarBuffers';
import { createCompleteExpressionControls, type CompleteExpressionControls } from './completeAvatarExpression';
import { completeAvatarAssetName, resolveCompleteAvatarDetail, type CompleteAvatarDetail } from './completeAvatarLod';
import { createCompleteCrowdTransmission } from './completeCrowdTransmission';
import { publicUrl } from '../app/publicUrl';

export type CompleteCrowdMode = 'adaptive' | 'full';
type Character = 'male' | 'female';
interface Source { container: AssetContainer; triangles: number }
interface Actor {
  id: number; character: Character; root: TransformNode; model?: InstantiatedEntries;
  group?: AnimationGroup; detail?: CompleteAvatarDetail; triangles: number;
  elapsed: number; lastFrame: number; pending?: CompleteAvatarDetail; revision: number;
  morphManagers?: MorphTargetManager[];
  expression?: CompleteExpressionControls;
  expressionElapsed?: number;
}

/** Owns crowd copies and the shared source assets. Each copy has an independent rig. */
export function createCompleteAvatarCrowd(scene: Scene) {
  const sources = new Map<string, Promise<Source>>();
  const loaded = new Set<AssetContainer>();
  const actors: Actor[] = [];
  const transmission = createCompleteCrowdTransmission();
  let disposed = false;
  let mode: CompleteCrowdMode = 'adaptive';
  let generation = 0;
  let statusError: string | null = null;
  let fullQualityTransmission = false;

  function disposeModel(actor: Actor) {
    actor.expression?.dispose(); actor.expression = undefined;
    actor.model?.dispose();
    // Babylon's InstantiatedEntries disposes nodes, bones and groups, but
    // leaves the per-copy morph managers allocated unless disposed explicitly.
    for (const manager of actor.morphManagers ?? []) manager.dispose();
    actor.model = undefined; actor.morphManagers = undefined;
  }

  function source(character: Character, detail: CompleteAvatarDetail): Promise<Source> {
    const key = `${character}:${detail}`;
    let promise = sources.get(key);
    if (!promise) {
      promise = loadCompleteAvatarSource(completeAvatarAssetName(character, detail)).then(source => SceneLoader.LoadAssetContainerAsync(publicUrl('/assets/avatars/complete-pair/'), source, scene, undefined, '.glb')).then(container => {
        if (disposed) { container.dispose(); throw new Error('Crowd has been disposed.'); }
        if (container.skeletons.length !== 1 || container.skeletons[0].bones.length !== 56
          || ['idle', 'walk', 'run'].some(name => !container.animationGroups.some(group => group.name === name))) {
          container.dispose(); throw new Error('Crowd asset has an invalid animation rig.');
        }
        prepareCompleteAvatarVertexBuffers(scene, container.meshes);
        for (const group of container.animationGroups) group.stop();
        for (const material of container.materials) if (material instanceof PBRMaterial) {
          if (scene.getEngine().isWebGPU && material.subSurface.isRefractionEnabled) {
            material.allowShaderHotSwapping = false;
          }
          transmission.watch(material);
          material.environmentIntensity = .75;
          if (material.metadata?.gltf?.extras?.launchIridescent) {
            const authoredFilm = material.metadata.gltf.extras.launchFilmTexture;
            material.environmentIntensity = authoredFilm ? 1.25 : 1.65;
            material.iridescence.isEnabled = detail < 2;
            if (!authoredFilm) {
              material.iridescence.intensity = 1;
              material.iridescence.maximumThickness = 420;
              material.iridescence.indexOfRefraction = 1.45;
            }
          }
        }
        loaded.add(container);
        return { container, triangles: container.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0) };
      }).catch(error => { sources.delete(key); throw error; });
      sources.set(key, promise);
    }
    return promise;
  }

  function pose(actor: Actor, force = false) {
    const group = actor.group;
    if (!group) return;
    const rate = mode === 'full' || actor.detail === 0 ? 60 : actor.detail === 1 ? 30 : 15;
    const tick = Math.floor(actor.elapsed * rate);
    if (!force && tick === actor.lastFrame) return;
    actor.lastFrame = tick;
    const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    const duration = Math.max(1 / fps, (group.to - group.from) / fps);
    group.goToFrame(group.from + ((tick / rate + actor.id * .173) % duration) * fps);
    const motion = actor.id % 3 === 0 ? 'walk' : actor.id % 3 === 1 ? 'idle' : 'run';
    actor.expression?.update(actor.elapsed - (actor.expressionElapsed ?? actor.elapsed), motion);
    actor.expressionElapsed = actor.elapsed;
  }

  async function replace(actor: Actor, detail: CompleteAvatarDetail) {
    const revision = ++actor.revision;
    actor.pending = detail;
    try {
      const asset = await source(actor.character, detail);
      if (disposed || actor.root.isDisposed() || actor.revision !== revision) return;
      const model = asset.container.instantiateModelsToScene(name => `${actor.id}:${name}`, false, { doNotInstantiate: true });
      for (const root of model.rootNodes) root.parent = actor.root;
      for (const mesh of actor.root.getChildMeshes()) { mesh.isPickable = false; mesh.checkCollisions = false; }
      const clip = actor.id % 3 === 0 ? 'walk' : actor.id % 3 === 1 ? 'idle' : 'run';
      const group = model.animationGroups.find(candidate => candidate.name.endsWith(`:${clip}`))!;
      for (const animation of model.animationGroups) animation.stop();
      group.start(true, 1, group.from, group.to); group.pause();
      disposeModel(actor);
      actor.model = model; actor.group = group; actor.detail = detail; actor.triangles = asset.triangles;
      actor.morphManagers = [...new Set(actor.root.getChildMeshes().map(mesh => mesh.morphTargetManager).filter((manager): manager is MorphTargetManager => Boolean(manager)))];
      actor.expression = createCompleteExpressionControls(actor.root.getChildMeshes(), actor.elapsed + actor.id * .73);
      actor.expression.setExpression(actor.id % 4 === 0 ? 'smile' : 'neutral', .7);
      actor.expressionElapsed = actor.elapsed;
      pose(actor, true);
    } catch (error) {
      if (!disposed && !actor.root.isDisposed()) statusError = error instanceof Error ? error.message : 'Crowd asset could not load.';
    } finally { if (actor.revision === revision) actor.pending = undefined; }
  }

  function clearActors() {
    for (const actor of actors) { actor.revision++; disposeModel(actor); actor.root.dispose(false, false); }
    actors.length = 0;
  }

  return {
    setFullQualityTransmission(enabled: boolean) { fullQualityTransmission = enabled; },
    async setCount(count: number, nextMode: CompleteCrowdMode, cameraPosition: Vector3) {
      if (disposed) return;
      const current = ++generation;
      mode = nextMode; statusError = null;
      const bounded = Math.min(64, Math.max(0, Number.isFinite(count) ? Math.round(count) : 0));
      // Let the control repaint, and spread disposal over short tasks. Retain
      // existing characters instead of destroying the entire crowd on a resize.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (current !== generation || disposed) return;
      let removed = 0;
      while (actors.length > bounded) {
        const actor = actors.pop()!;
        actor.revision++; disposeModel(actor); actor.root.dispose(false, false);
        if (++removed % 4 === 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          if (current !== generation || disposed) return;
        }
      }
      for (let i = actors.length;i < bounded;i++) {
        const root = new TransformNode(`crowd-actor-${i}`, scene);
        root.position.set(((i % 8) - 3.5) * 1.15, 0, -Math.floor(i / 8) * 2.1);
        const actor: Actor = { id: i, character: i % 2 ? 'female' : 'male', root, elapsed: 0, triangles: 0, lastFrame: -1, revision: 0 };
        actors.push(actor);
      }
      await Promise.all(actors.map(actor => {
        const detail = mode === 'full' ? 0 : resolveCompleteAvatarDetail(Vector3.Distance(cameraPosition, actor.root.position), actor.detail);
        actor.lastFrame = -1;
        if (actor.detail === detail) return Promise.resolve();
        return replace(actor, detail);
      }));
      if (current !== generation || disposed) return;
      if (statusError) throw new Error(statusError);
    },
    update(deltaSeconds: number, cameraPosition: Vector3) {
      if (disposed) return;
      let fullTransmission = fullQualityTransmission || mode === 'full' || actors.length === 0;
      for (const actor of actors) {
        actor.elapsed += Math.max(0, Math.min(deltaSeconds, .2));
        const desired = mode === 'full' ? 0 : resolveCompleteAvatarDetail(Vector3.Distance(cameraPosition, actor.root.position), actor.detail);
        if (desired === 0 || actor.detail === 0) fullTransmission = true;
        if (desired !== actor.detail && desired !== actor.pending) void replace(actor, desired);
        else if (desired === actor.detail && actor.pending !== undefined) { actor.revision++; actor.pending = undefined; }
        pose(actor);
      }
      transmission.update(fullTransmission);
    },
    stats() {
      const counts = [0, 0, 0];
      for (const actor of actors) if (actor.detail !== undefined) counts[actor.detail]++;
      return { actors: actors.length, detailCounts: counts, triangles: actors.reduce((sum, actor) => sum + actor.triangles, 0), cachedAssets: loaded.size, pending: actors.filter(actor => actor.pending !== undefined).length, fullQualityTransmission, transmissionTargets: transmission.stats(), error: statusError };
    },
    dispose() { if (disposed) return; disposed = true; generation++; transmission.dispose(); clearActors(); for (const container of loaded) container.dispose(); loaded.clear(); sources.clear(); },
  };
}
