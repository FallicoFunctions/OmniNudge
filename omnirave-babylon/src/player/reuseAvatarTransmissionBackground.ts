import { CopyTextureToTexture } from '@babylonjs/core/Misc/copyTextureToTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import type { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/core/ShadersWGSL/copyTextureToTexture.fragment.js';

const installed = new WeakSet<RenderTargetTexture>();

/** Capture this frame's HDR scene before transmitting shells, with a native fallback. */
export function reuseAvatarTransmissionBackground(scene: Scene, target: RenderTargetTexture, meshes: readonly AbstractMesh[]): void {
  if (!scene.getEngine().isWebGPU || !scene.metadata?.reuseTransmissionExperiment) return;
  for (const mesh of meshes) {
    if (mesh.material instanceof PBRMaterial && mesh.material.subSurface.isRefractionEnabled) mesh.renderingGroupId = 3;
  }
  if (installed.has(target)) return;
  installed.add(target);
  const engine = scene.getEngine();
  const copy = new CopyTextureToTexture(engine);
  // A full-screen copy has no geometry edges to multisample.
  target.samples = 1;
  const shouldRender = target._shouldRender;
  let copiedFrame = -2;
  // Render normally until the first successful copy. A lost/recreated HDR
  // target or unready copy shader also returns to Babylon's render path.
  const hdrTarget = () => scene.activeCamera?._postProcesses.find(post => post)?.inputTexture;
  target._shouldRender = function() {
    return copy.isReady() && hdrTarget()?.texture && copiedFrame >= scene.getFrameId() - 1
      ? false : shouldRender.call(this);
  };
  scene.setRenderingAutoClearDepthStencil(3, false);
  const observer = scene.onBeforeRenderingGroupObservable.add(info => {
    if (info.renderingGroupId !== 3 || !copy.isReady()) return;
    const source = engine._currentRenderTarget;
    if (!source?.texture || !target.renderTarget || source !== hdrTarget() || source === target.renderTarget) return;
    const viewport = engine.currentViewport;
    try {
      if (copy.copy(source.texture, target.renderTarget)) copiedFrame = scene.getFrameId();
    } finally {
      engine.bindFramebuffer(source);
      if (viewport) engine.setViewport(viewport);
      scene.resetCachedMaterial();
    }
  });
  scene.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderingGroupObservable.remove(observer);
    target._shouldRender = shouldRender;
    copy.dispose();
  });
}
