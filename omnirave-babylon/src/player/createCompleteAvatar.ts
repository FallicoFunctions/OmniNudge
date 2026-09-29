import { SceneLoader, type ISceneLoaderAsyncResult } from '@babylonjs/core/Loading/sceneLoader.js';
import { configureAvatarTransmission } from './configureAvatarTransmission';
import { prepareCompleteAvatarVertexBuffers } from './completeAvatarBuffers';
import { applyCompleteAvatarMetadata } from './completeAvatarMetadata';
import { loadCompleteAvatarSource } from './completeAvatarDownload';
import { createCompleteExpressionControls } from './completeAvatarExpression';
import { createCompleteAvatarWardrobe } from './completeAvatarWardrobe';
import { createCompleteWardrobePreferences } from './completeWardrobePreferences';
import { createCompleteAvatarCrouch, createCrouchTransition } from './completeAvatarCrouch';
import { applyCompleteAvatarLocomotion } from './completeAvatarLocomotion';
import { createAvatarPoseTransition } from './createAvatarPoseTransition';
import soleProbes from './completeAvatarSoleProbes.json';
import { sampleAvatarMotionPhase } from './avatarMotionPhase';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial.js';
import type { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/loaders/glTF/index.js';
import type { AvatarAnimationState } from './avatarAnimationState';
import type { ReviewAvatar } from './createReviewAvatar';

type CompleteAvatarAssets = Pick<ISceneLoaderAsyncResult, 'meshes' | 'transformNodes' | 'skeletons' | 'animationGroups'>;
interface CompleteAvatarOptions {
  persistWardrobe?: boolean;
  /** The asset container retains the geometry, textures and materials. */
  sharedMaterials?: boolean;
  /** Remote copies sample a shared clock so detail changes preserve the pose. */
  sampledAnimationRate?: number;
}

/** Fixed launch looks retain the complete fitted anatomy, materials and rig. */
export async function createCompleteAvatar(
  scene: Scene,
  character: 'male' | 'female',
  options: CompleteAvatarOptions = {},
): Promise<ReviewAvatar> {
  const source = await loadCompleteAvatarSource(`${character}.glb`);
  const imported = await SceneLoader.ImportMeshAsync('', '/assets/avatars/complete-pair/', source, scene, undefined, '.glb');
  return createCompleteAvatarFromAssets(scene, character, imported, options);
}

/** Build independent controls around either an import or a cached model copy. */
export function createCompleteAvatarFromAssets(
  scene: Scene,
  character: 'male' | 'female',
  imported: CompleteAvatarAssets,
  options: CompleteAvatarOptions = {},
): ReviewAvatar {
  configureAvatarTransmission(scene, imported.meshes);
  const root = new TransformNode('review-avatar-root', scene);
  const pivot = new TransformNode('complete-avatar-facing', scene);
  pivot.parent = root;
  // The complete GLBs already face local +Z after Babylon's glTF conversion,
  // matching the player controller's atan2(moveX, moveZ) convention.
  pivot.rotation.y = 0;
  for (const node of [...imported.meshes, ...imported.transformNodes]) {
    if (!node.parent) node.parent = pivot;
  }
  let disposed = false;
  let released = false;
  let cleanupControls: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cleanupControls?.();
    for (const manager of new Set(imported.meshes.map(mesh => mesh.morphTargetManager))) manager?.dispose();
    for (const group of imported.animationGroups) group.dispose();
    for (const skeleton of imported.skeletons) skeleton.dispose();
  };
  const release = () => {
    if (released) return;
    released = true;
    dispose();
    root.dispose(false, options.sharedMaterials !== true);
  };
  try {
    const clips = new Map(imported.animationGroups.map(group => [group.name, group]));
    if (imported.skeletons.length !== 1 || imported.skeletons[0].bones.length !== 56
      || ['idle', 'walk', 'run'].some(name => !clips.has(name))) {
      throw new Error('The complete avatar is missing its skeleton or movement clips.');
    }
    prepareCompleteAvatarVertexBuffers(scene, imported.meshes);
    for (const mesh of imported.meshes) {
      applyCompleteAvatarMetadata(mesh);
      mesh.isPickable = false;
      mesh.checkCollisions = false;
    }
    const materials = new Set(imported.meshes.flatMap(mesh => mesh.material instanceof MultiMaterial
      ? mesh.material.subMaterials : [mesh.material]));
    for (const material of materials) {
      if (material instanceof PBRMaterial) {
        // AssetContainer registers a shared MultiMaterial on instantiation,
        // but not its children. Scene-wide lighting/image changes must still
        // invalidate every rendered PBR material.
        if (!scene.materials.includes(material)) scene.addMaterial(material);
        // Transmission switches from the environment cube to the loader's 2D
        // background. WebGPU must wait for the matching pipeline rather than
        // bind that new texture to the previous cube-sampler shader.
        if (scene.getEngine().isWebGPU && material.subSurface.isRefractionEnabled) {
          material.allowShaderHotSwapping = false;
        }
        // Shared illumination and film response also work on the venue path.
        material.environmentIntensity = 0.75;
        if (/groom fibers|hair strands|fine hair|scalp strands|swept strands/.test(material.name)) {
          material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
          // Retain authored fiber coverage; a low forced threshold turns the
          // filtered strand texture into a solid strip at ordinary view sizes.
          material.alphaCutOff = Math.max(0.08, material.alphaCutOff);
        }
        if (material.metadata?.gltf?.extras?.launchIridescent) {
          const authoredFilm = material.metadata.gltf.extras.launchFilmTexture;
          material.environmentIntensity = authoredFilm ? 1.25 : 1.65;
          material.iridescence.isEnabled = true;
          if (!authoredFilm) {
            material.iridescence.intensity = 1;
            material.iridescence.maximumThickness = 420;
            material.iridescence.indexOfRefraction = 1.45;
          }
        }
      }
    }
    root.metadata = { avatarCompleteCharacter: character, avatarRenderSource: 'complete-pair-glb', avatarAuthoredBodiesLoaded: true };
    let active: AvatarAnimationState | null = null;
    let hasAnimated = false;
    let initializing = true;
    let lastSample = -1;
    let expressionElapsed: number | undefined;
    const applyCrouch = createCompleteAvatarCrouch(imported.skeletons[0], root);
    let crouchTransition: ReturnType<typeof createCrouchTransition> | undefined;
    let priorCrouch = 0;
    for (const group of imported.animationGroups) group.stop();
    applyCompleteAvatarLocomotion(character, imported.skeletons[0], imported.animationGroups);
    const poseTransition = createAvatarPoseTransition(imported.skeletons[0], soleProbes[character]);
    const expression = createCompleteExpressionControls(imported.meshes, character === 'female' ? .9 : 0);
    const wardrobe = createCompleteAvatarWardrobe(imported.meshes,
      options.persistWardrobe === false ? undefined : createCompleteWardrobePreferences(character));
    const expressionObserver = options.sampledAnimationRate ? null : scene.onBeforeRenderObservable.add(() => {
      expression.update(scene.getEngine().getDeltaTime() / 1000, active ?? 'idle', root.rotation.y);
    });
    cleanupControls = () => {
      scene.onBeforeRenderObservable.remove(expressionObserver);
      expression.dispose();
      wardrobe.dispose();
    };
    const avatar: ReviewAvatar = {
      wardrobe,
      expression,
      root,
      meshes: imported.meshes,
      skeletons: imported.skeletons,
      animationGroups: imported.animationGroups,
      animate(elapsed, state, crouched = false) {
        if (disposed) return;
        const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
        const group = clips.get(state)!;
        if (active !== state) {
          const previous = active ? clips.get(active)! : undefined;
          const phase = previous && active !== 'idle' && state !== 'idle'
            ? (previous.getCurrentFrame() - previous.from) / Math.max(.001, previous.to - previous.from) : 0;
          if (active && hasAnimated) poseTransition.start(time);
          for (const clip of imported.animationGroups) clip.stop();
          group.start(true, 1, group.from, group.to);
          group.goToFrame(group.from + phase * (group.to - group.from));
          if (options.sampledAnimationRate) group.pause();
          active = state;
          lastSample = -1;
        }
        hasAnimated = true;
        const rate = options.sampledAnimationRate;
        const crouch = crouchTransition?.(elapsed, crouched) ?? 0;
        if (!rate) {
          if (crouch > 0 || priorCrouch > 0 || poseTransition.active(time)) {
            // Re-sample the unmodified pose even when called twice at one frame.
            group.goToFrame(group.getCurrentFrame());
          }
          poseTransition.apply(time);
          applyCrouch(crouch);
          priorCrouch = crouch;
          return;
        }
        const sample = Math.floor(time * rate);
        if (sample === lastSample && crouch === priorCrouch) return;
        lastSample = sample;
        const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 30;
        const duration = Math.max(1 / fps, (group.to - group.from) / fps);
        const phase = initializing ? ((sample / rate) % duration) / duration
          : sampleAvatarMotionPhase(root.parent ?? root,state,time,duration,sample / rate);
        group.goToFrame(group.from + phase * (group.to - group.from));
        poseTransition.apply(time);
        applyCrouch(crouch);
        priorCrouch = crouch;
        if (expressionElapsed === undefined || time < expressionElapsed || time - expressionElapsed > .25) expression.seek(time, state);
        else expression.update(time - expressionElapsed, state,
          root.rotation.y + (root.parent instanceof TransformNode ? root.parent.rotation.y : 0));
        expressionElapsed = time;
      },
      dispose,
      release,
    };
    avatar.animate(0, 'idle');
    initializing = false;
    hasAnimated = false;
    crouchTransition = createCrouchTransition();
    return avatar;
  } catch (error) {
    release();
    throw error;
  }
}
