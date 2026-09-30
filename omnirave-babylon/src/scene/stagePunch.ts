// The bass punch every stage light effect shares: an impulse that snaps up on
// a bass hit and decays back to zero.
//
// With the track's beat list (see media/trackBeats.ts) the hits are the real
// ones: a bass note lifts the punch to its strength, and `kick` marks a kick.
// Only a track without a list falls back to the level-based guess - a bass
// reading well above its running average - which a loud master rarely
// triggers, because its bass band sits near the ceiling all the time.

import type { StageBeat } from '../media/trackBeats';

// The level-based guess: a raw reading this far above the smoothed level,
// and over the floor, is a hit; over STRONG_PUNCH it counts as a kick.
const PUNCH_RATIO = 1.25;
const PUNCH_FLOOR = 0.12;
const STRONG_PUNCH = 0.35;

export interface PunchStep {
  // The impulse after this frame, 0..1.
  punch: number;
  // A bass hit landed in this frame.
  hit: boolean;
  // That hit is a kick.
  kick: boolean;
}

// One shared result: read it before the next call.
const step: PunchStep = { punch: 0, hit: false, kick: false };

export function stepBassPunch(
  beat: StageBeat | null,
  audioPresent: boolean,
  bassRaw: number,
  bassSmoothed: number,
  punch: number,
  dtSeconds: number,
  decaySeconds: number,
): PunchStep {
  step.hit = false;
  step.kick = false;
  if (beat) {
    step.kick = audioPresent && beat.kick;
    if (audioPresent && beat.bass > 0 && beat.bass >= punch) {
      step.punch = beat.bass;
      step.hit = true;
    } else {
      step.punch = Math.max(0, punch - dtSeconds / decaySeconds);
    }
  } else if (audioPresent && bassRaw > PUNCH_FLOOR && bassRaw > bassSmoothed * PUNCH_RATIO && punch <= 0.2) {
    step.punch = 1;
    step.hit = true;
    step.kick = bassRaw > STRONG_PUNCH;
  } else {
    step.punch = Math.max(0, punch - dtSeconds / decaySeconds);
  }
  return step;
}
