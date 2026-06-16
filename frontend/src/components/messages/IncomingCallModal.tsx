import { Phone, Video, PhoneOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Call } from '../../types/calls';

interface IncomingCallModalProps {
  call: Call;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallModal({ call, onAccept, onDecline }: IncomingCallModalProps) {
  const { t } = useTranslation();
  const isVideo = call.call_type === 'video';
  const callerName = call.caller_username ?? t('common.unknown', 'Unknown');
  const title = isVideo ? t('calls.incomingVideoCall') : t('calls.incomingVoiceCall');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative flex flex-col items-center gap-6 rounded-2xl bg-[var(--color-surface)] p-8 shadow-2xl w-80">
        {/* Pulsing rings */}
        <div className="relative flex items-center justify-center">
          <span className="absolute inline-flex h-20 w-20 rounded-full bg-[var(--color-primary)] opacity-20 animate-ping" />
          <span className="absolute inline-flex h-16 w-16 rounded-full bg-[var(--color-primary)] opacity-30 animate-ping [animation-delay:0.3s]" />
          {/* Avatar placeholder */}
          <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-primary)] text-white text-2xl font-bold">
            {callerName.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Caller info */}
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-lg font-semibold text-[var(--color-text-primary)]">{callerName}</p>
          <p className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)]">
            {isVideo ? (
              <Video className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Phone className="w-4 h-4" aria-hidden="true" />
            )}
            {title}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-8">
          {/* Decline */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={onDecline}
              aria-label={t('calls.decline')}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-error)] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
            <span className="text-xs text-[var(--color-text-secondary)]">{t('calls.decline')}</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={onAccept}
              aria-label={t('calls.accept')}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-success)] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-success)]"
            >
              {isVideo ? (
                <Video className="w-6 h-6 text-white" />
              ) : (
                <Phone className="w-6 h-6 text-white" />
              )}
            </button>
            <span className="text-xs text-[var(--color-text-secondary)]">{t('calls.accept')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
