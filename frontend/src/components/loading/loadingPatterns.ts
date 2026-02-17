export type LoadingPattern = 'none' | 'spinner' | 'skeleton' | 'progress';

export interface LoadingPatternOptions {
  elapsedMs: number;
  hasKnownLayout?: boolean;
  hasMeasurableProgress?: boolean;
}

export function selectLoadingPattern({
  elapsedMs,
  hasKnownLayout = false,
  hasMeasurableProgress = false,
}: LoadingPatternOptions): LoadingPattern {
  if (elapsedMs < 500) {
    return 'none';
  }

  if (elapsedMs <= 3000) {
    return hasKnownLayout ? 'skeleton' : 'spinner';
  }

  if (hasMeasurableProgress) {
    return 'progress';
  }

  return hasKnownLayout ? 'skeleton' : 'spinner';
}
