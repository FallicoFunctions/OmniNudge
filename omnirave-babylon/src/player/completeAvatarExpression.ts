import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { MorphTarget } from '@babylonjs/core/Morph/morphTarget.js';
import type { AvatarAnimationState } from './avatarAnimationState';

export type CompleteExpression = 'neutral' | 'smile' | 'curious';
export type CompleteBlink = 'auto' | 'open' | 'closed' | 'left' | 'right';
export interface CompleteExpressionControls {
  setExpression: (expression: CompleteExpression, strength?: number) => void;
  setBlink: (blink: CompleteBlink) => void;
  setSecondaryMotion: (enabled: boolean) => void;
  setPaused: (paused: boolean) => void;
  seek: (seconds: number, motion: AvatarAnimationState) => void;
  update: (deltaSeconds: number, motion: AvatarAnimationState, yaw?: number) => void;
  dispose: () => void;
}

const names = ['Expression_BlinkLeft', 'Expression_BlinkRight', 'Expression_Smile',
  'Expression_BrowLift', 'Secondary_HairSide', 'Secondary_HairBack'] as const;
type TargetName = typeof names[number];
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

/** Quick closure, a short closed interval, and slower reopening. */
export function completeBlinkEnvelope(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const time = ((seconds % 13.7) + 13.7) % 13.7;
  for (const start of [2.4, 6.7, 11.8]) {
    const t = time - start;
    if (t >= 0 && t < .085) return smooth(t / .085);
    if (t >= .085 && t < .12) return 1;
    if (t >= .12 && t < .255) return 1 - smooth((t - .12) / .135);
  }
  return 0;
}

interface Spring { value: number; velocity: number }
/** Exact critically damped step for a constant target; stable at any timestep. */
export function stepCompleteHairSpring(spring: Spring, target: number, delta: number): Spring {
  const omega = 14;
  const offset = spring.value - target;
  const term = spring.velocity + omega * offset;
  const decay = Math.exp(-omega * delta);
  return { value: target + (offset + term * delta) * decay,
    velocity: (spring.velocity - omega * term * delta) * decay };
}

/** Controls only the authored expression/groom shapes, never garment correctives. */
export function createCompleteExpressionControls(meshes: readonly AbstractMesh[], phase = 0): CompleteExpressionControls {
  const targets = new Map<TargetName, MorphTarget[]>();
  const seen = new Set<MorphTarget>();
  for (const mesh of meshes) {
    const manager = mesh.morphTargetManager;
    if (!manager) continue;
    let hasControls = false;
    for (let i = 0; i < manager.numTargets; i++) {
      const target = manager.getTarget(i);
      const name = names.find(candidate => target.name === candidate || target.name.endsWith(`:${candidate}`));
      if (!name) continue;
      hasControls = true;
      if (seen.has(target)) continue;
      seen.add(target);
      const list = targets.get(name) ?? [];
      list.push(target); targets.set(name, list);
    }
    // Blink zero crossings must not trigger new shader variants every few seconds.
    if (hasControls) manager.optimizeInfluencers = false;
  }
  let expression: CompleteExpression = 'neutral';
  let strength = 1;
  let blink: CompleteBlink = 'auto';
  let secondary = true;
  let paused = false;
  let disposed = false;
  let elapsed = Number.isFinite(phase) ? phase : 0;
  let previousYaw: number | undefined;
  let side: Spring = { value: 0, velocity: 0 };
  let back: Spring = { value: 0, velocity: 0 };

  function apply() {
    if (disposed) return;
    const automatic = completeBlinkEnvelope(elapsed);
    const left = blink === 'auto' ? automatic : blink === 'closed' || blink === 'left' ? 1 : 0;
    const right = blink === 'auto' ? automatic : blink === 'closed' || blink === 'right' ? 1 : 0;
    const values: Record<TargetName, number> = {
      Expression_BlinkLeft: left, Expression_BlinkRight: right,
      Expression_Smile: expression === 'smile' ? .85 * strength : 0,
      Expression_BrowLift: (expression === 'curious' ? .8 : expression === 'smile' ? .15 : 0) * strength,
      Secondary_HairSide: secondary ? clamp(side.value, -1, 1) : 0,
      Secondary_HairBack: secondary ? clamp(back.value, -1, 1) : 0,
    };
    for (const [name, group] of targets) for (const target of group) target.influence = values[name];
  }

  function hairTarget(motion: AvatarAnimationState, turning = 0) {
    const amplitude = motion === 'run' ? .8 : motion === 'walk' ? .4 : .075;
    const pace = motion === 'run' ? 12 : motion === 'walk' ? 7.5 : 1.6;
    return {
      side: clamp(amplitude * Math.sin(elapsed * pace) - turning * .065, -1, 1),
      back: clamp(amplitude * (.22 + .5 * Math.sin(elapsed * pace + 1.15)), -1, 1),
    };
  }

  return {
    setExpression(next, value = 1) {
      expression = ['neutral', 'smile', 'curious'].includes(next) ? next : 'neutral';
      strength = Number.isFinite(value) ? clamp(value, 0, 1) : 0;
      apply();
    },
    setBlink(next) { blink = ['auto', 'open', 'closed', 'left', 'right'].includes(next) ? next : 'auto'; apply(); },
    setSecondaryMotion(enabled) {
      secondary = enabled;
      if (!enabled) { side = { value: 0, velocity: 0 }; back = { value: 0, velocity: 0 }; }
      apply();
    },
    setPaused(value) { paused = value; previousYaw = undefined; },
    seek(seconds, motion) {
      elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      const goal = hairTarget(motion);
      side = { value: goal.side, velocity: 0 }; back = { value: goal.back, velocity: 0 };
      previousYaw = undefined; apply();
    },
    update(deltaSeconds, motion, yaw) {
      if (disposed || paused) return;
      const dt = Number.isFinite(deltaSeconds) ? clamp(deltaSeconds, 0, .1) : 0;
      elapsed += dt;
      let turning = 0;
      if (yaw !== undefined && Number.isFinite(yaw)) {
        if (previousYaw !== undefined && dt > 0) {
          const angle = yaw - previousYaw;
          turning = clamp(Math.atan2(Math.sin(angle), Math.cos(angle)) / dt, -8, 8);
        }
        previousYaw = yaw;
      }
      if (secondary) {
        const goal = hairTarget(motion, turning);
        side = stepCompleteHairSpring(side, goal.side, dt);
        back = stepCompleteHairSpring(back, goal.back, dt);
      }
      apply();
    },
    dispose() { disposed = true; targets.clear(); seen.clear(); },
  };
}
