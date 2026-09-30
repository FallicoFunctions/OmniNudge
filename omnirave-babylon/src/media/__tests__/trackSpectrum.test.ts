import { describe, expect, it, vi } from 'vitest';
import { createTrackSpectrum, SPECTRUM_HEADER_BYTES } from '../trackSpectrum';

const FPS = 30;
const BINS = 4;
const FRAMES = FPS * 90; // 90 s: three 30-second parts

// Frame f holds [f % 256, 1, 2, 3].
function spectrumFile(): Uint8Array {
  const bytes = new Uint8Array(SPECTRUM_HEADER_BYTES + FRAMES * BINS);
  bytes.set([79, 77, 83, 80]); // "OMSP"
  const view = new DataView(bytes.buffer);
  view.setUint16(4, FPS, true);
  view.setUint16(6, BINS, true);
  view.setUint32(8, FRAMES, true);
  for (let f = 0; f < FRAMES; f += 1) bytes.set([f % 256, 1, 2, 3], SPECTRUM_HEADER_BYTES + f * BINS);
  return bytes;
}

function rangeServer(file: Uint8Array, options: { ignoreRange?: boolean; status?: number } = {}) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (options.status) return new Response(null, { status: options.status });
    if (options.ignoreRange) return new Response(file.slice(), { status: 200 });
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec((init?.headers as Record<string, string>).Range)!;
    return new Response(file.slice(Number(start), Number(end) + 1), { status: 206 });
  });
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createTrackSpectrum', () => {
  it('downloads only the part near the position, and blends between frames', async () => {
    const fetchImpl = rangeServer(spectrumFile());
    const spectrum = createTrackSpectrum({ fetchImpl, urlFor: (id) => `/audio/${id}.spectrum` });
    const target = new Uint8Array(BINS);

    expect(spectrum.fill('set', 1.5, target)).toBe(false); // header not here yet
    await settle();
    expect(spectrum.fill('set', 1.5, target)).toBe(false); // part not here yet
    await settle();
    // 1.55 s = frame 46.5: halfway between 46 and 47.
    expect(spectrum.fill('set', 1.55, target)).toBe(true);
    expect(target[0]).toBeCloseTo(47, 0);
    expect(Array.from(target.subarray(1))).toEqual([1, 2, 3]);

    const ranges = fetchImpl.mock.calls.map((call) => (call[1]?.headers as Record<string, string>).Range);
    expect(ranges).toEqual([`bytes=0-${SPECTRUM_HEADER_BYTES - 1}`, `bytes=16-${16 + FPS * 30 * BINS - 1}`]);
    expect(fetchImpl.mock.calls[0][0]).toBe('/audio/set.spectrum');
  });

  it('downloads the next part before the position gets to it', async () => {
    const fetchImpl = rangeServer(spectrumFile());
    const spectrum = createTrackSpectrum({ fetchImpl });
    const target = new Uint8Array(BINS);
    spectrum.fill('set', 25, target);
    await settle();
    spectrum.fill('set', 25, target);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await settle();
    expect(spectrum.fill('set', 31, target)).toBe(true);
    expect(target[0]).toBe((31 * FPS) % 256);
  });

  it('uses the whole file when the server ignores the Range request', async () => {
    const spectrum = createTrackSpectrum({ fetchImpl: rangeServer(spectrumFile(), { ignoreRange: true }) });
    const target = new Uint8Array(BINS);
    spectrum.fill('set', 80, target);
    await settle();
    expect(spectrum.fill('set', 80, target)).toBe(true);
    expect(target[0]).toBe((80 * FPS) % 256);
  });

  it('stops asking for a track that has no spectrum file', async () => {
    const fetchImpl = rangeServer(spectrumFile(), { status: 404 });
    let now = 0;
    const spectrum = createTrackSpectrum({ fetchImpl, now: () => now });
    const target = new Uint8Array(BINS);
    spectrum.fill('none', 0, target);
    await settle();
    now += 10 * 60_000;
    expect(spectrum.fill('none', 0, target)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fills the unused end of a longer target with zeros and leaves a shorter one full', async () => {
    const spectrum = createTrackSpectrum({ fetchImpl: rangeServer(spectrumFile(), { ignoreRange: true }) });
    spectrum.fill('set', 0, new Uint8Array(1));
    await settle();
    const longer = new Uint8Array(6).fill(9);
    expect(spectrum.fill('set', 0, longer)).toBe(true);
    expect(Array.from(longer)).toEqual([0, 1, 2, 3, 0, 0]);
    const shorter = new Uint8Array(2);
    spectrum.fill('set', 0, shorter);
    expect(Array.from(shorter)).toEqual([0, 1]);
  });
});
