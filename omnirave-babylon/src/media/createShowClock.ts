/** Continuous visual time anchored to media readings, never a playback-rate change. */
export function createShowClock() {
  let value: number | undefined;
  let previousMs = 0;
  let previousMedia = 0;
  let rate = 1;
  return {
    reset() {
      value = undefined;
      rate = 1;
    },
    read(mediaSeconds: number, nowMs: number): number {
      if (value === undefined || nowMs < previousMs) {
        value = mediaSeconds;
        previousMedia = mediaSeconds;
        rate = 1;
      } else {
        value += Math.min(1.5, Math.max(0, nowMs - previousMs) / 1000) * rate;
        if (mediaSeconds !== previousMedia) {
          const error = mediaSeconds - value;
          if (Math.abs(error) > 0.3) {
            // A seek/track discontinuity must take effect immediately.
            value = mediaSeconds;
            rate = 1;
          } else {
            // Correct reporting jitter gradually without backward movement
            // or a visible jump whenever Safari updates its media position.
            rate = 1 + Math.max(-0.1, Math.min(0.1, error / 0.5));
          }
          previousMedia = mediaSeconds;
        }
      }
      previousMs = nowMs;
      return Math.max(0, value);
    },
  };
}
