import { Mesh, MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createStageBeat, createTrackBeats, type StageBeat } from '../../media/trackBeats';
import { inWindows, type ShowEventWindows } from '../../media/showTimeline';
import { createImmersiveAudioShow } from '../createImmersiveAudioShow';
import { createCrownEffects } from '../createCrownEffects';
import { createCascadeCourtLightFloor } from '../createCascadeCourtLightFloor';
import { createHologramGrid } from '../createHologramGrid';

// Player-flagged 2026-09-30: two players at the same moment of the same track
// saw different laser colours, patterns and angles, because each effect built
// its state from the moment its own page loaded. Here two players join the
// same track 40 s apart, at different frame rates, through the real beat
// reader, and must see the same show.

type Hit = [seconds: number, strength: number];

function beatsFile(bass: Hit[], mids: Hit[], highs: Hit[], loudness: number[]): Uint8Array {
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

// 240 s: a drop to 60 s, a break to 100 s, a rising build-up to the drop at
// 128 s, and a drop to the end.
const BEAT = 0.47;
const inDrop = (t: number) => t < 60 || t >= 128;
const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) }, (_, i) => from + i * step);
const TRACK = beatsFile(
  range(0.2, 240, BEAT).filter(inDrop).map((t) => [t, 1]),
  [...range(100, 128, BEAT).map((t): Hit => [t, 0.3 + 0.7 * (t - 100) / 28]), ...range(0.2 + BEAT / 2, 240, BEAT * 2).filter(inDrop).map((t): Hit => [t, 0.8])],
  range(0.1, 240, BEAT / 2).map((t) => [t, inDrop(t) ? 0.6 : 0.2]),
  range(0, 240, 0.25).map((t) => (inDrop(t) ? 1 : t >= 100 ? 0.05 + 0.95 * (t - 100) / 28 : 0.05)),
);
// The precomputed spectrum is a function of the track position as well.
const spectrumAt = (t: number) => (target: Uint8Array) => target.fill(inDrop(t) ? 200 : 60);

async function trackReader() {
  const beats = createTrackBeats({ fetchImpl: async () => new Response(TRACK.slice(), { status: 200 }) });
  beats.read('track', 0, 0, createStageBeat());
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  return beats;
}

interface Snapshot {
  colour: number[];
  beams: Float32Array;
  cones: number[];
  tracery: Float32Array;
  pulse: number;
  floor: Float32Array;
  hologram: (string | number)[];
}

let engine: NullEngine | undefined;
afterEach(() => engine?.dispose());

// A fireworks lead-in at 120-130 s and a show from 130 s, in track seconds,
// as the runtime places the server's schedule.
const show = (activeEnd: number): ShowEventWindows => ({
  leadIns: Float64Array.of(120, 130), actives: Float64Array.of(130, activeEnd), activeStarts: Float64Array.of(130),
});

