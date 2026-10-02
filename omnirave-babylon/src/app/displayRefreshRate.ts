const SAMPLE_COUNT = 48;
const COMMON_REFRESH_RATES = [24, 30, 40, 48, 50, 60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360, 480];

// Use the faster, repeatable cadence, so missed frames do not turn a 144 Hz
// display into a 72 Hz target. A lone short interval cannot raise the target.
export function estimateDisplayRefreshRate(intervals: readonly number[]): number | undefined {
  const sorted = intervals.filter(ms => Number.isFinite(ms) && ms >= 1 && ms < 100).sort((a, b) => a - b);
  if (sorted.length < 24) return undefined;
  const fastInterval = sorted[Math.floor(sorted.length * 0.2)];
  const cadence = sorted.filter(ms => Math.abs(ms - fastInterval) <= fastInterval * 0.1);
  if (cadence.length < Math.max(8, Math.ceil(sorted.length / 3))) return undefined;
  // The fast percentile identifies the cadence, not its rate. Its short
  // jittered intervals otherwise invent targets such as 65 Hz on a 60 Hz
  // phone; retaining that maximum would make Auto blur indefinitely.
  const interval = cadence[Math.floor(cadence.length / 2)];
  const measured = 1000 / interval;
  const common = COMMON_REFRESH_RATES.reduce((nearest, hz) =>
    Math.abs(hz - measured) < Math.abs(nearest - measured) ? hz : nearest);
  return Math.abs(common - measured) / common < 0.03 ? common : Math.round(measured);
}

export interface DisplayRefreshMonitor {
  readonly targetFps: number;
  dispose(): void;
}

// Start during boot, before the expensive venue renders. Keep the highest
// observed cadence: GPU load and background throttling must not lower the
// target that Auto graphics is trying to reach. This does not pace rendering.
export function createDisplayRefreshMonitor(): DisplayRefreshMonitor {
  let measuredTarget: number | undefined;
  let candidate: number | undefined;
  let candidateWindows = 0;
  let previousTimestamp: number | undefined;
  let intervals: number[] = [];
  let disposed = false;
  const resetSamples = () => { previousTimestamp = undefined; intervals = []; candidate = undefined; candidateWindows = 0; };
  const sample = (timestamp: number) => {
    if (disposed) return;
    if (document.visibilityState === 'hidden') {
      resetSamples();
    } else {
      if (previousTimestamp !== undefined) intervals.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      if (intervals.length >= SAMPLE_COUNT) {
        const estimate = estimateDisplayRefreshRate(intervals);
        // The initial idle sample also respects a browser's power-saving
        // cadence. Once rendering starts, slow frames cannot lower the goal.
        if (estimate !== undefined && estimate === candidate) candidateWindows++;
        else { candidate = estimate; candidateWindows = estimate === undefined ? 0 : 1; }
        // Require repeatable windows: one unusually fast batch during boot
        // or resizing must not permanently raise the graphics target.
        if (candidate !== undefined && candidateWindows >= 3) {
          measuredTarget = Math.max(measuredTarget ?? candidate, candidate);
        }
        intervals = [];
      }
    }
    frame = window.requestAnimationFrame(sample);
  };
  let frame = window.requestAnimationFrame(sample);
  document.addEventListener('visibilitychange', resetSamples);
  return {
    get targetFps() { return measuredTarget ?? 60; },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', resetSamples);
    },
  };
}
