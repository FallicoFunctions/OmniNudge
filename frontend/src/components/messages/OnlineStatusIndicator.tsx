import { useWebSocket } from '../../contexts/WebSocketContext';

interface OnlineStatusIndicatorProps {
  userId: number;
  showText?: boolean;
  className?: string;
}

export function OnlineStatusIndicator({
  userId,
  showText = false,
  className = ''
}: OnlineStatusIndicatorProps) {
  const { isUserOnline } = useWebSocket();
  const online = isUserOnline(userId);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`h-2 w-2 rounded-full ${
          online ? 'bg-green-500' : 'bg-gray-400'
        }`}
        title={online ? 'Online' : 'Offline'}
        aria-label={online ? 'Online' : 'Offline'}
      />
      {showText && (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {online ? 'Online' : 'Offline'}
        </span>
      )}
    </div>
  );
}
