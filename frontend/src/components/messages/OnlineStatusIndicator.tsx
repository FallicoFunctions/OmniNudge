import { useWebSocket } from '../../contexts/WebSocketContext';
import { useTranslation } from 'react-i18next';

interface OnlineStatusIndicatorProps {
  userId: number;
  showText?: boolean;
  className?: string;
}

export function OnlineStatusIndicator({
  userId,
  showText = false,
  className = '',
}: OnlineStatusIndicatorProps) {
  const { isUserOnline } = useWebSocket();
  const { t } = useTranslation();
  const online = isUserOnline(userId);
  const label = online ? t('messages.online') : t('messages.offline');

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`}
        title={label}
        aria-label={label}
      />
      {showText && <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>}
    </div>
  );
}
