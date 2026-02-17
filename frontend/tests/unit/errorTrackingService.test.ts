import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

import { getErrorPatternForSeverity, trackError } from '../../src/services/errorTrackingService';

describe('errorTrackingService', () => {
  beforeEach(() => {
    loggerErrorMock.mockReset();
    delete (window as Window & { Sentry?: unknown }).Sentry;
  });

  it('maps severity to expected pattern', () => {
    expect(getErrorPatternForSeverity('info')).toBe('toast');
    expect(getErrorPatternForSeverity('warning')).toBe('inline');
    expect(getErrorPatternForSeverity('error')).toBe('toast');
    expect(getErrorPatternForSeverity('critical')).toBe('modal');
  });

  it('logs error with enriched context', () => {
    trackError({
      error: new Error('boom'),
      severity: 'critical',
      area: 'unit-test',
      pattern: 'page',
      context: { requestId: 'abc' },
    });

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({
        severity: 'critical',
        area: 'unit-test',
        pattern: 'page',
        requestId: 'abc',
      })
    );
  });

  it('sends to Sentry when available', () => {
    const captureException = vi.fn();
    window.Sentry = {
      captureException,
    };

    trackError({
      error: new Error('sentry-test'),
      severity: 'error',
      area: 'feed',
      context: { route: '/r/test' },
    });

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        level: 'error',
        tags: expect.objectContaining({
          area: 'feed',
          severity: 'error',
        }),
      })
    );
  });
});
