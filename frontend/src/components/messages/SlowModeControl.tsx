import { useTranslation } from 'react-i18next';

interface SlowModeControlProps {
  currentSeconds: number;
  onSetSlowMode: (seconds: number) => void;
  isLoading?: boolean;
}

const SLOW_MODE_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '10 seconds', value: 10 },
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
] as const;

export function SlowModeControl({ currentSeconds, onSetSlowMode, isLoading }: SlowModeControlProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
        {t('groups.admin.slowMode')}
      </span>
      <select
        value={currentSeconds}
        onChange={(e) => onSetSlowMode(Number(e.target.value))}
        disabled={isLoading}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
      >
        {SLOW_MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
