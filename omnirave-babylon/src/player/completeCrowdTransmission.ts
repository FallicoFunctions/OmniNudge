import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';

interface Settings { width: number; height: number; samples: number }
interface SharedTarget { original: Settings; owners: Map<symbol, boolean> }
// Several crowds may share the loader's scene background. A close view wins
// over distant requests, and the last owner restores the original settings.
const sharedTargets = new WeakMap<RenderTargetTexture, SharedTarget>();

function apply(target: RenderTargetTexture, state: SharedTarget) {
  if (!target.getInternalTexture()) return;
  const full = state.owners.size === 0 || [...state.owners.values()].some(Boolean);
  const scale = full ? 1 : Math.min(1, 512 / Math.max(state.original.width, state.original.height));
  const width = Math.max(1, Math.round(state.original.width * scale));
  const height = Math.max(1, Math.round(state.original.height * scale));
  const size = target.getSize();
  if (size.width !== width || size.height !== height) target.resize({ width, height });
  const samples = full ? state.original.samples : 1;
  if (target.samples !== samples) target.samples = samples;
}

/** Adjust only the background render, retaining authored garment optics and mipmaps. */
export function createCompleteCrowdTransmission() {
  const owner = Symbol('complete-crowd-transmission');
  const materials = new Set<PBRMaterial>();
  const targets = new Set<RenderTargetTexture>();
  let disposed = false;

  function release(target: RenderTargetTexture) {
    const state = sharedTargets.get(target);
    if (!state) return;
    state.owners.delete(owner);
    apply(target, state);
    if (!state.owners.size) sharedTargets.delete(target);
  }

  return {
    watch(material: PBRMaterial) {
      if (!disposed && material.metadata?.gltf?.extras?.launchTransmission) materials.add(material);
    },
    update(fullDetail: boolean) {
      if (disposed) return;
      // The glTF loader assigns this texture asynchronously, after cloning.
      // Read the public material binding each frame, including replacements.
      const current = new Set<RenderTargetTexture>();
      for (const material of materials) {
        const target = material.subSurface.refractionTexture;
        if (target instanceof RenderTargetTexture && target.getInternalTexture()) current.add(target);
      }
      for (const target of targets) if (!current.has(target)) { release(target); targets.delete(target); }
      for (const target of current) {
        let state = sharedTargets.get(target);
        if (!state) {
          state = { original: { ...target.getSize(), samples: target.samples }, owners: new Map() };
          sharedTargets.set(target, state);
        }
        targets.add(target);
        state.owners.set(owner, fullDetail);
        apply(target, state);
      }
    },
    stats() {
      return [...targets].map(target => ({ ...target.getSize(), samples: target.samples }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const target of targets) release(target);
      targets.clear(); materials.clear();
    },
  };
}
