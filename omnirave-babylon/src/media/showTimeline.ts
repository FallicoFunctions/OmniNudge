// The light show's state as a function of the track position alone.
//
// Each light effect used to build its state from the moment the page loaded:
// a palette that jumped on the kicks this player had heard, laser patterns
// that changed every N kicks counted since joining, beam angles summed frame
// by frame. Two players at the same moment of the same track therefore saw
// different colours, patterns and angles (player-flagged 2026-09-30). This
// answers every one of those questions from the track's beat list and the
// track position, so a player who joins halfway through a track sees exactly
// what everyone else sees, at any frame rate.

// The scheduled events (the fireworks lead-in and show) inside the current
// track, in track seconds, as [start, end] pairs in order. Every player gets
// the same schedule from the server and places it on the same track start, so
// these are the same for everyone, including a show earlier in the track.
export interface ShowEventWindows {
  leadIns: Float64Array;
  actives: Float64Array;
  // The start of each active window.
  activeStarts: Float64Array;
}

/** Sum of `part(from, to)` over the parts of [0, seconds] inside the windows. */
export function windowSum(windows: ArrayLike<number>, seconds: number, part: (from: number, to: number) => number): number {
  let sum = 0;
  for (let i = 0; i + 1 < windows.length; i += 2) {
    const from = Math.max(0, windows[i]);
    const to = Math.min(seconds, windows[i + 1]);
    if (to > from) sum += part(from, to);
  }
  return sum;
}

/** True when `seconds` is inside one of the windows. */
export function inWindows(windows: ArrayLike<number>, seconds: number): boolean {
  for (let i = 0; i + 1 < windows.length; i += 2) if (seconds >= windows[i] && seconds < windows[i + 1]) return true;
  return false;
}

export interface ShowPhrase {
  // Phrases started since the track began (0 for the first).
  index: number;
  // Seconds since the current phrase started.
  since: number;
}

export interface ShowTimeline {
  // Integrals from the track start to `seconds`, in seconds: of the energy
  // (0..1), of the build-up ramp (buildUp^1.5), and of energy x ramp. A speed
  // that is linear in these gives its phase without any frame history.
  energyArea(seconds: number): number;
  rampArea(seconds: number): number;
  energyRampArea(seconds: number): number;
  // The phrase at `seconds`. A phrase ends at the kicksPerPhrase-th kick
  // after its start, but not before minSeconds; or at maxSeconds without
  // enough kicks (a break). Inside `windows` the longest hold is
  // windowMaxSeconds instead.
  phrase(seconds: number, kicksPerPhrase: number, minSeconds: number, maxSeconds: number, out: ShowPhrase,
    windows?: Float64Array, windowMaxSeconds?: number): ShowPhrase;
  // A palette clock that runs with the track and jumps to the next palette
  // crossfade on a kick, at most once per cooldownSeconds, and at each of
  // `forcedJumps` (the start of a show) whatever the cooldown.
  paletteClock(seconds: number, cycleSeconds: number, fadeSeconds: number, cooldownSeconds: number,
    forcedJumps?: Float64Array): number;
  // The kicks as a beat position: kicks so far plus the way to the next one.
  beatPosition(seconds: number): number;
}

// Index of the first entry later than `seconds`.
function firstAfter(times: ArrayLike<number>, seconds: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] <= seconds) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Build-up progress (0..1) at `seconds`, as the beat reader reports it. */
export function buildUpAt(buildStarts: ArrayLike<number>, buildDrops: ArrayLike<number>, seconds: number): number {
  const next = firstAfter(buildDrops, seconds);
  if (next >= buildDrops.length || seconds < buildStarts[next]) return 0;
  const length = buildDrops[next] - buildStarts[next];
  return length > 0 ? Math.min(1, (seconds - buildStarts[next]) / length) : 0;
}

