// The Main Stage event schedule on this player's synced server clock.
//
// The server repeats each event every period (the fireworks: a 10 s lead-in
// before each full hour, then a 5-minute show) and sends that schedule with
// its event state. Read here at the server time, every player changes phase
// at the same moment, instead of when its own snapshot arrives; and the
// light show can place each lead-in and show inside the track (see
// showTimeline.ts), including one that ended before this player joined.

import type { ShowEventWindows } from './showTimeline';

export interface EventSchedule {
  activeStartMs: number;
  periodSeconds: number;
  leadInSeconds: number;
  activeSeconds: number;
}

export interface ScheduledEventState {
  phase: 'lead_in' | 'active' | 'none';
  countdownSeconds?: number;
  activeMinute?: number;
}

/** The schedule in a server event state, or null from an older server. */
export function readEventSchedule(state: Partial<EventSchedule> | null | undefined): EventSchedule | null {
  if (!state) return null;
  const { activeStartMs, periodSeconds, leadInSeconds = 0, activeSeconds } = state;
  if (!Number.isFinite(activeStartMs) || !(periodSeconds! > 0) || !(activeSeconds! > 0)) return null;
  return { activeStartMs: activeStartMs!, periodSeconds: periodSeconds!, leadInSeconds, activeSeconds: activeSeconds! };
}

// The cycle whose active start is the last one at or before `serverMs`.
function cycleStart(schedule: EventSchedule, serverMs: number): number {
  const period = schedule.periodSeconds * 1000;
  return schedule.activeStartMs + Math.floor((serverMs - schedule.activeStartMs) / period) * period;
}

/** What the server reports at `serverMs`, in whole seconds as it counts. */
export function scheduledEventState(schedule: EventSchedule, serverMs: number): ScheduledEventState {
  const second = Math.floor(serverMs / 1000) * 1000;
  const start = cycleStart(schedule, second);
  const next = start + schedule.periodSeconds * 1000;
  if (schedule.leadInSeconds > 0 && second >= next - schedule.leadInSeconds * 1000) {
    return { phase: 'lead_in', countdownSeconds: (next - second) / 1000 };
  }
  if (second < start + schedule.activeSeconds * 1000) {
    return { phase: 'active', activeMinute: Math.floor((second - start) / 60_000) + 1 };
  }
  return { phase: 'none' };
}

/**
 * The lead-in and active windows that overlap [fromMs, toMs], in seconds
 * after `zeroMs` (the server time at track position 0).
 */
export function eventWindows(schedule: EventSchedule, zeroMs: number, fromMs: number, toMs: number): ShowEventWindows {
  const period = schedule.periodSeconds * 1000;
  const leadIns: number[] = [];
  const actives: number[] = [];
  const at = (ms: number) => (ms - zeroMs) / 1000;
  for (let start = cycleStart(schedule, fromMs - schedule.activeSeconds * 1000); start - schedule.leadInSeconds * 1000 <= toMs; start += period) {
    const activeEnd = start + schedule.activeSeconds * 1000;
    if (schedule.leadInSeconds > 0 && start >= fromMs) leadIns.push(at(start - schedule.leadInSeconds * 1000), at(start));
    if (activeEnd >= fromMs && start <= toMs) actives.push(at(start), at(activeEnd));
  }
  const activeStarts = actives.filter((_, i) => i % 2 === 0);
  return { leadIns: Float64Array.from(leadIns), actives: Float64Array.from(actives), activeStarts: Float64Array.from(activeStarts) };
}
