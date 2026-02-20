import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SlowModeIndicatorProps {
  slowModeSeconds: number;
  /** Call this ref to start the cooldown after a successful message send. */
  cooldownTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onCooldownChange?: (isActive: boolean) => void;
}

function formatSlowModeDuration(seconds: number): string {
  if (seconds >= 3600) return `${seconds / 3600}h`;
  if (seconds >= 60) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function SlowModeIndicator({
  slowModeSeconds,
  cooldownTriggerRef,
  onCooldownChange,
}: SlowModeIndicatorProps) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Expose a trigger function via ref so the parent can start the countdown
  // after a successful message send — no global window pollution.
  useEffect(() => {
    if (!cooldownTriggerRef) return;
    cooldownTriggerRef.current = () => {
      setRemaining(slowModeSeconds);
      if (timerRef.current) clearInterval(timerRef.current);
      onCooldownChange?.(true);
      timerRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            onCooldownChange?.(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slowModeSeconds, cooldownTriggerRef, onCooldownChange]);

  if (slowModeSeconds === 0) return null;

  const isActive = remaining > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm mb-2 ${
        isActive
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
          : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {isActive
        ? t('groups.admin.slowModeActive', { seconds: remaining })
        : t('groups.admin.slowModeInfo', {
            duration: formatSlowModeDuration(slowModeSeconds),
            defaultValue: `Slow mode: {{duration}}`,
          })}
    </div>
  );
}
