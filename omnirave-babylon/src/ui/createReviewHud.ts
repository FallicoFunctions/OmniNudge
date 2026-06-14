export interface ReviewCheckpoint {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface CreateReviewHudOptions {
  checkpoints?: ReviewCheckpoint[];
  onSelectCheckpoint?: (checkpoint: ReviewCheckpoint) => void;
}

export function createReviewHud(host: HTMLElement, options: CreateReviewHudOptions = {}) {
  const hud = document.createElement('aside');
  hud.dataset.testid = 'review-hud';
  hud.className = 'review-hud';
  hud.innerHTML = `
    <p class="review-hud__eyebrow">Main Stage Review</p>
    <h1 class="review-hud__title">OmniRave Babylon Cleanroom</h1>
    <p class="review-hud__copy">Review route, lighting, and performance instrumentation active.</p>
  `;

  if (options.checkpoints?.length) {
    const route = document.createElement('nav');
    route.className = 'review-hud__route';
    route.setAttribute('aria-label', 'Main Stage review checkpoints');

    for (const checkpoint of options.checkpoints) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'review-hud__checkpoint';
      button.dataset.reviewCheckpoint = checkpoint.id;
      button.textContent = formatCheckpointLabel(checkpoint.id);
      button.addEventListener('click', () => options.onSelectCheckpoint?.(checkpoint));
      route.appendChild(button);
    }

    hud.appendChild(route);
  }

  host.appendChild(hud);
  return hud;
}

function formatCheckpointLabel(id: string) {
  return id
    .split('_')
    .map((part) => (part.toUpperCase() === 'VIP' ? 'VIP' : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}
