export function createPerfOverlay(host: HTMLElement) {
  const panel = document.createElement('div');
  panel.dataset.testid = 'perf-overlay';
  panel.className = 'perf-overlay';
  panel.textContent = 'FPS: -- | Frame: -- ms | FX: -- | SH: -- | TX: --';
  host.appendChild(panel);
  return panel;
}

// Live render-health readout: frame rate plus the number of active camera
// post-processes, so a silently detached post chain is visible at a glance.
export function updatePerfOverlay(
  panel: HTMLElement,
  fps: number,
  frameMs: number,
  activePostProcesses: number,
  shadowCasters: number,
  readyTextures: number,
) {
  panel.textContent = `FPS: ${Math.round(fps)} | Frame: ${frameMs.toFixed(1)} ms | FX: ${activePostProcesses} | SH: ${shadowCasters} | TX: ${readyTextures}`;
}
