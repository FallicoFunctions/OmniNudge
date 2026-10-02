// The hits of a stage track in three bands (bass: kicks and bass notes; mids:
// snares and claps; highs: hats and cymbals), and its beats, bars and drops,
// found ahead of time by scripts/analyze-track-beats.py and
// scripts/build-track-spectrum.mjs and stored as <trackId>.beats next to the
// track's audio file. The lights fire on these instead of guessing a beat
// from the spectrum level: a loud master keeps every band near its ceiling,
// so a level-based guess almost never fires. Like the spectrum, the list
// depends only on the track position, so every player sees the same hits,
// the same beat count and the same drops.
//
// The "kicks" the lights count are the beats: every beat of the music, in
// every genre, from a trained beat tracker (see analyze-track-beats.py).
// Each has a count aligned to the bars (a multiple of 4 on a bar start), so
// "every 16th kick" is every fourth bar start.
//
//   bytes 0-3   "OMB4"
//   bytes 4-27  hit count of each band, the loudness block count, the beat
//               count and the drop count (uint32 x 6, little-endian)
//   then        the bands in order; per hit: seconds into the track and
//               strength 0..1 (float32 each)
//   then        the mean power of each 0.25 s block of the mix (float32)
//   then        per beat: seconds (float32) and its count (uint32)
//   then        the index of each drop's beat (uint32)
//
// A two-hour set is about 1.1 MB, so the whole list is downloaded once.

import { publicUrl } from '../app/publicUrl';
import { buildUpAt, createShowTimeline, isBarStart, type ShowEventWindows, type ShowTimeline } from './showTimeline';

const BAND_COUNT = 3;
const BEATS_HEADER_BYTES = 4 + 4 * (BAND_COUNT + 3);
const LOUDNESS_BLOCK_SECONDS = 0.25;
const RETRY_AFTER_MS = 30_000;
// The tempo the light speeds were tuned at (the house part of the first set).
// A song at 176 BPM moves the lights 176/128 as fast. The tempo at a moment
// is the median of the beat gaps among the TEMPO_BEATS beats around it,
// leaving out gaps over TEMPO_MAX_GAP_SECONDS (a hole in the beats, not a
// tempo). Under TEMPO_FOLD_BPM it is doubled: the tracker hears drum and bass
// at half time in places (88 BPM for 176), and no song in a set is that slow.
// With fewer than TEMPO_MIN_GAPS gaps left, the tempo before holds. The
// factor stays within TEMPO_FACTOR_MIN..MAX.
const REFERENCE_BPM = 128;
const TEMPO_BEATS = 8;
const TEMPO_MAX_GAP_SECONDS = 1;
const TEMPO_MIN_GAPS = 4;
const TEMPO_FOLD_BPM = 100;
const TEMPO_FACTOR_MIN = 0.75;
const TEMPO_FACTOR_MAX = 1.4;
// Energy, 0 (a break) to 1 (a full drop), from two measures of the music
// within ENERGY_HALF_WINDOW seconds each side of the moment, each placed
// between the track's own 10th and 90th percentile:
//   - how hard it hits: the strength of all hits (kicks and bass notes
//     count fully, snares and hats half);
//   - how loud it is: the mean power of the mix, in decibels (the peaks and
//     valleys a waveform view of the track shows).
// The window is centred, not trailing, because the whole list is known
// ahead: the energy rises on the drop, not seconds after it. Stored every
// ENERGY_STEP_SECONDS.
const ENERGY_HALF_WINDOW = 2;
const ENERGY_STEP_SECONDS = LOUDNESS_BLOCK_SECONDS;
const ENERGY_BAND_WEIGHTS = [1, 0.5, 0.5];
const ENERGY_HIT_WEIGHT = 0.5;
// Build-up: the part before a drop where the music keeps rising into it
// (snare rolls, risers), from 4 s to over a minute long. Found per drop:
//   1. A rise level: snare and hat hits within 1 s each side, and loudness,
//      each placed between their own 5th and 95th percentile over the (up
//      to) BUILD_LOOKBACK_SECONDS before the drop, averaged, then smoothed
//      over 2 s (the peak) and over 6 s (the bottom).
//   2. Walking back from the drop, down through the build-up to the bottom
//      of the break: the break starts where the music (6 s level) is full
//      again, BUILD_FULL_LEVEL or more and BUILD_FULL_RISE above the lowest
//      level passed. (The end of a build-up is loud too, so "the last time
//      the music was full" would land inside the build-up.)
//   3. The build-up starts at the last moment the music is at the bottom
//      of that break (within BUILD_BOTTOM_TOLERANCE of its lowest level).
//   4. It counts only when the music then rises by BUILD_MIN_RISE up to the
//      last 4 s before the drop, over at least BUILD_MIN_SECONDS; otherwise
//      the drop has no build-up.
const BUILD_LOOKBACK_SECONDS = 120;
const BUILD_BOTTOM_TOLERANCE = 0.05;
const BUILD_MIN_RISE = 0.2;
const BUILD_MIN_SECONDS = 2;
const BUILD_FULL_LEVEL = 0.6;
const BUILD_FULL_RISE = 0.4;

