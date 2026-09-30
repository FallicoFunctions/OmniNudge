// The bass hits of a stage track (kicks and bass notes), found ahead of time
// by scripts/build-track-spectrum.mjs and stored as <trackId>.beats next to
// the track's audio file. The lights fire on these instead of guessing a beat
// from the spectrum level: a loud master keeps the bass band near its ceiling,
// so a level-based guess almost never fires. Like the spectrum, the list
// depends only on the track position, so every player sees the same hits.
//
//   bytes 0-3  "OMBT"
//   bytes 4-7  hit count (uint32, little-endian)
//   then       per hit: seconds into the track, strength 0..1 (float32 each)
//
// A two-hour set is about 250 KB, so the whole list is downloaded once.

import { publicUrl } from '../app/publicUrl';

const BEATS_HEADER_BYTES = 8;
const RETRY_AFTER_MS = 30_000;

export interface TrackBeats {
  // The strongest hit later than `fromSeconds` and not later than `toSeconds`
  // (0 when there is none). Null while the list is not downloaded, or when
  // the track has no beats file: the caller then keeps its own detection.
  strongestBetween(trackId: string, fromSeconds: number, toSeconds: number): number | null;
  dispose(): void;
}

export interface TrackBeatsOptions {
  fetchImpl?: typeof fetch;
  urlFor?: (trackId: string) => string;
  now?: () => number;
}

export function parseBeats(bytes: Uint8Array): { seconds: Float32Array; strength: Float32Array } | null {
  if (bytes.length < BEATS_HEADER_BYTES) return null;
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'OMBT') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (bytes.length < BEATS_HEADER_BYTES + count * 8) return null;
  const seconds = new Float32Array(count);
  const strength = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    seconds[i] = view.getFloat32(BEATS_HEADER_BYTES + i * 8, true);
    strength[i] = view.getFloat32(BEATS_HEADER_BYTES + i * 8 + 4, true);
  }
  return { seconds, strength };
}

export function createTrackBeats(options: TrackBeatsOptions = {}): TrackBeats {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const urlFor = options.urlFor ?? ((trackId: string) => publicUrl(`/audio/${trackId}.beats`));
  const now = options.now ?? (() => Date.now());

  let trackId: string | undefined;
  let beats: { seconds: Float32Array; strength: Float32Array } | 'loading' | undefined;
  let retryAt = 0;
  let abort = new AbortController();
  let disposed = false;

  function load(): void {
    const forTrack = trackId!;
    beats = 'loading';
    fetchImpl(urlFor(forTrack), { signal: abort.signal })
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
    strongestBetween(nextTrackId, fromSeconds, toSeconds) {
      if (disposed) return null;
      if (nextTrackId !== trackId) {
        abort.abort();
        abort = new AbortController();
        trackId = nextTrackId;
        beats = undefined;
        retryAt = 0;
      }
      if (beats === undefined) {
        if (now() >= retryAt) load();
        return null;
      }
      if (beats === 'loading') return null;
      const { seconds, strength } = beats;
      // First hit later than fromSeconds.
      let low = 0;
      let high = seconds.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (seconds[middle] <= fromSeconds) low = middle + 1;
        else high = middle;
      }
      let strongest = 0;
      for (let i = low; i < seconds.length && seconds[i] <= toSeconds; i += 1) {
        strongest = Math.max(strongest, strength[i]);
      }
      return strongest;
    },
    dispose() {
      disposed = true;
      abort.abort();
      beats = undefined;
    },
  };
}
