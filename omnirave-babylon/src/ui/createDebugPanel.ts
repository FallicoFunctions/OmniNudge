export function createDebugPanel(host: HTMLElement) {
  const panel = document.createElement('section');
  panel.dataset.testid = 'debug-panel';
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <label><input type="checkbox" data-debug-toggle="collision" /> Collision</label>
    <label><input type="checkbox" data-debug-toggle="routes" /> Review Route</label>
    <label><input type="checkbox" data-debug-toggle="lighting" /> Lighting</label>
  `;
  host.appendChild(panel);
  return panel;
}
