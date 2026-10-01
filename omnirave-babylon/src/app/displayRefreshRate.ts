const SAMPLE_COUNT = 48;
const COMMON_REFRESH_RATES = [60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360, 480];

// Use the faster, repeatable cadence, so missed frames do not turn a 144 Hz
// display into a 72 Hz target. A lone short interval cannot raise the target.
export function estimateDisplayRefreshRate(intervals: readonly number[]): number | undefined {
  const sorted = intervals.filter(ms => Number.isFinite(ms) && ms >= 1 && ms < 100).sort((a, b) => a - b);
  if (sorted.length < 24) return undefined;
  const interval = sorted[Math.floor(sorted.length * 0.2)];
  if (sorted.filter(ms => Math.abs(ms - interval) <= interval * 0.1).length < 8) return undefined;
  const measured = 1000 / interval;
  const common = COMMON_REFRESH_RATES.find(hz => Math.abs(hz - measured) / hz < 0.03);
  return common ?? Math.round(measured);
}

export interface DisplayRefreshMonitor {
  readonly targetFps: number;
  dispose(): void;
}

// Start during boot, before the expensive venue renders. Keep the highest
// observed cadence: GPU load and background throttling must not lower the
// target that Auto graphics is trying to reach. This does not pace rendering.
export function createDisplayRefreshMonitor(): DisplayRefreshMonitor {
  let targetFps = 60;
  let previousTimestamp: number | undefined;
  let intervals: number[] = [];
  let disposed = false;
  const resetSamples = () => { previousTimestamp = undefined; intervals = []; };
  const sample = (timestamp: number) => {
    if (disposed) return;
    if (document.visibilityState === 'hidden') {
      resetSamples();
    } else {
      if (previousTimestamp !== undefined) intervals.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      if (intervals.length >= SAMPLE_COUNT) {
        targetFps = Math.max(targetFps, estimateDisplayRefreshRate(intervals) ?? 60);
        intervals = [];
      }
    }
    frame = window.requestAnimationFrame(sample);
  };
  let frame = window.requestAnimationFrame(sample);
  document.addEventListener('visibilitychange', resetSamples);
  return {
    get targetFps() { return targetFps; },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', resetSamples);
    },
  };
}
