import { BakedVertexAnimationManager } from '@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { ReviewAvatar } from './createReviewAvatar';
import { AvatarInstanceMorphPlugin, AvatarInstancePosePlugin, createAvatarInstanceMorphs } from './createAvatarInstanceMorphs';
import { interleaveCompleteAvatarVertexBuffers } from './completeAvatarBuffers';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

const capacity = 64, bones = 57, rowFloats = bones * 16;
interface Member { mesh: Mesh; slot: number }
interface Group {
  proxy: Mesh; members: Member[]; matrices: Float32Array; settings: Float32Array;
  mirror: Matrix; lights: string;
  material: PBRMaterial;
  morphs: ReturnType<typeof createAvatarInstanceMorphs>;
  influences: Float32Array | null;
}

/** Prototype: live poses occupy rows of a texture; equal opaque panels draw together. */
export function createAvatarInstanceRenderer(scene: Scene) {
  const groups = new Map<string, Group>();
  const avatars = new Map<ReviewAvatar, number>();
  const instanceMaterials = new Map<string, PBRMaterial>();
  const excluded = new Set<AbstractMesh>();
  const free = Array.from({ length: capacity }, (_, i) => capacity - i - 1);
  const poseData = new Float32Array(capacity * rowFloats);
  const poseTexture = new RawTexture(poseData, bones * 4, capacity, Constants.TEXTUREFORMAT_RGBA,
    scene, false, false, Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT);
  poseTexture.name = 'live-crowd-bone-matrices'; poseTexture.gammaSpace = false;
  const manager = new BakedVertexAnimationManager(scene);
  manager.texture = poseTexture; manager.time = 0;
  const priorCandidates = scene.getActiveMeshCandidates;
  const candidates: { data: AbstractMesh[]; length: number } = { data: [], length: 0 };
  scene.getActiveMeshCandidates = () => {
    const source = priorCandidates.call(scene);
    candidates.length = 0;
    for (let i = 0; i < source.length; i++) if (!excluded.has(source.data[i])) candidates.data[candidates.length++] = source.data[i];
    candidates.data.length = candidates.length;
    return candidates;
  };
  const relative = Matrix.Identity();
  let disposed = false;
  const lightsKey = (mesh: Mesh) => mesh.lightSources.map(light => light.uniqueId).join(',');
  function register(avatar: ReviewAvatar): () => void {
    if (disposed || avatars.has(avatar) || !free.length || avatar.skeletons?.length !== 1 || avatar.skeletons[0].bones.length !== 56) return () => {};
    const slot = free.pop()!;
    avatars.set(avatar, slot);
    const owned: [string, Member][] = [];
    const createdGroups = new Set<string>();
    const createdMaterials = new Map<string, PBRMaterial>();
    let pendingProxy: Mesh | undefined;
    let pendingMorphs: Group['morphs'] = null;
    let released = false;
    const release = () => {
      if (released) return;
      released = true; avatars.delete(avatar); free.push(slot);
      for (const [key, member] of owned) {
        excluded.delete(member.mesh);
        const group = groups.get(key);
        if (!group) continue;
        const index = group.members.indexOf(member);
        if (index >= 0) group.members.splice(index, 1);
        if (!group.members.length) { group.proxy.dispose(false, false); group.morphs?.dispose(); groups.delete(key); }
      }
    };
    try {
      for (const mesh of avatar.meshes) {
        const material = mesh.material;
        if (!(mesh instanceof Mesh) || !mesh.geometry || !mesh.skeleton
          || mesh.skeleton.needInitialSkinMatrix || !mesh.computeBonesUsingShaders
          || (mesh.morphTargetManager && (!scene.metadata?.avatarInstanceMorphsExperiment
            || !mesh.morphTargetManager.isUsingTextureForTargets || mesh.morphTargetManager.numTargets > 4))
          || !(material instanceof PBRMaterial) || material.needAlphaBlendingForMesh(mesh)
          || material.subSurface.isRefractionEnabled || mesh.subMeshes?.length !== 1 || mesh.hasThinInstances
          || mesh.visibility !== 1 || mesh.billboardMode || mesh.infiniteDistance || mesh.hasInstances
          || mesh.getVerticesDataKinds().some(kind => mesh.getVertexBuffer(kind)?.isUpdatable())) continue;
        const sign = mesh.computeWorldMatrix(true).determinant() < 0 ? -1 : 1;
        const lights = lightsKey(mesh);
        const key = [mesh.geometry.uniqueId, material.uniqueId, mesh.renderingGroupId, mesh.sideOrientation,
          mesh.receiveShadows, mesh.layerMask, mesh.numBoneInfluencers, sign, lights].join('|');
        let group = groups.get(key);
        if (!group) {
          const morphs = pendingMorphs = mesh.morphTargetManager ? createAvatarInstanceMorphs(scene, mesh.morphTargetManager) : null;
          if (mesh.morphTargetManager && !morphs) continue;
          const proxy = pendingProxy = new Mesh(`crowd-instances:${mesh.name}`, scene);
          mesh.geometry.copy(`crowd-instances:${mesh.geometry.id}`).applyToMesh(proxy);
          proxy.material = material; proxy.skeleton = mesh.skeleton; proxy.numBoneInfluencers = mesh.numBoneInfluencers;
          interleaveCompleteAvatarVertexBuffers(scene, [proxy], true);
          const vertexBuffers = new Set(proxy.getVerticesDataKinds().map(kind => proxy.getVertexBuffer(kind)?.getBuffer()));
          if (vertexBuffers.size + (morphs ? 3 : 2) > 8) {
            proxy.dispose(false, false); morphs?.dispose(); pendingProxy = undefined; pendingMorphs = null; continue;
          }
          const materialKey = `${material.uniqueId}:${morphs ? 'morphs' : 'pose'}`;
          let instancedMaterial = instanceMaterials.get(materialKey);
          if (!instancedMaterial) {
            instancedMaterial = material.clone(`crowd-${morphs ? 'morphs' : 'pose'}:${material.name}`)!;
            createdMaterials.set(materialKey, instancedMaterial);
            if (morphs) new AvatarInstanceMorphPlugin(instancedMaterial);
            else new AvatarInstancePosePlugin(instancedMaterial);
            instanceMaterials.set(materialKey, instancedMaterial);
          }
          proxy.material = instancedMaterial;
          if (morphs) proxy.morphTargetManager = morphs.manager;
          proxy.sideOrientation = mesh.sideOrientation; proxy.renderingGroupId = mesh.renderingGroupId;
          proxy.receiveShadows = mesh.receiveShadows; proxy.layerMask = mesh.layerMask;
          proxy.metadata = { ...mesh.metadata, avatarGpuInstanceProxy: true };
          proxy._lightSources = [...mesh.lightSources];
          proxy.isPickable = false; proxy.checkCollisions = false;
          proxy.useVertexColors = mesh.useVertexColors; proxy.hasVertexAlpha = mesh.hasVertexAlpha;
          proxy.applyFog = mesh.applyFog; proxy.scaling.z = sign;
          proxy.computeWorldMatrix(true); proxy.freezeWorldMatrix();
          proxy.bakedVertexAnimationManager = manager;
          proxy.alwaysSelectAsActiveMesh = true; proxy.doNotSyncBoundingInfo = true;
          const matrices = new Float32Array(capacity * 16), settings = new Float32Array(capacity * 4);
          proxy.thinInstanceSetBuffer('matrix', matrices, 16, false);
          proxy.thinInstanceSetBuffer('bakedVertexAnimationSettingsInstanced', settings, 4, false);
          const influences = morphs ? new Float32Array(capacity * 4) : null;
          if (influences) proxy.thinInstanceSetBuffer('avatarMorphInfluences', influences, 4, false);
          proxy.thinInstanceCount = 0; proxy.setEnabled(false);
          group = { proxy, material, matrices, settings, members: [], mirror: Matrix.Scaling(1, 1, sign), lights, morphs, influences };
          groups.set(key, group);
          createdGroups.add(key);
          pendingProxy = undefined; pendingMorphs = null;
        }
        if (Boolean(group.morphs) !== Boolean(mesh.morphTargetManager)
          || (group.morphs && !group.morphs.matches(mesh.morphTargetManager!))) continue;
        const member = { mesh, slot };
        group.members.push(member); owned.push([key, member]);
      }
    } catch {
      // Registration is optional: a failed GPU allocation must leave the
      // complete original avatar available for Babylon's normal rendering.
      release();
      pendingProxy?.dispose(false, false); pendingMorphs?.dispose();
      for (const key of createdGroups) {
        const group = groups.get(key);
        if (group && !group.members.length) {
          group.proxy.dispose(false, false); group.morphs?.dispose(); groups.delete(key);
        }
      }
      for (const [key, material] of createdMaterials) {
        instanceMaterials.delete(key); material.dispose(false, true);
      }
      scene.metadata = { ...scene.metadata,
        avatarGpuInstanceFallbacks: (scene.metadata?.avatarGpuInstanceFallbacks ?? 0) + 1 };
    }
    return release;
  }
  const update = () => {
    const camera = scene.activeCamera;
    if (!camera || disposed) return;
    excluded.clear();
    for (const [avatar, slot] of avatars) {
      if (!avatar.root.isEnabled()) continue;
      const skeleton = avatar.skeletons![0];
      skeleton.prepare();
      const mesh = avatar.meshes.find(mesh => mesh.skeleton === skeleton);
      const matrices = mesh && skeleton.getTransformMatrices(mesh);
      if (matrices?.length === rowFloats) poseData.set(matrices, slot * rowFloats);
    }
    if (avatars.size) poseTexture.update(poseData);
    let rendered = 0;
    for (const group of groups.values()) {
      let count = 0;
      let matricesChanged = false, settingsChanged = false, influencesChanged = false;
      for (const { mesh, slot } of group.members) {
        if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0) continue;
        // A changed per-mesh material/light/visibility contract falls back to
        // its normal draw, preserving independent wardrobe and lighting.
        if (mesh.material !== group.material || mesh.visibility !== 1 || lightsKey(mesh) !== group.lights
          || (group.morphs && (!mesh.morphTargetManager || !group.morphs.matches(mesh.morphTargetManager)))) continue;
        mesh.computeWorldMatrix();
        excluded.add(mesh);
        if (!(mesh.layerMask & camera.layerMask) || (!mesh.alwaysSelectAsActiveMesh && !camera.isInFrustum(mesh))) continue;
        if (count >= capacity) { excluded.delete(mesh); continue; }
        mesh.getWorldMatrix().multiplyToRef(group.mirror, relative);
        const matrix = relative.asArray(), matrixOffset = count * 16, offset = count * 4;
        for (let i = 0; i < 16; i++) {
          const value = Math.fround(matrix[i]);
          matricesChanged ||= group.matrices[matrixOffset + i] !== value;
          group.matrices[matrixOffset + i] = value;
        }
        if (group.settings[offset] !== slot) {
          group.settings[offset] = group.settings[offset + 1] = slot;
          settingsChanged = true;
        }
        if (group.morphs) {
          const changed = group.morphs.write(mesh.morphTargetManager!, group.influences!, offset);
          influencesChanged ||= changed;
        }
        if (!count) {
          // Babylon dirties every shader attribute even when this setter
          // receives the same skeleton. Only a changed first member needs it.
          if (group.proxy.skeleton !== mesh.skeleton) group.proxy.skeleton = mesh.skeleton;
        }
        count++;
      }
      group.proxy.setEnabled(count > 0);
      group.proxy.thinInstanceCount = count;
      if (count) {
        if (matricesChanged) group.proxy.thinInstanceBufferUpdated('matrix');
        if (settingsChanged) group.proxy.thinInstancePartialBufferUpdate('bakedVertexAnimationSettingsInstanced', count, 0);
        if (influencesChanged) group.proxy.thinInstancePartialBufferUpdate('avatarMorphInfluences', count, 0);
      }
      rendered += count;
    }
    scene.metadata.avatarGpuInstances = { groups: groups.size, avatars: avatars.size, panels: rendered };
  };
  const observer = scene.onBeforeActiveMeshesEvaluationObservable.add(update);
  return { register, update, dispose() {
    if (disposed) return;
    disposed = true;
    scene.onBeforeActiveMeshesEvaluationObservable.remove(observer);
    scene.getActiveMeshCandidates = priorCandidates;
    for (const group of groups.values()) { group.proxy.dispose(false, false); group.morphs?.dispose(); }
    for (const material of instanceMaterials.values()) material.dispose(false, true);
    instanceMaterials.clear();
    groups.clear(); avatars.clear(); excluded.clear(); manager.dispose(true);
  } };
}
