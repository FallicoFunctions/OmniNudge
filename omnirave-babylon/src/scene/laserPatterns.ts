// Laser pattern library for the immersive audio show.
//
// Pure, allocation-light functions that shape a DENSE fan/curtain of beams per
// emitter. Each pattern maps (emitterIndex, beamIndex, beamCount, phase,
// energy) to a small angular OFFSET (yaw, pitch) applied on top of the
// emitter's own physical aim. Keeping them offsets (not absolute directions)
// lets the same pattern read correctly whether the emitter fires up from the
// crown, across from a side wing, or down from the truss.
//
// The show switches the active pattern on a musical-phrase counter so the
// motion never settles into one endless sine, and layers low-amplitude value
// noise (organicDrift) on top so nothing is mechanically periodic.

export interface LaserOffset {
  // Azimuth offset (radians) around the emitter's aim.
  yaw: number;
  // Elevation offset (radians); positive lifts the beam upward.
  pitch: number;
}

export type LaserPatternFn = (
  emitterIndex: number,
  beamIndex: number,
  beamCount: number,
  phase: number,
  energy: number,
) => LaserOffset;

// Normalized beam position across a fan: 0..1, and centered -0.5..0.5.
function frac(beamIndex: number, beamCount: number): number {
  return beamCount > 1 ? beamIndex / (beamCount - 1) : 0.5;
}

// fan-radiate: a single wide fan that gently sweeps side to side. The bread and
// butter dense curtain.
const fanRadiate: LaserPatternFn = (emitterIndex, beamIndex, beamCount, phase, energy) => {
  const c = frac(beamIndex, beamCount) - 0.5; // -0.5..0.5
  const width = 1.5 + 0.4 * energy;
  return {
    yaw: c * width + 0.22 * Math.sin(phase + emitterIndex * 0.6),
    pitch: 0.12 * Math.sin(phase * 0.7 + beamIndex * 0.11),
  };
};

// sky-shafts: near-vertical shafts fanned narrowly, pushed strongly upward.
// Reads as columns of light climbing out of the emitter (crown especially).
const skyShafts: LaserPatternFn = (emitterIndex, beamIndex, beamCount, phase) => {
  const c = frac(beamIndex, beamCount) - 0.5;
  return {
    yaw: c * 0.5,
    pitch: 1.0 + 0.18 * Math.sin(phase + emitterIndex + beamIndex * 0.05),
  };
};

// cross-hatch: two interleaved fans opening in opposite directions so the
// beams visibly cross overhead.
const crossHatch: LaserPatternFn = (emitterIndex, beamIndex, beamCount, phase, energy) => {
  const c = frac(beamIndex, beamCount) - 0.5;
  const side = beamIndex % 2 === 0 ? 1 : -1;
  const spread = 0.25 + Math.abs(c) * (1.3 + 0.3 * energy);
  return {
    yaw: side * spread + 0.15 * Math.sin(phase + emitterIndex),
    pitch: 0.18 * Math.sin(phase * 0.9 + side),
  };
};

// mandala: beams distributed around a full circle, forming a rotating cone /
// flower that turns with the phrase.
const mandala: LaserPatternFn = (emitterIndex, beamIndex, beamCount, phase, energy) => {
  const ang = (beamIndex / Math.max(1, beamCount)) * Math.PI * 2 + phase + emitterIndex * 0.4;
  const radius = 0.5 + 0.35 * energy;
  return {
    yaw: radius * Math.cos(ang),
    pitch: radius * Math.sin(ang),
  };
};

// converging-cone: a fan that pulses open and converges toward a point,
// breathing with the phrase.
const convergingCone: LaserPatternFn = (emitterIndex, beamIndex, beamCount, phase) => {
  const c = frac(beamIndex, beamCount) - 0.5;
  const pulse = 0.5 + 0.5 * Math.sin(phase + emitterIndex * 0.3); // 0..1
  return {
    yaw: c * (0.2 + 1.5 * pulse),
    pitch: 0.1 + c * 0.3 * (1 - pulse),
  };
};

export interface NamedLaserPattern {
  readonly name: string;
  readonly fn: LaserPatternFn;
}

export const LASER_PATTERNS: readonly NamedLaserPattern[] = [
  { name: 'fan-radiate', fn: fanRadiate },
  { name: 'sky-shafts', fn: skyShafts },
  { name: 'cross-hatch', fn: crossHatch },
  { name: 'mandala', fn: mandala },
  { name: 'converging-cone', fn: convergingCone },
];

// Wrap a (possibly negative or out-of-range) phrase index onto the library.
export function selectPattern(phraseIndex: number): NamedLaserPattern {
  const n = LASER_PATTERNS.length;
  const i = ((Math.trunc(phraseIndex) % n) + n) % n;
  return LASER_PATTERNS[i];
}

// Next phrase in the rotation (used when a musical phrase boundary fires).
export function nextPhraseIndex(current: number): number {
  const n = LASER_PATTERNS.length;
  return (((Math.trunc(current) + 1) % n) + n) % n;
}

// Monotonic phase accumulator. dtSeconds<0 is treated as 0 so a stalled first
// frame can never rewind the animation.
export function advancePhase(phase: number, dtSeconds: number, speed: number): number {
  return phase + (dtSeconds > 0 ? dtSeconds : 0) * speed;
}

// Low-amplitude value noise: a sum of three incommensurate sines (freq ratios
// 1, 1.618, 2.71) so the combined signal never repeats on a short period.
// Returns a bounded value in [-1, 1].
export function organicDrift(seed: number, phase: number): number {
  return (
    (Math.sin(phase * 1.0 + seed) +
      Math.sin(phase * 1.618 + seed * 2.3) +
      Math.sin(phase * 2.71 + seed * 4.1)) /
    3
  );
}
