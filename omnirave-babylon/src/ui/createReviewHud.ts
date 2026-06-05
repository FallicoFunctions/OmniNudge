export function createReviewHud(host: HTMLElement) {
  const hud = document.createElement('aside');
  hud.dataset.testid = 'review-hud';
  hud.className = 'review-hud';
  hud.innerHTML = `
    <p class="review-hud__eyebrow">Main Stage Review</p>
    <h1 class="review-hud__title">OmniRave Babylon Cleanroom</h1>
    <p class="review-hud__copy">Review route, lighting, and performance instrumentation active.</p>
  `;
  host.appendChild(hud);
  return hud;
}
