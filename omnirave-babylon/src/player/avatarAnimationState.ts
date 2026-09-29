export type AvatarAnimationState = 'idle' | 'walk' | 'run';

export function resolveAvatarAnimationState(speedMetersPerSecond: number): AvatarAnimationState {
  // Ordinary movement is 4.5 m/s; sprint is 6.975 m/s. Keep the threshold
  // between them so regular walking never adopts the bent-elbow run pose.
  if (speedMetersPerSecond >= 5.5) {
    return 'run';
  }

  if (speedMetersPerSecond >= 0.15) {
    return 'walk';
  }

  return 'idle';
}
