// The hits of a stage track in three bands (bass: kicks and bass notes; mids:
// snares and claps; highs: hats and cymbals), found ahead of time by
// scripts/build-track-spectrum.mjs and stored as <trackId>.beats next to the
// track's audio file. The lights fire on these instead of guessing a beat
// from the spectrum level: a loud master keeps every band near its ceiling,
// so a level-based guess almost never fires. Like the spectrum, the list
// depends only on the track position, so every player sees the same hits,
// the same kick count and the same drops.
//
//   bytes 0-3   "OMB2"
//   bytes 4-15  hit count of each band (uint32 x 3, little-endian)
//   then        the bands in order; per hit: seconds into the track and
//               strength 0..1 (float32 each)
//
// A two-hour set is about 830 KB, so the whole list is downloaded once.

import { publicUrl } from '../app/publicUrl';

const BAND_COUNT = 3;
const BEATS_HEADER_BYTES = 4 + 4 * BAND_COUNT;
const RETRY_AFTER_MS = 30_000;
// A bass hit this strong is a kick. Kicks are at least this far apart, so a
// busy bass line does not count (or flash) twice on one beat.
const KICK_STRENGTH = 0.7;
const KICK_MIN_GAP_SECONDS = 0.3;
// The first kick after this long without one is a drop (the kick comes back
// after a breakdown).
const DROP_QUIET_SECONDS = 6;

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
}

export function createStageBeat(): StageBeat {
  return { bass: 0, mids: 0, highs: 0, kick: false, kickCount: 0, drop: false };
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
}

export function parseBeats(bytes: Uint8Array): ParsedBeats | null {
  if (bytes.length < BEATS_HEADER_BYTES) return null;
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'OMB2') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const counts = [view.getUint32(4, true), view.getUint32(8, true), view.getUint32(12, true)];
  if (bytes.length < BEATS_HEADER_BYTES + (counts[0] + counts[1] + counts[2]) * 8) return null;
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
  const kicks: number[] = [];
  const drops: number[] = [];
  const bass = bands[0];
  for (let i = 0; i < bass.seconds.length; i += 1) {
    if (bass.strength[i] < KICK_STRENGTH) continue;
    const previous = kicks.length ? kicks[kicks.length - 1] : undefined;
    if (previous !== undefined && bass.seconds[i] - previous < KICK_MIN_GAP_SECONDS) continue;
    drops.push(previous !== undefined && bass.seconds[i] - previous >= DROP_QUIET_SECONDS ? 1 : 0);
    kicks.push(bass.seconds[i]);
  }
  return { bands, kickSeconds: Float32Array.from(kicks), kickIsDrop: Uint8Array.from(drops) };
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
      return true;
    },
    dispose() {
      disposed = true;
      abort.abort();
      beats = undefined;
    },
  };
}
