import { describe, expect, it, vi } from 'vitest';

import { createReviewHud } from '../createReviewHud';

describe('createReviewHud', () => {
  it('renders Main Stage route checkpoint buttons and dispatches selection', () => {
    const host = document.createElement('div');
    const onSelectCheckpoint = vi.fn();

    createReviewHud(host, {
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
      onSelectCheckpoint,
    });

    const spawnButton = host.querySelector<HTMLButtonElement>(
      '[data-review-checkpoint="spawn_reveal"]',
    );
    const vipButton = host.querySelector<HTMLButtonElement>('[data-review-checkpoint="vip_terrace"]');

    expect(spawnButton).not.toBeNull();
    expect(vipButton).not.toBeNull();
    expect(spawnButton!.textContent).toContain('Spawn Reveal');
    expect(vipButton!.textContent).toContain('VIP Terrace');

    vipButton?.click();

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
  });
});
