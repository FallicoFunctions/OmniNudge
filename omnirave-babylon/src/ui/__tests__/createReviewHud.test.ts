import { describe, expect, it, vi } from 'vitest';

import { createReviewHud } from '../createReviewHud';

describe('createReviewHud', () => {
  it('renders Main Stage route checkpoint buttons and dispatches selection', () => {
    const host = document.createElement('div');
    const onSelectCheckpoint = vi.fn();

    createReviewHud(host, {
      checkpoints: [
        { id: 'spawn_reveal', x: 0, y: 1.7, z: -48 },
        { id: 'vip_terrace', x: 22, y: 8.5, z: 18 },
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

    expect(onSelectCheckpoint).toHaveBeenCalledWith({ id: 'vip_terrace', x: 22, y: 8.5, z: 18 });
  });
});
