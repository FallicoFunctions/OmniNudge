import { describe, expect, it, vi } from 'vitest';
import { createTrackBeats, parseBeats } from '../trackBeats';

function beatsFile(hits: Array<[number, number]>): Uint8Array {
  const bytes = new Uint8Array(8 + hits.length * 8);
  bytes.set([79, 77, 66, 84]); // "OMBT"
  const view = new DataView(bytes.buffer);
  view.setUint32(4, hits.length, true);
  hits.forEach(([seconds, strength], i) => {
    view.setFloat32(8 + i * 8, seconds, true);
    view.setFloat32(12 + i * 8, strength, true);
  });
  return bytes;
}

const HITS: Array<[number, number]> = [[1, 1], [1.25, 0.5], [1.5, 1], [2, 0.75]];

async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createTrackBeats', () => {
  it('reports the strongest hit after the start of the window and up to its end', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => new Response(beatsFile(HITS).slice(), { status: 200 }));
    const beats = createTrackBeats({ fetchImpl, urlFor: (id) => `/audio/${id}.beats` });

    expect(beats.strongestBetween('set', 0, 1)).toBeNull(); // not downloaded yet
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('/audio/set.beats');

    expect(beats.strongestBetween('set', 0.9, 1)).toBe(1); // a hit exactly at the end counts
    expect(beats.strongestBetween('set', 1, 1.1)).toBe(0); // and is not counted again
    expect(beats.strongestBetween('set', 1.1, 1.3)).toBe(0.5);
    expect(beats.strongestBetween('set', 1.1, 2)).toBe(1); // strongest of three
    expect(beats.strongestBetween('set', 2, 50)).toBe(0); // after the last hit
    expect(beats.strongestBetween('set', 5, 5)).toBe(0); // empty window
  });

  it('gives null, and stops asking, for a track with no beats file', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    let now = 0;
    const beats = createTrackBeats({ fetchImpl, now: () => now });
    beats.strongestBetween('none', 0, 1);
    await settle();
    now += 10 * 60_000;
    expect(beats.strongestBetween('none', 0, 1)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a file that is not a beat list', () => {
    expect(parseBeats(new TextEncoder().encode('<!doctype html><html>'))).toBeNull();
    expect(parseBeats(beatsFile(HITS).slice(0, 20))).toBeNull(); // shorter than its count says
    expect(parseBeats(new Uint8Array(3))).toBeNull();
    expect(parseBeats(beatsFile([]))?.seconds.length).toBe(0);
  });

  it('loads the list of the new track when the track changes', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      new Response(beatsFile(String(url).includes('b.beats') ? [[1, 0.5]] : [[1, 1]]).slice(), { status: 200 }));
    const beats = createTrackBeats({ fetchImpl, urlFor: (id) => `/${id}.beats` });
    beats.strongestBetween('a', 0, 2);
    await settle();
    expect(beats.strongestBetween('a', 0, 2)).toBe(1);
    expect(beats.strongestBetween('b', 0, 2)).toBeNull();
    await settle();
    expect(beats.strongestBetween('b', 0, 2)).toBe(0.5);
  });
});
