import { useEffect, useState } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

/**
 * Shows WebSocket connection status indicator
 * Only visible when disconnected or reconnecting
 */
export function ConnectionStatusIndicator() {
  const { connectionState } = useWebSocket();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (connectionState !== 'reconnecting') {
      setIsVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setIsVisible(true);
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [connectionState]);

  // Don't show indicator if not authenticated
  if (!user) return null;

  // Only show for sustained reconnect attempts, not initial connect or brief dev churn.
  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-lg border border-orange-500 bg-orange-50 px-4 py-2 shadow-lg dark:bg-orange-900/20"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
        <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
          {t('connectionStatus.reconnecting')}
        </span>
      </div>
    </div>
  );
}
