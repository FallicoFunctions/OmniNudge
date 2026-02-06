import { useWebSocket } from '../../contexts/WebSocketContext';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Shows WebSocket connection status indicator
 * Only visible when disconnected or reconnecting
 */
export function ConnectionStatusIndicator() {
  const { isConnected } = useWebSocket();
  const { user } = useAuth();

  // Don't show indicator if not authenticated
  if (!user) return null;

  // Don't show indicator when connected
  if (isConnected) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-lg border border-orange-500 bg-orange-50 px-4 py-2 shadow-lg dark:bg-orange-900/20"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
        <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
          Reconnecting to server...
        </span>
      </div>
    </div>
  );
}
