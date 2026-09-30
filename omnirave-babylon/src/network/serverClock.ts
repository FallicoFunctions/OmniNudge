// The world server's clock, as seen from this browser. Each browser's own
// clock can be seconds off, and each player has a different network delay,
// so the stage music cannot use either directly. The world socket sends a
// "time_sync" ping; the server echoes it with its own time. The sample with
// the shortest round trip gives the best offset (NTP's rule): the server read
// its clock about half a round trip before the reply arrived.

export interface ServerClock {
  // The server's time now, in Unix milliseconds. Undefined before the first
  // sample arrives.
  now(): number | undefined;
  addSample(sentAtMs: number, serverTimeMs: number, receivedAtMs: number): void;
}

// Keeps the best sample of the most recent ones, so a changed network path
// (or a sleep/wake of the device) replaces an old sample in time.
const SAMPLE_WINDOW = 8;

export function createServerClock(localNow: () => number = () => Date.now()): ServerClock {
  const samples: Array<{ roundTripMs: number; offsetMs: number }> = [];
  let offsetMs: number | undefined;

  return {
    now() {
      return offsetMs === undefined ? undefined : localNow() + offsetMs;
    },
    addSample(sentAtMs, serverTimeMs, receivedAtMs) {
      const roundTripMs = receivedAtMs - sentAtMs;
      if (!(roundTripMs >= 0) || !Number.isFinite(serverTimeMs)) return;
      samples.push({ roundTripMs, offsetMs: serverTimeMs - (sentAtMs + roundTripMs / 2) });
      if (samples.length > SAMPLE_WINDOW) samples.shift();
      offsetMs = samples.reduce((best, sample) => (sample.roundTripMs < best.roundTripMs ? sample : best)).offsetMs;
    },
  };
}
