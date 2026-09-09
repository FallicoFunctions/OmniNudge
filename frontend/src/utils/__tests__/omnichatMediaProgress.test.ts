import { describe, expect, it } from 'vitest';
import { mediaJobPercent } from '../omnichatMediaProgress';
import type { OmniChatGenerationJob } from '../../types/omnichat';

const START = '2026-09-09T01:00:00.000Z';
const startedAt = new Date(START).getTime();
const at = (seconds: number) => startedAt + seconds * 1000;

function job(overrides: Partial<OmniChatGenerationJob> = {}): OmniChatGenerationJob {
  return {
    id: 'j1',
    kind: 'image',
    mode: 'contextual',
    status: 'running',
    progress: 90,
    created_at: START,
    started_at: START,
    ...overrides,
  } as OmniChatGenerationJob;
}

describe('mediaJobPercent', () => {
  // The whole point. job.progress caps at 90 in about thirty seconds and then
  // sits there; a video job would show that number for the next ten minutes.
  it('keeps rising long after job.progress has stopped', () => {
    const clip = job({ kind: 'video', mode: 'image_to_video', source_asset_id: 'a1', progress: 90 });
    const oneMinute = mediaJobPercent(clip, at(60));
    const fiveMinutes = mediaJobPercent(clip, at(300));
    const fifteenMinutes = mediaJobPercent(clip, at(900));

    expect(oneMinute).toBeLessThan(fiveMinutes);
    expect(fiveMinutes).toBeLessThan(fifteenMinutes);
  });

  it('never claims to be finished while the job is still running', () => {
    const clip = job({ kind: 'video', mode: 'image_to_video', source_asset_id: 'a1' });
    expect(mediaJobPercent(clip, at(60 * 60 * 24))).toBeLessThan(100);
    expect(mediaJobPercent(job(), at(60 * 60 * 24))).toBeLessThan(100);
  });

  it('reports a hundred only when the job says it succeeded', () => {
    expect(mediaJobPercent(job({ status: 'succeeded' }), at(1))).toBe(100);
  });

  // Halfway across its band at the measured median for that kind of job, so
  // the number means something rather than being decorative.
  it('is halfway across the band at the median duration', () => {
    // image/contextual: median 25s, band 5 to 99.
    expect(mediaJobPercent(job(), at(25))).toBe(52);
    // image/create is quicker, so the same elapsed time is further along.
    expect(mediaJobPercent(job({ mode: 'create' }), at(25))).toBeGreaterThan(52);
  });

  // The still and the animation are different jobs wearing one row, and
  // source_asset_id is the moment the first ends.
  it('splits a video into its two real phases', () => {
    const rendering = job({ kind: 'video', mode: 'contextual', progress: 5 });
    const animating = job({ kind: 'video', mode: 'contextual', source_asset_id: 'a1' });

    expect(mediaJobPercent(rendering, at(20))).toBeLessThan(40);
    expect(mediaJobPercent(rendering, at(600))).toBeLessThan(40);
    expect(mediaJobPercent(animating, at(1))).toBeGreaterThanOrEqual(40);
  });

  it('starts at the floor rather than at zero or at nothing', () => {
    expect(mediaJobPercent(job({ status: 'queued' }), at(0))).toBe(5);
    expect(mediaJobPercent(job(), at(0))).toBe(5);
    expect(mediaJobPercent(job({ started_at: undefined }), at(0))).toBe(5);
  });

  // A row with an unreadable timestamp must not produce NaN%.
  it('survives a timestamp it cannot read', () => {
    const broken = mediaJobPercent(job({ started_at: 'not a date', created_at: 'not a date' }), at(60));
    expect(Number.isFinite(broken)).toBe(true);
    expect(broken).toBeGreaterThanOrEqual(0);
  });
});
