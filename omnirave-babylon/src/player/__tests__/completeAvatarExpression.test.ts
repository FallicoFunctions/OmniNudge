import { MeshBuilder, MorphTarget, MorphTargetManager, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, expect, it } from 'vitest';
import { completeBlinkEnvelope, createCompleteExpressionControls, stepCompleteHairSpring } from '../completeAvatarExpression';

let engine: NullEngine | undefined;
afterEach(() => engine?.dispose());

function fixture(scene: Scene) {
  const mesh = MeshBuilder.CreateBox('face', {}, scene);
  const manager = new MorphTargetManager(scene);
  const targets = Object.fromEntries(['Expression_BlinkLeft', 'Expression_BlinkRight', 'Expression_Smile',
    'Expression_BrowLift', 'Secondary_HairSide', 'Secondary_HairBack', 'garment-corrective'].map(name => {
    const target = new MorphTarget(name, name === 'garment-corrective' ? .63 : 0, scene);
    target.setPositions(mesh.getVerticesData('position')!); manager.addTarget(target);
    return [name, target];
  }));
  mesh.morphTargetManager = manager;
  return { targets, manager, controls: createCompleteExpressionControls([mesh]) };
}

it('closes both lids, supports an independent wink, and leaves garment corrections untouched', () => {
  engine = new NullEngine();
  const { controls, targets, manager } = fixture(new Scene(engine));
  controls.seek(2.5, 'idle');
  expect(targets.Expression_BlinkLeft.influence).toBe(1);
  expect(targets.Expression_BlinkRight.influence).toBe(1);
  expect(manager.optimizeInfluencers).toBe(false);
  controls.setBlink('left');
  expect(targets.Expression_BlinkLeft.influence).toBe(1);
  expect(targets.Expression_BlinkRight.influence).toBe(0);
  controls.setExpression('smile', 100);
  expect(targets.Expression_Smile.influence).toBeCloseTo(.85);
  expect(targets['garment-corrective'].influence).toBe(.63);
  controls.setExpression('neutral');
  expect(targets.Expression_Smile.influence).toBe(0);
});

it('freezes automatic face/hair motion when paused, but still accepts manual expressions', () => {
  engine = new NullEngine();
  const { controls, targets } = fixture(new Scene(engine));
  controls.seek(2.5, 'run');
  controls.setPaused(true);
  const hair = targets.Secondary_HairSide.influence;
  for (let i = 0; i < 60; i++) controls.update(1 / 30, 'idle');
  expect(targets.Expression_BlinkLeft.influence).toBe(1);
  expect(targets.Secondary_HairSide.influence).toBe(hair);
  controls.setExpression('curious', .5);
  expect(targets.Expression_BrowLift.influence).toBeCloseTo(.4);
  controls.setBlink('open');
  expect(targets.Expression_BlinkLeft.influence).toBe(0);
  controls.setSecondaryMotion(false);
  expect(targets.Secondary_HairSide.influence).toBe(0);
  expect(targets.Secondary_HairBack.influence).toBe(0);
});

it('keeps per-character state independent and releases control after disposal', () => {
  engine = new NullEngine(); const scene = new Scene(engine);
  const a = fixture(scene); const b = fixture(scene);
  a.controls.setBlink('closed');
  expect(b.targets.Expression_BlinkLeft.influence).toBe(0);
  a.controls.dispose();
  a.controls.setBlink('open');
  a.controls.update(.1, 'run');
  expect(a.targets.Expression_BlinkLeft.influence).toBe(1);
});

it('bounds turn-driven hair at angle wrap and handles invalid or suspended frame times', () => {
  engine = new NullEngine(); const { controls, targets } = fixture(new Scene(engine));
  controls.update(.01, 'run', Math.PI - .01);
  controls.update(.01, 'run', -Math.PI + .01);
  for (const dt of [NaN, Infinity, -1, 1000, .1]) controls.update(dt, 'run', 0);
  for (const target of Object.values(targets)) {
    expect(Number.isFinite(target.influence)).toBe(true);
    expect(Math.abs(target.influence)).toBeLessThanOrEqual(1);
  }
});

it('settles the same hair spring equally at 30 Hz and 120 Hz without overshoot', () => {
  const solve = (fps: number) => {
    let state = { value: 0, velocity: 0 };
    for (let i = 0; i < fps; i++) state = stepCompleteHairSpring(state, 1, 1 / fps);
    return state;
  };
  expect(solve(30).value).toBeCloseTo(solve(120).value, 10);
  expect(solve(30).value).toBeLessThanOrEqual(1);
  expect(solve(30).value).toBeGreaterThan(.99);
  expect(completeBlinkEnvelope(2.5)).toBe(1);
  expect(completeBlinkEnvelope(2.7)).toBe(0);
  expect(completeBlinkEnvelope(2.5 + 13.7)).toBe(1);
});
