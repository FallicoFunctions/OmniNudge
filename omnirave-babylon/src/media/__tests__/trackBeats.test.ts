import { describe, expect, it, vi } from 'vitest';
import { createStageBeat, createTrackBeats, parseBeats } from '../trackBeats';
import { beatsFile, type Hit } from './beatsFile';

// Bass hits at 1, 1.5 and 2 with a bass note between; a breakdown; the bass
// comes back at 10 and keeps going to 13.5.
const STEADY: Hit[] = [10.5, 11, 11.5, 12, 12.5, 13, 13.5].map((seconds) => [seconds, 1]);
const BASS: Hit[] = [[1, 1], [1.25, 0.5], [1.5, 1], [2, 0.75], [10, 1], [10.1, 0.9], ...STEADY, [20, 1]];
const MIDS: Hit[] = [[1.5, 0.75]];
const HIGHS: Hit[] = [[1.25, 0.5], [1.75, 1]];
// The beats: a bar from 1 s; a bar of five from 3 s (the tracker heard an
// extra beat, so the count holds at 7); and after a gap with no beats, the
// bar at 10 s, which is a drop.
const BEATS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.25, 4.5, 10, 10.5];
const COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9];
const FILE = beatsFile({ bass: BASS, mids: MIDS, highs: HIGHS, beats: BEATS, counts: COUNTS, drops: [9] });