// One player from `joinAt` at `fps`, returning the show at each sample time.
// With `events` the effects also get the event phase each frame, as the
// runtime sets it from the schedule.
async function player(joinAt: number, fps: number, samples: number[], useTimeline = true,
  events: ShowEventWindows | null = null): Promise<Snapshot[]> {
  engine ??= new NullEngine();
  const scene = new Scene(engine);
  MeshBuilder.CreatePlane('main-stage-hero-screen-panel-l', { size: 1 }, scene);
  const beats = await trackReader();
  const beat = createStageBeat();
  let now = joinAt;
  let readFrom = now;
  let known = false;
  const getBeat = (): StageBeat | null => (known ? beat : null);
  const getShowSeconds = () => (useTimeline ? now : undefined);
  let spectrum = spectrumAt(now);
  const getFrequencyData = (target: Uint8Array) => spectrum(target);
  const options = { getFrequencyData, getBeat, getShowSeconds };
  const lasers = createImmersiveAudioShow(scene, options);
  const crown = createCrownEffects(scene, options);
  const floor = createCascadeCourtLightFloor(scene, options);
  const hologram = createHologramGrid(scene, options);
  const snapshots: Snapshot[] = [];
  const end = samples[samples.length - 1];
  let phase = '';
  for (let frame = 1; joinAt + frame / fps <= end + 1e-9; frame += 1) {
    now = joinAt + frame / fps;
    spectrum = spectrumAt(now);
    known = beats.read('track', readFrom, now, beat);
    readFrom = now;
    if (!useTimeline) beat.timeline = null;
    beat.events = events;
    if (events) {
      const state = inWindows(events.actives, now) ? { phase: 'active', activeMinute: Math.floor((now - events.actives[0]) / 60) + 1 }
        : inWindows(events.leadIns, now) ? { phase: 'lead_in', countdownSeconds: Math.ceil(events.leadIns[1] - now) } : { phase: 'none' };
      const key = JSON.stringify(state);
      if (key !== phase) {
        phase = key;
        for (const effect of [lasers, crown, floor, hologram]) effect.setEventState(state);
      }
    }
    lasers.update(1 / fps);
    crown.update(1 / fps);
    floor.update(1 / fps);
    hologram.update(1 / fps);
    if (samples.some((sample) => Math.abs(sample - now) < 1e-6)) {
      snapshots.push({
        colour: [lasers.currentColorR, lasers.currentColorG, lasers.currentColorB],
        beams: Float32Array.from((scene.getMeshByName('immersive-laser-beam') as Mesh)._thinInstanceDataStorage.matrixData!),
        // Each cone turns on its mount: the aim across (z) and up (x).
        cones: Array.from({ length: lasers.beams }, (_, i) => scene.getTransformNodeByName(`immersive-beam-mount-${i}`)!.rotation)
          .flatMap((rotation) => [rotation.x, rotation.z]),
        tracery: Float32Array.from((scene.getMeshByName('crown-fx-tracery') as Mesh)._userThinInstanceBuffersStorage.data.instanceColor),
        pulse: crown.pulsePosition,
        floor: Float32Array.from((scene.getMeshByName('cascade-court-light-floor') as Mesh)._userThinInstanceBuffersStorage.data.instanceColor),
        hologram: [hologram.currentShape, hologram.previousShape, hologram.morphProgress, hologram.peakColorR, hologram.peakColorG, hologram.peakColorB],
      });
    }
  }
  lasers.dispose(); crown.dispose(); floor.dispose(); hologram.dispose(); beats.dispose(); scene.dispose();
  return snapshots;
}

// The largest angle, in radians, between the same beam's direction (the
// matrix's scaled length axis) for the two players.
const largestBeamAngle = (a: Float32Array, b: Float32Array) => {
  let largest = 0;
  for (let o = 0; o < a.length; o += 16) {
    const la = Math.hypot(a[o], a[o + 1], a[o + 2]);
    const lb = Math.hypot(b[o], b[o + 1], b[o + 2]);
    const cosine = (a[o] * b[o] + a[o + 1] * b[o + 1] + a[o + 2] * b[o + 2]) / (la * lb);
    largest = Math.max(largest, Math.acos(Math.min(1, Math.max(-1, cosine))));
  }
  return largest;
};

const meanDifference = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};

const largestDifference = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let largest = 0;
  for (let i = 0; i < a.length; i += 1) largest = Math.max(largest, Math.abs(a[i] - b[i]));
  return largest;
};

