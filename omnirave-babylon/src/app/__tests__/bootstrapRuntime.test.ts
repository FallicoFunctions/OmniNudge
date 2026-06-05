import { describe, expect, it } from 'vitest';
import { bootstrapRuntime } from '../bootstrapRuntime';

describe('bootstrapRuntime', () => {
  it('creates a render canvas and review HUD', async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await bootstrapRuntime();

    expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-hud"]')).not.toBeNull();
  });
});