/** What the lights heard in one frame. Reused objects; read, do not keep. */
export interface StageBeat {
  // Strongest hit of each band in the frame, 0 when there was none.
  bass: number;
  mids: number;
  highs: number;
  // A beat landed in this frame.
  kick: boolean;
  // That beat starts a bar.
  bar: boolean;
  // The bar-aligned count of the last beat so far (see above): the same
  // number for every player, so "every 16th kick" is the same moment for
  // all of them.
  kickCount: number;
  // The beat in this frame is a drop.
  drop: boolean;
  // How much is going on in the music around now, 0 (breakdown) to 1 (drop),
  // relative to the rest of the track.
  energy: number;
  // Progress through a build-up into a drop: 0 at its start, rising to 1 at
  // the drop; 0 outside a build-up.
  buildUp: number;
  // The track position of this reading, and the show state as a function of
  // it (see showTimeline.ts): the same for every player at the same moment.
  seconds: number;
  timeline: ShowTimeline | null;
  // The scheduled events in this track, set by the runtime from the server's
  // schedule; null when it is not known.
  events: ShowEventWindows | null;
}

export function createStageBeat(): StageBeat {
  return { bass: 0, mids: 0, highs: 0, kick: false, bar: false, kickCount: 0, drop: false, energy: 0, buildUp: 0, seconds: 0, timeline: null, events: null };
}

export interface TrackBeats {
  // Fills `out` with the hits later than `fromSeconds` and not later than
  // `toSeconds`. False while the list is not downloaded, or when the track
  // has no beats file; `out` is then unchanged.
  read(trackId: string, fromSeconds: number, toSeconds: number, out: StageBeat): boolean;
  dispose(): void;
}

export interface TrackBeatsOptions {
  fetchImpl?: typeof fetch;
  urlFor?: (trackId: string) => string;
  now?: () => number;
}

interface Band {
  seconds: Float32Array;
  strength: Float32Array;
}

export interface ParsedBeats {
  bands: Band[];
  kickSeconds: Float32Array;
  kickCounts: Uint32Array;
  kickIsDrop: Uint8Array;
  energy: Float32Array;
  // Each drop with a build-up: its time, and when its build-up starts.
  buildDrops: Float32Array;
  buildStarts: Float32Array;
  timeline: ShowTimeline;
}

export function parseBeats(bytes: Uint8Array): ParsedBeats | null {
  if (bytes.length < BEATS_HEADER_BYTES) return null;
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'OMB4') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const counts = [view.getUint32(4, true), view.getUint32(8, true), view.getUint32(12, true)];
  const loudnessCount = view.getUint32(16, true);
  const beatCount = view.getUint32(20, true);
  const dropCount = view.getUint32(24, true);
  const size = BEATS_HEADER_BYTES + (counts[0] + counts[1] + counts[2]) * 8 + loudnessCount * 4 + beatCount * 8 + dropCount * 4;
  if (bytes.length < size) return null;
  const bands: Band[] = [];
  let offset = BEATS_HEADER_BYTES;
  for (const count of counts) {
    const seconds = new Float32Array(count);
    const strength = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      seconds[i] = view.getFloat32(offset, true);
      strength[i] = view.getFloat32(offset + 4, true);
      offset += 8;
    }
    bands.push({ seconds, strength });
  }
  const power = new Float32Array(loudnessCount);
  for (let i = 0; i < loudnessCount; i += 1) {
    power[i] = view.getFloat32(offset, true);
    offset += 4;
  }
  const kickSeconds = new Float32Array(beatCount);
  const kickCounts = new Uint32Array(beatCount);
  for (let i = 0; i < beatCount; i += 1) {
    kickSeconds[i] = view.getFloat32(offset, true);
    kickCounts[i] = view.getUint32(offset + 4, true);
    offset += 8;
  }
  const kickIsDrop = new Uint8Array(beatCount);
  for (let i = 0; i < dropCount; i += 1) {
    const beat = view.getUint32(offset, true);
    offset += 4;
    if (beat < beatCount) kickIsDrop[beat] = 1;
  }
  const dropSeconds = Array.from(kickSeconds).filter((_, i) => kickIsDrop[i] === 1);
  const builds = buildUps(bands, power, dropSeconds);
  const energy = energyCurve(bands, power);
  const tempo = tempoCurve(kickSeconds, energy.length);
  const timeline = createShowTimeline(kickSeconds, energy, ENERGY_STEP_SECONDS, builds.buildStarts, builds.buildDrops, kickCounts, tempo);
  return { bands, kickSeconds, kickCounts, kickIsDrop, energy, ...builds, timeline };
}