describe('the shared show clock', () => {
  const SAMPLES = [225, 230, 235, 240];

  it('shows the same show to players who joined 40 s apart', async () => {
    const early = await player(160, 60, SAMPLES);
    const late = await player(200, 60, SAMPLES);
    expect(late).toHaveLength(SAMPLES.length);
    for (let s = 0; s < SAMPLES.length; s += 1) {
      const a = early[s];
      const b = late[s];
      expect(largestDifference(a.colour, b.colour)).toBeLessThan(1e-6);
      expect(largestBeamAngle(a.beams, b.beams)).toBeLessThan(1e-4);
      expect(largestDifference(a.cones, b.cones)).toBeLessThan(1e-4);
      expect(largestDifference(a.tracery, b.tracery)).toBeLessThan(1e-4);
      expect(largestDifference(a.floor, b.floor)).toBeLessThan(1e-4);
      expect(b.hologram.slice(0, 3)).toEqual(a.hologram.slice(0, 3));
      expect(largestDifference(b.hologram.slice(3) as number[], a.hologram.slice(3) as number[])).toBeLessThan(1e-4);
    }
  }, 120_000);

  it('shows the same colours, patterns and formations at another frame rate', async () => {
    const early = await player(160, 60, SAMPLES);
    const late = await player(200, 24, SAMPLES);
    for (let s = 0; s < SAMPLES.length; s += 1) {
      const a = early[s];
      const b = late[s];
      expect(largestDifference(a.colour, b.colour)).toBeLessThan(1e-6);
      // The kick accent lands in another frame: well under a degree.
      expect(largestBeamAngle(a.beams, b.beams)).toBeLessThan(0.01);
      expect(largestDifference(a.cones, b.cones)).toBeLessThan(0.02);
      // Short kick pulses are sampled once per frame, so a brightness peak
      // differs a little with the frame rate; the colours and places do not.
      expect(largestDifference(a.tracery, b.tracery)).toBeLessThan(0.05);
      expect(meanDifference(a.floor, b.floor)).toBeLessThan(0.05);
      expect(b.hologram.slice(0, 3)).toEqual(a.hologram.slice(0, 3));
    }
  }, 120_000);

  it('shows the same show to a player who joined after a fireworks show earlier in the track', async () => {
    const early = await player(100, 60, SAMPLES, true, show(170));
    const late = await player(200, 60, SAMPLES, true, show(170));
    for (let s = 0; s < SAMPLES.length; s += 1) {
      expect(largestDifference(early[s].colour, late[s].colour)).toBeLessThan(1e-6);
      expect(largestBeamAngle(early[s].beams, late[s].beams)).toBeLessThan(1e-4);
      expect(largestDifference(early[s].cones, late[s].cones)).toBeLessThan(1e-4);
      expect(largestDifference(early[s].tracery, late[s].tracery)).toBeLessThan(1e-4);
      expect(late[s].hologram.slice(0, 3)).toEqual(early[s].hologram.slice(0, 3));
    }
  }, 120_000);

  it('shows the same fireworks show to a player who joined in the middle of it, with its own speeds', async () => {
    const early = await player(100, 60, SAMPLES, true, show(400));
    const late = await player(200, 60, SAMPLES, true, show(400));
    const withoutShow = await player(200, 60, SAMPLES, true, null);
    for (let s = 0; s < SAMPLES.length; s += 1) {
      expect(largestDifference(early[s].colour, late[s].colour)).toBeLessThan(1e-6);
      expect(largestBeamAngle(early[s].beams, late[s].beams)).toBeLessThan(1e-4);
      expect(largestDifference(early[s].cones, late[s].cones)).toBeLessThan(1e-4);
      expect(largestDifference(early[s].tracery, late[s].tracery)).toBeLessThan(1e-4);
      expect(Math.abs(early[s].pulse - late[s].pulse)).toBeLessThan(1e-6);
      expect(late[s].hologram.slice(0, 3)).toEqual(early[s].hologram.slice(0, 3));
    }
    // The show's own laser, cone and spire speeds are in: without the show
    // windows the same moment looks different.
    expect(Math.max(...SAMPLES.map((_, s) => largestBeamAngle(late[s].beams, withoutShow[s].beams)))).toBeGreaterThan(0.2);
    expect(Math.max(...SAMPLES.map((_, s) => largestDifference(late[s].cones, withoutShow[s].cones)))).toBeGreaterThan(0.1);
    expect(Math.max(...SAMPLES.map((_, s) => Math.abs(late[s].pulse - withoutShow[s].pulse)))).toBeGreaterThan(0.05);
    // The show's shorter hologram holds.
    expect(SAMPLES.some((_, s) => late[s].hologram[0] !== withoutShow[s].hologram[0] || late[s].hologram[2] !== withoutShow[s].hologram[2])).toBe(true);
  }, 120_000);

  it('without the timeline the same two players see different lasers (the reported fault)', async () => {
    const early = await player(160, 60, SAMPLES, false);
    const late = await player(200, 24, SAMPLES, false);
    const beamAngle = Math.max(...SAMPLES.map((_, s) => largestBeamAngle(early[s].beams, late[s].beams)));
    expect(beamAngle).toBeGreaterThan(0.2);
  }, 120_000);
});
