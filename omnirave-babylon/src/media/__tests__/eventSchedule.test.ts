import { describe, expect, it } from 'vitest';
import { eventWindows, readEventSchedule, scheduledEventState } from '../eventSchedule';

// The server's Main Stage rule (event_schedule.go): a 10 s lead-in before
// each full hour, then a 5-minute show.
const HOUR = Date.UTC(2026, 5, 4, 15, 0, 0);
const schedule = readEventSchedule({ activeStartMs: HOUR, periodSeconds: 3600, leadInSeconds: 10, activeSeconds: 300 })!;
const at = (h: number, m: number, s: number, ms = 0) => Date.UTC(2026, 5, 4, h, m, s, ms);

describe('scheduledEventState', () => {
  it('reports what the server reports at the same server time', () => {
    // The same moments as TestEventSchedule_MainStageLeadInAndActive.
    expect(scheduledEventState(schedule, at(14, 59, 49))).toEqual({ phase: 'none' });
    expect(scheduledEventState(schedule, at(14, 59, 50))).toEqual({ phase: 'lead_in', countdownSeconds: 10 });
    expect(scheduledEventState(schedule, at(14, 59, 52, 900))).toEqual({ phase: 'lead_in', countdownSeconds: 8 });
    expect(scheduledEventState(schedule, at(15, 0, 0))).toEqual({ phase: 'active', activeMinute: 1 });
    expect(scheduledEventState(schedule, at(15, 1, 0))).toEqual({ phase: 'active', activeMinute: 2 });
    expect(scheduledEventState(schedule, at(15, 5, 0))).toEqual({ phase: 'none' });
    // Any hour: the schedule repeats.
    expect(scheduledEventState(schedule, at(18, 2, 30))).toEqual({ phase: 'active', activeMinute: 3 });
  });

  it('reads no schedule from an older server', () => {
    expect(readEventSchedule({})).toBeNull();
    expect(readEventSchedule(null)).toBeNull();
  });
});

describe('eventWindows', () => {
  it('places every lead-in and show of a set in track seconds, including one before the player joined', () => {
    // A set that started at 14:30 and runs two hours.
    const start = at(14, 30, 0);
    const windows = eventWindows(schedule, start, start, start + 2 * 3600_000);
    expect(Array.from(windows.leadIns)).toEqual([1790, 1800, 5390, 5400]);
    expect(Array.from(windows.actives)).toEqual([1800, 2100, 5400, 5700]);
    expect(Array.from(windows.activeStarts)).toEqual([1800, 5400]);
  });

  it('keeps a show that began before the track and is still running', () => {
    const start = at(15, 2, 0);
    const windows = eventWindows(schedule, start, start, start + 600_000);
    expect(Array.from(windows.leadIns)).toEqual([]);
    expect(Array.from(windows.actives)).toEqual([-120, 180]);
  });
});
