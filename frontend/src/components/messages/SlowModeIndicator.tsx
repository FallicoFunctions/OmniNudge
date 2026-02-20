import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SlowModeIndicatorProps {
  slowModeSeconds: number;
  onCooldownChange?: (isActive: boolean) => void;
}

export function SlowModeIndicator({ slowModeSeconds, onCooldownChange }: SlowModeIndicatorProps) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Expose a method to start the cooldown after a message is sent
  useEffect(() => {
    (window as Record<string, unknown>).__startSlowModeCooldown = (seconds: number) => {
      setRemaining(seconds);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            onCooldownChange?.(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      onCooldownChange?.(true);
    };
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      delete (window as Record<string, unknown>).__startSlowModeCooldown;
    };
  }, [onCooldownChange]);

  if (slowModeSeconds === 0) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm mb-2 ${
        remaining > 0
          ? 'bg-[var(--color-warning,#f59e0b)]/10 text-[var(--color-warning,#b45309)]'
          : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {remaining > 0
        ? t('groups.admin.slowModeActive', { seconds: remaining })
        : `Slow mode: ${slowModeSeconds >= 3600 ? `${slowModeSeconds / 3600}h` : slowModeSeconds >= 60 ? `${slowModeSeconds / 60}m` : `${slowModeSeconds}s`}`}
    </div>
  );
}
