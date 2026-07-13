import type { AvatarColorway } from '../player/avatarColorways';
import type { ReviewCheckpoint } from '../scene/reviewRouteData';

export interface CreateReviewHudOptions {
  avatarColorways?: readonly AvatarColorway[];
  checkpoints?: readonly ReviewCheckpoint[];
  onSelectAvatarColorway?: (colorway: AvatarColorway) => void;
  onSelectCheckpoint?: (checkpoint: ReviewCheckpoint) => void;
  selectedAvatarColorwayId?: string;
}

export function createReviewHud(host: HTMLElement, options: CreateReviewHudOptions = {}) {
  const hud = document.createElement('aside');
  hud.dataset.testid = 'review-hud';
  hud.className = 'review-hud';
  hud.innerHTML = `
    <p class="review-hud__eyebrow">Main Stage Playtest</p>
    <h1 class="review-hud__title">OmniRave Babylon</h1>
    <p class="review-hud__copy">Avatar movement, venue collision, lighting, and performance instrumentation active.</p>
    <output class="review-hud__objective" data-review-objective>Objective: reach the first checkpoint</output>
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

  if (options.avatarColorways?.length) {
    const avatarPicker = document.createElement('div');
    avatarPicker.className = 'review-hud__avatar-picker';
    avatarPicker.setAttribute('aria-label', 'Avatar colorway');

    for (const colorway of options.avatarColorways) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'review-hud__avatar-swatch';
      button.dataset.avatarColorway = colorway.id;
      button.style.setProperty('--avatar-primary', colorway.primaryHex);
      button.style.setProperty('--avatar-accent', colorway.accentHex);
      button.setAttribute('aria-label', colorway.label);
      button.title = colorway.label;
      button.ariaPressed = String(colorway.id === options.selectedAvatarColorwayId);
      button.addEventListener('click', () => options.onSelectAvatarColorway?.(colorway));
      avatarPicker.appendChild(button);
    }

    hud.appendChild(avatarPicker);
  }

  host.appendChild(hud);
  return hud;
}

export function formatCheckpointLabel(id: string) {
  return id
    .split('_')
    .map((part) => (part.toUpperCase() === 'VIP' ? 'VIP' : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}
