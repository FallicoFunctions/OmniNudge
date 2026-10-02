import { describe, expect, it } from 'vitest';
import { buildUpAt, createShowTimeline, inWindows, windowSum, type ShowPhrase } from '../showTimeline';

const STEP = 0.25;
const steady = (seconds: number, value: number) => Float32Array.from({ length: seconds / STEP }, () => value);
const kicksEvery = (from: number, to: number, gap: number) =>
  Float32Array.from({ length: Math.round((to - from) / gap) }, (_, i) => from + i * gap);
const none = new Float32Array();
const phrase = (): ShowPhrase => ({ index: 0, since: 0 });

describe('createShowTimeline', () => {
  it('integrates the energy and the build-up ramp from the track start', () => {
    // Energy 0.5 for 10 s, 1 for 10 s; a build-up from 12 s into a drop at 16 s.
    const energy = Float32Array.from([...steady(10, 0.5), ...steady(10, 1)]);
    const timeline = createShowTimeline(none, energy, STEP, Float32Array.of(12), Float32Array.of(16));
    expect(timeline.energyArea(0)).toBe(0);
    expect(timeline.energyArea(4)).toBeCloseTo(2, 6);
    expect(timeline.energyArea(14)).toBeCloseTo(5 + 4, 6);
    expect(timeline.rampArea(12)).toBe(0);
    // buildUp^1.5 summed per step over 12..16 s: a quarter-step sum of (k/16)^1.5.
    let ramp = 0;
    for (let k = 0; k < 16; k += 1) ramp += (k / 16) ** 1.5 * STEP;
    expect(timeline.rampArea(16)).toBeCloseTo(ramp, 6);
    expect(timeline.energyRampArea(16)).toBeCloseTo(ramp, 6); // energy 1 there
    expect(timeline.rampArea(19)).toBeCloseTo(ramp, 6); // after the drop: no ramp
  });

  it('ends a phrase n counts on, not before the shortest hold, and after the longest hold without kicks', () => {
    // Kicks every 0.5 s for 10 s (each its own count), then a 30 s break.
    const kicks = kicksEvery(0.5, 10.5, 0.5);
    const timeline = createShowTimeline(kicks, steady(40, 0.5), STEP, none, none);
    // Four counts per phrase: from count 0 (0.5 s) to count 4 (2.5 s), 6.5, ...
    expect(timeline.phrase(2.4, 4, 0, 12, phrase())).toEqual({ index: 0, since: 2.4 });
    expect(timeline.phrase(2.5, 4, 0, 12, phrase()).index).toBe(1);
    expect(timeline.phrase(9.9, 4, 0, 12, phrase()).index).toBe(4);
    // In the break: a new phrase every 12 s after the last kick phrase (8.5 s).
    expect(timeline.phrase(20.4, 4, 0, 12, phrase()).index).toBe(4);
    expect(timeline.phrase(20.5, 4, 0, 12, phrase())).toEqual({ index: 5, since: 0 });
    // Two kicks per phrase but at least 3 s: phrases at 3, 6, 9 s.
    const held = createShowTimeline(kicks, steady(40, 0.5), STEP, none, none);
    expect(held.phrase(2.9, 2, 3, 12, phrase()).index).toBe(0);
    expect(held.phrase(3, 2, 3, 12, phrase()).index).toBe(1);
    expect(held.phrase(6, 2, 3, 12, phrase()).index).toBe(2);
  });

  it('keeps phrases on the bar starts through a bar the tracker heard as five beats', () => {
    // Bars of four at 0.5 s a beat; the second bar has an extra beat at 3.25 s.
    const kicks = Float32Array.of(0, 0.5, 1, 1.5, 2, 2.5, 3, 3.25, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8);
    const counts = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const timeline = createShowTimeline(kicks, steady(10, 0.5), STEP, none, none, counts);
    // Two bars a phrase: at the bar starts 4 s (count 8) and 8 s (count 16),
    // not at the 9th beat (3.5 s).
    expect([3.5, 3.9, 4, 7.9, 8].map((t) => timeline.phrase(t, 8, 0, 12, phrase()).index)).toEqual([0, 0, 1, 1, 2]);
  });

  it('runs the palette clock with the track and jumps it to the next crossfade on bar starts, with a cooldown', () => {
    // Bar starts at 1, 2 (inside the cooldown) and 5 s; a beat at 4 s that
    // does not start a bar.
    const timeline = createShowTimeline(Float32Array.of(1, 2, 4, 5), steady(30, 0.5), STEP, none, none,
      Float32Array.of(0, 4, 5, 8));
    expect(timeline.paletteClock(0.5, 22, 2, 3)).toBe(0.5);
    // The kick at 1 s moves the clock to the start of the first crossfade (20.01 s).
    expect(timeline.paletteClock(1, 22, 2, 3)).toBeCloseTo(20.01, 6);
    expect(timeline.paletteClock(3, 22, 2, 3)).toBeCloseTo(22.01, 6); // the kick at 2 s is in the cooldown
    // At 5 s the clock (24.01) jumps to the next crossfade, 42.01.
    expect(timeline.paletteClock(5, 22, 2, 3)).toBeCloseTo(42.01, 6);
    expect(timeline.paletteClock(6, 22, 2, 3)).toBeCloseTo(43.01, 6);
  });

  it('gives the kicks as a beat position', () => {
    const timeline = createShowTimeline(Float32Array.of(1, 1.5, 2), steady(5, 0.5), STEP, none, none);
    expect(timeline.beatPosition(0.5)).toBe(0);
    expect(timeline.beatPosition(1)).toBe(0);
    expect(timeline.beatPosition(1.25)).toBeCloseTo(0.5, 6);
    expect(timeline.beatPosition(1.5)).toBe(1);
    expect(timeline.beatPosition(4)).toBe(2);
  });

  it('answers the same for a moment whatever was asked before it', () => {
    const kicks = kicksEvery(0.47, 120, 0.47);
    const energy = Float32Array.from({ length: 480 }, (_, i) => 0.5 + 0.5 * Math.sin(i / 30));
    const first = createShowTimeline(kicks, energy, STEP, Float32Array.of(50), Float32Array.of(60));
    const second = createShowTimeline(kicks, energy, STEP, Float32Array.of(50), Float32Array.of(60));
    for (let t = 0; t < 100; t += 0.016) first.phrase(t, 16, 0, 12, phrase());
    const read = (timeline: typeof first) => [timeline.phrase(99.3, 16, 0, 12, phrase()), timeline.paletteClock(99.3, 22, 2, 3),
      timeline.energyArea(99.3), timeline.rampArea(99.3), timeline.beatPosition(99.3)];
    expect(read(second)).toEqual(read(first));
  });
});

