export function createDebugPanel(host: HTMLElement) {
  const panel = document.createElement('section');
  panel.dataset.testid = 'debug-panel';
  panel.className = 'debug-panel';
  // Note: this panel previously rendered collision/routes/lighting toggle
  // checkboxes that nothing read or wired up (verified: no listener attached
  // to data-debug-toggle anywhere, and wiring them to real scene toggles
  // would mean reaching into scene files this module doesn't own). Removed
  // as dead markup rather than shipping non-functional UI.
  panel.innerHTML = `
    <output data-debug-readout="mesh-pick">Pick: --</output>
    <output data-debug-readout="player-state">Player: --</output>
  `;
  host.appendChild(panel);
  return panel;
}
