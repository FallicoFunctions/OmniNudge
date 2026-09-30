// Precomputed spectrum of a stage track, so the lights are the same for every
// player: they follow the track position, not this tab's audio output (a
// muted or blocked tab gives the live analyser nothing).
//
// scripts/build-track-spectrum.mjs writes <trackId>.spectrum next to the
// track's audio file. It holds what an AnalyserNode (fftSize 256, smoothing
// 0.8, default decibel range) reports, FRAMES_PER_SECOND times a second:
//
//   bytes 0-3   "OMSP"
//   bytes 4-5   frames per second (uint16, little-endian)
//   bytes 6-7   bins per frame (uint16, little-endian)
//   bytes 8-11  frame count (uint32, little-endian)
//   bytes 12-15 reserved
//   then        frame count x bins bytes, one byte per bin (0-255)
//
// A 2-hour set is about 30 MB, so the reader downloads only the part near
// the playhead, with HTTP Range requests, WINDOW_SECONDS at a time.

import { publicUrl } from '../app/publicUrl';

export const SPECTRUM_HEADER_BYTES = 16;
const WINDOW_SECONDS = 30;
// Download the next part this long before the playhead gets to it.
const PREFETCH_SECONDS = 10;
const RETRY_AFTER_MS = 30_000;
const KEPT_WINDOWS = 3;

export interface TrackSpectrum {
  // Fills `target` with the spectrum at `seconds` into the track, like
  // AnalyserNode.getByteFrequencyData. False when that part is not
  // downloaded yet or the track has no spectrum file; `target` is then
  // unchanged.
  fill(trackId: string, seconds: number, target: Uint8Array): boolean;
  dispose(): void;
}

export interface TrackSpectrumOptions {
  fetchImpl?: typeof fetch;
  urlFor?: (trackId: string) => string;
  now?: () => number;
}

interface SpectrumHeader {
  fps: number;
  bins: number;
  frames: number;
}

type Window = Uint8Array | 'loading';

export function parseSpectrumHeader(bytes: Uint8Array): SpectrumHeader | null {
  if (bytes.length < SPECTRUM_HEADER_BYTES) return null;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = { fps: view.getUint16(4, true), bins: view.getUint16(6, true), frames: view.getUint32(8, true) };
  return magic === 'OMSP' && header.fps > 0 && header.bins > 0 ? header : null;
}

