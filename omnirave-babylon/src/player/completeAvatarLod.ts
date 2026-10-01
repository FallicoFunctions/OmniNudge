export type CompleteAvatarDetail = 0 | 1 | 2;

// The venue never loads detail 0. One detail-0 body measured about 665 MB of
// GPU and page memory (437k vertices, 2048 textures, 149 morph targets), a
// third of the whole game; detail 1 has 182k vertices, 1024 textures and 65
// morph targets. Detail 0 stays for the avatar review pages.

/** Use the existing LODs below a pixel budget. */
export function resolveProjectedAvatarDetail(heightPixels: number, previous?: CompleteAvatarDetail, farThreshold = 80): CompleteAvatarDetail {
  if (!Number.isFinite(heightPixels) || heightPixels <= 0) return previous ?? 2;
  if (previous === 1 && heightPixels > farThreshold * .875) return 1;
  if (previous === 2 && heightPixels <= farThreshold * 1.125) return 2;
  return heightPixels > farThreshold ? 1 : 2;
}

/** Project the standing body itself, including camera pitch and perspective depth. */
export function projectedAvatarHeightPixels(eye: { x: number; y: number; z: number },
  viewProjection: ArrayLike<number>, viewportHeight: number, eyeHeight: number, standingHeight = 1.8): number {
  if (![eye.x, eye.y, eye.z, viewportHeight, eyeHeight, standingHeight].every(Number.isFinite)
    || viewportHeight <= 0 || standingHeight <= 0) return Number.NaN;
  const m = viewProjection, bottom = eye.y - eyeHeight, top = bottom + standingHeight;
  const baseY = eye.x * m[1] + eye.z * m[9] + m[13];
  const baseW = eye.x * m[3] + eye.z * m[11] + m[15];
  const bottomW = baseW + bottom * m[7], topW = baseW + top * m[7];
  if (bottomW <= 0 && topW <= 0) return 0;
  if (bottomW <= .001 || topW <= .001) return Number.MAX_VALUE;
  return Math.abs((baseY + top * m[5]) / topW - (baseY + bottom * m[5]) / bottomW) * viewportHeight / 2;
}

/** Hysteresis keeps a character from changing mesh repeatedly at a boundary. */
export function resolveCompleteAvatarDetail(distance: number, previous?: CompleteAvatarDetail): CompleteAvatarDetail {
  if (!Number.isFinite(distance)) return 2;
  if (previous === 1 && distance < 17.5) return 1;
  if (previous === 2 && distance >= 15) return 2;
  return distance < 16 ? 1 : 2;
}

export function completeAvatarAssetName(character: 'male' | 'female', detail: CompleteAvatarDetail): string {
  return `${character}${detail ? `-lod${detail}` : ''}.glb`;
}

/** The local character keeps detail 1 through the normal follow-camera range. */
export function resolveLocalAvatarDetail(distance: number, previous: CompleteAvatarDetail = 1): CompleteAvatarDetail {
  if (!Number.isFinite(distance)) return previous;
  if (previous === 1 && distance < 26) return 1;
  if (previous === 2 && distance >= 23) return 2;
  return distance < 25 ? 1 : 2;
}
