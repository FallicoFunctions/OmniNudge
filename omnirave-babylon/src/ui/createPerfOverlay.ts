export function createPerfOverlay(host: HTMLElement) {
  const panel = document.createElement('div');
  panel.dataset.testid = 'perf-overlay';
  panel.className = 'perf-overlay';
  panel.textContent = 'FPS: -- | Frame: -- ms';
  host.appendChild(panel);
  return panel;
}
