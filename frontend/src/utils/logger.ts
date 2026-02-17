/**
 * Client-side logger with backend shipping
 * Ships WARN and ERROR logs to backend for aggregation
 */

enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  user_id?: string;
  session_id: string;
  page_url: string;
  user_agent: string;
}

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

class Logger {
  private sessionId: string;
  private logCounts = new Map<string, number>();
  private readonly MAX_LOGS_PER_MINUTE = 10;

  constructor() {
    this.sessionId = this.generateSessionId();

    // Clear rate limits every minute
    setInterval(() => {
      this.logCounts.clear();
    }, 60000);
  }

  /**
   * Log debug message (console only, not shipped)
   */
  debug(message: string, context?: Record<string, any>): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, context);
    }
  }

  /**
   * Log info message (console only, not shipped)
   */
  info(message: string, context?: Record<string, any>): void {
    console.info(`[INFO] ${message}`, context);
  }

  /**
   * Log warning (shipped to backend)
   */
  warn(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      context,
      user_id: this.getUserId(),
      session_id: this.sessionId,
      page_url: window.location.href,
      user_agent: navigator.userAgent,
    };

    console.warn(`[WARN] ${message}`, context);
    this.ship(entry);
  }

  /**
   * Log error (shipped to backend)
   */
  error(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context,
      user_id: this.getUserId(),
      session_id: this.sessionId,
      page_url: window.location.href,
      user_agent: navigator.userAgent,
    };

    console.error(`[ERROR] ${message}`, context);
    this.ship(entry);
  }

  /**
   * Ship log entry to backend (rate limited)
   */
  private async ship(entry: LogEntry): Promise<void> {
    // Check rate limit
    const key = `${entry.message}_${JSON.stringify(entry.context)}`;
    const count = this.logCounts.get(key) || 0;

    if (count >= this.MAX_LOGS_PER_MINUTE) {
      console.warn('[Logger] Rate limit exceeded, dropping log');
      return;
    }

    this.logCounts.set(key, count + 1);

    try {
      const response = await fetch('/api/v1/logs/frontend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
        // Don't include auth token - allow unauthenticated error reporting
      });

      if (!response.ok) {
        console.error('[Logger] Failed to ship log:', response.statusText);
      }
    } catch (error) {
      // Don't retry to avoid infinite loops
      console.error('[Logger] Failed to ship log:', error);
    }
  }

  /**
   * Get user ID from localStorage
   */
  private getUserId(): string | undefined {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return undefined;

      const user = JSON.parse(userStr);
      return user?.id;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const logger = new Logger();

// Global error handler
window.addEventListener('error', (event) => {
  logger.error('Uncaught error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error?.stack,
  });

  if (window.Sentry) {
    window.Sentry.captureException(event.error ?? new Error(event.message), {
      level: 'fatal',
      tags: {
        area: 'global_window_error',
        source: 'window_error',
      },
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  }
});

// Global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', {
    reason: event.reason?.message || String(event.reason),
    stack: event.reason?.stack,
  });

  if (window.Sentry) {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    window.Sentry.captureException(reason, {
      level: 'fatal',
      tags: {
        area: 'global_promise_rejection',
        source: 'unhandledrejection',
      },
    });
  }
});