async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loaded() {
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(FILE.slice(), { status: 200 }));
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

  it('gives every beat as a kick, with its bar-aligned count and the bar starts', async () => {
    const { read } = await loaded();
    expect(read(0, 0.5)).toMatchObject({ kick: false, bar: false, kickCount: 0 });
    expect(read(0.9, 1)).toMatchObject({ kick: true, bar: true, kickCount: 0 });
    expect(read(1.2, 1.3)).toMatchObject({ kick: false, bar: false, kickCount: 0 }); // a bass note is not a beat
    expect(read(1.9, 2)).toMatchObject({ kick: true, bar: false, kickCount: 2 });
    expect(read(2.9, 3)).toMatchObject({ kick: true, bar: true, kickCount: 4 });
    // The fifth beat of a bar holds the count; it is not a bar start.
    expect(read(4.4, 4.5)).toMatchObject({ kick: true, bar: false, kickCount: 7 });
    // A player who joins here has the same count as one who heard it all.
    expect(read(7, 7)).toMatchObject({ kick: false, kickCount: 7 });
    expect(read(9.9, 10)).toMatchObject({ kick: true, bar: true, kickCount: 8 });
  });

  it('marks the beats the file names as drops', async () => {
    const { read } = await loaded();
    expect(read(0.9, 1).drop).toBe(false);
    expect(read(9.9, 10)).toMatchObject({ kick: true, drop: true });
    expect(read(10.4, 10.5)).toMatchObject({ kick: true, drop: false });
  });

  it('counts loudness as well as hits: a loud passage with no hits reads half way', async () => {
    // 60 s: the first half loud with no hits, the second loud with steady kicks.
    const power = Array.from({ length: 240 }, (_, block) => (block < 20 ? 0.001 : 0.1));
    const kicks: Hit[] = Array.from({ length: 60 }, (_, k) => [30 + k * 0.5, 1]);
    const fetchImpl = vi.fn(async () => new Response(beatsFile({ bass: kicks, loudness: power }).slice(), { status: 200 }));
    const beats = createTrackBeats({ fetchImpl });
    const out = createStageBeat();
    beats.read('set', 0, 1, out);
    await settle();
    beats.read('set', 15, 15, out);
    expect(out.energy).toBeGreaterThan(0.4);
    expect(out.energy).toBeLessThan(0.6);
  });

  describe('build-ups', () => {
    // A track: full music to 30 s, a quiet break with no hits, then (from
    // `buildFrom`) snares and hats that get denser and louder into a drop at
    // 90 s, and full music again after it. A beat every 0.5 s throughout.
    function track(buildFrom: number | null) {
      const full = (t: number) => t < 30 || t >= 90;
      const rising = (t: number) => buildFrom !== null && t >= buildFrom && t < 90;
      const power = Array.from({ length: 480 }, (_, block) => {
        const t = block * 0.25;
        if (full(t)) return 0.1;
        if (rising(t)) return 0.002 * Math.pow(50, (t - buildFrom!) / (90 - buildFrom!));
        return 0.002;
      });
      const kicks: Hit[] = [];
      for (let t = 0; t < 120; t += 0.5) if (full(t)) kicks.push([t, 1]);
      const snares: Hit[] = [];
      for (let t = 0; t < 120; t += 0.1) {
        if (full(t) && Math.round(t * 10) % 5 === 0) snares.push([t, 0.8]);
        // The roll: a hit every 0.1 s, getting stronger toward the drop.
        else if (rising(t)) snares.push([t, 0.3 + 0.7 * ((t - buildFrom!) / (90 - buildFrom!))]);
      }
      const beats = Array.from({ length: 240 }, (_, i) => i * 0.5);
      return beatsFile({ bass: kicks, mids: snares, loudness: power, beats, drops: [180] });
    }

    async function progressAt(buildFrom: number | null, times: number[]) {
      const fetchImpl = vi.fn(async () => new Response(track(buildFrom).slice(), { status: 200 }));
      const beats = createTrackBeats({ fetchImpl });
      const out = createStageBeat();
      beats.read('set', 0, 1, out);
      await settle();
      return times.map((t) => {
        beats.read('set', t, t, out);
        return out.buildUp;
      });
    }

    it('measures a long build-up from the bottom of the break to the drop', async () => {
      const [inBreak, early, half, late, after] = await progressAt(60, [50, 62, 75, 88, 95]);
      expect(inBreak).toBe(0);
      expect(early).toBeGreaterThan(0);
      expect(early).toBeLessThan(0.2);
      expect(half).toBeGreaterThan(0.35);
      expect(half).toBeLessThan(0.65);
      expect(late).toBeGreaterThan(0.85);
      expect(after).toBe(0); // the drop ends it
    });

    it('measures a short snare roll just as well', async () => {
      const [before, during] = await progressAt(86, [80, 88.5]);
      expect(before).toBe(0);
      expect(during).toBeGreaterThan(0.3);
    });

    it('finds none when the break stays flat up to the drop', async () => {
      const progress = await progressAt(null, [40, 60, 80, 89]);
      expect(progress).toEqual([0, 0, 0, 0]);
    });
  });

  it('runs the lights with the tempo: faster in a faster song, half time doubled, a hole held', () => {
    // 20 s at 176 BPM; 20 s heard at half time (88 BPM); 20 s at 105 BPM;
    // 20 s with a lone beat every 2 s (holes, not a tempo); then no beats.
    const run = (from: number, bpm: number) => Array.from({ length: Math.floor(20 / (60 / bpm)) }, (_, i) => from + i * (60 / bpm));
    const beats = [...run(0, 176), ...run(20, 88), ...run(40, 105), ...run(60, 30)];
    const parsed = parseBeats(beatsFile({ loudness: new Array(400).fill(0.1), beats }))!;
    const { tempoArea, energyArea } = parsed.timeline;
    const factor = (from: number, to: number) => (tempoArea(to) - tempoArea(from)) / (to - from);
    expect(factor(0, 10)).toBeCloseTo(176 / 128, 2);
    expect(factor(25, 35)).toBeCloseTo(176 / 128, 2);
    expect(factor(45, 55)).toBeCloseTo(105 / 128, 2);
    // Through the holes and past the last beat, the last tempo holds.
    expect(factor(65, 75)).toBeCloseTo(105 / 128, 2);
    expect(factor(85, 95)).toBeCloseTo(105 / 128, 2);
    // The energy is weighted by the tempo the same way.
    const energy = parsed.energy.slice(0, 40).reduce((sum, value) => sum + value * 0.25, 0);
    expect(energyArea(10)).toBeCloseTo((energy * 176) / 128, 2);
  });

  it('reads the energy low in a quiet break and high in a loud, busy drop', async () => {
    // 60 s: a quiet break with no hits, then a loud part with steady kicks.
    const power = Array.from({ length: 240 }, (_, block) => (block < 120 ? 0.001 : 0.1));
    const kicks: Hit[] = Array.from({ length: 60 }, (_, k) => [30 + k * 0.5, 1]);
    const hats: Hit[] = Array.from({ length: 120 }, (_, k) => [30 + k * 0.25, 0.6]);
    const fetchImpl = vi.fn(async () => new Response(beatsFile({ bass: kicks, highs: hats, loudness: power }).slice(), { status: 200 }));
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
    expect(parseBeats(FILE.slice(0, FILE.length - 1))).toBeNull(); // shorter than its counts say
    expect(parseBeats(new Uint8Array(3))).toBeNull();
    // Earlier formats ("OMBT", "OMB2", "OMB3"): refused, not misread.
    for (const tag of [84, 50, 51]) {
      expect(parseBeats(Uint8Array.from([79, 77, 66, tag, ...new Array(24).fill(0)]))).toBeNull();
    }
    expect(parseBeats(beatsFile())?.kickSeconds.length).toBe(0);
  });

  it('loads the list of the new track when the track changes', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      new Response(beatsFile({ bass: String(url).includes('b.beats') ? [[1, 0.5]] : [[1, 1]] }).slice(), { status: 200 }));
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
