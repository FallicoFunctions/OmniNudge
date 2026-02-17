import { describe, expect, it } from 'vitest';
import { selectLoadingPattern } from '../../src/components/loading/loadingPatterns';

describe('selectLoadingPattern', () => {
  it('returns none for very short waits', () => {
    expect(selectLoadingPattern({ elapsedMs: 120 })).toBe('none');
    expect(selectLoadingPattern({ elapsedMs: 499 })).toBe('none');
  });

  it('returns spinner for medium waits without known layout', () => {
    expect(selectLoadingPattern({ elapsedMs: 900 })).toBe('spinner');
    expect(selectLoadingPattern({ elapsedMs: 3000 })).toBe('spinner');
  });

  it('returns skeleton for medium waits with known layout', () => {
    expect(selectLoadingPattern({ elapsedMs: 900, hasKnownLayout: true })).toBe('skeleton');
  });

  it('returns progress for long waits with measurable progress', () => {
    expect(
      selectLoadingPattern({
        elapsedMs: 6000,
        hasKnownLayout: true,
        hasMeasurableProgress: true,
      })
    ).toBe('progress');
  });

  it('falls back to skeleton/spinner for long waits without measurable progress', () => {
    expect(selectLoadingPattern({ elapsedMs: 6000, hasKnownLayout: true })).toBe('skeleton');
    expect(selectLoadingPattern({ elapsedMs: 6000, hasKnownLayout: false })).toBe('spinner');
  });
});