// The tempo factor (see REFERENCE_BPM) at each energy step; 1 before the
// first measurable tempo.
function tempoCurve(kickSeconds: Float32Array, steps: number): Float32Array {
  const tempo = new Float32Array(steps);
  const gaps: number[] = [];
  let factor = 1;
  for (let step = 0; step < steps; step += 1) {
    const at = firstAfter(kickSeconds, step * ENERGY_STEP_SECONDS);
    const from = Math.max(0, Math.min(kickSeconds.length - 1 - TEMPO_BEATS, at - TEMPO_BEATS / 2));
    gaps.length = 0;
    for (let k = from; k < Math.min(kickSeconds.length - 1, from + TEMPO_BEATS); k += 1) {
      const gap = kickSeconds[k + 1] - kickSeconds[k];
      if (gap > 0 && gap <= TEMPO_MAX_GAP_SECONDS) gaps.push(gap);
    }
    if (gaps.length >= TEMPO_MIN_GAPS) {
      gaps.sort((x, y) => x - y);
      let bpm = 60 / gaps[gaps.length >> 1];
      if (bpm < TEMPO_FOLD_BPM) bpm *= 2;
      factor = Math.min(TEMPO_FACTOR_MAX, Math.max(TEMPO_FACTOR_MIN, bpm / REFERENCE_BPM));
    }
    tempo[step] = factor;
  }
  return tempo;
}

// Centred moving average over `width` steps.
function smooth(values: Float32Array, width: number): Float32Array {
  const sum = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i += 1) sum[i + 1] = sum[i] + values[i];
  const half = Math.floor(width / 2);
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length, i + half + 1);
    return (sum[to] - sum[from]) / (to - from);
  });
}

function percentile(values: Float32Array, q: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted.length ? sorted[Math.floor(q * (sorted.length - 1))] : 0;
}

