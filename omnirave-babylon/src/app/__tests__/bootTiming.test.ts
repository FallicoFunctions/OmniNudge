import { expect, it, vi } from 'vitest';

it('sends an unfinished timing report on refresh and does not report it twice', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const listeners = vi.spyOn(window, 'addEventListener');
  try {
    const { markBootPhase } = await import('../bootTiming');
    markBootPhase('runtime');
    markBootPhase('visible');
    expect(fetch).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pagehide'));
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0][1];
    expect(request.keepalive).toBe(true);
    expect(JSON.parse(request.body)).toEqual({
      event: 'omnirave_boot',
      properties: expect.objectContaining({ runtime: expect.any(Number), visible: expect.any(Number) }),
    });

    markBootPhase('audible');
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    for (const [name, callback] of listeners.mock.calls) {
      if (name === 'pagehide') window.removeEventListener(name, callback);
    }
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
