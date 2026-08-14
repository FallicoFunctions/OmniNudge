import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HUD_NOTICE_DURATION_MS, createHudNotice } from '../createHudNotice';

describe('createHudNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts hidden, shows a message, and auto-dismisses', () => {
    const host = document.createElement('div');
    const notice = createHudNotice(host);
    const element = host.querySelector<HTMLElement>('[data-testid="hud-notice"]')!;

    expect(element.hidden).toBe(true);

    notice.show('Accounts arrive in a later update');
    expect(element.hidden).toBe(false);
    expect(element.textContent).toBe('Accounts arrive in a later update');

    vi.advanceTimersByTime(HUD_NOTICE_DURATION_MS);
    expect(element.hidden).toBe(true);
  });

  it('restarts the dismiss timer on a repeat show', () => {
    const host = document.createElement('div');
    const notice = createHudNotice(host);
    const element = host.querySelector<HTMLElement>('[data-testid="hud-notice"]')!;

    notice.show('first');
    vi.advanceTimersByTime(HUD_NOTICE_DURATION_MS - 10);
    notice.show('second');
    vi.advanceTimersByTime(HUD_NOTICE_DURATION_MS - 10);

    expect(element.hidden).toBe(false);
    expect(element.textContent).toBe('second');
  });

  it('dispose() removes the element and clears the pending timer', () => {
    const host = document.createElement('div');
    const notice = createHudNotice(host);

    notice.show('later');
    notice.dispose();
    vi.advanceTimersByTime(HUD_NOTICE_DURATION_MS * 2);

    expect(host.querySelector('[data-testid="hud-notice"]')).toBe(null);
    expect(vi.getTimerCount()).toBe(0);
  });
});
