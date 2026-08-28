import { renderHook } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useFormat } from '../useFormat';

/**
 * A date-only string is a calendar date, not an instant. new Date('2026-02-01')
 * reads it as UTC midnight, so anywhere west of UTC it formats as the previous
 * day -- and the CCPA page printed "Last Updated: January 2026" from the
 * constant 2026-02-01 while the Terms page dated itself January 9 from
 * 2026-01-10.
 *
 * These run in a timezone west of UTC on purpose. In UTC the bug is invisible,
 * so a runner that happens to sit there would have passed all of this while
 * the pages lied to every reader in the Americas.
 */
describe('formatDate with a calendar date', () => {
  const original = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    process.env.TZ = original;
  });

  const format = () => renderHook(() => useFormat()).result.current.formatDate;

  it('keeps the month it was given', () => {
    expect(format()('2026-02-01', { year: 'numeric', month: 'long' })).toBe('February 2026');
  });

  it('keeps the day it was given', () => {
    expect(format()('2026-01-10', { year: 'numeric', month: 'long', day: 'numeric' })).toBe(
      'January 10, 2026'
    );
  });

  it('still treats a string carrying a time as an instant', () => {
    // 04:00Z is 23:00 the previous day in New York, and that is correct.
    expect(
      format()('2026-01-10T04:00:00Z', { year: 'numeric', month: 'long', day: 'numeric' })
    ).toBe('January 9, 2026');
  });
});
