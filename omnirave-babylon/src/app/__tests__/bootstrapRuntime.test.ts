import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRuntimeMock } = vi.hoisted(() => ({
  createRuntimeMock: vi.fn(async (host: HTMLElement) => {
    const canvas = document.createElement('canvas');
    canvas.dataset.testid = 'babylon-render-canvas';
    host.appendChild(canvas);

    const hud = document.createElement('aside');
    hud.dataset.testid = 'review-hud';
    host.appendChild(hud);
  }),
}));

vi.mock('../createRuntime', () => ({
  createRuntime: createRuntimeMock,
}));

import { bootstrapRuntime } from '../bootstrapRuntime';

describe('bootstrapRuntime', () => {
  beforeEach(() => {
    createRuntimeMock.mockClear();
  });

  it('creates a render canvas and review HUD once', async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await bootstrapRuntime();
    await bootstrapRuntime();

    expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-hud"]')).not.toBeNull();
    expect(createRuntimeMock).toHaveBeenCalledTimes(1);
  });
});
