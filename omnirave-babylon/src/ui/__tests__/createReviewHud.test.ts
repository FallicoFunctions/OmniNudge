import { describe, expect, it, vi } from 'vitest';

import { USER_AVATAR_COLORWAYS } from '../../player/avatarColorways';
import { createReviewHud } from '../createReviewHud';

describe('createReviewHud', () => {
  it('renders Main Stage route checkpoint buttons and dispatches selection', () => {
    const host = document.createElement('div');
    const onSelectCheckpoint = vi.fn();
    const onSelectAvatarColorway = vi.fn();

    createReviewHud(host, {
      avatarColorways: USER_AVATAR_COLORWAYS,
      checkpoints: [
        {
          id: 'spawn_reveal',
          x: 0,
          y: 1.7,
          z: -48,
          camera: {
            alpha: -Math.PI / 2,
            beta: 1.08,
            radius: 60,
            focusOffset: { x: 0, y: 8, z: 44 },
          },
        },
        {
          id: 'vip_terrace',
          x: 22,
          y: 8.5,
          z: 18,
          camera: {
            alpha: -2.8,
            beta: 1,
            radius: 38,
            focusOffset: { x: -10, y: 3, z: -14 },
          },
        },
      ],
      onSelectAvatarColorway,
      onSelectCheckpoint,
      selectedAvatarColorwayId: 'aurora',
    });

    const spawnButton = host.querySelector<HTMLButtonElement>(
      '[data-review-checkpoint="spawn_reveal"]',
    );
    const vipButton = host.querySelector<HTMLButtonElement>('[data-review-checkpoint="vip_terrace"]');

    expect(spawnButton).not.toBeNull();
    expect(vipButton).not.toBeNull();
    expect(spawnButton!.textContent).toContain('Spawn Reveal');
    expect(vipButton!.textContent).toContain('VIP Terrace');
    expect(host.querySelector('[data-review-objective]')?.textContent).toContain(
      'Objective: reach the first checkpoint',
    );
    const auroraButton = host.querySelector<HTMLButtonElement>('[data-avatar-colorway="aurora"]');
    const pulseButton = host.querySelector<HTMLButtonElement>('[data-avatar-colorway="pulse"]');
    expect(auroraButton?.ariaPressed).toBe('true');
    expect(pulseButton?.ariaLabel).toBe('Pulse');

    vipButton?.click();
    pulseButton?.click();

    expect(onSelectCheckpoint).toHaveBeenCalledWith({
      id: 'vip_terrace',
      x: 22,
      y: 8.5,
      z: 18,
      camera: {
        alpha: -2.8,
        beta: 1,
        radius: 38,
        focusOffset: { x: -10, y: 3, z: -14 },
      },
    });
    expect(onSelectAvatarColorway).toHaveBeenCalledWith(USER_AVATAR_COLORWAYS[2]);
  });

  it('renders a hidden completion banner and dispatches restart on click', () => {
    const host = document.createElement('div');
    const onRestartRoute = vi.fn();

    createReviewHud(host, { onRestartRoute });

    const banner = host.querySelector<HTMLElement>('[data-review-complete]');
    const restartButton = host.querySelector<HTMLButtonElement>('[data-review-restart]');

    expect(banner).not.toBeNull();
    expect(banner!.hidden).toBe(true);
    expect(restartButton).not.toBeNull();
    expect(restartButton!.textContent).toContain('Play Again');

    restartButton?.click();

    expect(onRestartRoute).toHaveBeenCalledTimes(1);
  });
});
