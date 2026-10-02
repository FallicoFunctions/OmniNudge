import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDisplayRefreshMonitor, estimateDisplayRefreshRate } from '../displayRefreshRate';

afterEach(() => vi.restoreAllMocks());

describe('display refresh detection', () => {
  it.each([24, 30, 40, 48, 50, 60, 75, 90, 120, 144, 165, 240, 360])('recognizes %s Hz despite jitter and missed frames', hz => {
    const intervals = Array.from({ length: 48 }, (_, i) => (1000 / hz) * (i % 5 === 0 ? 2 : 1 + (i % 3 - 1) * 0.01));
    expect(estimateDisplayRefreshRate(intervals)).toBe(hz);
  });

  it('uses the cadence Safari exposes in power-saving mode, then discovers a faster cadence', () => {
    let callback: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { callback = fn; return 1; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const monitor = createDisplayRefreshMonitor();
    let timestamp = 0;
    for (let i = 0; i < 145; i++) { timestamp += 1000 / 30; callback!(timestamp); }
    expect(monitor.targetFps).toBe(30);
    for (let i = 0; i < 144; i++) { timestamp += 1000 / 120; callback!(timestamp); }
    expect(monitor.targetFps).toBe(120);
    monitor.dispose();
  });

  it('does not mistake a short outlier or an incomplete sample for high refresh', () => {
    expect(estimateDisplayRefreshRate([4, ...Array(47).fill(1000 / 60)])).toBe(60);
    expect(estimateDisplayRefreshRate(Array(10).fill(1000 / 144))).toBeUndefined();
    expect(estimateDisplayRefreshRate(Array(48).fill(Number.NaN))).toBeUndefined();
    expect(estimateDisplayRefreshRate(Array(48).fill(1000))).toBeUndefined();
  });

  it('does not permanently chase an invented 65 FPS target from 60 Hz callback jitter', () => {
    const jitter = [15.3, 15.4, 16.2, 16.6, 16.8, 17.2, 17.5, 18.3];
    expect(estimateDisplayRefreshRate(Array.from({ length: 48 }, (_, i) => jitter[i % jitter.length]))).toBe(60);
  });

  it('retains a repeatable uncommon refresh rate rather than forcing it to 60 or 120', () => {
    expect(estimateDisplayRefreshRate(Array(48).fill(1000 / 80))).toBe(80);
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
    frames(145, 144);
    expect(monitor.targetFps).toBe(144);
    frames(48, 60);
    expect(monitor.targetFps).toBe(144);
    frames(48, 240);
    expect(monitor.targetFps).toBe(144);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    frames(50, 240);
    expect(monitor.targetFps).toBe(144);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    frames(145, 240);
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