export function createTrackSpectrum(options: TrackSpectrumOptions = {}): TrackSpectrum {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const urlFor = options.urlFor ?? ((trackId: string) => publicUrl(`/audio/${trackId}.spectrum`));
  const now = options.now ?? (() => Date.now());

  let trackId: string | undefined;
  let header: SpectrumHeader | 'loading' | undefined;
  let retryAt = 0;
  // The whole frame data, when the server ignored the Range request.
  let allFrames: Uint8Array | undefined;
  let windows = new Map<number, Window>();
  let abort = new AbortController();
  let disposed = false;

  function reset(nextTrackId: string): void {
    abort.abort();
    abort = new AbortController();
    trackId = nextTrackId;
    header = undefined;
    allFrames = undefined;
    windows = new Map();
    retryAt = 0;
  }

  function failed(): void {
    if (retryAt !== Number.POSITIVE_INFINITY) retryAt = now() + RETRY_AFTER_MS;
  }

  async function fetchBytes(start: number, end: number): Promise<{ bytes: Uint8Array; whole: boolean } | null> {
    const response = await fetchImpl(urlFor(trackId!), {
      headers: { Range: `bytes=${start}-${end}` },
      signal: abort.signal,
    });
    // A track with no spectrum file: stop asking, the live analysis stays.
    if (response.status === 404) retryAt = Number.POSITIVE_INFINITY;
    if (response.status !== 206 && response.status !== 200) return null;
    return { bytes: new Uint8Array(await response.arrayBuffer()), whole: response.status === 200 };
  }

  function loadHeader(): void {
    const forTrack = trackId;
    header = 'loading';
    fetchBytes(0, SPECTRUM_HEADER_BYTES - 1)
      .then((result) => {
        if (disposed || forTrack !== trackId) return;
        const parsed = result ? parseSpectrumHeader(result.bytes) : null;
        if (!result || !parsed) {
          header = undefined;
          failed();
          return;
        }
        header = parsed;
        if (result.whole) allFrames = result.bytes.subarray(SPECTRUM_HEADER_BYTES);
      })
      .catch(() => {
        if (forTrack !== trackId) return;
        header = undefined;
        failed();
      });
  }

  function loadWindow(index: number, known: SpectrumHeader): void {
    if (windows.has(index) || now() < retryAt) return;
    const firstFrame = index * WINDOW_SECONDS * known.fps;
    if (firstFrame >= known.frames) return;
    const lastFrame = Math.min(known.frames, firstFrame + WINDOW_SECONDS * known.fps) - 1;
    const forTrack = trackId;
    windows.set(index, 'loading');
    fetchBytes(SPECTRUM_HEADER_BYTES + firstFrame * known.bins, SPECTRUM_HEADER_BYTES + (lastFrame + 1) * known.bins - 1)
      .then((result) => {
        if (disposed || forTrack !== trackId) return;
        if (!result) {
          windows.delete(index);
          failed();
          return;
        }
        if (result.whole) {
          allFrames = result.bytes.subarray(SPECTRUM_HEADER_BYTES);
          return;
        }
        windows.set(index, result.bytes);
        // Keep the windows nearest this one; the rest are behind the playhead.
        const far = [...windows.keys()].sort((a, b) => Math.abs(b - index) - Math.abs(a - index));
        for (const key of far.slice(0, Math.max(0, windows.size - KEPT_WINDOWS))) windows.delete(key);
      })
      .catch(() => {
        if (forTrack !== trackId) return;
        windows.delete(index);
        failed();
      });
  }

  function frameBytes(known: SpectrumHeader, frame: number): Uint8Array | undefined {
    if (frame < 0 || frame >= known.frames) return undefined;
    if (allFrames) {
      const start = frame * known.bins;
      return allFrames.length >= start + known.bins ? allFrames.subarray(start, start + known.bins) : undefined;
    }
    const framesPerWindow = WINDOW_SECONDS * known.fps;
    const window = windows.get(Math.floor(frame / framesPerWindow));
    if (!(window instanceof Uint8Array)) return undefined;
    const start = (frame % framesPerWindow) * known.bins;
    return window.length >= start + known.bins ? window.subarray(start, start + known.bins) : undefined;
  }

  return {
    fill(nextTrackId, seconds, target) {
      if (disposed || !Number.isFinite(seconds)) return false;
      if (nextTrackId !== trackId) reset(nextTrackId);
      const at = Math.max(0, seconds);
      if (header === undefined) {
        if (now() >= retryAt) loadHeader();
        return false;
      }
      if (header === 'loading') return false;
      const known = header;
      const position = at * known.fps;
      const frame = Math.floor(position);
      if (!allFrames) {
        const windowIndex = Math.floor(at / WINDOW_SECONDS);
        loadWindow(windowIndex, known);
        if (at - windowIndex * WINDOW_SECONDS > WINDOW_SECONDS - PREFETCH_SECONDS) {
          loadWindow(windowIndex + 1, known);
        }
      }
      const current = frameBytes(known, frame);
      if (!current) return false;
      // Frames are 1/fps apart; blend toward the next one for smooth motion.
      const next = frameBytes(known, frame + 1) ?? current;
      const blend = position - frame;
      const count = Math.min(target.length, known.bins);
      for (let bin = 0; bin < count; bin += 1) {
        target[bin] = Math.round(current[bin] + (next[bin] - current[bin]) * blend);
      }
      target.fill(0, count);
      return true;
    },
    dispose() {
      disposed = true;
      abort.abort();
      windows.clear();
      allFrames = undefined;
    },
  };
}