describe('the scheduled event windows', () => {
  it('sums a part over the windows up to a moment, and finds the moment inside one', () => {
    const windows = Float64Array.of(-5, 10, 20, 30);
    expect(windowSum(windows, 25, (from, to) => to - from)).toBe(10 + 5);
    expect(windowSum(windows, 100, (from, to) => to - from)).toBe(10 + 10);
    expect(inWindows(windows, 20)).toBe(true);
    expect(inWindows(windows, 30)).toBe(false);
  });

  it('shortens the longest phrase hold inside a show window', () => {
    // No kicks: phrases every 12 s, but every 5 s inside the show at 30-50 s.
    // The phrase from 45 s outlasts the show and ends at the ordinary 12 s.
    const timeline = createShowTimeline(none, steady(80, 0.5), STEP, none, none);
    const show = Float64Array.of(30, 50);
    const starts = [0, 12, 24, 30, 35, 40, 45, 56.9, 57].map((t) => timeline.phrase(t, 4, 0, 12, phrase(), show, 5).index);
    expect(starts).toEqual([0, 1, 2, 3, 4, 5, 6, 6, 7]);
    // Without the window: the ordinary 12 s phrases.
    expect(timeline.phrase(40, 4, 0, 12, phrase()).index).toBe(3);
  });

  it('jumps the palette at the start of a show whatever the kick cooldown', () => {
    const timeline = createShowTimeline(Float32Array.of(1), steady(30, 0.5), STEP, none, none);
    // The kick at 1 s jumps to 20.01; at 3.5 s (22.51, inside the kick's
    // cooldown) the show starts and jumps on to the next crossfade, 42.01.
    expect(timeline.paletteClock(4, 22, 2, 3)).toBeCloseTo(23.01, 6);
    expect(timeline.paletteClock(4, 22, 2, 3, Float64Array.of(3.5))).toBeCloseTo(42.51, 6);
  });
});

describe('buildUpAt', () => {
  it('is the progress through a build-up, 0 outside one', () => {
    expect(buildUpAt(Float32Array.of(12), Float32Array.of(16), 11)).toBe(0);
    expect(buildUpAt(Float32Array.of(12), Float32Array.of(16), 14)).toBe(0.5);
    expect(buildUpAt(Float32Array.of(12), Float32Array.of(16), 16)).toBe(0);
  });
});
