import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { analyticsService } from './services/analyticsService';
import { trackError } from './services/errorTrackingService';
import i18n from './i18n/config';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    trackError({
      error,
      severity: 'critical',
      area: 'root_error_boundary',
      pattern: 'page',
      context: {
        componentStack: errorInfo.componentStack,
      },
    });

    // Track as analytics event for automated rollbacks
    analyticsService.track('error_occurred', {
      error_message: error.message,
      component_stack: errorInfo.componentStack,
    });

    // If this is a Context error, it might be a lazy loading issue
    // Log additional info for debugging
    if (error.message?.includes('Context') || error.message?.includes('Provider')) {
      console.error(
        'Context/Provider error detected. This might be a lazy loading or Safari-specific issue.'
      );
      console.error('Component stack:', errorInfo.componentStack);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#fee',
            color: '#c00',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          <h1>{i18n.t('errorBoundary.title')}</h1>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            <summary>{i18n.t('errorBoundary.details')}</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.error && this.state.error.stack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
