import { useEffect, useState } from 'react';
import { Mic, MicOff, PhoneCall, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOmniChatCall } from './OmniChatCallProvider';

// Long enough to read, short enough not to sit in the header all day.
const FAILURE_SHOWN_MS = 8000;

export function formatCallTime(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * The call, where the phone button was: mute to the left, and the live icon
 * with the time since the phone was pressed. Tapping the live icon hangs up.
 */
export default function LiveCallControls() {
  const { t } = useTranslation();
  const calls = useOmniChatCall();
  const call = calls?.call ?? null;
  const failure = calls?.failure ?? '';
  const dismissFailure = calls?.dismissFailure;
  const startedAt = call?.startedAt ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    if (!failure || !dismissFailure) return;
    const timer = window.setTimeout(dismissFailure, FAILURE_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [failure, dismissFailure]);

  if (!calls) return null;

  if (!call) {
    if (!failure) return null;
    return (
      <p
        role="alert"
        className="flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1.5 text-xs text-rose-100"
      >
        {failure}
        <button
          type="button"
          aria-label={t('omnichat.liveCall.dismiss')}
          onClick={calls.dismissFailure}
          className="rounded-full p-0.5 text-rose-100/70 hover:text-rose-100"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </p>
    );
  }

  const time = formatCallTime(now - call.startedAt);
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={call.muted}
        aria-label={t(call.muted ? 'omnichat.liveCall.unmute' : 'omnichat.liveCall.mute')}
        onClick={calls.toggleMute}
        className={`omnichat-touch-target flex items-center justify-center rounded-full px-2.5 transition ${call.muted ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}
      >
        {call.muted ? (
          <MicOff size={17} aria-hidden="true" />
        ) : (
          <Mic size={17} aria-hidden="true" />
        )}
      </button>
      {/* The name stays still: a focused button whose name changes is read out
          again, every second, to a caller who is listening rather than looking.
          The time is a separate timer, which is never announced by itself. */}
      <button
        type="button"
        aria-label={t('omnichat.liveCall.hangUp', { name: call.persona.name })}
        onClick={calls.endCall}
        className="omnichat-touch-target flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 text-emerald-200 transition hover:bg-rose-500/25 hover:text-rose-100"
      >
        <PhoneCall size={16} aria-hidden="true" className="animate-pulse" />
        <span aria-hidden="true" className="text-sm font-semibold tabular-nums">
          {time}
        </span>
      </button>
      <span role="timer" className="sr-only">
        {t('omnichat.liveCall.elapsed', { time })}
      </span>
    </div>
  );
}
