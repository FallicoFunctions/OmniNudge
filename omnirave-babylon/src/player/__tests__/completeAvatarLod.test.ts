import { expect, it } from 'vitest';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js';
import { completeAvatarAssetName, projectedAvatarHeightPixels, resolveCompleteAvatarDetail, resolveProjectedAvatarDetail } from '../completeAvatarLod';

it('projects body height with the actual camera, including pitch and lateral position', () => {
  const eye = new Vector3(2, 1.6, 2), viewport = new Viewport(0, 0, 1280, 720);
  const projection = Matrix.PerspectiveFovLH(.9, 1280 / 720, .1, 100);
  const view = Matrix.LookAtLH(new Vector3(0, 4, -6), new Vector3(0, 1, 0), Vector3.Up());
  const transform = view.multiply(projection);
  const bottom = Vector3.Project(new Vector3(2, 0, 2), Matrix.Identity(), transform, viewport);
  const top = Vector3.Project(new Vector3(2, 1.8, 2), Matrix.Identity(), transform, viewport);
  expect(projectedAvatarHeightPixels(eye, transform.m, 720, 1.6)).toBeCloseTo(Math.abs(top.y - bottom.y), 4);
  const level = Matrix.LookAtLH(new Vector3(0, 1.6, -6), new Vector3(0, 1.6, 2), Vector3.Up()).multiply(projection);
  expect(projectedAvatarHeightPixels(eye, level.m, 720, 1.6))
    .toBeCloseTo(projectedAvatarHeightPixels(new Vector3(8, 1.6, 2), level.m, 720, 1.6), 5);
});

it('keeps projected detail stable at the pixel threshold and never picks detail 0', () => {
  expect(resolveProjectedAvatarDetail(200, undefined, 200)).toBe(2);
  expect(resolveProjectedAvatarDetail(176, 1, 200)).toBe(1);
  expect(resolveProjectedAvatarDetail(175, 1, 200)).toBe(2);
  expect(resolveProjectedAvatarDetail(225, 2, 200)).toBe(2);
  expect(resolveProjectedAvatarDetail(226, 2, 200)).toBe(1);
  expect(resolveProjectedAvatarDetail(2000, undefined, 200)).toBe(1);
  expect(resolveProjectedAvatarDetail(2000, 0, 200)).toBe(1);
  expect(resolveProjectedAvatarDetail(Number.NaN, 1)).toBe(1);
});
it('keeps distance transitions stable and never picks detail 0', () => {
  expect(resolveCompleteAvatarDetail(0.5)).toBe(1);
  expect(resolveCompleteAvatarDetail(10)).toBe(1);
  expect(resolveCompleteAvatarDetail(20)).toBe(2);
  expect(resolveCompleteAvatarDetail(1, 0)).toBe(1);
  expect(resolveCompleteAvatarDetail(17.4, 1)).toBe(1);
  expect(resolveCompleteAvatarDetail(17.6, 1)).toBe(2);
  expect(resolveCompleteAvatarDetail(15.2, 2)).toBe(2);
  expect(resolveCompleteAvatarDetail(14.9, 2)).toBe(1);
  expect(resolveCompleteAvatarDetail(NaN)).toBe(2);
  expect(completeAvatarAssetName('female', 2)).toBe('female-lod2.glb');
  expect(completeAvatarAssetName('male', 0)).toBe('male.glb');
});

it('keeps the local follow view at detail 1 and uses hysteresis for distant camera views', async () => {
  const { resolveLocalAvatarDetail } = await import('../completeAvatarLod');
  expect(resolveLocalAvatarDetail(2)).toBe(1); expect(resolveLocalAvatarDetail(2, 0)).toBe(1);
  expect(resolveLocalAvatarDetail(25.5, 1)).toBe(1);
  expect(resolveLocalAvatarDetail(26, 1)).toBe(2); expect(resolveLocalAvatarDetail(23.1, 2)).toBe(2);
  expect(resolveLocalAvatarDetail(22.9, 2)).toBe(1); expect(resolveLocalAvatarDetail(60, 1)).toBe(2);
  expect(resolveLocalAvatarDetail(NaN, 1)).toBe(1);
});
