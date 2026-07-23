// Rave palette system for the immersive audio show.
//
// A pure, allocation-conscious module: an ordered set of saturated palettes
// drawn from real festival laser shows, plus helpers to sample a palette as a
// cyclic gradient and to compute the current cross-faded palette pair over
// time. The show cycles the active palette (~22s each) with a smooth
// crossfade (~2s), keeping the whole venue color-coherent while still varying
// across a track. Every stop channel is a saturated 0..1 float; sampling is
// guaranteed to stay in range so downstream color buffers never go negative.

export interface RaveColor {
  r: number;
  g: number;
  b: number;
}

export interface RavePalette {
  readonly name: string;
  // Ordered stops sampled as a CYCLIC gradient (stop N wraps back to stop 0),
  // so palette rotation never hits a hard seam.
  readonly stops: readonly RaveColor[];
}

// Four palettes pulled from real festival looks. Deliberately NOT the old
// fixed magenta+cyan pair: each palette commits to a hue family so the venue
// reads coherently, and the four families together span the spectrum.
export const RAVE_PALETTES: readonly RavePalette[] = [
  {
    // Deep red -> orange -> amber -> gold-white. Classic warm pyro laser wall.
    name: 'inferno',
    stops: [
      { r: 0.5, g: 0.02, b: 0.0 },
      { r: 1.0, g: 0.22, b: 0.0 },
      { r: 1.0, g: 0.55, b: 0.05 },
      { r: 1.0, g: 0.9, b: 0.6 },
    ],
  },
  {
    // Emerald -> green -> lime -> white. Cool jungle/liquid look.
    name: 'emerald',
    stops: [
      { r: 0.0, g: 0.5, b: 0.22 },
      { r: 0.1, g: 0.9, b: 0.2 },
      { r: 0.6, g: 1.0, b: 0.12 },
      { r: 0.85, g: 1.0, b: 0.85 },
    ],
  },
  {
    // Deep blue -> blue -> cyan -> white. Big-room electric.
    name: 'electric',
    stops: [
      { r: 0.02, g: 0.1, b: 0.7 },
      { r: 0.0, g: 0.35, b: 1.0 },
      { r: 0.1, g: 0.85, b: 1.0 },
      { r: 0.8, g: 0.97, b: 1.0 },
    ],
  },
  {
    // Deep violet -> purple -> hot magenta -> white-pink. Peak-time laser.
    name: 'violet',
    stops: [
      { r: 0.25, g: 0.0, b: 0.6 },
      { r: 0.5, g: 0.05, b: 0.9 },
      { r: 1.0, g: 0.05, b: 0.7 },
      { r: 1.0, g: 0.7, b: 0.95 },
    ],
  },
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fract(v: number): number {
  return v - Math.floor(v);
}

// Sample a palette as a CYCLIC gradient at position (t01 + phase), wrapped into
// [0,1). phase lets the show slowly rotate the sampling window over time so a
// single palette still drifts. Writes into `out` (preallocated by the caller)
// to keep hot paths allocation-free, and also returns it. Output stays 0..1.
export function resolvePaletteColor(
  palette: RavePalette,
  t01: number,
  phase: number,
  out: RaveColor = { r: 0, g: 0, b: 0 },
): RaveColor {
  const stops = palette.stops;
  const n = stops.length;
  if (n === 0) {
    out.r = 0;
    out.g = 0;
    out.b = 0;
    return out;
  }
  if (n === 1) {
    out.r = clamp01(stops[0].r);
    out.g = clamp01(stops[0].g);
    out.b = clamp01(stops[0].b);
    return out;
  }
  const u = fract(t01 + phase); // 0..1
  const seg = u * n; // 0..n
  const i = Math.floor(seg) % n;
  const next = (i + 1) % n;
  const f = seg - Math.floor(seg); // 0..1 within the segment
  const a = stops[i];
  const b = stops[next];
  out.r = clamp01(a.r + (b.r - a.r) * f);
  out.g = clamp01(a.g + (b.g - a.g) * f);
  out.b = clamp01(a.b + (b.b - a.b) * f);
  return out;
}

export interface PaletteCrossfade {
  // Index of the palette currently fading OUT (steady when mix===0).
  fromIndex: number;
  // Index of the palette fading IN.
  toIndex: number;
  // 0 = fully `from`, 1 = fully `to`. Stays 0 for most of a cycle, then ramps
  // 0->1 over the crossfade window at the end of each cycle.
  mix: number;
}

// Given an accumulated palette clock, decide which two palettes are active and
// how far the crossfade between them has progressed. Pure so the show's color
// timeline is unit-testable. `paletteCount` wraps the indices.
//
// Timeline per cycle of length `cycleSeconds`: the last `crossfadeSeconds`
// blend into the next palette; the rest holds steady (mix 0).
export function paletteCrossfade(
  clockSeconds: number,
  cycleSeconds: number,
  crossfadeSeconds: number,
  paletteCount: number,
): PaletteCrossfade {
  const count = paletteCount > 0 ? paletteCount : 1;
  const cycle = cycleSeconds > 0 ? cycleSeconds : 1;
  const fade = Math.min(Math.max(0, crossfadeSeconds), cycle);
  const clock = clockSeconds < 0 ? 0 : clockSeconds;
  const cycleIndex = Math.floor(clock / cycle);
  const within = clock - cycleIndex * cycle; // 0..cycle
  const fromIndex = ((cycleIndex % count) + count) % count;
  const toIndex = (fromIndex + 1) % count;
  let mix = 0;
  if (fade > 0 && within > cycle - fade) {
    mix = (within - (cycle - fade)) / fade; // 0..1
  }
  return { fromIndex, toIndex, mix: clamp01(mix) };
}