export function createShowTimeline(
  kickSeconds: ArrayLike<number>,
  energy: ArrayLike<number>,
  stepSeconds: number,
  buildStarts: ArrayLike<number>,
  buildDrops: ArrayLike<number>,
): ShowTimeline {
  const steps = energy.length;
  // Per step (constant over the step): energy, ramp and their product; and
  // their running sums at each step start.
  const ramp = new Float64Array(steps);
  const energyStart = new Float64Array(steps + 1);
  const rampStart = new Float64Array(steps + 1);
  const bothStart = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i += 1) {
    const build = buildUpAt(buildStarts, buildDrops, i * stepSeconds);
    ramp[i] = build * Math.sqrt(build);
    energyStart[i + 1] = energyStart[i] + energy[i] * stepSeconds;
    rampStart[i + 1] = rampStart[i] + ramp[i] * stepSeconds;
    bothStart[i + 1] = bothStart[i] + energy[i] * ramp[i] * stepSeconds;
  }
  const area = (starts: Float64Array, value: (step: number) => number, seconds: number) => {
    if (!steps || seconds <= 0) return 0;
    const step = Math.min(steps - 1, Math.floor(seconds / stepSeconds));
    return starts[step] + value(step) * (seconds - step * stepSeconds);
  };
  // The end of the music, for the phrase boundaries of a final kickless tail.
  const end = Math.max(steps * stepSeconds, kickSeconds.length ? kickSeconds[kickSeconds.length - 1] : 0);

  // Cached per rule, and per event windows (a new array when the schedule
  // or the track start changes).
  const noWindows = new Float64Array();
  const cached = <T>(store: WeakMap<Float64Array, Map<string, T>>, windows: Float64Array, key: string, build: () => T): T => {
    let byKey = store.get(windows);
    if (!byKey) store.set(windows, (byKey = new Map()));
    let value = byKey.get(key);
    if (value === undefined) byKey.set(key, (value = build()));
    return value;
  };

  const phrases = new WeakMap<Float64Array, Map<string, Float64Array>>();
  function phraseStarts(kicksPerPhrase: number, minSeconds: number, maxSeconds: number,
    windows: Float64Array, windowMaxSeconds: number): Float64Array {
    return cached(phrases, windows, `${kicksPerPhrase}:${minSeconds}:${maxSeconds}:${windowMaxSeconds}`, () => {
      const list = [0];
      const longest = Math.max(maxSeconds, 1e-3);
      for (let start = 0; start <= end;) {
        // The longest hold: outside the windows at start + longest; inside a
        // window as soon as the phrase has held windowMaxSeconds there.
        let next = start + longest;
        if (inWindows(windows, next)) next = Number.POSITIVE_INFINITY;
        for (let i = 0; i + 1 < windows.length; i += 2) {
          const at = Math.max(start + Math.max(windowMaxSeconds, 1e-3), windows[i]);
          if (at < windows[i + 1]) next = Math.min(next, at);
        }
        const kick = firstAfter(kickSeconds, start) + kicksPerPhrase - 1;
        if (kick < kickSeconds.length) next = Math.min(next, Math.max(kickSeconds[kick], start + minSeconds));
        if (!Number.isFinite(next) || next <= start) next = start + longest;
        list.push(next);
        start = next;
      }
      return Float64Array.from(list);
    });
  }

  const palettes = new WeakMap<Float64Array, Map<string, { at: Float64Array; offset: Float64Array }>>();
  function paletteJumps(cycleSeconds: number, fadeSeconds: number, cooldownSeconds: number, forced: Float64Array) {
    return cached(palettes, forced, `${cycleSeconds}:${fadeSeconds}:${cooldownSeconds}`, () => {
      const at: number[] = [];
      const offsets: number[] = [];
      let offset = 0;
      let last = Number.NEGATIVE_INFINITY;
      const jump = (seconds: number) => {
        // Straight into the next crossfade, as the show always did.
        const clock = seconds + offset;
        offset += (Math.floor(clock / cycleSeconds) + 1) * cycleSeconds - fadeSeconds + 0.01 - clock;
        at.push(seconds);
        offsets.push(offset);
        last = seconds;
      };
      let f = 0;
      for (let i = 0; i <= kickSeconds.length; i += 1) {
        const kick = i < kickSeconds.length ? kickSeconds[i] : Number.POSITIVE_INFINITY;
        for (; f < forced.length && forced[f] <= kick; f += 1) if (forced[f] >= 0) jump(forced[f]);
        if (i < kickSeconds.length && kick - last >= cooldownSeconds) jump(kick);
      }
      return { at: Float64Array.from(at), offset: Float64Array.from(offsets) };
    });
  }

  return {
    energyArea: (seconds) => area(energyStart, (step) => energy[step], seconds),
    rampArea: (seconds) => area(rampStart, (step) => ramp[step], seconds),
    energyRampArea: (seconds) => area(bothStart, (step) => energy[step] * ramp[step], seconds),
    phrase(seconds, kicksPerPhrase, minSeconds, maxSeconds, out, windows = noWindows, windowMaxSeconds = maxSeconds) {
      const starts = phraseStarts(kicksPerPhrase, minSeconds, maxSeconds, windows, windowMaxSeconds);
      const index = Math.max(0, firstAfter(starts, Math.max(0, seconds)) - 1);
      out.index = index;
      out.since = Math.max(0, seconds - starts[index]);
      return out;
    },
    paletteClock(seconds, cycleSeconds, fadeSeconds, cooldownSeconds, forcedJumps = noWindows) {
      const jumps = paletteJumps(cycleSeconds, fadeSeconds, cooldownSeconds, forcedJumps);
      const count = firstAfter(jumps.at, seconds);
      return Math.max(0, seconds) + (count ? jumps.offset[count - 1] : 0);
    },
    beatPosition(seconds) {
      const count = firstAfter(kickSeconds, seconds);
      if (count === 0) return 0;
      if (count >= kickSeconds.length) return count - 1;
      const previous = kickSeconds[count - 1];
      const gap = kickSeconds[count] - previous;
      return count - 1 + (gap > 0 ? Math.min(1, (seconds - previous) / gap) : 0);
    },
  };
}
