import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component
 * Catches JavaScript errors in child component tree and displays fallback UI
 * Prevents entire app from crashing due to component errors
 *
 * Usage:
 * <ErrorBoundary fallback={<ErrorFallback />}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // TODO: Send to error tracking service (Sentry, LogRocket, etc.)
    // Example:
    // if (typeof Sentry !== 'undefined') {
    //   Sentry.captureException(error, { contexts: { react: errorInfo } });
    // }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-lg active:opacity-80 transition-opacity"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
