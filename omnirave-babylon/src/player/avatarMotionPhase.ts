import type { AvatarAnimationState } from './avatarAnimationState';

interface MotionPhase {
  state: AvatarAnimationState;
  duration: number;
  origin: number;
  phase: number;
  lastTime: number;
}

// The player anchor survives avatar/detail replacements. Weak ownership lets
// its animation clock disappear when that player leaves the scene.
const clocks = new WeakMap<object, MotionPhase>();
const wrap = (phase: number) => phase-Math.floor(phase);

/** Keep the same leading foot when changing gait or replacing a sampled rig. */
export function sampleAvatarMotionPhase(owner: object, state: AvatarAnimationState, time: number, duration: number, sampleTime = time): number {
  let clock = clocks.get(owner);
  if (!clock || time < clock.lastTime) {
    clock = { state, duration, origin: 0, phase: 0, lastTime: time };
    clocks.set(owner,clock);
  }
  let phase = wrap(clock.phase+(time-clock.origin)/clock.duration);
  if (state !== clock.state || Math.abs(duration-clock.duration) > .000001) {
    if (state !== clock.state && (state === 'idle' || clock.state === 'idle')) phase = 0;
    clock.state = state;
    clock.duration = duration;
    clock.origin = time;
    clock.phase = phase;
  }
  clock.lastTime = time;
  // A 15 Hz replacement may sample an earlier tick than the previous 60 Hz
  // copy. That is quantization, not a rewind of the player's elapsed clock.
  return wrap(clock.phase+(Math.max(clock.origin,sampleTime)-clock.origin)/clock.duration);
}
