import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ErrorPageProps {
  title?: string;
  message?: string;
  statusCode?: number;
  showHomeButton?: boolean;
  showRefreshButton?: boolean;
  onRetry?: () => void;
}

export function ErrorPage({
  title,
  message,
  statusCode,
  showHomeButton = true,
  showRefreshButton = true,
  onRetry,
}: ErrorPageProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('errors.somethingWentWrong');
  const resolvedMessage = message ?? t('emptyStates.error.description');

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

        {statusCode && <div className="text-6xl font-bold text-primary mb-4">{statusCode}</div>}

        <h1 className="text-3xl font-bold mb-4">{resolvedTitle}</h1>
        <p className="text-secondary mb-8">{resolvedMessage}</p>

        <div className="flex gap-3 justify-center">
          {showHomeButton && (
            <a
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Home size={20} />
              {t('notFoundPage.goHome')}
            </a>
          )}
          {showRefreshButton && (
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-6 py-3 border border-border rounded-lg hover:bg-secondary/10 transition-colors"
            >
              <RefreshCw size={20} />
              {t('emptyStates.error.actions.tryAgain')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 404 Page
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <ErrorPage
      title={t('notFoundPage.title')}
      message={t('notFoundPage.description')}
      statusCode={404}
      showRefreshButton={false}
    />
  );
}

// 500 Page
export function ServerErrorPage({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <ErrorPage
      title={t('errorPages.serverError.title')}
      message={t('errors.serverError')}
      statusCode={500}
      onRetry={onRetry}
    />
  );
}

// Network Error Page
export function NetworkErrorPage({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <ErrorPage
      title={t('errorPages.networkError.title')}
      message={t('errors.networkError')}
      showHomeButton={false}
      onRetry={onRetry}
    />
  );
}

// Maintenance Page
export function MaintenancePage() {
  const { t } = useTranslation();
  return (
    <ErrorPage
      title={t('errorPages.maintenance.title')}
      message={t('errorPages.maintenance.message')}
      showHomeButton={false}
      showRefreshButton={true}
    />
  );
}
