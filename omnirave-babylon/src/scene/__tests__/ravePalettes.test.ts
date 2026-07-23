import { describe, expect, it } from 'vitest';

import { RAVE_PALETTES, paletteCrossfade, resolvePaletteColor } from '../ravePalettes';

describe('ravePalettes', () => {
  it('exposes the four named festival palettes, each with multiple saturated stops', () => {
    const names = RAVE_PALETTES.map((p) => p.name);
    expect(names).toEqual(['inferno', 'emerald', 'electric', 'violet']);
    for (const palette of RAVE_PALETTES) {
      expect(palette.stops.length).toBeGreaterThanOrEqual(3);
      for (const stop of palette.stops) {
        for (const channel of [stop.r, stop.g, stop.b]) {
          expect(Number.isFinite(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('resolvePaletteColor stays in 0..1 for arbitrary t and phase', () => {
    const palette = RAVE_PALETTES[0];
    for (const t of [-2.3, 0, 0.37, 0.5, 1, 4.9]) {
      for (const phase of [-1.1, 0, 0.6, 3.3]) {
        const c = resolvePaletteColor(palette, t, phase);
        for (const channel of [c.r, c.g, c.b]) {
          expect(Number.isFinite(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('resolvePaletteColor writes into a provided out object without allocating', () => {
    const out = { r: 0, g: 0, b: 0 };
    const returned = resolvePaletteColor(RAVE_PALETTES[2], 0.4, 0.1, out);
    expect(returned).toBe(out);
    expect(out.r + out.g + out.b).toBeGreaterThan(0);
  });

  it('resolvePaletteColor moves through the palette as t sweeps', () => {
    const palette = RAVE_PALETTES[3];
    const a = resolvePaletteColor(palette, 0.0, 0);
    const b = resolvePaletteColor(palette, 0.5, 0);
    const delta = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    expect(delta).toBeGreaterThan(0.05);
  });

  it('paletteCrossfade holds steady mid-cycle and ramps 0..1 across the fade window', () => {
    const cycle = 22;
    const fade = 2;
    const count = RAVE_PALETTES.length;

    // Start of a cycle: fully on the from-palette, no crossfade.
    const start = paletteCrossfade(0, cycle, fade, count);
    expect(start.fromIndex).toBe(0);
    expect(start.toIndex).toBe(1);
    expect(start.mix).toBe(0);

    // Mid-cycle (well before the fade window): still steady.
    expect(paletteCrossfade(10, cycle, fade, count).mix).toBe(0);

    // Just inside the fade window: mix begins climbing.
    const early = paletteCrossfade(cycle - fade + 0.5, cycle, fade, count).mix;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(1);

    // End of the fade window: fully on the to-palette.
    const end = paletteCrossfade(cycle - 0.0001, cycle, fade, count).mix;
    expect(end).toBeGreaterThan(0.99);
  });

  it('paletteCrossfade advances and wraps the palette indices across cycles', () => {
    const cycle = 22;
    const count = RAVE_PALETTES.length;
    expect(paletteCrossfade(cycle * 1 + 1, cycle, 2, count).fromIndex).toBe(1);
    expect(paletteCrossfade(cycle * count + 1, cycle, 2, count).fromIndex).toBe(0);
  });
});
