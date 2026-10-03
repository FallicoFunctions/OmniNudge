import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSoundHint } from '../createSoundHint';

describe('createSoundHint', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('renders a status note into the host', () => {
    const host = document.createElement('div');
    const { element } = createSoundHint(host);

    expect(host.querySelector('[data-testid="sound-hint"]')).toBe(element);
    expect(element.tagName).toBe('BUTTON');
    expect(element.textContent).toBe('Click or press any key for sound');
  });

  it('provides a tappable mobile prompt and removes its activation handler on disposal', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const activate = vi.fn();
    const hint = createSoundHint(document.createElement('div'), { onActivate: activate });
    expect(hint.element.textContent).toBe('Tap for sound');
    hint.element.click();
    expect(activate).toHaveBeenCalledTimes(1);
    hint.dispose();
    hint.element.click();
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the note from the host', () => {
    const host = document.createElement('div');
    const { dispose } = createSoundHint(host);

    dispose();
    expect(host.querySelector('[data-testid="sound-hint"]')).toBeNull();
  });
});
