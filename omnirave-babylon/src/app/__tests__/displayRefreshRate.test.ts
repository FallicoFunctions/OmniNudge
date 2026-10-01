import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDisplayRefreshMonitor, estimateDisplayRefreshRate } from '../displayRefreshRate';

afterEach(() => vi.restoreAllMocks());

describe('display refresh detection', () => {
  it.each([60, 75, 120, 144, 165, 240, 360])('recognizes %s Hz despite jitter and missed frames', hz => {
    const intervals = Array.from({ length: 48 }, (_, i) => (1000 / hz) * (i % 5 === 0 ? 2 : 1 + (i % 3 - 1) * 0.01));
    expect(estimateDisplayRefreshRate(intervals)).toBe(hz);
  });

  it('does not mistake a short outlier or an incomplete sample for high refresh', () => {
    expect(estimateDisplayRefreshRate([4, ...Array(47).fill(1000 / 60)])).toBe(60);
    expect(estimateDisplayRefreshRate(Array(10).fill(1000 / 144))).toBeUndefined();
    expect(estimateDisplayRefreshRate(Array(48).fill(Number.NaN))).toBeUndefined();
    expect(estimateDisplayRefreshRate(Array(48).fill(1000))).toBeUndefined();
  });

  it('keeps a fast display target during GPU slowdowns, ignores hidden frames, and cancels on disposal', () => {
    let callback: FrameRequestCallback | undefined;
    let timestamp = 0;
    let frameId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { callback = fn; return ++frameId; });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const monitor = createDisplayRefreshMonitor();
    const frames = (count: number, hz: number) => {
      for (let i = 0; i < count; i++) { timestamp += 1000 / hz; callback!(timestamp); }
    };
    expect(monitor.targetFps).toBe(60);
    frames(49, 144);
    expect(monitor.targetFps).toBe(144);
    frames(48, 60);
    expect(monitor.targetFps).toBe(144);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    frames(50, 240);
    expect(monitor.targetFps).toBe(144);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    frames(49, 240);
    expect(monitor.targetFps).toBe(240);
    monitor.dispose();
    expect(cancel).toHaveBeenCalledWith(frameId);
    const lastFrameId = frameId;
    callback!(timestamp + 4);
    expect(frameId).toBe(lastFrameId);
    monitor.dispose();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