function buildUps(bands: Band[], power: Float32Array, dropSeconds: number[]) {
  const starts: number[] = [];
  const drops: number[] = [];
  const steps = power.length;
  if (!steps) return { buildDrops: new Float32Array(), buildStarts: new Float32Array() };
  const step = LOUDNESS_BLOCK_SECONDS;
  // Snare and hat hits within 1 s each side, and loudness (dB) over 2 s.
  const busy = new Float32Array(steps);
  for (const band of [bands[1], bands[2]]) {
    const sum = new Float64Array(band.strength.length + 1);
    for (let i = 0; i < band.strength.length; i += 1) sum[i + 1] = sum[i] + band.strength[i];
    for (let i = 0; i < steps; i += 1) {
      busy[i] += sum[firstAfter(band.seconds, i * step + 1)] - sum[firstAfter(band.seconds, i * step - 1)];
    }
  }
  const powerSum = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i += 1) powerSum[i + 1] = powerSum[i] + power[i];
  const loud = new Float32Array(steps).map((_, i) => {
    const from = Math.max(0, i - 4);
    const to = Math.min(steps, i + 4);
    return 10 * Math.log10((powerSum[to] - powerSum[from]) / Math.max(1, to - from) + 1e-12);
  });

  let previousDrop = 0;
  for (const drop of dropSeconds) {
    const regionStart = Math.floor(Math.max(previousDrop, drop - BUILD_LOOKBACK_SECONDS) / step);
    const regionEnd = Math.min(steps, Math.floor((drop - 0.3) / step));
    previousDrop = drop;
    if (regionEnd - regionStart < 8 / step) continue;
    const place = (values: Float32Array) => {
      const region = values.subarray(regionStart, regionEnd);
      const low = percentile(region, 0.05);
      const span = Math.max(percentile(region, 0.95) - low, 1e-9);
      return region.map((value) => Math.min(1, Math.max(0, (value - low) / span)));
    };
    const busyLevel = place(busy);
    const loudLevel = place(loud);
    const level = busyLevel.map((value, i) => 0.5 * value + 0.5 * loudLevel[i]);
    const peakLevel = smooth(level, Math.round(2 / step));
    const bottomLevel = smooth(level, Math.round(6 / step));
    // In region steps from here on.
    const at = (seconds: number) => Math.min(level.length, Math.max(0, Math.floor(seconds / step) - regionStart));
    let peak = 0;
    for (let i = at(drop - 4); i < level.length; i += 1) peak = Math.max(peak, peakLevel[i]);
    const breakEnd = at(drop - 1);
    let breakStart = 0;
    let bottom = Infinity;
    for (let i = breakEnd - 1; i >= 0; i -= 1) {
      if (bottomLevel[i] >= BUILD_FULL_LEVEL && bottomLevel[i] >= bottom + BUILD_FULL_RISE) {
        breakStart = i;
        break;
      }
      bottom = Math.min(bottom, bottomLevel[i]);
    }
    if (breakEnd <= breakStart || !Number.isFinite(bottom)) continue;
    let start = breakStart;
    for (let i = breakStart; i < breakEnd; i += 1) if (bottomLevel[i] <= bottom + BUILD_BOTTOM_TOLERANCE) start = i;
    const startSeconds = (regionStart + start) * step;
    if (peak - bottomLevel[start] < BUILD_MIN_RISE || drop - startSeconds < BUILD_MIN_SECONDS) continue;
    drops.push(drop);
    starts.push(startSeconds);
  }
  return { buildDrops: Float32Array.from(drops), buildStarts: Float32Array.from(starts) };
}

// Values placed between their own 10th and 90th percentile, 0..1.
function spread(values: Float32Array): Float32Array {
  const sorted = Float32Array.from(values).sort();
  const low = sorted.length ? sorted[Math.floor(0.1 * (sorted.length - 1))] : 0;
  const high = sorted.length ? sorted[Math.floor(0.9 * (sorted.length - 1))] : 0;
  const span = high - low;
  return values.map((value) => (span > 0 ? Math.min(1, Math.max(0, (value - low) / span)) : 0));
}

function energyCurve(bands: Band[], power: Float32Array): Float32Array {
  let end = power.length * LOUDNESS_BLOCK_SECONDS;
  for (const band of bands) if (band.seconds.length) end = Math.max(end, band.seconds[band.seconds.length - 1]);
  const steps = Math.floor(end / ENERGY_STEP_SECONDS) + 1;
  // Running sums of strength, so a window's sum is two lookups per band.
  const sums = bands.map((band) => {
    const sum = new Float64Array(band.strength.length + 1);
    for (let i = 0; i < band.strength.length; i += 1) sum[i + 1] = sum[i] + band.strength[i];
    return sum;
  });
  const raw = new Float32Array(steps);
  for (let step = 0; step < steps; step += 1) {
    const at = step * ENERGY_STEP_SECONDS;
    let total = 0;
    bands.forEach((band, b) => {
      const from = firstAfter(band.seconds, at - ENERGY_HALF_WINDOW);
      const to = firstAfter(band.seconds, at + ENERGY_HALF_WINDOW);
      total += ENERGY_BAND_WEIGHTS[b] * (sums[b][to] - sums[b][from]);
    });
    raw[step] = total;
  }
  const hits = spread(raw);
  if (!power.length) return hits;
  // Loudness in decibels over the same centred window.
  const powerSum = new Float64Array(power.length + 1);
  for (let i = 0; i < power.length; i += 1) powerSum[i + 1] = powerSum[i] + power[i];
  const half = Math.round(ENERGY_HALF_WINDOW / LOUDNESS_BLOCK_SECONDS);
  const decibels = new Float32Array(steps);
  for (let step = 0; step < steps; step += 1) {
    const from = Math.max(0, Math.min(power.length, step - half));
    const to = Math.max(from, Math.min(power.length, step + half));
    const mean = to > from ? (powerSum[to] - powerSum[from]) / (to - from) : 0;
    decibels[step] = 10 * Math.log10(mean + 1e-12);
  }
  const loud = spread(decibels);
  return hits.map((value, step) => ENERGY_HIT_WEIGHT * value + (1 - ENERGY_HIT_WEIGHT) * loud[step]);
}

