import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface ErrorPageProps {
  title?: string;
  message?: string;
  statusCode?: number;
  showHomeButton?: boolean;
  showRefreshButton?: boolean;
  onRetry?: () => void;
}

export function ErrorPage({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  statusCode,
  showHomeButton = true,
  showRefreshButton = true,
  onRetry,
}: ErrorPageProps) {
  const handleRefresh = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={48} className="text-red-600 dark:text-red-400" />
        </div>

        {statusCode && (
          <div className="text-6xl font-bold text-primary mb-4">{statusCode}</div>
        )}

        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-secondary mb-8">{message}</p>

        <div className="flex gap-3 justify-center">
          {showHomeButton && (
            <a
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Home size={20} />
              Go Home
            </a>
          )}
          {showRefreshButton && (
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-6 py-3 border border-border rounded-lg hover:bg-secondary/10 transition-colors"
            >
              <RefreshCw size={20} />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 404 Page
export function NotFoundPage() {
  return (
    <ErrorPage
      title="Page Not Found"
      message="The page you're looking for doesn't exist or has been moved."
      statusCode={404}
      showRefreshButton={false}
    />
  );
}

// 500 Page
export function ServerErrorPage({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorPage
      title="Server Error"
      message="Our servers encountered an error. We've been notified and are working on it."
      statusCode={500}
      onRetry={onRetry}
    />
  );
}

// Network Error Page
export function NetworkErrorPage({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorPage
      title="Connection Lost"
      message="Please check your internet connection and try again."
      showHomeButton={false}
      onRetry={onRetry}
    />
  );
}

// Maintenance Page
export function MaintenancePage() {
  return (
    <ErrorPage
      title="Under Maintenance"
      message="We're performing scheduled maintenance. We'll be back soon!"
      showHomeButton={false}
      showRefreshButton={true}
    />
  );
}
