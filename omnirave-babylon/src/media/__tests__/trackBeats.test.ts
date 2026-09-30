import { describe, expect, it, vi } from 'vitest';
import { createStageBeat, createTrackBeats, parseBeats } from '../trackBeats';

type Hit = [seconds: number, strength: number];

function beatsFile(bass: Hit[], mids: Hit[] = [], highs: Hit[] = [], loudness: number[] = []): Uint8Array {
  const bands = [bass, mids, highs];
  const bytes = new Uint8Array(20 + bands.reduce((sum, band) => sum + band.length, 0) * 8 + loudness.length * 4);
  bytes.set([79, 77, 66, 51]); // "OMB3"
  const view = new DataView(bytes.buffer);
  bands.forEach((band, i) => view.setUint32(4 + 4 * i, band.length, true));
  view.setUint32(16, loudness.length, true);
  let offset = 20;
  for (const [seconds, strength] of bands.flat()) {
    view.setFloat32(offset, seconds, true);
    view.setFloat32(offset + 4, strength, true);
    offset += 8;
  }
  for (const power of loudness) {
    view.setFloat32(offset, power, true);
    offset += 4;
  }
  return bytes;
}

// Kicks at 1, 1.5 and 2 with a bass note between; a breakdown; the kick
// comes back at 10 and keeps going to 13.5 (a drop), with a double hit 0.1 s
// after it that is one kick; then a lone kick at 20, after another quiet
// passage, with nothing after it (not a drop).
const STEADY: Hit[] = [10.5, 11, 11.5, 12, 12.5, 13, 13.5].map((seconds) => [seconds, 1]);
const BASS: Hit[] = [[1, 1], [1.25, 0.5], [1.5, 1], [2, 0.75], [10, 1], [10.1, 0.9], ...STEADY, [20, 1]];
const MIDS: Hit[] = [[1.5, 0.75]];
const HIGHS: Hit[] = [[1.25, 0.5], [1.75, 1]];

async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loaded() {
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(beatsFile(BASS, MIDS, HIGHS).slice(), { status: 200 }));
  const beats = createTrackBeats({ fetchImpl, urlFor: (id) => `/audio/${id}.beats` });
  const out = createStageBeat();
  expect(beats.read('set', 0, 1, out)).toBe(false); // not downloaded yet
  await settle();
  const read = (from: number, to: number) => {
    expect(beats.read('set', from, to, out)).toBe(true);
    return { ...out };
  };
  return { fetchImpl, read };
}