// Index of the first entry later than `seconds`.
function firstAfter(times: Float32Array, seconds: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] <= seconds) low = middle + 1;
    else high = middle;
  }
  return low;
}

function strongest(band: Band, fromSeconds: number, toSeconds: number): number {
  let value = 0;
  for (let i = firstAfter(band.seconds, fromSeconds); i < band.seconds.length && band.seconds[i] <= toSeconds; i += 1) {
    value = Math.max(value, band.strength[i]);
  }
  return value;
}

export function createTrackBeats(options: TrackBeatsOptions = {}): TrackBeats {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const urlFor = options.urlFor ?? ((trackId: string) => publicUrl(`/audio/${trackId}.beats`));
  const now = options.now ?? (() => Date.now());

  let trackId: string | undefined;
  let beats: ParsedBeats | 'loading' | undefined;
  let retryAt = 0;
  let abort = new AbortController();
  let disposed = false;

  function load(): void {
    const forTrack = trackId!;
    beats = 'loading';
    // Ask the server whether the file changed (a 304 when it did not): the
    // audio folder is cached for 7 days, and a browser holding an older
    // build of the list would otherwise keep it that long.
    fetchImpl(urlFor(forTrack), { signal: abort.signal, cache: 'no-cache' })
      .then(async (response) => {
        const parsed = response.ok ? parseBeats(new Uint8Array(await response.arrayBuffer())) : null;
        if (disposed || forTrack !== trackId) return;
        beats = parsed ?? undefined;
        // A track with no beats file: stop asking. Anything else: try later.
        if (!parsed) retryAt = response.status === 404 ? Number.POSITIVE_INFINITY : now() + RETRY_AFTER_MS;
      })
      .catch(() => {
        if (forTrack !== trackId) return;
        beats = undefined;
        retryAt = now() + RETRY_AFTER_MS;
      });
  }

  return {
    read(nextTrackId, fromSeconds, toSeconds, out) {
      if (disposed) return false;
      if (nextTrackId !== trackId) {
        abort.abort();
        abort = new AbortController();
        trackId = nextTrackId;
        beats = undefined;
        retryAt = 0;
      }
      if (beats === undefined) {
        if (now() >= retryAt) load();
        return false;
      }
      if (beats === 'loading') return false;
      out.bass = strongest(beats.bands[0], fromSeconds, toSeconds);
      out.mids = strongest(beats.bands[1], fromSeconds, toSeconds);
      out.highs = strongest(beats.bands[2], fromSeconds, toSeconds);
      const firstKick = firstAfter(beats.kickSeconds, fromSeconds);
      const kicksUntil = firstAfter(beats.kickSeconds, toSeconds);
      out.kick = kicksUntil > firstKick;
      out.kickCount = kicksUntil > 0 ? beats.kickCounts[kicksUntil - 1] : 0;
      out.bar = false;
      out.drop = false;
      for (let i = firstKick; i < kicksUntil; i += 1) {
        if (isBarStart(beats.kickCounts, i)) out.bar = true;
        if (beats.kickIsDrop[i]) out.drop = true;
      }
      const position = Math.max(0, toSeconds) / ENERGY_STEP_SECONDS;
      const step = Math.min(beats.energy.length - 1, Math.floor(position));
      const next = Math.min(beats.energy.length - 1, step + 1);
      out.energy = beats.energy.length
        ? beats.energy[step] + (beats.energy[next] - beats.energy[step]) * Math.min(1, position - step)
        : 0;
      out.buildUp = buildUpAt(beats.buildStarts, beats.buildDrops, toSeconds);
      out.seconds = toSeconds;
      out.timeline = beats.timeline;
      return true;
    },
    dispose() {
      disposed = true;
      abort.abort();
      beats = undefined;
    },
  };
}
