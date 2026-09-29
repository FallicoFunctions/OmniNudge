import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { MorphTargetManager } from '@babylonjs/core/Morph/morphTargetManager.js';
import type { MorphTarget } from '@babylonjs/core/Morph/morphTarget.js';
import type { Scene } from '@babylonjs/core/scene.js';

interface MorphStorage {
  _targetStoreTexture: BaseTexture | null;
  _textureVertexStride: number;
  _textureWidth: number;
  _textureHeight: number;
  _vertexCount: number;
  _supportsPositions: boolean;
  _supportsNormals: boolean;
  _supportsTangents: boolean;
  _supportsUVs: boolean;
  _supportsUV2s: boolean;
  _supportsColors: boolean;
}

const channels = (target: MorphTarget) => [target.getPositions(), target.getNormals(), target.getTangents(),
  target.getUVs(), target.getUV2s(), target.getColors()];

/**
 * Launch-avatar targets are immutable arrays; only their influences animate.
 * Keep one uploaded array texture while giving every clone independent targets,
 * influences and texture ownership. Subsequent synchronize() calls use Babylon
 * normally, so a copy that edits its target data receives its own GPU storage.
 */
export function shareAvatarMorphTargetBuffers(scene: Scene, source: MorphTargetManager) {
  const storage = source as unknown as MorphStorage;
  const internal = storage._targetStoreTexture?.getInternalTexture();
  if (!source.isUsingTextureForTargets || !internal || source.numTargets === 0) return { dispose() {}, bytes: 0 };
  const arrays = Array.from({ length: source.numTargets }, (_, i) => channels(source.getTarget(i)));
  const descriptor = Object.getOwnPropertyDescriptor(source, 'clone');
  const nativeClone = source.clone;
  const snapshot: Omit<MorphStorage, '_targetStoreTexture'> = {
    _textureVertexStride: storage._textureVertexStride, _textureWidth: storage._textureWidth,
    _textureHeight: storage._textureHeight, _vertexCount: storage._vertexCount,
    _supportsPositions: storage._supportsPositions, _supportsNormals: storage._supportsNormals,
    _supportsTangents: storage._supportsTangents, _supportsUVs: storage._supportsUVs,
    _supportsUV2s: storage._supportsUV2s, _supportsColors: storage._supportsColors,
  };
  // This owner belongs to the pool rather than the scene's texture list.
  // Each visible wrapper takes an additional native InternalTexture reference.
  internal.incrementReferences();
  const owner = new BaseTexture(scene.getEngine(), internal);
  let disposed = false;
  const wrappedClone = function(this: MorphTargetManager) {
    const matches = !disposed && this === source && this.numTargets === arrays.length
      && arrays.every((row, i) => channels(this.getTarget(i)).every((data, j) => data === row[j]));
    if (!matches) return nativeClone.call(this);
    const copy = new MorphTargetManager(scene);
    const nativeSynchronize = copy.synchronize;
    // Match Babylon's clone operation, installing the initial storage before
    // unfreezing targets would repack and upload the same data for every peer.
    copy.synchronize = function() {
      delete (copy as unknown as { synchronize?: () => void }).synchronize;
      if (!copy.isUsingTextureForTargets || copy.numTargets > scene.getEngine().getCaps().texture2DArrayMaxLayerCount) {
        nativeSynchronize.call(copy);
        return;
      }
      const targetStorage = copy as unknown as MorphStorage;
      internal.incrementReferences();
      const texture = new BaseTexture(scene, internal);
      texture.name = `Shared avatar morph texture ${copy.uniqueId}`;
      Object.assign(targetStorage, snapshot, { _targetStoreTexture: texture });
      // Preserve synchronize's final mesh notification when a caller has
      // attached the manager before its initial synchronization.
      for (const mesh of scene.meshes) if (mesh.morphTargetManager === copy) mesh._syncGeometryWithMorphTargetManager();
    };
    try {
      copy.areUpdatesFrozen = true;
      for (let i = 0; i < this.numTargets; i++) copy.addTarget(this.getTarget(i).clone());
      copy.areUpdatesFrozen = false;
      copy.enablePositionMorphing = this.enablePositionMorphing;
      copy.enableNormalMorphing = this.enableNormalMorphing;
      copy.enableTangentMorphing = this.enableTangentMorphing;
      copy.enableUVMorphing = this.enableUVMorphing;
      copy.enableUV2Morphing = this.enableUV2Morphing;
      copy.enableColorMorphing = this.enableColorMorphing;
      copy.metadata = this.metadata;
      return copy;
    } catch (error) { copy.dispose(); throw error; }
  };
  source.clone = wrappedClone;
  return {
    bytes: snapshot._textureWidth * snapshot._textureHeight * arrays.length * 4 * Float32Array.BYTES_PER_ELEMENT,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (source.clone === wrappedClone) {
        if (descriptor) Object.defineProperty(source, 'clone', descriptor);
        else delete (source as unknown as { clone?: () => MorphTargetManager }).clone;
      }
      owner.dispose();
    },
  };
}
