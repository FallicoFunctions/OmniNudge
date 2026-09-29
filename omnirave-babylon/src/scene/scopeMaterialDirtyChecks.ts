import type { Material } from '@babylonjs/core/Materials/material.js';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';

interface DirtyMaterial {
  _blockDirtyMechanism: boolean;
  _markAllSubMeshesAsDirty(this: Material, callback: (defines: MaterialDefines) => void): void;
}

/** Use Babylon's maintained direct-binding index for frequently animated materials. */
export function scopeMaterialDirtyChecks(material: Material): void {
  const scene = material.getScene();
  const internal = material as unknown as DirtyMaterial;
  const original = internal._markAllSubMeshesAsDirty;
  internal._markAllSubMeshesAsDirty = function(callback) {
    // MultiMaterial children and the default material can have indirect users
    // that aren't in the direct-binding index. Preserve the native scan there.
    if (!this.meshMap || (scene._hasDefaultMaterial && scene.defaultMaterial === this)
      || scene.multiMaterials.some(multi => multi.subMaterials.includes(this))) {
      original.call(this, callback);
      return;
    }
    if (scene.blockMaterialDirtyMechanism || (this as unknown as DirtyMaterial)._blockDirtyMechanism) return;
    for (const key in this.meshMap) {
      const mesh = this.meshMap[key];
      if (!mesh?.subMeshes) continue;
      for (const subMesh of mesh.subMeshes) {
        if (subMesh.getMaterial() !== this) continue;
        for (const draw of subMesh._drawWrappers) {
          if (draw?.defines && typeof draw.defines !== 'string' && typeof draw.defines.markAllAsDirty === 'function'
            && this._materialContext === draw.materialContext) callback(draw.defines);
        }
      }
    }
  };
  material.onDisposeObservable.addOnce(() => { internal._markAllSubMeshesAsDirty = original; });
}
