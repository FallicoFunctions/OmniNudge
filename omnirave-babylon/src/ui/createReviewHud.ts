import type { AvatarColorway } from '../player/avatarColorways';
import type { ReviewCheckpoint } from '../scene/reviewRouteData';

export type FireworksPreviewAct = 'countdown' | 'minute-1' | 'minute-2' | 'minute-3' | 'stop';

export interface CreateReviewHudOptions {
  avatarColorways?: readonly AvatarColorway[];
  checkpoints?: readonly ReviewCheckpoint[];
  onSelectAvatarColorway?: (colorway: AvatarColorway) => void;
  onSelectCheckpoint?: (checkpoint: ReviewCheckpoint) => void;
  onRestartRoute?: () => void;
  onPreviewFireworks?: (act: FireworksPreviewAct) => void;
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
    <div class="review-hud__complete" data-review-complete hidden>
      <p class="review-hud__complete-headline">ROUTE COMPLETE</p>
      <button type="button" class="review-hud__restart" data-review-restart>Play Again</button>
    </div>
  `;

  hud
    .querySelector<HTMLButtonElement>('[data-review-restart]')
    ?.addEventListener('click', () => options.onRestartRoute?.());

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

  if (options.onPreviewFireworks) {
    const preview = document.createElement('div');
    preview.className = 'review-hud__fireworks';
    preview.setAttribute('role', 'group');
    preview.setAttribute('aria-label', 'Fireworks preview');

    const acts: readonly [FireworksPreviewAct, string][] = [
      ['countdown', 'Countdown'],
      ['minute-1', 'Crown'],
      ['minute-2', 'Orbits'],
      ['minute-3', 'Finale'],
      ['stop', 'Stop'],
    ];
    const buttons: HTMLButtonElement[] = [];
    for (const [act, label] of acts) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'review-hud__checkpoint';
      button.dataset.fireworksPreview = act;
      button.textContent = label;
      button.ariaPressed = 'false';
      button.addEventListener('click', () => {
        for (const peer of buttons) {
          peer.ariaPressed = String(peer === button && act !== 'stop');
        }
        options.onPreviewFireworks?.(act);
      });
      buttons.push(button);
      preview.appendChild(button);
    }
    hud.appendChild(preview);
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
