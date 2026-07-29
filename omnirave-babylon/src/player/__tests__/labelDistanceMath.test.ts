import { describe, expect, it } from 'vitest';

import {
  LABEL_FIXED_DISTANCE_METERS,
  LABEL_MAX_DISTANCE_METERS,
  LABEL_MIN_SCALE_DISTANCE_METERS,
  isLabelVisibleAtDistance,
  resolveLabelDistanceScale,
} from '../labelDistanceMath';

describe('labelDistanceMath', () => {
  it('converts the design doc feet to venue metres', () => {
    // Sec 10.1: readable within about 15 feet, hard vanish around 40 feet.
    expect(LABEL_FIXED_DISTANCE_METERS).toBeCloseTo(4.572, 3);
    expect(LABEL_MAX_DISTANCE_METERS).toBeCloseTo(12.192, 3);
  });

  it('holds a constant on-screen size inside the fixed range', () => {
    // Constant apparent size means world scale grows with distance.
    const near = resolveLabelDistanceScale(2);
    const mid = resolveLabelDistanceScale(3.5);
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(1);
  });

  it('stops compensating at the fixed range and beyond, so perspective shrinks it naturally', () => {
    expect(resolveLabelDistanceScale(LABEL_FIXED_DISTANCE_METERS)).toBeCloseTo(1, 6);
    expect(resolveLabelDistanceScale(LABEL_FIXED_DISTANCE_METERS + 3)).toBeCloseTo(1, 6);
    expect(resolveLabelDistanceScale(LABEL_MAX_DISTANCE_METERS)).toBeCloseTo(1, 6);
  });

  it('floors the scale for a label pressed against the camera', () => {
    const floor = LABEL_MIN_SCALE_DISTANCE_METERS / LABEL_FIXED_DISTANCE_METERS;
    expect(resolveLabelDistanceScale(0)).toBeCloseTo(floor, 6);
    expect(resolveLabelDistanceScale(0.01)).toBeCloseTo(floor, 6);
  });

  it('hard-vanishes past the 40ft bound', () => {
    expect(isLabelVisibleAtDistance(LABEL_MAX_DISTANCE_METERS - 0.01)).toBe(true);
    expect(isLabelVisibleAtDistance(LABEL_MAX_DISTANCE_METERS)).toBe(true);
    expect(isLabelVisibleAtDistance(LABEL_MAX_DISTANCE_METERS + 0.01)).toBe(false);
    expect(isLabelVisibleAtDistance(1000)).toBe(false);
  });

  it('treats an unknown distance (no active camera) as full size and visible', () => {
    expect(resolveLabelDistanceScale(Number.NaN)).toBe(1);
    expect(isLabelVisibleAtDistance(Number.NaN)).toBe(true);
  });
});
