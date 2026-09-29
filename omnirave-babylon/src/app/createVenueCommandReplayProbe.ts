import type { Scene } from '@babylonjs/core/scene.js';
import type { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
import { SnapshotRenderingHelper } from '@babylonjs/core/Misc/snapshotRenderingHelper.js';

/** Local diagnostic only: fast replay is not yet a complete dynamic venue renderer. */
export function createVenueCommandReplayProbe(host: HTMLElement, scene: Scene, mode: string) {
  const engine = scene.getEngine() as WebGPUEngine;
  if (!engine.isWebGPU || !['standard', 'fast'].includes(mode)) return;
  const button = document.createElement('button');
  button.textContent = `Enable ${mode} command replay probe`;
  button.style.cssText = 'position:fixed;right:20px;top:190px;z-index:90;padding:10px;color:white;background:#422b55';
  host.append(button);
  let helper: SnapshotRenderingHelper | undefined;
  button.onclick = () => {
    if (engine.snapshotRendering) {
      helper?.disableSnapshotRendering();
      engine.snapshotRendering = false;
      button.textContent = `Enable ${mode} command replay probe`;
    } else {
      if (mode === 'fast') {
        helper ??= new SnapshotRenderingHelper(scene, { morphTargetsNumMaxInfluences: 64 });
        helper.enableSnapshotRendering();
      } else {
        engine.snapshotRenderingMode = 0;
        engine.snapshotRendering = true;
      }
      button.textContent = 'Disable command replay probe';
    }
  };
  scene.onDisposeObservable.addOnce(() => { helper?.dispose(); engine.snapshotRendering = false; button.remove(); });
}
