import { describe, expect, it } from 'vitest';
import { createSoundHint } from '../createSoundHint';

describe('createSoundHint', () => {
  it('renders a status note into the host', () => {
    const host = document.createElement('div');
    const { element } = createSoundHint(host);

    expect(host.querySelector('[data-testid="sound-hint"]')).toBe(element);
    expect(element.getAttribute('role')).toBe('status');
    expect(element.textContent).toBe('Click or press any key for sound');
  });

  it('dispose removes the note from the host', () => {
    const host = document.createElement('div');
    const { dispose } = createSoundHint(host);

    dispose();
    expect(host.querySelector('[data-testid="sound-hint"]')).toBeNull();
  });
});
