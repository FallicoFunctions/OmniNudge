import { logger } from '../utils/logger';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorPattern = 'toast' | 'inline' | 'modal' | 'page';

const severityToPattern: Record<ErrorSeverity, ErrorPattern> = {
  info: 'toast',
  warning: 'inline',
  error: 'toast',
  critical: 'modal',
};

declare global {
  interface Window {
    Sentry?: {
      captureException: (
        error: unknown,
        context?: {
          level?: 'info' | 'warning' | 'error' | 'fatal';
          tags?: Record<string, string>;
          extra?: Record<string, unknown>;
        }
      ) => void;
    };
  }
}

interface TrackErrorParams {
  error: unknown;
  severity: ErrorSeverity;
  area: string;
  pattern?: ErrorPattern;
  context?: Record<string, unknown>;
}

function toSentryLevel(severity: ErrorSeverity): 'info' | 'warning' | 'error' | 'fatal' {
  if (severity === 'critical') {
    return 'fatal';
  }
  return severity;
}

export function getErrorPatternForSeverity(severity: ErrorSeverity): ErrorPattern {
  return severityToPattern[severity];
}

export function trackError({
  error,
  severity,
  area,
  pattern,
  context,
}: TrackErrorParams): void {
  const resolvedPattern = pattern ?? getErrorPatternForSeverity(severity);
  const errorObject = error instanceof Error ? error : new Error(String(error));
  const trackingContext = {
    severity,
    area,
    pattern: resolvedPattern,
    ...context,
  };

  logger.error(errorObject.message, {
    stack: errorObject.stack,
    ...trackingContext,
  });

  if (typeof window.Sentry === 'undefined') {
    return;
  }

  window.Sentry.captureException(errorObject, {
    level: toSentryLevel(severity),
    tags: {
      area,
      pattern: resolvedPattern,
      severity,
    },
    extra: context,
  });
}