describe('createTrackBeats', () => {
  it('reports the strongest hit of each band after the start of the window and up to its end', async () => {
    const { fetchImpl, read } = await loaded();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('/audio/set.beats');
    // Revalidated on every load, so a new build of the list replaces a cached one.
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].cache).toBe('no-cache');

    expect(read(0.9, 1)).toMatchObject({ bass: 1, mids: 0, highs: 0 }); // a hit exactly at the end counts
    expect(read(1, 1.1)).toMatchObject({ bass: 0, mids: 0, highs: 0 }); // and is not counted again
    expect(read(1.1, 1.3)).toMatchObject({ bass: 0.5, mids: 0, highs: 0.5 });
    expect(read(1.1, 2)).toMatchObject({ bass: 1, mids: 0.75, highs: 1 }); // strongest of several
    expect(read(30, 50)).toMatchObject({ bass: 0, mids: 0, highs: 0, kick: false }); // after the last hit
  });

  it('counts kicks for the whole track, so every player gets the same count', async () => {
    const { read } = await loaded();
    expect(read(0, 0.5)).toMatchObject({ kick: false, kickCount: 0 });
    expect(read(0.9, 1)).toMatchObject({ kick: true, kickCount: 1 });
    expect(read(1.1, 1.3)).toMatchObject({ kick: false, kickCount: 1 }); // a bass note is not a kick
    expect(read(1.9, 2)).toMatchObject({ kick: true, kickCount: 3 });
    // A player who joins here has the same count as one who heard it all.
    expect(read(5, 5)).toMatchObject({ kick: false, kickCount: 3 });
    // Two strong hits 0.1 s apart are one kick.
    expect(read(9.9, 10.2)).toMatchObject({ kick: true, kickCount: 4 });
    expect(read(10.2, 10.6)).toMatchObject({ kick: true, kickCount: 5 });
  });

  it('counts loudness as well as hits: a loud passage with no hits reads half way', async () => {
    // 60 s: the first half loud with no hits, the second loud with steady kicks.
    const power = Array.from({ length: 240 }, (_, block) => (block < 20 ? 0.001 : 0.1));
    const kicks: Hit[] = Array.from({ length: 60 }, (_, k) => [30 + k * 0.5, 1]);
    const fetchImpl = vi.fn(async () => new Response(beatsFile(kicks, [], [], power).slice(), { status: 200 }));
    const beats = createTrackBeats({ fetchImpl });
    const out = createStageBeat();
    beats.read('set', 0, 1, out);
    await settle();
    beats.read('set', 15, 15, out);
    expect(out.energy).toBeGreaterThan(0.4);
    expect(out.energy).toBeLessThan(0.6);
  });

  it('marks the first kick after a passage with no kick as a drop, when steady kicks follow', async () => {
    const { read } = await loaded();
    expect(read(0.9, 1).drop).toBe(false); // the first kick of the track is not a drop
    expect(read(1.4, 1.5).drop).toBe(false);
    expect(read(9.9, 10).drop).toBe(true);
    expect(read(10.4, 10.5).drop).toBe(false);
    expect(read(19.9, 20)).toMatchObject({ kick: true, drop: false }); // a lone kick in a break
  });

  it('reads the energy low in a quiet break and high in a loud, busy drop', async () => {
    // 60 s: a quiet break with no hits, then a loud part with steady kicks.
    const power = Array.from({ length: 240 }, (_, block) => (block < 120 ? 0.001 : 0.1));
    const kicks: Hit[] = Array.from({ length: 60 }, (_, k) => [30 + k * 0.5, 1]);
    const hats: Hit[] = Array.from({ length: 120 }, (_, k) => [30 + k * 0.25, 0.6]);
    const fetchImpl = vi.fn(async () => new Response(beatsFile(kicks, [], hats, power).slice(), { status: 200 }));
    const beats = createTrackBeats({ fetchImpl });
    const out = createStageBeat();
    beats.read('set', 0, 1, out);
    await settle();
    beats.read('set', 10, 10, out);
    expect(out.energy).toBeLessThan(0.1);
    beats.read('set', 45, 45, out);
    expect(out.energy).toBeGreaterThan(0.9);
    // Centred: already rising at the drop itself, not seconds after it.
    beats.read('set', 30, 30, out);
    expect(out.energy).toBeGreaterThan(0.2);
  });

  it('gives false, and stops asking, for a track with no beats file', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    let now = 0;
    const beats = createTrackBeats({ fetchImpl, now: () => now });
    const out = createStageBeat();
    beats.read('none', 0, 1, out);
    await settle();
    now += 10 * 60_000;
    expect(beats.read('none', 0, 1, out)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a file that is not a beat list', () => {
    expect(parseBeats(new TextEncoder().encode('<!doctype html><html>'))).toBeNull();
    expect(parseBeats(beatsFile(BASS).slice(0, 30))).toBeNull(); // shorter than its counts say
    expect(parseBeats(new Uint8Array(3))).toBeNull();
    // Earlier formats ("OMBT", "OMB2"): refused, not misread.
    expect(parseBeats(Uint8Array.from([79, 77, 66, 84, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(parseBeats(Uint8Array.from([79, 77, 66, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(parseBeats(beatsFile([]))?.kickSeconds.length).toBe(0);
  });

  it('loads the list of the new track when the track changes', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      new Response(beatsFile(String(url).includes('b.beats') ? [[1, 0.5]] : [[1, 1]]).slice(), { status: 200 }));
    const beats = createTrackBeats({ fetchImpl, urlFor: (id) => `/${id}.beats` });
    const out = createStageBeat();
    beats.read('a', 0, 2, out);
    await settle();
    expect(beats.read('a', 0, 2, out)).toBe(true);
    expect(out.bass).toBe(1);
    expect(beats.read('b', 0, 2, out)).toBe(false);
    await settle();
    expect(beats.read('b', 0, 2, out)).toBe(true);
    expect(out.bass).toBe(0.5);
  });
});
