import { expect, it } from 'vitest';
import { sampleAvatarMotionPhase } from '../avatarMotionPhase';

it('keeps the leading foot when walking changes to running and back', () => {
  const player = {};
  expect(sampleAvatarMotionPhase(player,'walk',.3,1)).toBeCloseTo(.3);
  // A direct time % duration seek would flip this to the opposite leg (.75).
  expect(sampleAvatarMotionPhase(player,'run',.3,.4)).toBeCloseTo(.3);
  expect(sampleAvatarMotionPhase(player,'run',.4,.4)).toBeCloseTo(.55);
  expect(sampleAvatarMotionPhase(player,'walk',.4,1)).toBeCloseTo(.55);
  expect(sampleAvatarMotionPhase(player,'walk',.5,1)).toBeCloseTo(.65);
});

it('shares the current phase across detail replacements and keeps players independent', () => {
  const player = {}, other = {};
  sampleAvatarMotionPhase(player,'walk',.3,1);
  sampleAvatarMotionPhase(player,'run',.3,.4);
  const original = sampleAvatarMotionPhase(player,'run',.4,.4);
  const replacement = sampleAvatarMotionPhase(player,'run',.4,.4);
  expect(replacement).toBeCloseTo(original);
  expect(sampleAvatarMotionPhase(other,'run',.4,.4)).toBeCloseTo(0);
  // Off-screen copies resume analytically without stepping missed frames.
  expect(sampleAvatarMotionPhase(player,'run',12.4,.4)).toBeCloseTo(original);
});

it('starts a new step when leaving idle and resets safely when the player clock rewinds', () => {
  const player = {};
  sampleAvatarMotionPhase(player,'idle',.7,3);
  expect(sampleAvatarMotionPhase(player,'walk',.8,1)).toBe(0);
  expect(sampleAvatarMotionPhase(player,'walk',.9,1)).toBeCloseTo(.1);
  expect(sampleAvatarMotionPhase(player,'idle',1,3)).toBe(0);
  expect(sampleAvatarMotionPhase(player,'run',1.1,.4)).toBe(0);
  expect(sampleAvatarMotionPhase(player,'run',.1,.4)).toBeCloseTo(.25);
});

it('retains gait timing when a lower detail copy samples an earlier tick', () => {
  const player = {};
  sampleAvatarMotionPhase(player,'walk',.3,1);
  sampleAvatarMotionPhase(player,'run',.3,.4);
  const near = sampleAvatarMotionPhase(player,'run',.42,.4,25/60);
  const far = sampleAvatarMotionPhase(player,'run',.42,.4,6/15);
  expect(near).toBeCloseTo(.3+(25/60-.3)/.4);
  expect(far).toBeCloseTo(.55);
  expect(sampleAvatarMotionPhase(player,'run',.5,.4)).toBeCloseTo(.8);
  expect(sampleAvatarMotionPhase({},'walk',.42,1,6/15)).toBeCloseTo(.4);
});
