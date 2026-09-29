import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import type { AssetContainer } from '@babylonjs/core/assetContainer.js';

/** Reuse the initial CPU-skinned bounds of immutable, stopped avatar templates. */
export function prepareAvatarCopyBounds(container: AssetContainer) {
  const records = new WeakMap<Mesh, {
    bounds: BoundingInfo; subBounds: BoundingInfo[];
    geometry: Mesh['geometry']; skeleton: Mesh['skeleton']; morphs: Mesh['morphTargetManager'];
  }>();
  const restores: (() => void)[] = [];
  const copyBounds = (bounds: BoundingInfo) => new BoundingInfo(bounds.boundingBox.minimum.clone(), bounds.boundingBox.maximum.clone());
  class PreparedAvatarMesh extends Mesh {
    // Field initialization runs after Mesh's constructor finishes cloning.
    private _avatarCopyComplete = true;
    override refreshBoundingInfo(...args: Parameters<Mesh['refreshBoundingInfo']>): Mesh {
      const source = this.source;
      const prepared = !this._avatarCopyComplete && source ? records.get(source) : undefined;
      if (!prepared || args[0] !== true || args[1] !== true) return super.refreshBoundingInfo(...args);
      this.setBoundingInfo(copyBounds(prepared.bounds));
      for (let i = 0; i < (this.subMeshes?.length ?? 0); i++) {
        if (prepared.subBounds[i]) this.subMeshes[i].setBoundingInfo(copyBounds(prepared.subBounds[i]));
      }
      this._updateBoundingInfo();
      return this;
    }
  }
  for (const source of container.meshes) {
    if (!(source instanceof Mesh) || source.getClassName() !== 'Mesh' || !source.geometry || !source.skeleton
      || !source.computeBonesUsingShaders || source.hasThinInstances || source.hasInstances
      || source.skeleton.needInitialSkinMatrix || source.getBoundingInfo().isLocked) continue;
    // The container's clips are stopped and their joint nodes never animate;
    // every visible copy gets its own skeleton after this native clone step.
    source.refreshBoundingInfo(true, true);
    const prepared = { bounds: copyBounds(source.getBoundingInfo()),
      subBounds: source.subMeshes.map(sub => copyBounds(sub.getBoundingInfo())),
      geometry: source.geometry, skeleton: source.skeleton, morphs: source.morphTargetManager };
    records.set(source, prepared);
    const descriptor = Object.getOwnPropertyDescriptor(source, 'clone');
    const nativeClone = source.clone;
    const clone: Mesh['clone'] = function(this: Mesh, name = '', parent = null, noChildren, clonePhysics = true) {
      if (this !== source || noChildren !== true || (parent && !('_addToSceneRootNodes' in parent))
        || this.geometry !== prepared.geometry || this.skeleton !== prepared.skeleton || this.morphTargetManager !== prepared.morphs) {
        return nativeClone.call(this, name, parent, noChildren, clonePhysics);
      }
      return new PreparedAvatarMesh(name, this.getScene(), parent as Mesh['parent'], this, noChildren, clonePhysics);
    };
    source.clone = clone;
    restores.push(() => {
      if (source.clone !== clone) return;
      if (descriptor) Object.defineProperty(source, 'clone', descriptor);
      else delete (source as unknown as { clone?: Mesh['clone'] }).clone;
      records.delete(source);
    });
  }
  return { dispose() { for (const restore of restores.splice(0)) restore(); } };
}
