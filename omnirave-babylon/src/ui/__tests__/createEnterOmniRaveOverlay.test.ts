import { describe, expect, it, vi } from 'vitest';
import { createEnterOmniRaveOverlay } from '../createEnterOmniRaveOverlay';

describe('createEnterOmniRaveOverlay', () => {
  it('renders into the host with the Enter OmniRave copy', () => {
    const host = document.createElement('div');
    const { element } = createEnterOmniRaveOverlay(host, () => {});

    expect(host.querySelector('[data-testid="enter-omnirave-overlay"]')).toBe(element);
    expect(host.querySelector('[data-testid="enter-omnirave-button"]')).not.toBeNull();
    expect(element.textContent).toContain('Enter OmniRave');
  });

  it('fires onEnter when the button is tapped', () => {
    const host = document.createElement('div');
    const onEnter = vi.fn();
    createEnterOmniRaveOverlay(host, onEnter);

    host.querySelector<HTMLButtonElement>('[data-testid="enter-omnirave-button"]')?.click();

    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the overlay from the host', () => {
    const host = document.createElement('div');
    const { dispose } = createEnterOmniRaveOverlay(host, () => {});

    expect(host.querySelector('[data-testid="enter-omnirave-overlay"]')).not.toBeNull();
    dispose();
    expect(host.querySelector('[data-testid="enter-omnirave-overlay"]')).toBeNull();
  });
});
