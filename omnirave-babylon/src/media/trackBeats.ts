// The hits of a stage track in three bands (bass: kicks and bass notes; mids:
// snares and claps; highs: hats and cymbals), found ahead of time by
// scripts/build-track-spectrum.mjs and stored as <trackId>.beats next to the
// track's audio file. The lights fire on these instead of guessing a beat
// from the spectrum level: a loud master keeps every band near its ceiling,
// so a level-based guess almost never fires. Like the spectrum, the list
// depends only on the track position, so every player sees the same hits,
// the same kick count and the same drops.
//
//   bytes 0-3   "OMB3"
//   bytes 4-19  hit count of each band, then the loudness block count
//               (uint32 x 4, little-endian)
//   then        the bands in order; per hit: seconds into the track and
//               strength 0..1 (float32 each)
//   then        the mean power of each 0.25 s block of the mix (float32)
//
// A two-hour set is about 950 KB, so the whole list is downloaded once.

import { publicUrl } from '../app/publicUrl';

const BAND_COUNT = 3;
const BEATS_HEADER_BYTES = 4 + 4 * (BAND_COUNT + 1);
const LOUDNESS_BLOCK_SECONDS = 0.25;
const RETRY_AFTER_MS = 30_000;
// A bass hit this strong is a kick. Kicks are at least this far apart, so a
// busy bass line does not count (or flash) twice on one beat.
const KICK_STRENGTH = 0.7;
const KICK_MIN_GAP_SECONDS = 0.3;
// A drop: the first kick after this long without one (the kick comes back
// after a breakdown), when at least DROP_KICKS_AFTER kicks follow within
// DROP_CHECK_SECONDS. A lone kick inside a breakdown is not a drop.
const DROP_QUIET_SECONDS = 6;
const DROP_KICKS_AFTER = 6;
const DROP_CHECK_SECONDS = 4;
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

/** What the lights heard in one frame. Reused objects; read, do not keep. */
export interface StageBeat {
  // Strongest hit of each band in the frame, 0 when there was none.
  bass: number;
  mids: number;
  highs: number;
  // A kick landed in this frame.
  kick: boolean;
  // Kicks in the track up to now: the same number for every player, so
  // "every 16th kick" is the same moment for all of them.
  kickCount: number;
  // The kick in this frame is a drop.
  drop: boolean;
  // How much is going on in the music around now, 0 (breakdown) to 1 (drop),
  // relative to the rest of the track.
  energy: number;
}

export function createStageBeat(): StageBeat {
  return { bass: 0, mids: 0, highs: 0, kick: false, kickCount: 0, drop: false, energy: 0 };
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
  kickIsDrop: Uint8Array;
  energy: Float32Array;
}

export function parseBeats(bytes: Uint8Array): ParsedBeats | null {
  if (bytes.length < BEATS_HEADER_BYTES) return null;
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'OMB3') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const counts = [view.getUint32(4, true), view.getUint32(8, true), view.getUint32(12, true)];
  const loudnessCount = view.getUint32(16, true);
  if (bytes.length < BEATS_HEADER_BYTES + (counts[0] + counts[1] + counts[2]) * 8 + loudnessCount * 4) return null;
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
  const kicks: number[] = [];
  const bass = bands[0];
  for (let i = 0; i < bass.seconds.length; i += 1) {
    if (bass.strength[i] < KICK_STRENGTH) continue;
    const previous = kicks.length ? kicks[kicks.length - 1] : undefined;
    if (previous !== undefined && bass.seconds[i] - previous < KICK_MIN_GAP_SECONDS) continue;
    kicks.push(bass.seconds[i]);
  }
  const kickSeconds = Float32Array.from(kicks);
  const kickIsDrop = new Uint8Array(kicks.length);
  for (let i = 1; i < kicks.length; i += 1) {
    if (kicks[i] - kicks[i - 1] < DROP_QUIET_SECONDS) continue;
    const following = firstAfter(kickSeconds, kicks[i] + DROP_CHECK_SECONDS) - (i + 1);
    if (following >= DROP_KICKS_AFTER) kickIsDrop[i] = 1;
  }
  return { bands, kickSeconds, kickIsDrop, energy: energyCurve(bands, power) };
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
      out.kickCount = kicksUntil;
      out.drop = false;
      for (let i = firstKick; i < kicksUntil; i += 1) {
        if (beats.kickIsDrop[i]) out.drop = true;
      }
      const position = Math.max(0, toSeconds) / ENERGY_STEP_SECONDS;
      const step = Math.min(beats.energy.length - 1, Math.floor(position));
      const next = Math.min(beats.energy.length - 1, step + 1);
      out.energy = beats.energy.length
        ? beats.energy[step] + (beats.energy[next] - beats.energy[step]) * Math.min(1, position - step)
        : 0;
      return true;
    },
    dispose() {
      disposed = true;
      abort.abort();
      beats = undefined;
    },
  };
}
