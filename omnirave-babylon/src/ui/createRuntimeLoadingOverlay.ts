export function createRuntimeLoadingOverlay(host: HTMLElement) {
  const overlay = document.createElement('div');
  overlay.dataset.testid = 'runtime-loading-overlay';
  overlay.className = 'runtime-loading-overlay';
  overlay.innerHTML = `
    <p class="runtime-loading-overlay__eyebrow">OmniRave</p>
    <h1 class="runtime-loading-overlay__title">Loading Main Stage</h1>
    <p class="runtime-loading-overlay__copy">Getting the venue and your avatar ready.</p>
  `;

  host.appendChild(overlay);
  return overlay;
}
