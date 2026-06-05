export type AvatarAnimationState = 'idle' | 'walk' | 'run';

export function resolveAvatarAnimationState(speedMetersPerSecond: number): AvatarAnimationState {
  if (speedMetersPerSecond >= 3.5) {
    return 'run';
  }

  if (speedMetersPerSecond >= 0.15) {
    return 'walk';
  }

  return 'idle';
}
