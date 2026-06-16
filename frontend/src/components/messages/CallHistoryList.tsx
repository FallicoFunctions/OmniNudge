import { useQuery } from '@tanstack/react-query';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { callsService } from '../../services/callsService';
import type { Call } from '../../types/calls';

interface CallHistoryListProps {
  conversationId: number;
  currentUserId: number;
  onCallBack?: (callType: 'voice' | 'video') => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function CallRow({
  call,
  currentUserId,
  onCallBack,
}: {
  call: Call;
  currentUserId: number;
  onCallBack?: (callType: 'voice' | 'video') => void;
}) {
  const { t } = useTranslation();
  const isOutgoing = call.caller_id === currentUserId;
  const isMissed = call.status === 'missed' || (call.status === 'ringing' && !call.answered_at);
  const isRejected = call.status === 'rejected';

  const rowColor =
    isMissed || isRejected ? 'text-[var(--color-error)]' : 'text-[var(--color-text-primary)]';

  const directionIcon = isMissed ? (
    <PhoneMissed className="w-4 h-4" aria-hidden="true" />
  ) : isOutgoing ? (
    <PhoneOutgoing className="w-4 h-4" aria-hidden="true" />
  ) : (
    <PhoneIncoming className="w-4 h-4" aria-hidden="true" />
  );

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors">
      {/* Type icon */}
      <div className={`flex-shrink-0 ${rowColor}`}>
        {call.call_type === 'video' ? (
          <Video className="w-5 h-5" aria-hidden="true" />
        ) : (
          <Phone className="w-5 h-5" aria-hidden="true" />
        )}
      </div>

      {/* Direction + status */}
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-1 text-sm font-medium ${rowColor}`}>
          {directionIcon}
          <span className="truncate">
            {isOutgoing ? t('calls.outgoing') : t('calls.incoming')}
            {isMissed ? ` — ${t('calls.callMissed')}` : ''}
            {isRejected ? ` — ${t('calls.callRejected')}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] mt-0.5">
          <span>{formatTimestamp(call.started_at)}</span>
          {call.duration_seconds !== undefined && call.duration_seconds !== null && (
            <span>· {formatDuration(call.duration_seconds)}</span>
          )}
        </div>
      </div>

      {/* Call back button */}
      {onCallBack && (
        <button
          onClick={() => onCallBack(call.call_type)}
          aria-label={t('calls.callBack')}
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full hover:bg-[var(--color-surface-3)] transition-colors text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <PhoneCall className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function CallHistoryList({
  conversationId,
  currentUserId,
  onCallBack,
}: CallHistoryListProps) {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['call-history', conversationId],
    queryFn: () => callsService.getCallHistory(conversationId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-[var(--color-text-secondary)]">
        {t('common.loading', 'Loading...')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-[var(--color-error)]">
        {t('errors.failedToLoad', 'Failed to load')}
      </div>
    );
  }

  const calls: Call[] = data?.calls ?? [];

  if (calls.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-[var(--color-text-secondary)]">
        {t('calls.noHistory')}
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {calls.map((call) => (
        <CallRow key={call.id} call={call} currentUserId={currentUserId} onCallBack={onCallBack} />
      ))}
    </div>
  );
}
