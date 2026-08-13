// Distance rules for world-space player labels - name plates (design doc sec
// 10.1) and above-head chat bubbles (sec 10.5). Both sections state the same
// rule in the same words: "fixed/readable" inside the near range, then
// "scale down naturally", with a hard vanish at the far bound.
//
// The venue is authored in metres (playerController's gravity/jump constants
// are metres-per-second), while the design doc quotes feet, so the spec's
// numbers are converted once here.

const METRES_PER_FOOT = 0.3048;

/**
 * Sec 10.1 "visible within about 15 feet / fixed-readable within that range".
 * Inside this radius the label holds a CONSTANT ON-SCREEN size, which means
 * its world size has to grow with distance - that is what "fixed" buys you.
 */
export const LABEL_FIXED_DISTANCE_METERS = 15 * METRES_PER_FOOT; // 4.572 m

/**
 * Sec 10.1 "hard vanish around initial target 40 feet". A hard cut, not a
 * fade - the doc is explicit, so the label is simply disabled past here.
 */
export const LABEL_MAX_DISTANCE_METERS = 40 * METRES_PER_FOOT; // 12.192 m

/**
 * Not in the spec. Without a floor the constant-on-screen rule drives world
 * scale to zero as the camera approaches, so a label pressed right against
 * the lens would collapse to nothing. Below this the label just stops
 * shrinking and grows on screen like ordinary geometry.
 */
export const LABEL_MIN_SCALE_DISTANCE_METERS = 1.5;

/**
 * World-space scale multiplier for a label whose owner is `distanceMeters`
 * from the camera. 1 at (and beyond) the fixed-size radius, where the label
 * stops compensating and shrinks naturally with perspective.
 */
export function resolveLabelDistanceScale(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters)) return 1;
  const clamped = Math.min(
    LABEL_FIXED_DISTANCE_METERS,
    Math.max(LABEL_MIN_SCALE_DISTANCE_METERS, distanceMeters),
  );
  return clamped / LABEL_FIXED_DISTANCE_METERS;
}

/** False past the sec 10.1 hard-vanish radius. */
export function isLabelVisibleAtDistance(distanceMeters: number): boolean {
  if (!Number.isFinite(distanceMeters)) return true;
  return distanceMeters <= LABEL_MAX_DISTANCE_METERS;
}
